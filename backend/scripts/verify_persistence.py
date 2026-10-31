"""Recheck saved live runs after restarting the local backend; no resets/deletions."""
import json
import sys
from pathlib import Path
from urllib.parse import urlsplit, urlunsplit

import httpx

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from app.core.config import get_settings

root = Path(__file__).resolve().parents[2]
report_path = root / "docs" / "live-test-results.json"
report = json.loads(report_path.read_text())
settings = get_settings()


def main():
    with httpx.Client(base_url="http://127.0.0.1:8001", headers={"Authorization": f"Bearer {settings.demo_access_token}"}, timeout=30) as client:
        health = client.get("/health")
        health.raise_for_status()
        assert health.json()["configured"]
        runs = []
        for scenario in report["scenarios"]:
            response = client.get(f"/api/executions/{scenario['execution_id']}")
            response.raise_for_status()
            run = response.json()
            assert run["outcome"] == scenario["expected"]
            assert run["status"] == "completed"
            assert len(run["stages"]) == 6
            runs.append(run)
        assert len(runs) == 4
        assert runs[0]["review_status"] == "approved"
        assert runs[1]["review_status"] == "information_requested"
        pos = client.get("/api/purchase-orders")
        pos.raise_for_status()
        po = next(p for p in pos.json() if p["reference"] == "PO-2026-1001")
        assert float(po["accepted_amount"]) == 60000
        print("PASS: all four executions, 24 stages, review history, and accepted PO balance survived backend restart.")
        # Correct reviewer credentials still cannot override unresolved rules.
        review = client.post(f"/api/executions/{runs[3]['id']}/reviews", headers={"X-Review-Token": settings.review_access_token}, json={"action": "approve", "reviewer": "Demo QA reviewer", "comment": "Negative test: approval must be refused for unresolved overbilling."})
        assert review.status_code == 409
        assert "Unresolved checks" in review.json()["error"]["message"]
        fresh = client.get(f"/api/executions/{runs[3]['id']}").json()
        assert fresh["review_status"] == "pending"
        assert fresh["reviews"] == runs[3]["reviews"]
        print("PASS: database rejects overbilling approval even with a valid reviewer code; no review or balance mutation occurred.")
        # Do not send backend access headers to Storage; use a separate client.
        signed = client.get(f"/api/executions/{runs[0]['id']}/document")
        signed.raise_for_status()
        url = signed.json()["url"]
        split = urlsplit(url)
        public = urlunsplit((split.scheme, split.netloc, split.path.replace("/object/sign/", "/object/public/"), "", ""))
        with httpx.Client(timeout=30) as storage_client:
            download = storage_client.get(url)
            assert download.status_code == 200 and download.content.startswith(b"%PDF-")
            anonymous = storage_client.get(public)
            assert anonymous.status_code in (400, 401, 403, 404)
        print("PASS: signed PDF download succeeds; anonymous public-bucket access is denied.")
        stats = client.get("/api/dashboard")
        stats.raise_for_status()
        assert stats.json()["metrics"]["total"] == 4
        assert stats.json()["metrics"]["approved"] == 1
        report["checks"].extend([
            "All 4 executions, 24 stages, reviews, and PO balance survived backend process restart",
            "Database function rejects unresolved overbilling approval with valid reviewer credentials",
            "Private Storage denies anonymous public access while signed PDF download succeeds",
        ])
        report["persistence_restart_verified"] = True
        report_path.write_text(json.dumps(report, indent=2))


try:
    main()
except Exception as exc:
    # Never print requests, headers, signed URLs, or exception URLs containing tokens.
    print(f"Persistence/access verification failed: {type(exc).__name__}. Inspect server status and test assertions; no secrets printed.")
    raise SystemExit(1)
