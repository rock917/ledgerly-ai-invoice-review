# Demo scenarios

All documents and reference records are synthetic. Amounts use INR; PO-2026-1001 has a gross limit of 100,000. Tax zero is an explicit test assumption, not a legal claim.

Run in this order against the seeded database:

| Input | Preconditions | Expected behaviour | Live actual result |
|---|---|---|---|
| 01-valid-partial-invoice.pdf | PO accepted amount = 0 | Ready, total 60,000; inspect evidence then approve; remaining PO amount = 40,000 | PASS: ready, then approved; 5.306s processing |
| 02-missing-invoice-number.pdf | None | Needs review; invoice number remains null, missing field identified; request information | PASS: needs_review; number null; information request saved |
| 03-duplicate-renamed.pdf | First invoice processed | Blocked duplicate despite different filename; prior run referenced | PASS: blocked; original execution linked in rule evidence |
| 04-partial-invoice-overage.pdf | First invoice human-approved | Needs review; remaining 40,000 vs invoice 45,000; overage 5,000 | PASS: needs_review; overage 5000; database also refuses approval |

The happy path is not counted as an edge case. The other three are designed business edge cases. All four were executed using real Groq and Supabase through the local React interface on 31 October 2026. Detailed execution IDs and rule results are in docs/live-test-results.json. These are local end-to-end results, not public deployment results.

The database seed is non-destructive and does not reset accepted balances. Rehearsals need a new set of uniquely numbered invoices and fresh POs, or an explicitly authorized reset of the dedicated demo dataset. Do not reset someone else's project.

Additional reliability cases: corrupt or oversized PDF; scan with no text; malformed AI output; timeout; 429 quota; database outage; unauthorized upload/review; concurrent approvals. Mocked Python tests cover several failure boundaries. Actual PostgreSQL concurrency and public deployment remain to be tested.

## Public approval rehearsal

`05-live-approval-invoice.pdf` uses the fresh invoice number `NS-2026-LIVE-003`, Northstar Office Supplies, PO-2026-1001, and INR 10,000. Generate it with `python backend/scripts/generate_samples.py --approval-only`.

Precondition: this invoice number has not been processed and the PO has at least INR 10,000 remaining. With the earlier approved INR 60,000 invoice, expect `ready`, then human approval changes the accepted balance to INR 70,000 and remaining balance to INR 30,000. Approval is a demo database operation; it does not initiate payment. The candidate verified this public approval on 1 November: accepted INR 70,000; remaining INR 30,000. This invoice is already approved. Reuploading the same invoice is expected to be blocked as a duplicate.

## Scanned invoice rehearsal

`06-scanned-invoice.pdf` contains only an image, with no hidden text layer. Invoice `NS-2026-OCR-004` is for INR 5,000 against PO-2026-1001. It was visually checked and tested locally through actual OCR, Groq extraction and Supabase reference reads; all 11 rules passed. That check made no database writes. The deployed Azure backend processed this sample on 2 November (Asia/Calcutta) in 35.687 seconds and saved it ready for review. It remains unapproved. Re-uploading it now should trigger duplicate detection. This is one measured execution, not a load-test result.

Generate with `python backend/scripts/generate_ocr_sample.py`, then verify with `python backend/scripts/check_ocr.py --live`, using the project virtual environment.
