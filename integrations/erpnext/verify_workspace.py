"""Real pilot test. Prepare an invoice, then export only after user approval.

Uses ignored local credentials and owner.json. Never approves an invoice itself.
Run with `prepare` or `export`; repeat prepare reuses its recorded execution.
"""
import asyncio
import hashlib
import json
import sys
from pathlib import Path
from uuid import uuid4

import httpx

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / 'backend'))
from app.core.config import Settings
from app.core.errors import ServiceError
from app.database import Repository
from app.services.ai import GroqExtractor
from app.services.documents import extract_pages
from app.services.erpnext import ERPNext
from app.workflow import run_invoice


async def main(mode):
    private = ROOT / 'tmp/erpnext'
    state_path = private / 'workspace-check.json'
    credentials = json.loads((private / 'credentials.json').read_text())
    owner = json.loads((private / 'owner.json').read_text())['owner_id']
    settings = Settings().model_copy(update=dict(app_env='development',
        erpnext_url='http://127.0.0.1:18080', erpnext_company=credentials['company'],
        erpnext_api_key=credentials['api_key'], erpnext_api_secret=credentials['api_secret'],
        erpnext_owner_id=owner))
    async with httpx.AsyncClient() as client:
        repo = Repository(settings, client, owner)
        erp = ERPNext(settings, client)
        if mode == 'prepare':
            po = await erp.import_po(repo, credentials['purchase_order'])
            repeated = await erp.import_po(repo, credentials['purchase_order'])
            assert po['id'] == repeated['id'] and po['accepted_amount'] == repeated['accepted_amount']
            print('Real ERP PO imported; repeated import preserved its ID and accepted balance.', flush=True)
            if state_path.exists():
                state = json.loads(state_path.read_text())
                assert state['owner_id'] == owner, 'Saved test belongs to another workspace'
                execution = state['execution_id']
            else:
                content = (ROOT / 'output/pdf/erpnext-demo-invoice.pdf').read_bytes()
                pages = extract_pages(content, settings.max_pdf_pages)
                digest = hashlib.sha256(content).hexdigest()
                existing = await repo.rows('executions', {'file_hash': 'eq.' + digest, 'select': 'id'})
                if existing:
                    execution = existing[0]['id']
                else:
                    execution = str(uuid4())
                    path = f'{owner}/{execution}/invoice.pdf'
                    await repo.upload(path, content)
                    await repo.create(dict(id=execution, filename='erpnext-demo-invoice.pdf', file_hash=digest, storage_path=path))
                    state_path.write_text(json.dumps(dict(owner_id=owner, execution_id=execution)))
                    await repo.stage(execution, 0, 'Receive invoice', 'running')
                    await repo.stage(execution, 0, 'Receive invoice', 'completed', 'Synthetic ERP pilot PDF validated and saved privately; 1 page.')
                    await run_invoice(execution, pages, repo, GroqExtractor(settings, client), settings.groq_model, content)
                state_path.write_text(json.dumps(dict(owner_id=owner, execution_id=execution)))
            run = await repo.detail(execution)
            print(json.dumps({key: run.get(key) for key in ['id','invoice_number','status','outcome','review_status','error_code','error_message']}, indent=2))
            assert run['status'] == 'completed' and run['outcome'] == 'ready', 'Invoice did not pass workflow checks'
            report = dict(status='awaiting_human_approval', execution_id=execution,
                invoice_number=run['invoice_number'], purchase_order=credentials['purchase_order'],
                mode='Local connector with real ERPNext, Supabase and Groq',
                checks=['PO import persisted in selected workspace','Repeated import preserved ID and balance','PDF saved privately','Real Groq extraction and workflow checks passed'],
                limitations=['Human approval and real persisted export remain pending','Public Azure-to-ERP hosting is not configured'])
        else:
            state = json.loads(state_path.read_text())
            assert state['owner_id'] == owner
            execution = state['execution_id']
            run = await repo.detail(execution)
            if run['review_status'] != 'approved':
                raise ServiceError('Approve the synthetic invoice in Ledgerly before running export.', 409, 'approval_required')
            before = await repo.rows('purchase_orders', {'id': 'eq.' + run['po_id']})
            first = await erp.export(repo, execution)
            second = await erp.export(repo, execution)
            assert first['erp_document_id'] == second['erp_document_id']
            draft = await erp.existing(execution)
            assert draft['docstatus'] == 0
            after = await repo.rows('purchase_orders', {'id': 'eq.' + run['po_id']})
            assert before[0]['accepted_amount'] == after[0]['accepted_amount']
            report = dict(status='passed', execution_id=execution, invoice_number=run['invoice_number'],
                purchase_order=credentials['purchase_order'], draft=first['erp_document_id'],
                mode='Local connector with real ERPNext, Supabase and Groq; user approved through Ledgerly',
                checks=['PO import and repeated import','PDF storage and real Groq workflow','Human approval persisted','ERP draft created and verified','Repeated export returned same draft','Export did not change accepted PO balance'],
                limitations=['Public Azure-to-ERP hosting is not configured'])
        (ROOT / 'docs/erpnext-workspace-check-results.json').write_text(json.dumps(report, indent=2) + '\n')
        print(json.dumps(report, indent=2))


if __name__ == '__main__':
    if len(sys.argv) != 2 or sys.argv[1] not in ('prepare', 'export'):
        raise SystemExit('Usage: verify_workspace.py prepare|export')
    try:
        asyncio.run(main(sys.argv[1]))
    except ServiceError as exc:
        print(f'{exc.code}: {exc.message}')
        sys.exit(1)
