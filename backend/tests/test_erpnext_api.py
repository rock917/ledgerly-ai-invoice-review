from unittest.mock import AsyncMock

import pytest
from fastapi.testclient import TestClient

from app.auth import Identity
from app.core.errors import ServiceError
from app.main import app, authorize, get_repo, settings

OWNER='10000000-0000-4000-8000-000000000001'
RUN='20000000-0000-4000-8000-000000000001'


@pytest.fixture
def client_repo(monkeypatch):
    repo=AsyncMock()
    repo.owner_id=OWNER
    monkeypatch.setattr(settings,'erpnext_owner_id','different-owner')
    app.dependency_overrides[authorize]=lambda: Identity(OWNER,'Tester')
    app.dependency_overrides[get_repo]=lambda: repo
    try:
        with TestClient(app) as client: yield client,repo
    finally: app.dependency_overrides.clear()


def test_unconnected_workspace_has_no_database_export_query(client_repo):
    client,repo=client_repo
    assert client.get('/api/erpnext').json()=={'enabled':False,'mode':'draft_only'}
    assert client.get(f'/api/executions/{RUN}/erpnext').json()=={'enabled':False}
    repo.detail.assert_awaited_once_with(RUN)
    repo.rows.assert_not_called()


def test_export_state_checks_record_ownership(client_repo):
    client,repo=client_repo
    repo.detail.side_effect=ServiceError('Execution not found.',404,'not_found')
    assert client.get(f'/api/executions/{RUN}/erpnext').status_code==404
    repo.rows.assert_not_called()


def test_wrong_owner_cannot_import_or_export(client_repo):
    client,repo=client_repo
    assert client.post('/api/erpnext/purchase-orders',json={'reference':'PO-1'}).status_code==403
    assert client.post(f'/api/executions/{RUN}/erpnext').status_code==403
    repo.request.assert_not_called()


def test_import_reference_validation(client_repo):
    client,repo=client_repo
    for reference in ['', 'x'*141, 'PO?fields=password']:
        assert client.post('/api/erpnext/purchase-orders',json={'reference':reference}).status_code==422
    repo.request.assert_not_called()
