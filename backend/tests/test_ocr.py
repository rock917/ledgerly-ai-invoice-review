import asyncio
from io import BytesIO
from unittest.mock import AsyncMock

import pytest
from pypdf import PdfWriter

from app.core.errors import ServiceError
from app.services import ocr
from app.services.ocr import candidate_pages, merge_results


def blank_pdf(count=1):
    writer = PdfWriter()
    for _ in range(count):
        writer.add_blank_page(width=600, height=800)
    output = BytesIO()
    writer.write(output)
    return output.getvalue()


def test_hybrid_document_selects_only_sparse_pages():
    native = 'Native invoice details including identifiers and monetary totals. ' * 3
    assert candidate_pages(blank_pdf(2), [native, '']) == [1]


def test_merge_keeps_native_page_and_flags_uncertain_ocr():
    text = 'Invoice OCR-001: total INR 1000.00; supplier Northstar.'
    result = merge_results(['native text', ''], [1], [{'index': 1, 'text': text, 'scores': [0.99, 0.5]}])
    assert result.pages == ['native text', text]
    assert result.ocr_pages == [2]
    assert 'Page 2' in result.warnings[0]


def test_blank_scan_is_not_invented():
    result = merge_results([''], [0], [{'index': 0, 'text': '', 'scores': []}])
    assert result.pages == ['']
    assert 'insufficient' in result.warnings[0]


def test_ocr_output_limit_and_missing_page_are_rejected():
    with pytest.raises(ServiceError, match='20,000'):
        merge_results([''], [0], [{'index': 0, 'text': 'x' * 20001, 'scores': [1]}])
    with pytest.raises(ServiceError, match='incomplete page'):
        merge_results(['', ''], [0, 1], [{'index': 0, 'text': '', 'scores': []}])


async def test_native_text_does_not_start_ocr(monkeypatch):
    spawn = AsyncMock()
    monkeypatch.setattr(ocr.asyncio, 'create_subprocess_exec', spawn)
    pages = ['Full readable native invoice text. ' * 4]
    result = await ocr.prepare_document(blank_pdf(), pages)
    assert result.pages == pages and not result.ocr_pages
    spawn.assert_not_called()


async def test_timeout_kills_worker_and_does_not_accept_text(monkeypatch):
    from unittest.mock import Mock
    process = Mock(returncode=None)
    process.communicate = AsyncMock(side_effect=TimeoutError)
    process.wait = AsyncMock()
    monkeypatch.setattr(ocr.asyncio, 'create_subprocess_exec', AsyncMock(return_value=process))
    with pytest.raises(ServiceError) as error:
        await ocr.prepare_document(blank_pdf(), [''])
    assert error.value.code == 'ocr_timeout'
    process.kill.assert_called_once()
    process.wait.assert_awaited_once()


async def test_cancel_kills_worker(monkeypatch):
    from unittest.mock import Mock
    process = Mock(returncode=None)
    process.communicate = AsyncMock(side_effect=asyncio.CancelledError)
    process.wait = AsyncMock()
    monkeypatch.setattr(ocr.asyncio, 'create_subprocess_exec', AsyncMock(return_value=process))
    with pytest.raises(asyncio.CancelledError):
        await ocr.prepare_document(blank_pdf(), [''])
    process.kill.assert_called_once()
