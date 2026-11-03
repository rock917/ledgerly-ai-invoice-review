# Ledgerly progress - 3 November 2026

## Latest: embedded tutorial video

- Added a roughly 71-second captioned WebM walkthrough to the sign-in page and New invoice, with an Overview link, native playback/fullscreen controls, poster and text transcript. No autoplay or external video host.
- Recorded locally with synthetic Auth/API responses, clearly labeled staged sample results. Covers sign-in, sample selection, workflow submission, rules/evidence, review notes and the PO balance. No live accounts, emails, approvals or database writes.
- TypeScript/Vite build, existing mocked auth/sample/review browser checks, and video playback/seeking/mobile checks pass. Encoded video frames inspected to ensure review controls remain visible above the captions.

- Published through GitHub/Vercel. Read-only public-site checks passed for anonymous playback, seeking, transcript, mobile layout and HTTP 206 byte-range delivery. See `tutorial-check-results.json`.

## Recruiter sample walkthrough

- Added five downloadable PDFs and explicit Use sample controls on New invoice, plus an empty-workspace entry point. Selection fills the upload form; Start workflow is still required.
- Guide explains scenario order, review notes, changing PO balances, duplicate history, and slower OCR. No workspace reset is performed.
- Public copies match the original synthetic PDFs byte for byte; the scan has no text layer. TypeScript/Vite build and mocked browser checks passed, including all downloads, no automatic submissions, invalid-PDF handling, explicit multipart upload, desktop/mobile layout and both themes.
- `DEMO_WALKTHROUGH.md` includes reviewer instructions and a suggested recording outline. A short staged tutorial is now recorded; see the video update below. It is instructional material, not a new live-provider test.
- Owner screenshots/report confirm Google OAuth production mode and successful sign-in with a non-test account, plus email confirmation and password recovery. The cross-account invoice URL test returned Execution not found. Broader live API isolation testing remains outside those manual checks.

## Deployed baseline

- GitHub: https://github.com/rock917/ledgerly-ai-invoice-review
- Frontend: https://ledgerly-ai-invoice-review.vercel.app
- Backend: https://ledgerly-api-bobby-h3e4dnf4g3hsh9ej.centralindia-01.azurewebsites.net
- User-provided deployment logs show a successful Azure build; public health returned HTTP 200/configured true.
- User screenshots confirm the public run `289a4956-3580-40a6-98d4-5728b61f3479` (NS-2026-LIVE-003, INR 10,000) completed in 6.1 seconds, was approved, and raised PO-2026-1001 accepted balance to INR 70,000, leaving INR 30,000.
- Earlier local live tests remain in `live-test-results.json`. Those are historical results, not new production load/concurrency claims.

## New implementation: deployed and verified

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

## Deployment result

The candidate deployed the backend successfully. Independent API checks passed: health, Supabase connectivity, approval filters and CORS. Public OCR run `f72c2c0a-b057-4416-bda8-d7c17fea9151` completed in 35.687 seconds, ready for review, with all 11 checks passing. It remains unapproved and no PO balance changed. Frontend commit `741739d` is deployed through Vercel. Real-browser checks passed for layout, theme persistence, approved/pending filters, summary, OCR detail, form gating, and mobile overflow. No reviews were submitted during those checks. See `azure-ocr-check-results.json` and `production-ui-check-results.json`.

## Remaining work

- One scanned run is verified on Azure B1. Measure memory and multi-page/load behavior separately.
- Keep the same single worker/instance; in-process workflows are not durable.
- Exercise actual PostgreSQL concurrent approval behavior and deployment load separately.
- Set up the planned local ERPNext demo, then implement/test a connector against real test records. No simulated sync success.
- Login is deployed; owner-reported live checks are recorded below and in `auth-deployment-check-results.json`.
- Record the demo video using `DEMO_WALKTHROUGH.md`, confirm submission requirements against the candidate guide, and rehearse interview explanations.

No payments are initiated. Existing approved invoices and purchase-order balances were not reset or altered by the new OCR checks.

## Next user-facing step

The quick tour now includes a 94-second English AI voiceover, optional narration subtitles and native mute controls. It retains the staged-demo label and burned-in instructions. The narration is pre-generated using free local tooling and an online speech service; viewers play a static MP4, with no paid speech API or backend change. Commit c0c220e is deployed on Vercel. TypeScript/Vite build and local/public Chrome checks passed for audio decoding, 11 subtitle cues, seeking, transcript, themes and mobile width. Public MP4 serving and near-end HTTP 206 range requests passed. See `narration-check-results.json` for release verification.

Open New invoice and try the sample walkthrough in a workspace with fresh sample history. Prepare the recording using `DEMO_WALKTHROUGH.md`. Existing history and balances are retained; a previously processed sample can trigger duplicate detection in that account. ERPNext remains a separately documented setup plan.


## Login release — deployed; manual live checks completed

Implemented Google/email signup and login, confirmation/reset flow, logout, private workspace provisioning, verified session ownership, per-account sample POs, and reviewer UUID audit records. Themes and OCR remain supported. All 73 backend tests pass. PGlite tests execute the actual migration and verify idempotency, cross-owner constraints, independent same-invoice approvals, balance protection, and denied anon/authenticated access. Mock browser checks pass; see auth-ui-check-results.json.

The user applied the migration, configured SMTP/redirect URLs and Vercel public variables, and deployed the auth backend. Commit 2ae6733 was fast-forwarded to main and deployed by Vercel. Azure health returned 200, unauthenticated /api/me returned 401, and a real browser verified the enabled login screen and Google redirect. The owner subsequently verified Google sign-in (including a non-test account), email confirmation, recovery, private workspaces, and a cross-account invoice URL denial. Google Audience is In production; the owner reported disabling ENABLE_LEGACY_DEMO. These are bounded manual checks, not a comprehensive audit. Existing shared history is preserved and does not appear in a new private account. Follow AUTH_SETUP.md. ERPNext remains a plan only.
