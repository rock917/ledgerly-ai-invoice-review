import copy
import json
from types import SimpleNamespace
from unittest.mock import AsyncMock

import httpx
import pytest

from app.core.errors import ServiceError
from app.services.erpnext import ERPNext


@pytest.fixture
def pilot():
    settings = SimpleNamespace(erpnext_url='http://localhost:18080', erpnext_api_key='test-key',
        erpnext_api_secret='test-secret', erpnext_company='Demo', erpnext_owner_id='owner-a', app_env='development')
    mapping = dict(reference='PO-ERP-1', supplier='Supplier-1', supplier_name='Demo supplier', tax_id=None,
        company='Demo', currency='INR', amount='100000', item_code='SERVICES', po_detail='line1',
        uom='Nos', qty='100', rate='1000', expense_account='Expenses - D', cost_center='Main - D')
    run = dict(id='execution-1', po_id='po-1', status='completed', review_status='approved', outcome='ready',
        vendor_name='Demo supplier', invoice_number='INV-1', currency='INR', total='10000', extraction=dict(
        po_reference='PO-ERP-1', invoice_number='INV-1', invoice_date='2026-11-01', currency='INR',
        tax='0', subtotal='10000', total='10000', line_items=[dict(quantity='10', unit_price='1000', amount='10000')]))
    repo = AsyncMock()
    repo.owner_id = 'owner-a'
    repo.detail.return_value = run
    repo.rows.return_value = [{'erp_snapshot': mapping}]
    state = {'record': None, 'creates': 0, 'timeout': False, 'unique': True}
    async def rpc(method, path, json):
        if path.endswith('ap_erp_claim'):
            return {'status': 'pending', 'lease_token': json['p_token']}
        return {'status': 'synced' if json['p_document_id'] else 'failed', 'erp_document_id': json['p_document_id']}
    repo.request.side_effect = rpc
    def transport(request):
        path = request.url.path
        if '/Custom Field/' in path:
            return httpx.Response(200, json={'data': dict(dt='Purchase Invoice', fieldname='custom_ledgerly_execution_id', fieldtype='Data', unique=int(state['unique']))})
        if path.endswith('/Purchase Invoice') and request.method == 'POST':
            state['creates'] += 1
            state['record'] = json.loads(request.content) | {'name': 'PINV-1', 'grand_total': 10000, 'total_taxes_and_charges': 0}
            if state['timeout']: raise httpx.ReadTimeout('timeout', request=request)
            return httpx.Response(200, json={'data': state['record']})
        if path.endswith('/Purchase Invoice'):
            return httpx.Response(200, json={'data': [{'name': 'PINV-1'}] if state['record'] else []})
        if path.endswith('/Purchase Invoice/PINV-1'):
            return httpx.Response(200, json={'data': state['record']})
        raise AssertionError(path)
    client = httpx.AsyncClient(transport=httpx.MockTransport(transport))
    erp = ERPNext(settings, client)
    erp.snapshot = AsyncMock(return_value=mapping)
    return erp, repo, state, run, mapping


async def test_export_and_retry_reconcile_one_draft(pilot):
    erp, repo, state, *_ = pilot
    first = await erp.export(repo, 'execution-1')
    second = await erp.export(repo, 'execution-1')
    assert first == second == {'status': 'synced', 'erp_document_id': 'PINV-1', 'error_message': None, 'attempts': None, 'updated_at': None}
    assert state['creates'] == 1
    assert state['record']['docstatus'] == 0
    assert state['record']['update_stock'] == 0


async def test_timeout_after_remote_save_reconciles(pilot):
    erp, repo, state, *_ = pilot
    state['timeout'] = True
    assert (await erp.export(repo, 'execution-1'))['status'] == 'synced'
    assert state['creates'] == 1


async def test_other_workspace_cannot_export_or_import(pilot):
    erp, repo, state, *_ = pilot
    repo.owner_id = 'owner-b'
    for action in (erp.export, erp.import_po):
        with pytest.raises(ServiceError, match='not connected'): await action(repo, 'execution-1')
    repo.detail.assert_not_called()
    erp.snapshot.assert_not_called()
    assert state['creates'] == 0


@pytest.mark.parametrize('field,value', [('review_status','pending'),('review_status','rejected'),('status','running'),('outcome','blocked')])
async def test_unapproved_invoice_cannot_export(pilot, field, value):
    erp, repo, state, run, _ = pilot
    run[field] = value
    with pytest.raises(ServiceError, match='Human approval'): await erp.export(repo, 'execution-1')
    assert state['creates'] == 0
    repo.request.assert_not_called()


async def test_unique_remote_reference_required(pilot):
    erp, repo, state, *_ = pilot
    state['unique'] = False
    with pytest.raises(ServiceError, match='unique Ledgerly'): await erp.export(repo, 'execution-1')
    assert state['creates'] == 0


async def test_remote_po_change_prevents_export(pilot):
    erp, repo, state, _, mapping = pilot
    erp.snapshot.return_value = mapping | {'rate': '2000'}
    with pytest.raises(ServiceError, match='changed since import'): await erp.export(repo, 'execution-1')
    assert state['creates'] == 0


async def test_existing_wrong_draft_is_never_overwritten(pilot):
    erp, repo, state, *_ = pilot
    await erp.export(repo, 'execution-1')
    state['record']['supplier'] = 'Other supplier'
    with pytest.raises(ServiceError, match='differs'): await erp.export(repo, 'execution-1')
    assert state['creates'] == 1


async def test_active_lease_prevents_second_request(pilot):
    erp, repo, state, *_ = pilot
    repo.request.side_effect = None
    repo.request.return_value = {'status': 'pending', 'lease_token': 'another-worker'}
    with pytest.raises(ServiceError, match='already running'): await erp.export(repo, 'execution-1')
    assert state['creates'] == 0


@pytest.mark.parametrize('change', ['tax','rate','quantity','total','currency','multiple_lines'])
def test_unsupported_invoice_is_explicitly_rejected(pilot, change):
    erp, _, _, run, mapping = pilot
    run = copy.deepcopy(run)
    if change == 'multiple_lines': run['extraction']['line_items'] *= 2
    elif change in ('rate','quantity'): run['extraction']['line_items'][0]['unit_price' if change == 'rate' else change] = '999'
    else: run['extraction'][change] = 'USD' if change == 'currency' else '99'
    with pytest.raises(ServiceError): erp.payload(run,mapping)


def test_http_only_allowed_on_local_development(pilot):
    erp, *_ = pilot
    erp.authorize('owner-a')
    erp.settings.app_env = 'production'
    with pytest.raises(ServiceError, match='HTTPS'): erp.authorize('owner-a')


async def test_remote_errors_never_expose_secrets(pilot):
    erp, *_ = pilot
    erp.client = httpx.AsyncClient(transport=httpx.MockTransport(lambda _: httpx.Response(403, text='test-secret traceback')))
    with pytest.raises(ServiceError) as error: await erp.request('GET','/api/resource/Company')
    assert str(error.value) == 'ERPNext returned HTTP 403. Check the integration account permissions and ERP logs.'
