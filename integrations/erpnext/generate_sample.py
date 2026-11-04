"""Generate the synthetic invoice for the local ERP pilot (no credentials)."""
from pathlib import Path

from reportlab.lib.colors import HexColor
from reportlab.lib.pagesizes import A4
from reportlab.pdfgen import canvas

ROOT = Path(__file__).resolve().parents[2]
OUTPUT = ROOT / 'output/pdf/erpnext-demo-invoice.pdf'


def main():
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    c = canvas.Canvas(str(OUTPUT), pagesize=A4)
    c.setTitle('Ledgerly ERPNext synthetic invoice')
    c.setFillColor(HexColor('#0f766e'))
    c.rect(0, 730, A4[0], 112, fill=1, stroke=0)
    c.setFillColor(HexColor('#ffffff'))
    c.setFont('Helvetica-Bold', 24)
    c.drawString(42, 787, 'INVOICE')
    c.setFont('Helvetica', 11)
    c.drawString(42, 760, 'Synthetic ERP integration sample')
    c.setFillColor(HexColor('#182230'))
    c.setFont('Helvetica-Bold', 16)
    c.drawString(42, 689, 'Ledgerly Demo Supplies')
    c.setFont('Helvetica', 11)
    lines = [
        'Vendor tax identifier: DEMO-ERP-001',
        'Bill to: Ledgerly Demo',
        'Invoice number: ERP-LIVE-20261104-001',
        'Invoice date: 2026-11-04',
        'Purchase order: PUR-ORD-2026-00001',
        'Currency: INR',
    ]
    for index, line in enumerate(lines):
        c.drawString(42, 661 - index * 24, line)
    c.setFillColor(HexColor('#e8f5f1'))
    c.rect(42, 476, 511, 32, fill=1, stroke=0)
    c.setFillColor(HexColor('#182230'))
    c.setFont('Helvetica-Bold', 10)
    for x, label in [(52, 'Description'), (321, 'Qty'), (375, 'Unit price'), (478, 'Amount')]:
        c.drawString(x, 488, label)
    c.setFont('Helvetica', 10)
    c.drawString(52, 451, 'Office consumables (non-stock)')
    c.drawString(321, 451, '10')
    c.drawRightString(437, 451, '1000.00')
    c.drawRightString(543, 451, '10000.00')
    c.setStrokeColor(HexColor('#d4dedb'))
    c.line(42, 430, 553, 430)
    c.setFont('Helvetica', 11)
    c.drawString(340, 397, 'Subtotal INR')
    c.drawRightString(543, 397, '10000.00')
    c.drawString(340, 371, 'Tax INR')
    c.drawRightString(543, 371, '0.00')
    c.setFont('Helvetica-Bold', 13)
    c.drawString(340, 334, 'TOTAL DUE INR')
    c.drawRightString(543, 334, '10000.00')
    c.setFont('Helvetica', 10)
    c.drawString(42, 248, 'Tax is explicitly zero for this synthetic scenario.')
    c.drawString(42, 229, 'For demonstration only. No actual goods, charges or payment obligation.')
    c.setFillColor(HexColor('#52616b'))
    c.setFont('Helvetica', 9)
    c.drawString(42, 42, 'Ledgerly ERPNext pilot | Synthetic data')
    c.drawRightString(553, 42, 'Page 1 of 1')
    c.save()
    print(str(OUTPUT))


if __name__ == '__main__':
    main()
