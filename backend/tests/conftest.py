import pytest

from app.schemas import Invoice


@pytest.fixture
def invoice():
    values = dict(vendor_name="Northstar Office Supplies", vendor_tax_id="DEMO-TAX-001", invoice_number="NS-1001", invoice_date="2026-10-20", po_reference="PO-2026-1001", currency="INR", subtotal="60000.00", tax="0.00", total="60000.00", line_items=[{"description": "Office supplies", "quantity": "10", "unit_price": "6000.00", "amount": "60000.00"}], uncertainties=[])
    evidence = [{"field": key, "quote": str(values[key]), "page": 1} for key in ["vendor_name", "invoice_number", "invoice_date", "po_reference", "currency", "subtotal", "tax", "total"]]
    return Invoice(**values, evidence=evidence)


@pytest.fixture
def vendors():
    return [{"id": "vendor-1", "name": "Northstar Office Supplies", "tax_id": "DEMO-TAX-001", "approved": True}]


@pytest.fixture
def pos():
    return [{"id": "po-1", "reference": "PO-2026-1001", "vendor_id": "vendor-1", "currency": "INR", "amount": "100000.00", "accepted_amount": "0.00", "status": "open"}]
