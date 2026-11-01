import asyncio
import hashlib
import json
import logging
import re
import secrets
from contextlib import asynccontextmanager
from pathlib import PurePath
from datetime import datetime, timedelta, timezone
from uuid import UUID, uuid4

import httpx
from fastapi import Depends, FastAPI, File, Header, Query, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from app.auth import Identity, authenticate
from app.core.config import get_settings
from app.core.errors import ServiceError
from app.database import Repository
from app.schemas import ReviewRequest
from app.services.ai import GroqExtractor
from app.services.documents import extract_pages
from app.workflow import run_invoice


class JsonFormatter(logging.Formatter):
    def format(self, record):
        data = {"level": record.levelname, "event": record.getMessage()}
        for field in ["execution_id", "outcome", "error_code"]:
            if hasattr(record, field):
                data[field] = getattr(record, field)
        return json.dumps(data)


handler = logging.StreamHandler()
handler.setFormatter(JsonFormatter())
logger = logging.getLogger("ledgerly")
logger.setLevel(logging.INFO)
logger.addHandler(handler)
logger.propagate = False
settings = get_settings()
tasks: set[asyncio.Task] = set()
submission_lock = asyncio.Lock()


@asynccontextmanager
async def lifespan(app: FastAPI):
    async with httpx.AsyncClient() as client:
        app.state.http = client
        app.state.repo = Repository(settings, client)
        app.state.extractor = GroqExtractor(settings, client)
        yield
        for task in list(tasks):
            task.cancel()
        if tasks:
            await asyncio.gather(*tasks, return_exceptions=True)


app = FastAPI(title="Ledgerly AP API", version="0.1.0", description="Invoice evidence, deterministic decisions, and human review. No payment execution.", lifespan=lifespan)
app.add_middleware(CORSMiddleware, allow_origins=[o.strip() for o in settings.cors_origins.split(",") if o.strip()], allow_credentials=False, allow_methods=["GET", "POST"], allow_headers=["Authorization", "Content-Type", "X-Review-Token"])
bearer = HTTPBearer(auto_error=False)


async def authorize(credentials: HTTPAuthorizationCredentials | None = Depends(bearer)) -> Identity:
    if settings.missing_configuration:
        raise ServiceError("The workspace service is not configured yet.", 503, "configuration_required")
    return await authenticate(credentials.credentials if credentials else '', settings, app.state.http)


def get_repo(user: Identity = Depends(authorize)) -> Repository:
    return app.state.repo.for_owner(user.user_id) if user.user_id else app.state.repo


@app.get('/api/me')
async def me(user: Identity = Depends(authorize), repo: Repository = Depends(get_repo)):
    if user.user_id is None:
        return {'id': None, 'display_name': 'Legacy demo', 'legacy': True}
    profile = await repo.request('POST', '/rest/v1/rpc/ap_ensure_workspace', json={'p_user_id': user.user_id, 'p_display_name': user.name})
    return profile | {'legacy': False, 'daily_upload_limit': settings.max_daily_uploads}


@app.exception_handler(ServiceError)
async def service_error(_, exc: ServiceError):
    return JSONResponse(status_code=exc.status_code, content={"error": {"code": exc.code, "message": exc.message}})


@app.exception_handler(Exception)
async def unexpected_error(_, exc):
    logger.error("unexpected_api_error", extra={"error_code": type(exc).__name__})
    return JSONResponse(status_code=500, content={"error": {"code": "internal_error", "message": "The request failed. Please retry; no successful operation is assumed."}})


@app.get("/health")
async def health():
    return {"status": "ok", "configured": not settings.missing_configuration, "version": "0.1.0"}


@app.get("/api/readiness", dependencies=[Depends(authorize)])
async def readiness(repo: Repository = Depends(get_repo)):
    await repo.rows("vendors", {"select": "id", "limit": "1"})
    return {"database": "connected", "ai": "configured_not_probed"}


@app.get("/api/dashboard", dependencies=[Depends(authorize)])
async def dashboard(repo: Repository = Depends(get_repo)):
    await repo.recover_stale()
    metrics = await repo.request("POST", "/rest/v1/rpc/ap_dashboard_owned", json={"p_owner_id": repo.owner_id})
    recent = await repo.rows("executions", {"select": "id,filename,status,outcome,review_status,vendor_name,invoice_number,total,currency,created_at,duration_ms", "order": "created_at.desc", "limit": "8"})
    return {"metrics": metrics, "recent": recent}


