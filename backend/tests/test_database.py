import httpx
import pytest

from app.core.config import Settings
from app.core.errors import ServiceError
from app.database import Repository


async def test_transient_read_failure_retries_once():
    count = 0
    def handler(request):
        nonlocal count
        count += 1
        if count == 1: raise httpx.ReadError("connection dropped", request=request)
        return httpx.Response(200, json=[{"reference": "PO-1"}])
    async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
        result = await Repository(Settings(supabase_url="https://example.supabase.co"), client).rows("purchase_orders")
    assert result == [{"reference": "PO-1"}]
    assert count == 2


async def test_approval_with_unknown_network_outcome_is_not_retried():
    count = 0
    def handler(request):
        nonlocal count
        count += 1
        raise httpx.ReadError("connection dropped", request=request)
    async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
        with pytest.raises(ServiceError):
            await Repository(Settings(supabase_url="https://example.supabase.co"), client).request("POST", "/rest/v1/rpc/ap_review_invoice", json={})
    assert count == 1


async def test_stage_start_uses_application_clock():
    payloads = []
    def handler(request):
        import json
        payloads.append(json.loads(request.content))
        return httpx.Response(201)
    async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
        await Repository(Settings(supabase_url="https://example.supabase.co"), client).stage("id", 1, "Extract", "running")
    assert "started_at" in payloads[0]
