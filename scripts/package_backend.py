"""Build an Azure ZIP from an allowlist; never include local environment files."""
from pathlib import Path
from zipfile import ZIP_DEFLATED, ZipFile
import argparse

root = Path(__file__).resolve().parents[1]
backend = root / "backend"
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--auth', action='store_true', help='Name the artifact for the login rollout; apply workspace migration before deploying.')
args = parser.parse_args()
output = root / "tmp" / "deploy" / ("ledgerly-backend-auth.zip" if args.auth else "ledgerly-backend.zip")
files = [backend / "requirements.txt", *sorted((backend / "app").rglob("*.py"))]
if not (backend / "app" / "main.py").is_file():
    raise SystemExit("Backend entry point missing")
output.parent.mkdir(parents=True, exist_ok=True)
with ZipFile(output, "w", ZIP_DEFLATED) as archive:
    for source in files:
        archive.write(source, source.relative_to(backend).as_posix())
with ZipFile(output) as archive:
    names = archive.namelist()
    assert "requirements.txt" in names and "app/main.py" in names
    assert all(name == "requirements.txt" or (name.startswith("app/") and name.endswith(".py")) for name in names)
    assert not any(".env" in name or "__pycache__" in name for name in names)
    assert archive.testzip() is None
print(f"Verified deployment package: {output}")
print(f"{len(names)} source/dependency files; no environment files, tests, logs, or credentials packaged.")
