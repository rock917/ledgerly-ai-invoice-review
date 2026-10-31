"""Business policy v1: gross totals, explicit PO references, no automatic payments."""
import re
from datetime import date
from decimal import Decimal, InvalidOperation

from app.schemas import Decision, Invoice, RuleResult


def identity(value: str | None) -> str:
    return re.sub(r"[^A-Z0-9]", "", (value or "").upper())


def evaluate(invoice: Invoice, vendors: list[dict], pos: list[dict], prior: list[dict], today: date | None = None) -> Decision:
    rules: list[RuleResult] = []

    def add(code, status, title, detected, policy, action):
        rules.append(RuleResult(code=code, status=status, title=title, detected=detected, rule=policy, next_action=action))

    required = ["vendor_name", "invoice_number", "invoice_date", "po_reference", "currency", "subtotal", "tax", "total"]
    missing = [field for field in required if not str(getattr(invoice, field) or "").strip()]
    add("required_fields", "review" if missing else "pass", "Required information", ", ".join(missing) if missing else "All required fields present", "Do not infer missing identifiers or amounts.", "Request a corrected invoice." if missing else "No action needed.")
    try:
        valid_date = date.fromisoformat(invoice.invoice_date or "") <= (today or date.today())
    except ValueError:
        valid_date = False
    add("invoice_date", "pass" if valid_date else "review", "Invoice date", invoice.invoice_date or "Missing date", "Date must be ISO YYYY-MM-DD and cannot be in the future.", "No action needed." if valid_date else "Verify the invoice date.")

    # Require grounded excerpts for every critical extracted field.
    supported = {e.field for e in invoice.evidence if e.quote.strip() and e.page > 0}
    unsupported = [field for field in required if getattr(invoice, field) is not None and field not in supported]
    add("source_evidence", "review" if unsupported else "pass", "Source evidence", ", ".join(unsupported) if unsupported else "Critical fields have document excerpts", "Every critical field needs a verified source excerpt.", "Inspect the source document." if unsupported else "No action needed.")
    if invoice.uncertainties:
        add("extraction_uncertainty", "review", "Extraction uncertainty", "; ".join(invoice.uncertainties), "Unresolved extraction uncertainty requires human attention.", "Inspect the document and request corrections as needed.")

    matched = [v for v in vendors if identity(v["name"]) == identity(invoice.vendor_name)] if identity(invoice.vendor_name) else []
    vendor = matched[0] if len(matched) == 1 else None
    approved = vendor is not None and vendor["approved"]
    add("approved_vendor", "pass" if approved else "review", "Approved vendor", vendor["name"] if vendor else "No unique vendor match", "Require one exact normalized vendor match in the approved vendor register.", "No action needed." if approved else "Ask procurement to verify the vendor.")
    if vendor and invoice.vendor_tax_id and vendor.get("tax_id"):
        tax_match = identity(vendor["tax_id"]) == identity(invoice.vendor_tax_id)
        add("vendor_tax_id", "pass" if tax_match else "review", "Vendor identifier", invoice.vendor_tax_id, "A supplied tax identifier must match the vendor register; this is not government verification.", "No action needed." if tax_match else "Resolve the conflicting vendor identity.")

    matches = [p for p in pos if identity(p["reference"]) == identity(invoice.po_reference)] if identity(invoice.po_reference) else []
    po = matches[0] if len(matches) == 1 else None
    po_ok = bool(po and vendor and po["vendor_id"] == vendor["id"] and po["status"] == "open")
    add("purchase_order", "pass" if po_ok else "review", "Purchase order match", po["reference"] if po else "No unique explicit PO match", "PO must be open, explicit, and belong to the matched vendor.", "No action needed." if po_ok else "Confirm the PO reference and vendor with procurement.")

    duplicate = next((r for r in prior if identity(invoice.invoice_number) and identity(r.get("vendor_name")) == identity(invoice.vendor_name) and identity(r.get("invoice_number")) == identity(invoice.invoice_number) and r.get("review_status") != "rejected"), None)
    add("duplicate_invoice", "block" if duplicate else "pass", "Duplicate invoice", f"Previously processed as {duplicate['id']}" if duplicate else "No matching vendor + invoice number", "An existing non-rejected invoice with the same normalized vendor and number cannot be accepted twice.", "Review the original execution; do not resubmit for payment." if duplicate else "No action needed.")

    if all(getattr(invoice, field) is not None for field in ["subtotal", "tax", "total"]):
        subtotal, tax, total = (Decimal(getattr(invoice, f)) for f in ["subtotal", "tax", "total"])
        valid_amounts = subtotal >= 0 and tax >= 0 and total > 0 and abs(subtotal + tax - total) <= Decimal("0.01")
        add("invoice_arithmetic", "pass" if valid_amounts else "review", "Invoice arithmetic", f"Subtotal {subtotal} + tax {tax} vs total {total}", "Nonnegative subtotal and tax; positive total; rounding difference at most 0.01. Credits are outside this release.", "No action needed." if valid_amounts else "Request corrected amounts or review the rounding discrepancy.")
        if invoice.line_items:
            try:
                amounts = [Decimal(item.amount) for item in invoice.line_items if item.amount is not None]
                line_ok = len(amounts) == len(invoice.line_items) and all(a.is_finite() and a >= 0 for a in amounts) and abs(sum(amounts) - subtotal) <= Decimal("0.01")
            except (InvalidOperation, TypeError):
                line_ok = False
            add("line_items", "pass" if line_ok else "review", "Line item reconciliation", f"{len(invoice.line_items)} extracted line items", "Line amounts must sum to the pretax subtotal within 0.01; ambiguous tax-inclusive lines require review.", "No action needed." if line_ok else "Verify line-item tax treatment and amounts.")
        if po:
            currency_ok = (invoice.currency or "").upper() == po["currency"]
            add("currency", "pass" if currency_ok else "review", "Currency agreement", f"Invoice {invoice.currency}; PO {po['currency']}", "Invoice and PO currencies must match. No FX conversion.", "No action needed." if currency_ok else "Resolve the currency mismatch.")
            if currency_ok:
                remaining = Decimal(str(po["amount"])) - Decimal(str(po["accepted_amount"]))
                within = total <= remaining
                add("po_remaining_balance", "pass" if within else "review", "Remaining PO balance", f"Invoice {total}; remaining {remaining}; overage {max(total - remaining, Decimal(0))}", "Gross invoice total must not exceed the remaining gross PO balance. No overbilling tolerance.", "No action needed." if within else "Ask procurement for a corrected invoice or an authorized PO amendment.")

    outcome = "blocked" if any(r.status == "block" for r in rules) else "needs_review" if any(r.status == "review" for r in rules) else "ready"
    summary = {"ready": "All configured checks passed. Ready for human AP approval; no payment has been initiated.", "needs_review": "Review required. Resolve the flagged checks before accepting this invoice.", "blocked": "Duplicate invoice detected. Acceptance is blocked; inspect the original execution."}[outcome]
    return Decision(outcome=outcome, summary=summary, rules=rules, po_id=po["id"] if po else None)
