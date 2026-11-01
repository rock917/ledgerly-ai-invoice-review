# Ledgerly progress - 2 November 2026

## Deployed baseline

- GitHub: https://github.com/rock917/ledgerly-ai-invoice-review
- Frontend: https://ledgerly-ai-invoice-review.vercel.app
- Backend: https://ledgerly-api-bobby-h3e4dnf4g3hsh9ej.centralindia-01.azurewebsites.net
- User-provided deployment logs show a successful Azure build; public health returned HTTP 200/configured true.
- User screenshots confirm the public run `289a4956-3580-40a6-98d4-5728b61f3479` (NS-2026-LIVE-003, INR 10,000) completed in 6.1 seconds, was approved, and raised PO-2026-1001 accepted balance to INR 70,000, leaving INR 30,000.
- Earlier local live tests remain in `live-test-results.json`. Those are historical results, not new production load/concurrency claims.

## New implementation: backend live; frontend release in progress

| Change | Evidence |
|---|---|
| Selected #6 minimal layout | Invoice table, filters, selected-invoice summary; desktop/mobile screenshots inspected |
| Light / Dark / System themes | Browser checks passed for persistence and OS-theme changes |
| Human review clarity | Approved/rejected history filters, pending-only queue explanation, final decision banner, explicit minimum note length |
| Backend filters | Whitelisted review-status filter and pending queue tests pass |
| Local OCR | Image-only sample and mixed pages read; blank page requires review |
| Real providers with OCR | Groq extraction and Supabase read checks passed; all 11 business rules passed; no database writes |
| Regression checks | 59 Python tests pass; TypeScript/Vite build passes |
| ERPNext | Candidate requested a setup plan; `ERP_NEXT_PLAN.md` prepared; no account or connection created |

The OCR smoke report is in `ocr-check-results.json`. Single-page OCR took 5.75 seconds locally on Windows, not measured on Azure. UI browser checks use mocked API fixtures; real OCR/provider checks are a separate read-only test. This distinction is intentional.

## Immediate next step

The candidate deployed the backend successfully. Independent API checks passed: health, Supabase connectivity, approval filters and CORS. Public OCR run `f72c2c0a-b057-4416-bda8-d7c17fea9151` completed in 35.687 seconds, ready for review, with all 11 checks passing. It remains unapproved and no PO balance changed. Release and verify the matching frontend next. See `azure-ocr-check-results.json`.

## Remaining work

- One scanned run is verified on Azure B1. Measure memory and multi-page/load behavior separately.
- Keep the same single worker/instance; in-process workflows are not durable.
- Exercise actual PostgreSQL concurrent approval behavior and deployment load separately.
- Set up the planned local ERPNext demo, then implement/test a connector against real test records. No simulated sync success.
- Optional verified reviewer identities/login remain a separate future change.
- Update the final reviewer walkthrough, record the maximum five-minute video, and rehearse interview explanations.

No payments are initiated. Existing approved invoices and purchase-order balances were not reset or altered by the new OCR checks.
