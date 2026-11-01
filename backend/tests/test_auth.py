from unittest.mock import AsyncMock

import httpx
import pytest
from fastapi.testclient import TestClient

from app.auth import Identity, authenticate
from app.core.config import Settings
from app.core.errors import ServiceError
from app.database import Repository
from app.main import app, authorize, get_repo

OWNER = '10000000-0000-4000-8000-000000000001'
EXECUTION = '20000000-0000-4000-8000-000000000001'


def config(**kwargs):
    return Settings(_env_file=None, supabase_url='https://auth.example.test', supabase_service_role_key='fake-service', **kwargs)


@pytest.mark.asyncio
async def test_verified_identity_comes_from_auth_not_metadata():
    def respond(req):
        assert req.headers['Authorization'] == 'Bearer session-test'
        assert req.url.path == '/auth/v1/user'
        return httpx.Response(200, json={'id': OWNER, 'email': 'a@example.test', 'email_confirmed_at': '2026-01-01', 'user_metadata': {'id': 'forged', 'full_name': 'Alice'}})
    async with httpx.AsyncClient(transport=httpx.MockTransport(respond)) as client:
        assert await authenticate('session-test', config(), client) == Identity(OWNER, 'Alice', 'a@example.test')


@pytest.mark.asyncio
@pytest.mark.parametrize('status,body,expected', [(401,{},401),(403,{},401),(500,{},503),(200,{'id':'invalid'},401),(200,{'id':OWNER,'email':'a@example.test'},403),(200,{'id':OWNER,'email':'a@example.test','email_confirmed_at':'now','is_anonymous':True},403)])
async def test_invalid_sessions_fail_closed(status,body,expected):
    async with httpx.AsyncClient(transport=httpx.MockTransport(lambda _: httpx.Response(status,json=body))) as client:
        with pytest.raises(ServiceError) as error:
            await authenticate('invalid-test',config(),client)
        assert error.value.status_code == expected


@pytest.mark.asyncio
async def test_legacy_code_is_disabled_by_default_and_missing_token_never_calls_auth():
    calls=[]
    def respond(req):
        calls.append(req)
        return httpx.Response(401)
    async with httpx.AsyncClient(transport=httpx.MockTransport(respond)) as client:
        with pytest.raises(ServiceError):
            await authenticate('',config(),client)
        assert not calls
        with pytest.raises(ServiceError):
            await authenticate('old-code',config(demo_access_token='old-code'),client)
        assert len(calls)==1
        assert (await authenticate('old-code',config(demo_access_token='old-code',enable_legacy_demo=True),client)).user_id is None


@pytest.mark.asyncio
async def test_auth_network_failure_is_safe():
    def respond(req):
        raise httpx.ConnectError('private transport details',request=req)
    async with httpx.AsyncClient(transport=httpx.MockTransport(respond)) as client:
        with pytest.raises(ServiceError) as error:
            await authenticate('secret-test',config(),client)
        assert error.value.status_code==503
        assert 'private' not in error.value.message and 'secret-test' not in error.value.message


@pytest.mark.asyncio
@pytest.mark.parametrize('owner,scope',[(OWNER,'eq.'+OWNER),(None,'is.null')])
async def test_repository_scopes_reads_writes_and_stages(owner,scope):
    async with httpx.AsyncClient() as client:
        repo=Repository(config(),client,owner)
        repo.request=AsyncMock(return_value=[])
        await repo.rows('executions',{'owner_id':'eq.attacker'})
        assert repo.request.call_args.kwargs['params']['owner_id']==scope
        await repo.update(EXECUTION,{'status':'completed'})
        assert repo.request.call_args.kwargs['params']['owner_id']==scope
        await repo.create({'id':EXECUTION,'owner_id':'forged'})
        assert repo.request.call_args.kwargs['json']['owner_id']==owner
        await repo.stage(EXECUTION,0,'Receive','completed')
        assert repo.request.call_args.kwargs['params']['owner_id']==scope
        with pytest.raises(ServiceError) as error:
            await repo.detail(EXECUTION)
        assert error.value.status_code==404


@pytest.fixture
def private_client():
    repo=AsyncMock()
    repo.owner_id=OWNER
    app.dependency_overrides[authorize]=lambda: Identity(OWNER,'Verified Alice','a@example.test')
    app.dependency_overrides[get_repo]=lambda: repo
    try:
        with TestClient(app) as client:
            yield client,repo
    finally:
        app.dependency_overrides.clear()


def test_review_uses_session_identity_and_rejects_short_notes(private_client):
    client,repo=private_client
    repo.request.return_value={'review_status':'approved'}
    response=client.post(f'/api/executions/{EXECUTION}/reviews',json={'action':'approve','comment':'Checked carefully','reviewer':'Spoofed name'})
    assert response.status_code==200
    payload=repo.request.call_args.kwargs['json']
    assert payload['p_owner_id']==OWNER and payload['p_reviewer']=='Verified Alice'
    response=client.post(f'/api/executions/{EXECUTION}/reviews',json={'action':'approve','comment':'    x    '})
    assert response.status_code==422


def test_foreign_documents_and_reviews_are_hidden(private_client):
    client,repo=private_client
    repo.detail.side_effect=ServiceError('Execution not found.',404,'not_found')
    assert client.get(f'/api/executions/{EXECUTION}/document').status_code==404
    assert client.post(f'/api/executions/{EXECUTION}/reviews',json={'action':'approve','comment':'Checked carefully'}).status_code==404
    repo.signed_url.assert_not_called()
    repo.request.assert_not_called()


def test_profile_provisions_verified_account_only(private_client):
    client,repo=private_client
    repo.request.return_value={'id':OWNER,'display_name':'Verified Alice'}
    assert client.get('/api/me?user_id=forged').json()['id']==OWNER
    assert repo.request.call_args.kwargs['json']=={'p_user_id':OWNER,'p_display_name':'Verified Alice'}
