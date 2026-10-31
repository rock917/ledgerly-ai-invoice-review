from unittest.mock import AsyncMock

from app.core.errors import ServiceError
from app.workflow import run_invoice


async def test_workflow_persists_decision_and_real_stages(invoice, vendors, pos):
    repo = AsyncMock()
    repo.rows.side_effect = [vendors, pos, []]
    extractor = AsyncMock()
    extractor.extract.return_value = invoice
    await run_invoice("run-id", ["a sufficiently long document containing real invoice text"], repo, extractor, "test-model")
    updates = [call.args[1] for call in repo.update.call_args_list]
    assert any(u.get("outcome") == "ready" for u in updates)
    assert updates[-1]["status"] == "completed"
    completed = [c.args[2] for c in repo.stage.call_args_list if c.args[3] == "completed"]
    assert completed == ["Extract invoice", "Validate information", "Match purchase order", "Evaluate business rules", "Save decision"]


async def test_scan_routes_to_review_without_claiming_ai_success():
    repo, extractor = AsyncMock(), AsyncMock()
    await run_invoice("scan-id", [""], repo, extractor, "test-model")
    extractor.extract.assert_not_called()
    update = repo.update.call_args.args[1]
    assert update["outcome"] == "needs_review"
    assert update["status"] == "completed"
    assert "ai_model" not in update


async def test_ai_failure_is_technical_failure_without_decision():
    repo, extractor = AsyncMock(), AsyncMock()
    extractor.extract.side_effect = ServiceError("Provider failed", 502, "ai_error")
    await run_invoice("failed-id", ["a sufficiently long document containing real invoice text"], repo, extractor, "test-model")
    update = repo.update.call_args.args[1]
    assert update["status"] == "failed"
    assert update["outcome"] is None
    assert update["error_code"] == "ai_error"


async def test_database_failure_never_marks_completed(invoice):
    repo, extractor = AsyncMock(), AsyncMock()
    extractor.extract.return_value = invoice
    repo.update.side_effect = ServiceError("DB down")
    await run_invoice("failed-db-id", ["a sufficiently long document containing real invoice text"], repo, extractor, "test-model")
    assert not any(c.args[1].get("status") == "completed" for c in repo.update.call_args_list)
