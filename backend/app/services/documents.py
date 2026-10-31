from io import BytesIO

from pypdf import PdfReader

from app.core.errors import ServiceError


def extract_pages(data: bytes, max_pages: int) -> list[str]:
    if not data.startswith(b"%PDF-"):
        raise ServiceError("The file is not a PDF. Upload a valid invoice PDF.", 422, "invalid_pdf")
    try:
        reader = PdfReader(BytesIO(data))
        if reader.is_encrypted:
            raise ServiceError("Password-protected PDFs are not supported. Upload an unlocked copy.", 422, "encrypted_pdf")
        if not 1 <= len(reader.pages) <= max_pages:
            raise ServiceError(f"Upload an invoice with 1–{max_pages} pages.", 422, "page_limit")
        pages = [page.extract_text() or "" for page in reader.pages]
        if sum(len(p) for p in pages) > 20000:
            raise ServiceError("The document exceeds the 20,000-character processing limit.", 422, "document_too_long")
        return pages
    except ServiceError:
        raise
    except Exception as exc:
        raise ServiceError("The PDF could not be read. Upload a readable, uncorrupted copy.", 422, "unreadable_pdf") from exc
