import asyncio
import logging
import time

from app.core.errors import ServiceError
from app.database import Repository, now
from app.schemas import Decision, RuleResult
from app.services.ai import Extractor
from app.services.ocr import DocumentText, prepare_document
from app.services.rules import evaluate, identity

log = logging.getLogger("ledgerly.workflow")


async def run_invoice(execution_id: str, pages: list[str], repo: Repository, extractor: Extractor, model: str, document_data: bytes | None = None):
    started = time.monotonic()
    current = 1
    names = {1: "Extract invoice", 2: "Validate information", 3: "Match purchase order", 4: "Evaluate business rules", 5: "Save decision"}
    try:
        async with asyncio.timeout(180):
            await repo.stage(execution_id, current, names[current], "running")
            document = await prepare_document(document_data, pages) if document_data is not None else DocumentText(pages, [], [])
            pages = document.pages
            source_note = f"OCR used on page(s) {', '.join(map(str, document.ocr_pages))}. Excerpts are OCR transcriptions; compare with the original PDF. " if document.ocr_pages else ""
            if sum(len(p.strip()) for p in pages) < 40:
                await repo.stage(execution_id, current, names[current], "skipped", source_note + "No usable document text after reading; no AI call was made.")
                decision = Decision(outcome="needs_review", summary="A readable invoice is required. Upload a clearer scan or a text-based PDF.", po_id=None, rules=[RuleResult(code="readable_document", status="review", title="Document readability", detected="Insufficient readable document text", rule="Never invent fields from an unreadable document.", next_action="Request a clearer PDF or review the original document manually.")])
                await repo.update(execution_id, {"status": "completed", "outcome": "needs_review", "decision": decision.model_dump(), "finished_at": now(), "duration_ms": int((time.monotonic() - started) * 1000)})
                return

            invoice = await extractor.extract(pages)
            invoice.uncertainties.extend(document.warnings)
            await repo.update(execution_id, {"extraction": invoice.model_dump(), "ai_model": model, "vendor_name": invoice.vendor_name, "invoice_number": invoice.invoice_number, "total": invoice.total, "currency": (invoice.currency or "").upper() or None, "invoice_identity": identity(invoice.vendor_name) + ":" + identity(invoice.invoice_number) if identity(invoice.vendor_name) and identity(invoice.invoice_number) else None})
            await repo.stage(execution_id, current, names[current], "completed", source_note + "Groq response validated; source excerpts checked against the extracted text.")
            current = 2
            await repo.stage(execution_id, current, names[current], "running")
            await repo.stage(execution_id, current, names[current], "completed", f"{len(invoice.line_items)} line items; {len(invoice.uncertainties)} extraction warnings. Amounts use decimal arithmetic.")
            current = 3
            await repo.stage(execution_id, current, names[current], "running")
            vendors, pos, prior = await asyncio.gather(repo.rows("vendors"), repo.rows("purchase_orders"), repo.rows("executions", {"status": "eq.completed", "id": f"neq.{execution_id}", "select": "id,vendor_name,invoice_number,review_status", "invoice_identity": "eq." + identity(invoice.vendor_name) + ":" + identity(invoice.invoice_number)}))
            await repo.stage(execution_id, current, names[current], "completed", "Loaded approved vendor register, purchase orders, and matching invoice history from Supabase.")
            current = 4
            await repo.stage(execution_id, current, names[current], "running")
            decision = evaluate(invoice, vendors, pos, prior)
            await repo.stage(execution_id, current, names[current], "completed", f"{len(decision.rules)} checks evaluated; outcome: {decision.outcome}.")
            current = 5
            await repo.stage(execution_id, current, names[current], "running")
            await repo.update(execution_id, {"outcome": decision.outcome, "decision": decision.model_dump(), "po_id": decision.po_id})
            await repo.stage(execution_id, current, names[current], "completed", "Decision and rule evidence saved. No payment initiated.")
            await repo.update(execution_id, {"status": "completed", "finished_at": now(), "duration_ms": int((time.monotonic() - started) * 1000)})
            log.info("workflow_completed", extra={"execution_id": execution_id, "outcome": decision.outcome})
    except (Exception, asyncio.CancelledError) as exc:
        cancelled = isinstance(exc, asyncio.CancelledError)
        code = exc.code if isinstance(exc, ServiceError) else "interrupted" if cancelled else "workflow_timeout" if isinstance(exc, TimeoutError) else "workflow_failed"
        message = exc.message if isinstance(exc, ServiceError) else "Processing was interrupted. Submit again to retry." if cancelled else "Processing could not complete. No successful result is assumed."
        log.error("workflow_failed", extra={"execution_id": execution_id, "error_code": code})
        try:
            await repo.stage(execution_id, current, names[current], "failed", message)
            await repo.update(execution_id, {"status": "interrupted" if cancelled else "failed", "outcome": None, "error_code": code, "error_message": message, "finished_at": now(), "duration_ms": int((time.monotonic() - started) * 1000)})
        except Exception:
            log.error("failure_persistence_unavailable", extra={"execution_id": execution_id})
        if cancelled:
            raise
