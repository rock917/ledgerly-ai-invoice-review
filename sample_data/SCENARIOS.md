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
