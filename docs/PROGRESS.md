# Milestone tracker

Updated 1 November 2026. Out-of-pocket budget: INR 0; existing Azure student credits authorized for backend hosting. Selected problem: PS-1. Local application name: Ledgerly.

Status describes verified progress, not just source files written. Cloud deployment is a separate gate.

| Milestone | Status | Evidence / next gate |
|---|---|---|
| Problem selection | COMPLETED | Candidate confirmed PS-1 |
| Requirements analysis | COMPLETED | All 7 guide pages read; official requirements distinguished from preferred stack |
| Workflow architecture | COMPLETED | Scope, policy, and recovery documented in DECISIONS.md |
| Database setup | COMPLETED | User applied schema and seed; live table/vendor/PO connectivity verified |
| Backend foundation | COMPLETED | Health, readiness, auth, upload validation, API routes verified |
| Core AI workflow | COMPLETED | All four cases executed through React/FastAPI with real Groq and Supabase |
| Happy-path testing | COMPLETED | Real Groq extraction; 11 passed checks; approval saved; PO balance reduced from 100000 to 40000 |
| React frontend | COMPLETED | Production build and live desktop/mobile browser checks pass for the initial scope |
| Dashboard | COMPLETED | 4 completed, 0 failed, 3 pending reviews, 1 approved; UI matches Supabase |
| Live execution | COMPLETED | Browser reads actual persisted stages and final decision |
| Edge-case handling | COMPLETED | Missing number, renamed duplicate, cumulative PO overbilling verified live; 49 regression tests pass |
| Supabase persistence | COMPLETED | All 4 executions, 24 stages, review history and PO balance survive backend restart; private Storage verified |
| Vercel deployment | NOT STARTED | Free Hobby deployment and eligibility check pending |
| Azure backend deployment | IN PROGRESS | Replaces Render as primary host; packaging prepared, subscription verification and resource creation pending |
| End-to-end production testing | NOT STARTED | Local browser-to-cloud-provider tests do not count as public deployment |
| README | IN PROGRESS | Setup, architecture, policy, endpoints, deployment and limitations written; final links pending |
| Five-minute demo | NOT STARTED | Four synthetic sample inputs prepared; recording pending |
| Interview preparation | NOT STARTED | Architecture decisions documented; Q&A rehearsal pending |

## Verified checks

- Backend regression: 49 passed. One upstream TestClient/httpx deprecation warning; tests pass.
- Frontend TypeScript and Vite production build passed.
- Live Supabase tables, dashboard function, seeded vendor records, and initial PO balances verified.
- Groq credentials accepted and configured model available.
- Original PDF retrieval through private Supabase signed URL succeeded.
- Anonymous public-bucket access denied. Overbilling approval with a valid reviewer code rejected by the database; no review/balance mutation occurred.
- Live browser suite passed. Actual results are recorded in live-test-results.json. API keys and signed document URLs are excluded.
- Git initialized; .env files, virtual environment, dependencies, and temporary artifacts are ignored.

## Bugs discovered and fixed during real testing

1. Vite environment access through an alias compiled but failed at runtime. Replaced with direct import.meta.env access and verified the browser opened the app.
2. A Supabase read failed after successful approval. Added one bounded retry for safe reads only; writes and approvals are not blindly retried. Added regression coverage.
3. Database/application clock offset produced negative stage durations. New stages now use the application clock for both endpoints. Historical negative durations are labeled unavailable; historical timestamps are not rewritten.
4. A screen-reader-only table header escaped its scroll container on mobile. Positioned the table container and verified no page-level horizontal overflow at 390 px.

## Current local endpoints

- Frontend: http://127.0.0.1:5173/
- API health: http://127.0.0.1:8001/health
- Swagger: http://127.0.0.1:8001/docs

Port 8000 was already occupied and was not modified. Backend requires the local .env; no credentials are stored in this tracker.

## Remaining verification

Public deployment and simultaneous-approval concurrency testing remain separate milestones. No application payment functionality exists. The initial happy-path invoice is already approved, so re-uploading it now correctly returns a duplicate outcome. Prepare a fresh uniquely numbered invoice/PO set for the recorded happy-path demo; do not reset existing records without an explicit decision.

## Session result

Local implementation and requested live integration checks passed. No keys printed or committed. Azure credit use was authorized on 1 November; no Azure resources have been provisioned. The backend ZIP is prepared with source/dependency files only. Next milestone: verify the student subscription's credit coverage and spending limit, deploy the backend on Azure and frontend on Vercel, then repeat the full workflow through the public URL. GitHub remote setup remains pending.
