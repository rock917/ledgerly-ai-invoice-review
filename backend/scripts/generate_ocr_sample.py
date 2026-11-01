"""Create an image-only synthetic invoice to exercise the real OCR path."""
from io import BytesIO
from pathlib import Path

import pypdfium2 as pdfium
from pypdf import PdfReader
from reportlab.lib.pagesizes import A4
from reportlab.lib.utils import ImageReader
from reportlab.pdfgen.canvas import Canvas

from generate_samples import invoice
import generate_samples


def main():
    root = Path(__file__).resolve().parents[2]
    temporary = root / 'tmp' / 'pdfs'
    temporary.mkdir(parents=True, exist_ok=True)
    generate_samples.OUTPUT = temporary
    source = invoice('ocr-source.pdf', 'NS-2026-OCR-004', 5000, 'Office consumables - scanned delivery')
    with pdfium.PdfDocument(source) as pdf:
        page = pdf[0]
        bitmap = page.render(scale=2)
        picture = bitmap.to_pil().convert('RGB')
        bitmap.close()
        page.close()
    image_bytes = BytesIO()
    picture.save(image_bytes, format='JPEG', quality=90)
    target = root / 'sample_data' / '06-scanned-invoice.pdf'
    output = Canvas(str(target), pagesize=A4, invariant=True)
    output.setTitle('Synthetic scanned invoice - OCR test')
    output.drawImage(ImageReader(image_bytes), 0, 0, width=A4[0], height=A4[1])
    output.save()
    assert not PdfReader(target).pages[0].extract_text().strip()
    with pdfium.PdfDocument(target) as pdf:
        page = pdf[0]
        bitmap = page.render(scale=1.4)
        bitmap.to_pil().save(temporary / 'ocr-sample-preview.png')
        bitmap.close()
        page.close()
    print('Created sample_data/06-scanned-invoice.pdf; confirmed image-only (no text layer).')


if __name__ == '__main__':
    main()
