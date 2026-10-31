from pathlib import Path

import pytest
from pydantic import ValidationError

from app.core.errors import ServiceError
from app.schemas import Invoice
from app.services.documents import extract_pages


def test_sample_pdf_is_readable_and_contains_actual_amount():
    sample = Path(__file__).resolve().parents[2] / "sample_data" / "01-valid-partial-invoice.pdf"
    pages = extract_pages(sample.read_bytes(), 5)
    assert len(pages) == 1
    assert "NS-2026-001" in pages[0]
    assert "60000.00" in pages[0]


def test_corrupt_pdf_explains_the_error():
    with pytest.raises(ServiceError) as exc:
        extract_pages(b"%PDF-this-is-corrupted", 5)
    assert exc.value.code == "unreadable_pdf"


def test_not_provided_is_missing_not_a_valid_identifier(invoice):
    result = Invoice.model_validate(invoice.model_dump() | {"invoice_number": "NOT PROVIDED"})
    assert result.invoice_number is None


@pytest.mark.parametrize("amount", ["NaN", "Infinity", "1,000.00", "100.001"])
def test_invalid_monetary_formats_rejected(invoice, amount):
    with pytest.raises(ValidationError):
        Invoice.model_validate(invoice.model_dump() | {"total": amount})
