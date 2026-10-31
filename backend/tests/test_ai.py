import httpx
import pytest

from app.core.config import Settings
from app.core.errors import ServiceError
from app.services.ai import GroqExtractor


async def test_valid_structured_result_checks_real_quotes(invoice):
    payload = {"choices": [{"finish_reason": "stop", "message": {"content": invoice.model_dump_json()}}]}
    async with httpx.AsyncClient(transport=httpx.MockTransport(lambda r: httpx.Response(200, json=payload))) as client:
        result = await GroqExtractor(Settings(groq_api_key="test"), client).extract(["\n".join(e.quote for e in invoice.evidence)])
    assert len(result.evidence) == len(invoice.evidence)
    assert not result.uncertainties


async def test_fabricated_quote_is_removed(invoice):
    payload = {"choices": [{"finish_reason": "stop", "message": {"content": invoice.model_dump_json()}}]}
    async with httpx.AsyncClient(transport=httpx.MockTransport(lambda r: httpx.Response(200, json=payload))) as client:
        result = await GroqExtractor(Settings(groq_api_key="test"), client).extract(["This source contains no invoice fields."])
    assert result.evidence == []
    assert len(result.uncertainties) == len(invoice.evidence)


@pytest.mark.parametrize("body", ['{"total": "100"}', 'not json', '{"total":"NaN"}'])
async def test_malformed_output_never_succeeds(body):
    payload = {"choices": [{"finish_reason": "stop", "message": {"content": body}}]}
    async with httpx.AsyncClient(transport=httpx.MockTransport(lambda r: httpx.Response(200, json=payload))) as client:
        with pytest.raises(ServiceError, match="schema validation"):
            await GroqExtractor(Settings(groq_api_key="test"), client).extract(["source"])


async def test_free_quota_does_not_switch_to_paid_provider():
    requests = []
    def handler(request):
        requests.append(request)
        return httpx.Response(429, headers={"retry-after": "60"})
    async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
        with pytest.raises(ServiceError) as exc:
            await GroqExtractor(Settings(groq_api_key="test"), client).extract(["source"])
    assert exc.value.code == "ai_rate_limit"
    assert len(requests) == 1


async def test_timeout_reports_failure():
    def handler(request): raise httpx.ReadTimeout("timeout", request=request)
    async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
        with pytest.raises(ServiceError) as exc:
            await GroqExtractor(Settings(groq_api_key="test"), client).extract(["source"])
    assert exc.value.code == "ai_timeout"
