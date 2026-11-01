"""Small asynchronous adapter over Supabase's HTTP APIs. No local persistence fallback."""
import asyncio
import logging
from datetime import datetime, timedelta, timezone
from urllib.parse import quote

import httpx

from app.core.config import Settings
from app.core.errors import ServiceError


def now() -> str:
    return datetime.now(timezone.utc).isoformat()


class Repository:
    def __init__(self, settings: Settings, client: httpx.AsyncClient, owner_id: str | None = None):
        self.settings, self.client = settings, client
        self.owner_id = owner_id
        self.base = settings.supabase_url.rstrip("/")
        self.headers = {"apikey": settings.supabase_service_role_key, "Content-Type": "application/json"}
        if settings.supabase_service_role_key.startswith("eyJ"):
            self.headers["Authorization"] = f"Bearer {settings.supabase_service_role_key}"

    def for_owner(self, owner_id: str):
        return Repository(self.settings, self.client, owner_id)

    @property
    def scope(self):
        return {'owner_id': f'eq.{self.owner_id}' if self.owner_id else 'is.null'}

    async def request(self, method: str, path: str, **kwargs):
        headers = self.headers | kwargs.pop("headers", {})
        safe_read = method == "GET" or path == "/rest/v1/rpc/ap_dashboard_owned"
        for attempt in range(2 if safe_read else 1):
            try:
                response = await self.client.request(method, self.base + path, headers=headers, timeout=20, **kwargs)
                if safe_read and attempt == 0 and response.status_code in (502, 503, 504):
                    await asyncio.sleep(1)
                    continue
                break
            except httpx.HTTPError as exc:
                logging.getLogger("ledgerly.database").warning("supabase_transport_error", extra={"error_code": type(exc).__name__})
                if safe_read and attempt == 0:
                    await asyncio.sleep(1)
                    continue
                raise ServiceError(f"Supabase could not be reached ({type(exc).__name__}). No successful persistence is assumed.", 503, "database_unavailable") from exc
        if response.is_error:
            if "/rpc/ap_review_invoice" in path and response.status_code == 400:
                detail = response.json().get("message", "Review could not be saved.")
                raise ServiceError(detail, 409, "review_conflict")
            raise ServiceError("Supabase rejected the operation. Check the schema, bucket, and backend credentials.", 503, "database_error")
        return response.json() if response.content else None

    async def rows(self, table: str, params: dict | None = None):
        return await self.request("GET", f"/rest/v1/ap_{table}", params=(params or {}) | self.scope)

    async def create(self, execution: dict):
        await self.request("POST", "/rest/v1/ap_executions", json=execution | {'owner_id': self.owner_id})

    async def update(self, execution_id: str, values: dict):
        await self.request("PATCH", "/rest/v1/ap_executions", params={"id": f"eq.{execution_id}"} | self.scope, json=values | {"updated_at": now()})

    async def stage(self, execution_id: str, position: int, name: str, status: str, detail: str = ""):
        values = {"execution_id": execution_id, "position": position, "name": name, "status": status, "detail": detail, "owner_id": self.owner_id}
        if status == "running":
            await self.request("POST", "/rest/v1/ap_stages", json=values | {"started_at": now()})
        else:
            await self.request("PATCH", "/rest/v1/ap_stages", params={"execution_id": f"eq.{execution_id}", "position": f"eq.{position}"} | self.scope, json={"status": status, "detail": detail, "finished_at": now()})

    async def detail(self, execution_id: str):
        rows = await self.rows("executions", {"id": f"eq.{execution_id}", "select": "*,stages:ap_stages!ap_stages_execution_id_fkey(*),reviews:ap_reviews!ap_reviews_execution_id_fkey(*)"})
        if not rows:
            raise ServiceError("Execution not found.", 404, "not_found")
        result = rows[0]
        result["stages"].sort(key=lambda row: row["position"])
        result["reviews"].sort(key=lambda row: row["created_at"])
        return result

    async def upload(self, path: str, content: bytes):
        await self.request("POST", f"/storage/v1/object/{self.settings.supabase_storage_bucket}/{path}", content=content, headers={"Content-Type": "application/pdf", "x-upsert": "false"})

    async def signed_url(self, path: str):
        result = await self.request("POST", f"/storage/v1/object/sign/{self.settings.supabase_storage_bucket}/{quote(path, safe='/')}", json={"expiresIn": 120})
        return self.base + "/storage/v1" + result["signedURL"]

    async def recover_stale(self):
        before = (datetime.now(timezone.utc) - timedelta(minutes=10)).isoformat()
        stale = await self.rows("executions", {"status": "eq.running", "updated_at": f"lt.{before}", "select": "id"})
        for row in stale:
            await self.update(row["id"], {"status": "interrupted", "error_code": "interrupted", "error_message": "Processing stopped before completion. Submit again to retry.", "finished_at": now()})
            await self.request("PATCH", "/rest/v1/ap_stages", params={"execution_id": f"eq.{row['id']}", "status": "eq.running"} | self.scope, json={"status": "failed", "finished_at": now(), "detail": "Processing interrupted."})
