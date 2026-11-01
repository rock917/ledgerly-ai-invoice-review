"""Real offline OCR smoke check; --live also checks Groq and reads Supabase.

Never creates an execution, writes a PO, or approves an invoice.
"""
import argparse
import asyncio
import json
import sys
import time
from io import BytesIO
from pathlib import Path

import httpx
from pypdf import PdfReader, PdfWriter

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from app.core.config import Settings
from app.database import Repository
from app.services.ai import GroqExtractor
from app.services.documents import extract_pages
from app.services.ocr import prepare_document
from app.services.rules import evaluate, identity


async def check(live: bool):
    root = Path(__file__).resolve().parents[2]
    data = (root / 'sample_data/06-scanned-invoice.pdf').read_bytes()
    native = extract_pages(data, 5)
    assert native == [''], 'Fixture must have no hidden text layer'
    start = time.monotonic()
    result = await prepare_document(data, native)
    seconds = round(time.monotonic() - start, 2)
    for expected in ['NS-2026-OCR-004', 'PO-2026-1001', '5000.00', 'Northstar Office Supplies']:
        assert expected in result.pages[0], f'OCR missed fixture field: {expected}'
    assert result.ocr_pages == [1] and not result.warnings

    # A native first page and scanned second page retain their source numbering.
    writer = PdfWriter()
    writer.add_page(PdfReader(root / 'sample_data/05-live-approval-invoice.pdf').pages[0])
    writer.add_page(PdfReader(BytesIO(data)).pages[0])
    combined = BytesIO()
    writer.write(combined)
    pages = extract_pages(combined.getvalue(), 5)
    mixed = await prepare_document(combined.getvalue(), pages)
    assert mixed.ocr_pages == [2] and mixed.pages[0] == pages[0]
    assert 'NS-2026-OCR-004' in mixed.pages[1]

    blank = PdfWriter()
    blank.add_blank_page(600, 800)
    content = BytesIO()
    blank.write(content)
    empty = await prepare_document(content.getvalue(), [''])
    assert not empty.pages[0].strip() and empty.warnings
    report = {'image_only_ocr': 'passed', 'mixed_pages': 'passed', 'blank_scan': 'review_required',
              'single_page_ocr_seconds_local': seconds, 'cloud_checks': 'not_run', 'database_writes': 0}
    if live:
        settings = Settings()
        async with httpx.AsyncClient() as client:
            invoice = await GroqExtractor(settings, client).extract(result.pages)
            assert invoice.invoice_number == 'NS-2026-OCR-004'
            assert invoice.total == '5000.00'
            repo = Repository(settings, client)
            vendors, pos, prior = await asyncio.gather(repo.rows('vendors'), repo.rows('purchase_orders'), repo.rows('executions', {
                'invoice_identity': 'eq.' + identity(invoice.vendor_name) + ':' + identity(invoice.invoice_number),
                'status': 'eq.completed', 'select': 'id,vendor_name,invoice_number,review_status',
            }))
            decision = evaluate(invoice, vendors, pos, prior)
            report.update(cloud_checks='real Groq extraction and Supabase reads passed', outcome=decision.outcome,
                          checks=[{'code': rule.code, 'status': rule.status} for rule in decision.rules])
    print(json.dumps(report, indent=2))
    output = root / 'tmp' / 'ocr-check.json'
    output.parent.mkdir(exist_ok=True)
    output.write_text(json.dumps(report, indent=2) + '\n', encoding='utf-8')


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--live', action='store_true')
    args = parser.parse_args()
    asyncio.run(check(args.live))
