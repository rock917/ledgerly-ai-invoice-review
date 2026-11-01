from unittest.mock import AsyncMock

from fastapi.testclient import TestClient

from app.main import app, settings


def configure(monkeypatch):
    monkeypatch.setattr(settings, "enable_legacy_demo", True)
    for name, value in [("supabase_url", "https://test.supabase.co"), ("supabase_service_role_key", "test-key"), ("groq_api_key", "test-key"), ("demo_access_token", "demo-test"), ("review_access_token", "review-test")]:
        monkeypatch.setattr(settings, name, value)


def test_health_does_not_expose_credentials():
    with TestClient(app) as client:
        result = client.get("/health")
    assert result.status_code == 200
    assert set(result.json()) == {"status", "configured", "version"}


def test_missing_configuration_is_explicit(monkeypatch):
    monkeypatch.setattr(settings, "groq_api_key", "")
    with TestClient(app) as client:
        result = client.get("/api/dashboard")
    assert result.status_code == 503
    assert result.json()["error"]["code"] == "configuration_required"


def test_unauthorized_access_does_not_query_database(monkeypatch):
    configure(monkeypatch)
    with TestClient(app) as client:
        repo = AsyncMock()
        app.state.repo = repo
        result = client.get("/api/dashboard")
        repo.rows.assert_not_called()
    assert result.status_code == 401


def test_corrupted_pdf_is_rejected_before_storage(monkeypatch):
    configure(monkeypatch)
    with TestClient(app) as client:
        repo = AsyncMock()
        app.state.repo = repo
        result = client.post("/api/executions", headers={"Authorization": "Bearer demo-test"}, files={"file": ("invoice.pdf", b"not a pdf", "application/pdf")})
        repo.upload.assert_not_called()
    assert result.status_code == 422


def test_upload_limit(monkeypatch):
    configure(monkeypatch)
    with TestClient(app) as client:
        result = client.post("/api/executions", headers={"Authorization": "Bearer demo-test"}, files={"file": ("invoice.pdf", b"x" * (5 * 1024 * 1024 + 1), "application/pdf")})
    assert result.status_code == 413


def test_review_requires_separate_access(monkeypatch):
    configure(monkeypatch)
    with TestClient(app) as client:
        result = client.post("/api/executions/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/reviews", headers={"Authorization": "Bearer demo-test"}, json={"action": "approve", "comment": "Checked against PO", "reviewer": "Tester"})
    assert result.status_code == 403


def test_dashboard_uses_actual_repository_response(monkeypatch):
    configure(monkeypatch)
    with TestClient(app) as client:
        repo = AsyncMock()
        repo.request.return_value = {"total": 7, "pending_reviews": 3}
        repo.owner_id = None
        repo.rows.return_value = []
        app.state.repo = repo
        result = client.get("/api/dashboard", headers={"Authorization": "Bearer demo-test"})
    assert result.status_code == 200
    assert result.json()["metrics"] == {"total": 7, "pending_reviews": 3}


def test_review_filters_and_pending_queue_are_distinct(monkeypatch):
    configure(monkeypatch)
    with TestClient(app) as client:
        repo = AsyncMock()
        repo.rows.return_value = []
        app.state.repo = repo
        for value in ['approved', 'rejected']:
            client.get('/api/executions', params={'review_status': value}, headers={'Authorization': 'Bearer demo-test'})
            assert repo.rows.call_args.args[1]['review_status'] == f'eq.{value}'
        client.get('/api/executions?review=true&review_status=approved', headers={'Authorization': 'Bearer demo-test'})
        assert repo.rows.call_args.args[1]['review_status'] == 'in.(pending,information_requested)'
        client.get('/api/executions?review_status=eq.anything', headers={'Authorization': 'Bearer demo-test'})
        assert 'review_status' not in repo.rows.call_args.args[1]
