# Scope and design decisions

PS-1 selected by the candidate on 31 October 2026. Four-day delivery window. Hard budget: zero out-of-pocket spending, no automatic paid fallback. On 1 November 2026 the candidate authorized consuming existing Azure student credits for hosting, subject to verified coverage and the subscription spending limit remaining enabled.

## Official requirements versus implementation choices

The guide requires a live runnable process, visible stages and outputs, an interface/dashboard, 2-4 meaningful edge cases, a maximum five-minute video, and a live interview demonstration. Synthetic data is allowed. No Zamp or Pace tooling.

Chosen implementation: React/Vite/Tailwind/shadcn-style owned UI components on Vercel; Python/FastAPI on Azure App Service using student credits; Supabase PostgreSQL and private Storage; Groq Free. Render Free remains a fallback. No Railway paid plan. No payment execution, ERP connection, model training, vector database, or agent framework.

## Policy v1.0

- English text PDFs and clear printed scans, up to 5 MB / 5 pages / 20,000 extracted characters, one invoice per file.
- Sparse-text pages and pages containing large raster images use bounded offline OCR. Unreadable or low-score OCR text requires review. Source quotes are verified against transcriptions; compare with original pixels before approval. See OCR.md for limits and verified results.
- Vendor and PO matching use exact alphanumeric normalization. No fuzzy auto-approval.
- Required fields: vendor, invoice number, date, PO reference, currency, subtotal, tax, total.
- Dates must be unambiguous ISO dates and not future dates. Missing fields are never invented.
- Monetary arithmetic uses Decimal. Subtotal + tax must equal total within 0.01. Amounts have at most two decimals; credits and negative tax are unsupported.
- PO and invoice amounts are gross (tax included). Partial invoices consume PO balance only after human approval. No overbilling tolerance. No FX conversion.
- Duplicate identity is normalized vendor name plus invoice number. Prior non-rejected completed submissions block acceptance. Exact-file hashes coalesce active retries. The SQL unique index additionally prevents repeated approval of a business identity.
- All critical fields need source excerpts. Excerpt existence is checked; this is not a guarantee of semantic correctness. All ready invoices still require a person to approve.
- Any extraction ambiguity or incomplete/mismatched check routes to review. Explicit duplicate detection takes precedence and blocks the invoice.
- Approve is allowed only for a ready invoice. Approval locks and rechecks the PO, vendor, currency, and remaining balance in PostgreSQL. Reject is final. Request-information preserves the review trail; reject/resolve an old incomplete submission before resubmitting a corrected invoice with the same identifier.
- Approval means accepted by AP, never payment initiation. Purchase orders and vendor reference records are seeded; editing procurement data is outside the initial UI scope.

## Execution and recovery

Single FastAPI process with at most two active tasks. UI polls actual persisted stage records. Groq request timeout 45 seconds; one bounded retry for transient failures; workflow deadline 180 seconds. Status is separate from business outcome. No fake extraction fallback and no SQLite fallback.

An in-process task is not durable. Graceful shutdown attempts to mark interrupted runs. Reads recover running records older than ten minutes as interrupted. A crash/database outage can leave an interim record; resubmission is the retry mechanism. Stay single-instance/single-worker for this release. A durable queue is a future scaling decision.

## Access model

The login release uses Supabase Auth with Google and confirmed email/password sign-in. Every API request validates the session with Auth; the server derives the user UUID and scopes all reads/writes, duplicate checks, dashboards, and atomic approvals to it. Every user receives two private synthetic POs; records from the original demo remain in a separate NULL-owner workspace. Reviewer UUIDs are recorded; a browser-supplied reviewer name cannot override the verified account identity. Signup, reset, and OAuth use PKCE. An optional disabled-by-default legacy-code bridge permits a staged rollout, scoped strictly to NULL-owner records. See AUTH_SETUP.md for required migration and provider configuration; these changes are not yet deployed.

Owners may review invoices in their own synthetic workspace. This is a demonstration of accountable review, not organizational separation of duties. A rolling 24-hour per-account upload cap and global two-job cap limit demo usage within the single API process; neither is a distributed abuse-prevention system.

Supabase service-role access stays on the backend. All app tables enable RLS and deny anon/authenticated access. The service role has explicit permissions. Private document links expire after 120 seconds. App tables use ap_ names to avoid collisions; use a dedicated demo Supabase project where possible. No real confidential invoices on the demo.

## Credit-funded and free-tier deployment assumptions

Azure App Service Linux Basic B1 with Always On is the deployed backend, funded through authorized student credits. Keep one worker/instance and the student subscription spending limit enabled; no pay-as-you-go upgrade. All durable data remains in Supabase. Vercel only hosts static assets. Supabase Free capacity and inactivity pausing must be monitored. Groq quotas are shared at organization level, including the candidate's other projects. Render Free remains a fallback if credit coverage or regional quota is unsuitable. See AZURE_DEPLOYMENT.md.

## Value hypothesis (not a measured result)

At 500 invoices/month and 8 minutes manual handling, baseline is 66.7 staff hours. If 70% need 1 minute and 30% need 6 minutes after automation, handling falls to 20.8 hours: 45.8 hours of potential capacity released. At an assumed INR 600/hour, capacity value is about INR 27,500/month. This is illustrative, not customer data or proven ROI. Measure processing latency, review effort, exception rate, and decision correctness in the demonstration.
