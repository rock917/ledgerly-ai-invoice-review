"""Reproducible synthetic demo PDFs. Run from repository root with the project venv."""
from pathlib import Path
from shutil import copyfile

from reportlab.lib.colors import HexColor
from reportlab.lib.pagesizes import A4
from reportlab.pdfgen.canvas import Canvas

OUTPUT = Path(__file__).resolve().parents[2] / "sample_data"
OUTPUT.mkdir(exist_ok=True)


def invoice(filename: str, number: str | None, amount: int, description: str):
    path = OUTPUT / filename
    pdf = Canvas(str(path), pagesize=A4, invariant=True)
    pdf.setTitle("Synthetic invoice - Northstar Office Supplies")
    pdf.setAuthor("Ledgerly case study fixtures")
    pdf.setFillColor(HexColor("#164d42"))
    pdf.rect(0, 750, 596, 92, stroke=0, fill=1)
    pdf.setFillColor(HexColor("#ffffff"))
    pdf.setFont("Helvetica-Bold", 23)
    pdf.drawString(44, 796, "NORTHSTAR")
    pdf.setFont("Helvetica", 11)
    pdf.drawString(44, 775, "Office Supplies")
    pdf.setFillColor(HexColor("#263b33"))
    pdf.setFont("Helvetica-Bold", 24)
    pdf.drawString(44, 708, "INVOICE")
    pdf.setFont("Helvetica", 10)
    lines = ["Vendor: Northstar Office Supplies", "Vendor tax identifier: DEMO-TAX-001", f"Invoice number: {number or 'NOT PROVIDED'}", "Invoice date: 2026-10-20", "Purchase order: PO-2026-1001", "Currency: INR", "Bill to: Example Operations Ltd (synthetic company)"]
    for i, line in enumerate(lines): pdf.drawString(44, 677 - i * 23, line)
    pdf.setFillColor(HexColor("#edf3e9"))
    pdf.rect(44, 447, 506, 30, fill=1, stroke=0)
    pdf.setFillColor(HexColor("#4c6740"))
    pdf.setFont("Helvetica-Bold", 10)
    for x, label in [(54, "Description"), (310, "Qty"), (365, "Unit price (INR)"), (466, "Amount (INR)")]: pdf.drawString(x, 458, label)
    pdf.setFillColor(HexColor("#263b33"))
    pdf.setFont("Helvetica", 10)
    pdf.drawString(54, 426, description)
    pdf.drawString(310, 426, "1")
    pdf.drawRightString(440, 426, f"{amount:.2f}")
    pdf.drawRightString(540, 426, f"{amount:.2f}")
    pdf.setStrokeColor(HexColor("#dce4d6"))
    pdf.line(44, 406, 550, 406)
    for y, label, value in [(365, "Subtotal", f"INR {amount:.2f}"), (338, "Tax (synthetic scenario)", "INR 0.00"), (299, "TOTAL DUE", f"INR {amount:.2f}")]:
        pdf.setFont("Helvetica-Bold" if y == 299 else "Helvetica", 12 if y == 299 else 10)
        pdf.drawString(295, y, label)
        pdf.drawRightString(540, y, value)
    pdf.setFont("Helvetica", 10)
    pdf.drawString(44, 225, "Payment terms: Net 30 days")
    pdf.drawString(44, 204, "This is a partial invoice against the referenced purchase order.")
    pdf.setFillColor(HexColor("#8a9780"))
    pdf.setFont("Helvetica", 9)
    pdf.drawString(44, 75, "SYNTHETIC TEST DOCUMENT - NOT A TAX INVOICE OR PAYMENT REQUEST")
    pdf.drawString(44, 59, "Created for workflow testing. No real vendor, bank account, or transaction.")
    pdf.save()
    return path


first = invoice("01-valid-partial-invoice.pdf", "NS-2026-001", 60000, "Office workstation supplies - first delivery")
invoice("02-missing-invoice-number.pdf", None, 10000, "Office consumables")
copyfile(first, OUTPUT / "03-duplicate-renamed.pdf")
invoice("04-partial-invoice-overage.pdf", "NS-2026-002", 45000, "Office workstation supplies - second delivery")
print("Created four synthetic invoice fixtures in sample_data/.")
