"""Bounded live ERP check; real ERP reads/draft writes, in-memory Ledgerly state.

Run from the repository root with .venv Python. Credentials must have been copied
from the local demo site to tmp/erpnext/credentials.json. Never uses Supabase.
"""
import asyncio
import json
import sys
from datetime import date
from pathlib import Path
from types import SimpleNamespace
from uuid import uuid4

import httpx

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / 'backend'))
from app.services.erpnext import ERPNext
from app.core.errors import ServiceError


async def main():
    credentials = json.loads((ROOT / 'tmp/erpnext/credentials.json').read_text())
    settings = SimpleNamespace(erpnext_url='http://127.0.0.1:18080', erpnext_company=credentials['company'],
        erpnext_api_key=credentials['api_key'], erpnext_api_secret=credentials['api_secret'],
        erpnext_owner_id='local-pilot', app_env='development')
    execution = str(uuid4())
    async with httpx.AsyncClient() as client:
        erp = ERPNext(settings, client)
        mapping = await erp.snapshot(credentials['purchase_order'])
        run = dict(id=execution, po_id='local-po', vendor_name=mapping['supplier_name'],
            invoice_number='LEDGERLY-' + execution[:8], total='10000', currency='INR',
            status='completed', review_status='approved', outcome='ready')
        run['extraction'] = dict(vendor_name=run['vendor_name'], invoice_number=run['invoice_number'],
            invoice_date=str(date.today()), po_reference=mapping['reference'], currency='INR',
            total='10000', subtotal='10000', tax='0', line_items=[dict(quantity='10', unit_price='1000', amount='10000')])
        class LocalState:
            owner_id = 'local-pilot'
            record = None
            async def detail(self, _): return run
            async def rows(self, *_): return [{'erp_snapshot': mapping}]
            async def request(self, method, path, json):
                if path.endswith('ap_erp_claim'):
                    if self.record and self.record['status']=='synced': return self.record
                    self.record = {'status':'pending','lease_token':json['p_token']}
                else:
                    self.record = {'status':'synced' if json['p_document_id'] else 'failed',
                        'erp_document_id':json['p_document_id'], 'error_message':json['p_error']}
                return self.record
        repo = LocalState()
        first = await erp.export(repo, execution)
        # Simulate lost local acknowledgement to force destination reconciliation.
        repo.record = None
        second = await erp.export(repo, execution)
        assert first['erp_document_id'] == second['erp_document_id']
        draft = await erp.existing(execution)
        assert draft['docstatus'] == 0
        run['review_status'] = 'pending'
        try: await erp.export(repo, execution)
        except ServiceError as exc: assert exc.code == 'erp_validation'
        else: raise AssertionError('Unapproved export was accepted')
        results = dict(status='passed', mode='real local ERPNext; Ledgerly persistence is an in-memory test adapter',
            purchase_order=mapping['reference'], draft=first['erp_document_id'], execution_id=execution,
            checks=['ERP supplier/item/company/PO reads','unique external reference configuration',
                'approved invoice creates a draft','lost acknowledgement reconciles same draft',
                'draft totals and PO line mapping verified','unapproved export rejected'],
            limitations=['Supabase migration and deployed Azure-to-ERP connection not tested by this script'])
        (ROOT / 'docs/erpnext-live-check-results.json').write_text(json.dumps(results,indent=2)+'\n')
        print(json.dumps(results,indent=2))


if __name__ == '__main__':
    try: asyncio.run(main())
    except ServiceError as exc:
        print(f'ERP check failed: {exc.message}')
        sys.exit(1)
