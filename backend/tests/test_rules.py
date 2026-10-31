from datetime import date

import pytest

from app.services.rules import evaluate


def decision(invoice, vendors, pos, prior=None):
    return evaluate(invoice, vendors, pos, prior or [], today=date(2026, 10, 31))


def test_happy_path_is_ready_not_payment(invoice, vendors, pos):
    result = decision(invoice, vendors, pos)
    assert result.outcome == "ready"
    assert all(rule.status == "pass" for rule in result.rules)
    assert "no payment" in result.summary


def test_partial_invoice_overage_uses_accepted_balance(invoice, vendors, pos):
    pos[0]["accepted_amount"] = "60000.00"
    invoice.subtotal = invoice.total = "45000.00"
    invoice.line_items[0].amount = "45000.00"
    result = decision(invoice, vendors, pos)
    rule = next(r for r in result.rules if r.code == "po_remaining_balance")
    assert result.outcome == "needs_review"
    assert rule.status == "review"
    assert "overage 5000.00" in rule.detected


def test_partial_invoice_exact_remaining_passes(invoice, vendors, pos):
    pos[0]["accepted_amount"] = "40000.00"
    assert decision(invoice, vendors, pos).outcome == "ready"


def test_duplicate_ignores_case_and_punctuation(invoice, vendors, pos):
    prior = [{"id": "earlier-run", "vendor_name": "NORTHSTAR OFFICE SUPPLIES", "invoice_number": "ns / 1001", "review_status": "pending"}]
    result = decision(invoice, vendors, pos, prior)
    assert result.outcome == "blocked"
    assert "earlier-run" in next(r.detected for r in result.rules if r.code == "duplicate_invoice")


def test_rejected_invoice_allows_corrected_resubmission(invoice, vendors, pos):
    prior = [{"id": "earlier-run", "vendor_name": invoice.vendor_name, "invoice_number": invoice.invoice_number, "review_status": "rejected"}]
    assert decision(invoice, vendors, pos, prior).outcome == "ready"


@pytest.mark.parametrize("field", ["invoice_number", "po_reference", "total", "tax", "currency"])
def test_missing_information_never_passes(invoice, vendors, pos, field):
    setattr(invoice, field, None)
    result = decision(invoice, vendors, pos)
    assert result.outcome == "needs_review"
    assert field in next(r.detected for r in result.rules if r.code == "required_fields")


def test_duplicate_precedence_over_missing_fields(invoice, vendors, pos):
    invoice.po_reference = None
    prior = [{"id": "old", "vendor_name": invoice.vendor_name, "invoice_number": invoice.invoice_number, "review_status": "approved"}]
    assert decision(invoice, vendors, pos, prior).outcome == "blocked"


def test_hallucinated_or_absent_evidence_requires_review(invoice, vendors, pos):
    invoice.evidence = []
    assert decision(invoice, vendors, pos).outcome == "needs_review"


def test_currency_mismatch_does_not_compare_money(invoice, vendors, pos):
    invoice.currency = "USD"
    result = decision(invoice, vendors, pos)
    assert result.outcome == "needs_review"
    assert not any(r.code == "po_remaining_balance" for r in result.rules)


@pytest.mark.parametrize("change", ["closed_po", "wrong_vendor", "unapproved_vendor", "tax_mismatch", "future_date", "bad_arithmetic", "uncertainty"])
def test_business_exceptions_escalate(invoice, vendors, pos, change):
    if change == "closed_po": pos[0]["status"] = "closed"
    if change == "wrong_vendor": pos[0]["vendor_id"] = "other-vendor"
    if change == "unapproved_vendor": vendors[0]["approved"] = False
    if change == "tax_mismatch": invoice.vendor_tax_id = "DIFFERENT-ID"
    if change == "future_date": invoice.invoice_date = "2035-01-01"
    if change == "bad_arithmetic": invoice.tax = "10.00"
    if change == "uncertainty": invoice.uncertainties = ["Ambiguous line description"]
    assert decision(invoice, vendors, pos).outcome == "needs_review"


def test_decimal_rounding_tolerance(invoice, vendors, pos):
    invoice.tax = "0.01"
    assert decision(invoice, vendors, pos).outcome == "ready"
    invoice.tax = "0.02"
    assert decision(invoice, vendors, pos).outcome == "needs_review"
