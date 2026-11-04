"""Restricted ERPNext pilot: one workspace, explicit PO import, draft invoices only."""
import json
from datetime import date
from decimal import Decimal, InvalidOperation
from urllib.parse import quote, urlsplit
from uuid import uuid4

import httpx

from app.core.errors import ServiceError
from app.services.rules import identity


def require(condition, message):
    if not condition:
        raise ServiceError(message, 409, "erp_validation")


def number(value):
    try:
        result = Decimal(str(value))
        if not result.is_finite():
            raise ValueError()
        return result
    except (InvalidOperation, ValueError, TypeError):
        raise ServiceError("ERP mapping contains a missing or invalid number.", 409, "erp_validation")


class ERPNext:
    def __init__(self, settings, client):
        self.settings, self.client = settings, client
        self.base = settings.erpnext_url.rstrip("/")

    def enabled(self, owner):
        return bool(owner and owner == self.settings.erpnext_owner_id and all([
            self.base, self.settings.erpnext_api_key, self.settings.erpnext_api_secret, self.settings.erpnext_company]))

    def authorize(self, owner):
        if not self.enabled(owner):
            raise ServiceError("ERPNext is not connected to this private workspace.", 403, "erp_not_connected")
        url = urlsplit(self.base)
        local = url.hostname in ("localhost", "127.0.0.1") and self.settings.app_env == "development"
        require(url.scheme == "https" or (local and url.scheme == "http"), "ERPNext requires HTTPS outside local development.")
        require(bool(url.hostname) and not url.username and not url.password and not url.query and not url.fragment and url.path in ("", "/"), "ERPNext must use a plain site origin.")

    async def request(self, method, path, **kwargs):
        try:
            response = await self.client.request(method, self.base + path,
                headers={"Authorization": f"token {self.settings.erpnext_api_key}:{self.settings.erpnext_api_secret}"},
                follow_redirects=False, timeout=15, **kwargs)
        except httpx.HTTPError as exc:
            raise ServiceError("ERPNext could not be reached. Retry checks for an existing draft before creating another.", 502, "erp_unavailable") from exc
        if response.status_code >= 300:
            # Never return ERP tracebacks, cookies or credential-bearing requests to a client.
            raise ServiceError(f"ERPNext returned HTTP {response.status_code}. Check the integration account permissions and ERP logs.", 502, "erp_rejected")
        try:
            return response.json()
        except ValueError as exc:
            raise ServiceError("ERPNext returned an invalid response.", 502, "erp_invalid_response") from exc

    async def doc(self, kind, name):
        data = await self.request("GET", f"/api/resource/{quote(kind, safe='')}/{quote(name, safe='')}")
        require(isinstance(data.get("data"), dict), "ERPNext document response is missing.")
        return data["data"]

    async def snapshot(self, reference):
        po = await self.doc("Purchase Order", reference)
        require(po.get("company") == self.settings.erpnext_company, "This purchase order belongs to another ERP company.")
        require(po.get("docstatus") == 1 and po.get("status") not in ("Closed", "Cancelled", "On Hold", "Completed"), "ERP purchase order must be submitted and open.")
        require(number(po.get("per_billed", 0)) == 0, "This pilot imports unbilled POs only; ERP-posted invoices need reconciliation.")
        require(po.get("currency") == "INR" and not po.get("taxes") and number(po.get("discount_amount", 0)) == 0, "Pilot supports INR POs without tax or discounts only.")
        require(len(po.get("items", [])) == 1, "Pilot requires exactly one non-stock PO line for an explicit mapping.")
        item = po["items"][0]
        qty, rate, total = number(item.get("qty")), number(item.get("rate")), number(po.get("grand_total"))
        require(qty > 0 and rate > 0 and total == qty * rate == number(po.get("net_total")), "PO totals or rates are inconsistent.")
        supplier = await self.doc("Supplier", po["supplier"])
        require(not supplier.get("disabled") and not supplier.get("on_hold"), "ERP supplier is disabled or on hold.")
        product = await self.doc("Item", item["item_code"])
        require(not product.get("disabled") and not product.get("is_stock_item"), "Pilot supports enabled non-stock items only.")
        company = await self.doc("Company", po["company"])
        expense = item.get("expense_account") or company.get("default_expense_account")
        center = item.get("cost_center") or company.get("cost_center")
        require(bool(expense and center and item.get("name") and item.get("uom")), "ERP expense account, cost center and PO line mapping are required.")
        return {"reference": po["name"], "supplier": po["supplier"], "supplier_name": supplier["supplier_name"],
            "tax_id": supplier.get("tax_id") or None, "company": po["company"], "currency": "INR", "amount": str(total),
            "item_code": item["item_code"], "po_detail": item["name"], "uom": item["uom"], "qty": str(qty), "rate": str(rate),
            "expense_account": expense, "cost_center": center}

    async def import_po(self, repo, reference):
        self.authorize(repo.owner_id)
        snapshot = await self.snapshot(reference)
        return await repo.request("POST", "/rest/v1/rpc/ap_erp_import", json={"p_owner_id": repo.owner_id, "p_snapshot": snapshot})

    async def check_unique_reference(self):
        field = await self.doc('Custom Field', 'Purchase Invoice-custom_ledgerly_execution_id')
        require(field.get('dt') == 'Purchase Invoice' and field.get('fieldname') == 'custom_ledgerly_execution_id'
            and field.get('fieldtype') == 'Data' and field.get('unique') == 1,
            'ERPNext needs a unique Ledgerly execution reference before export is allowed.')

    def payload(self, run, mapping):
        require(run.get("status") == "completed" and run.get("review_status") == "approved" and run.get("outcome") == "ready", "Human approval is required before export.")
        invoice = run.get("extraction") or {}
        require(identity(run.get("vendor_name")) == identity(mapping["supplier_name"]) and invoice.get("po_reference") == mapping["reference"], "Approved invoice does not match the ERP supplier and PO.")
        require(run.get("currency") == mapping["currency"] == invoice.get("currency"), "ERP and invoice currencies must agree.")
        require(number(invoice.get("tax")) == 0, "Pilot does not export tax-bearing invoices.")
        lines = invoice.get("line_items") or []
        require(len(lines) == 1, "Pilot requires one invoice line matching the PO line.")
        qty, rate = number(lines[0].get("quantity")), number(lines[0].get("unit_price"))
        total = number(run.get("total"))
        require(0 < qty <= number(mapping["qty"]) and rate == number(mapping["rate"]), "Invoice quantity/rate must match the ERP PO line; bundled amounts need manual mapping.")
        require(total == qty * rate == number(invoice.get("subtotal")) == number(invoice.get("total")) == number(lines[0].get("amount")), "Approved invoice totals do not reconcile for ERP export.")
        require(bool(invoice.get("invoice_number")) and invoice["invoice_number"] == run.get("invoice_number"), "Invoice number is missing or changed.")
        try:
            bill_date = date.fromisoformat(invoice["invoice_date"])
        except (ValueError, KeyError, TypeError):
            raise ServiceError("A valid invoice date is required for ERP export.", 409, "erp_validation")
        return {"doctype": "Purchase Invoice", "docstatus": 0, "supplier": mapping["supplier"], "company": mapping["company"],
            "currency": mapping["currency"], "bill_no": invoice["invoice_number"], "bill_date": str(bill_date),
            "posting_date": str(date.today()), "due_date": str(date.today()), "update_stock": 0,
            "custom_ledgerly_execution_id": run["id"], "items": [{"item_code": mapping["item_code"], "qty": float(qty),
            "rate": float(rate), "uom": mapping["uom"], "purchase_order": mapping["reference"], "po_detail": mapping["po_detail"],
            "expense_account": mapping["expense_account"], "cost_center": mapping["cost_center"]}], "taxes": []}

    async def existing(self, execution_id):
        data = await self.request("GET", "/api/resource/Purchase%20Invoice", params={
            "filters": json.dumps([["custom_ledgerly_execution_id", "=", execution_id]]),
            "fields": json.dumps(["name"]), "limit_page_length": 2})
        rows = data.get("data")
        require(isinstance(rows, list) and len(rows) <= 1, "ERP unique execution reference is missing or duplicated.")
        return await self.doc("Purchase Invoice", rows[0]["name"]) if rows else None

    def verify(self, doc, payload, total):
        require(doc.get("docstatus") == 0, "ERP document is no longer a draft. Inspect it in ERPNext; no new invoice was created.")
        require(not doc.get('update_stock'), 'ERP draft unexpectedly changes stock. Inspect it in ERPNext.')
        for key in ("supplier", "company", "currency", "bill_no", "bill_date", "custom_ledgerly_execution_id"):
            require(doc.get(key) == payload[key], "ERP draft differs from the approved invoice; inspect it before retrying.")
        require(number(doc.get("grand_total")) == number(total) and number(doc.get("total_taxes_and_charges", 0)) == 0,
            "ERP-calculated total differs from the approved total. Inspect the existing draft; it was not submitted.")
        items = doc.get("items") or []
        require(len(items) == 1, "ERP draft line mapping changed.")
        for key in ("purchase_order", "po_detail", "item_code", "expense_account", "cost_center", "uom"):
            require(items[0].get(key) == payload["items"][0][key], "ERP draft line mapping changed.")
        for key in ("qty", "rate"):
            require(number(items[0].get(key)) == number(payload["items"][0][key]), "ERP draft quantity or rate changed.")

    async def export(self, repo, execution_id):
        self.authorize(repo.owner_id)
        run = await repo.detail(execution_id)
        pos = await repo.rows("purchase_orders", {"id": f"eq.{run.get('po_id')}", "limit": "1"}) if run.get("po_id") else []
        require(bool(pos and pos[0].get("erp_snapshot")), "Import this purchase order from ERPNext before processing an invoice for it.")
        mapping = pos[0]["erp_snapshot"]
        payload = self.payload(run, mapping)
        token = str(uuid4())
        claim = await repo.request("POST", "/rest/v1/rpc/ap_erp_claim", json={"p_owner_id": repo.owner_id, "p_execution_id": execution_id, "p_token": token})
        if claim["status"] == "synced":
            return self.public_export(claim)
        require(claim.get("lease_token") == token, "An export is already running. Refresh its status; after an interruption wait three minutes before retrying.")
        try:
            await self.check_unique_reference()
            # Reconcile first: handles timeouts after ERP saved but before Supabase recorded it.
            draft = await self.existing(execution_id)
            if draft is None:
                fresh = await self.snapshot(mapping["reference"])
                require(fresh == mapping, "ERP PO or supplier changed since import. Inspect the mapping before export.")
                try:
                    await self.request("POST", "/api/resource/Purchase%20Invoice", json=payload)
                except ServiceError:
                    draft = await self.existing(execution_id)
                    if draft is None:
                        raise
                if draft is None:
                    draft = await self.existing(execution_id)
                require(draft is not None, "ERP draft creation could not be confirmed. Retry will reconcile before creating anything.")
            self.verify(draft, payload, run["total"])
            result = await repo.request("POST", "/rest/v1/rpc/ap_erp_finish", json={"p_owner_id": repo.owner_id,
                "p_execution_id": execution_id, "p_token": token, "p_document_id": draft["name"], "p_error": None})
            return self.public_export(result)
        except ServiceError as exc:
            try:
                await repo.request("POST", "/rest/v1/rpc/ap_erp_finish", json={"p_owner_id": repo.owner_id,
                    "p_execution_id": execution_id, "p_token": token, "p_document_id": None, "p_error": exc.message})
            except ServiceError:
                # Retain the first actionable error. The lease expires for safe reconciliation.
                pass
            raise

    def public_export(self, row):
        return {k: row.get(k) for k in ("status", "erp_document_id", "error_message", "attempts", "updated_at")}