@app.get("/api/executions", dependencies=[Depends(authorize)])
async def executions(q: str = Query("", max_length=100), outcome: str = "", status: str = "", review: bool = False, review_status: str = "", offset: int = Query(0, ge=0), repo: Repository = Depends(get_repo)):
    await repo.recover_stale()
    params = {"select": "id,filename,status,outcome,review_status,vendor_name,invoice_number,total,currency,created_at,duration_ms", "order": "created_at.desc", "limit": "25", "offset": str(offset)}
    if outcome in ["ready", "needs_review", "blocked"]:
        params["outcome"] = f"eq.{outcome}"
    if status in ["running", "completed", "failed", "interrupted"]:
        params["status"] = f"eq.{status}"
    if review_status in ["approved", "rejected", "pending", "information_requested"]:
        params["review_status"] = f"eq.{review_status}"
    if review:
        params["status"] = "eq.completed"
        params["review_status"] = "in.(pending,information_requested)"
    if q.strip():
        clean = re.sub(r"[^\w\s-]", "", q).strip()
        if clean:
            params["or"] = f"(filename.ilike.*{clean}*,vendor_name.ilike.*{clean}*,invoice_number.ilike.*{clean}*)"
    return await repo.rows("executions", params)


@app.get("/api/executions/{execution_id}", dependencies=[Depends(authorize)])
async def execution(execution_id: UUID, repo: Repository = Depends(get_repo)):
    await repo.recover_stale()
    return await repo.detail(str(execution_id))


@app.get("/api/executions/{execution_id}/document", dependencies=[Depends(authorize)])
async def document(execution_id: UUID, repo: Repository = Depends(get_repo)):
    run = await repo.detail(str(execution_id))
    return {"url": await repo.signed_url(run["storage_path"])}


@app.get("/api/purchase-orders", dependencies=[Depends(authorize)])
async def purchase_orders(repo: Repository = Depends(get_repo)):
    return await repo.rows("purchase_orders", {"select": "*,vendor:ap_vendors!ap_purchase_orders_vendor_id_fkey(name)", "order": "reference.asc"})


@app.post("/api/executions", status_code=202, dependencies=[Depends(authorize)])
async def submit(file: UploadFile = File(...), repo: Repository = Depends(get_repo)):
    if not (file.filename or "").lower().endswith(".pdf"):
        raise ServiceError("Upload a PDF invoice.", 422, "unsupported_file")
    content = await file.read(settings.max_upload_mb * 1024 * 1024 + 1)
    await file.close()
    if len(content) > settings.max_upload_mb * 1024 * 1024:
        raise ServiceError(f"Invoice must be at most {settings.max_upload_mb} MB.", 413, "file_too_large")
    pages = await asyncio.to_thread(extract_pages, content, settings.max_pdf_pages)
    digest = hashlib.sha256(content).hexdigest()
    # Single-process demo backend: serialize acceptance and cap active jobs.
    async with submission_lock:
        if len(tasks) >= 2:
            raise ServiceError("Two invoices are already processing. Wait for a run to finish.", 429, "capacity_limit")
        existing = await repo.rows("executions", {"file_hash": f"eq.{digest}", "status": "eq.running", "select": "id", "limit": "1"})
        if existing:
            return {"id": existing[0]["id"], "reused": True}
        if repo.owner_id:
            cutoff = (datetime.now(timezone.utc) - timedelta(days=1)).isoformat()
            recent = await repo.rows('executions', {'created_at': f'gte.{cutoff}', 'select': 'id', 'limit': str(settings.max_daily_uploads)})
            if len(recent) >= settings.max_daily_uploads:
                raise ServiceError(f'Demo limit reached: {settings.max_daily_uploads} uploads per 24 hours. Please return later.', 429, 'daily_upload_limit')
        execution_id = str(uuid4())
        path = f"{repo.owner_id or 'legacy'}/{execution_id}/invoice.pdf"
        await repo.upload(path, content)
        await repo.create({"id": execution_id, "filename": PurePath(file.filename).name[:180], "file_hash": digest, "storage_path": path})
        await repo.stage(execution_id, 0, "Receive invoice", "running")
        await repo.stage(execution_id, 0, "Receive invoice", "completed", f"PDF validated and saved privately; {len(pages)} page(s).")
        task = asyncio.create_task(run_invoice(execution_id, pages, repo, app.state.extractor, settings.groq_model, content))
        tasks.add(task)
        task.add_done_callback(tasks.discard)
    return {"id": execution_id, "reused": False}


@app.post("/api/executions/{execution_id}/reviews", dependencies=[Depends(authorize)])
async def review_invoice(execution_id: UUID, body: ReviewRequest, x_review_token: str = Header(""), user: Identity = Depends(authorize), repo: Repository = Depends(get_repo)):
    if user.user_id is None:
        if not secrets.compare_digest(x_review_token, settings.review_access_token):
            raise ServiceError("A valid reviewer access code is required.", 403, "review_unauthorized")
        reviewer = body.reviewer or 'Legacy reviewer'
    else:
        reviewer = user.name
    # Ownership check also hides whether another user's execution exists.
    await repo.detail(str(execution_id))
    return await repo.request("POST", "/rest/v1/rpc/ap_review_invoice_owned", json={"p_execution_id": str(execution_id), "p_owner_id": user.user_id, "p_action": body.action, "p_reviewer": reviewer, "p_comment": body.comment})
