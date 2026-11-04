"""Package the public sample PDFs and instructions without changing invoices."""
from pathlib import Path
from zipfile import ZIP_DEFLATED, ZipFile

samples = Path(__file__).resolve().parents[1] / "frontend/public/assets/samples"
files = [
    "TEST-INSTRUCTIONS.txt",
    "01-valid-partial-invoice.pdf",
    "03-duplicate-renamed.pdf",
    "04-partial-invoice-overage.pdf",
    "02-missing-invoice-number.pdf",
    "06-scanned-invoice.pdf",
]
for name in files:
    if not (samples / name).is_file():
        raise FileNotFoundError(samples / name)

with ZipFile(samples / "ledgerly-interview-samples.zip", "w", ZIP_DEFLATED) as archive:
    for name in files:
        archive.write(samples / name, name)
print("Packaged five sample PDFs and test instructions.")
