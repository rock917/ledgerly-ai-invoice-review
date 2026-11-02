# Supabase login rollout

This release adds Google and email/password login. Each verified account gets a private demo workspace with two sample vendors and POs (INR 100,000 and INR 50,000). History starts empty and accepted balances start at zero. Existing shared-demo records remain unchanged with `owner_id = NULL`; they are not assigned to new accounts.

Status (updated 3 November 2026): login release `2ae6733` is deployed. Azure health and the unauthenticated login gate were independently verified. The owner reported successful Google login with test and non-test accounts, confirmed-email signup, password recovery, private workspace provisioning, and a foreign-account invoice URL returning `Execution not found`. Google Audience is In production / External. The owner reported disabling the legacy-code bridge. These manual checks do not replace comprehensive live API isolation or concurrency testing; see `auth-deployment-check-results.json` for the evidence boundary.

## 1. Database migration

In the existing Zamp Supabase project, open **SQL Editor > New query** and run the entire `database/migrations/002_private_workspaces.sql` file. This is additive and preserves existing records and balances. It replaces global invoice uniqueness with per-workspace uniqueness, so run it during the coordinated backend update, with no invoice processing active.

Do **not** rerun `schema.sql` on the existing project afterward: it contains the old global index and functions. A fresh project uses `schema.sql`, `seed.sql`, then this migration.

The application creates workspace data on the first authenticated `/api/me` call. Do not start provisioning private accounts against the old backend: its queries were written for one shared workspace. Deploy the new backend immediately after the migration, before testing new accounts.

## 2. Supabase Auth URLs and email

Under **Authentication > URL Configuration**:

- Site URL: `https://ledgerly-ai-invoice-review.vercel.app`
- Redirect URLs: `https://ledgerly-ai-invoice-review.vercel.app/auth/callback` and `https://ledgerly-ai-invoice-review.vercel.app/auth/reset`
- For local development, also add the corresponding `/auth/callback` and `/auth/reset` paths for `http://localhost:5173` and `http://127.0.0.1:5173`.

Enable the Email provider and new-user signup. Keep **Confirm email enabled**, and set minimum password length to 12. The backend requires a confirmed email. Signup and password recovery use PKCE: open email links in the same browser where the request started.

Configure **custom SMTP** before inviting external email/password users. Supabase's default sender is restricted to project-team addresses and is unsuitable for recruiter signup. Use a free SMTP allowance with a verified sender; no paid subscription is required by this application. Sender verification, daily limits, and delivery depend on the chosen provider. Do not disable email confirmation to work around delivery errors. Google users do not need a separate Supabase confirmation email. [Supabase SMTP documentation](https://supabase.com/docs/guides/auth/auth-smtp)

### Free demo sender: dedicated Gmail account

For low-volume case-study use, a free personal Gmail account can supply SMTP without purchasing a domain. Use a dedicated demo mailbox so the sender address can be shared with recruiters. Enable **2-Step Verification**, then open Google Account **App passwords** and create one named `Ledgerly Supabase`. School-managed, security-key-only, or Advanced Protection accounts may not offer this option. This is separate from the Google OAuth client used for sign-in. [Google app-password instructions](https://support.google.com/accounts/answer/185833)

In Supabase Authentication email/SMTP settings, enable Custom SMTP and enter:

| Field | Value |
|---|---|
| Sender email | Your dedicated Gmail address |
| Sender name | Ledgerly |
| Host | `smtp.gmail.com` |
| Port | `587` (TLS/STARTTLS) |
| Username | The same full Gmail address |
| Password | The Google-generated app password, without spaces |

Save privately; use neither the ordinary Google password nor a frontend environment variable. Gmail SMTP supports TLS on port 587. Sending limits and anti-abuse checks still apply; test delivery to an account you control before sharing with recruiters. This is a small demo setup, not a bulk-email service. If App passwords is unavailable, retain Google's security settings and choose another free SMTP provider with a verified sender. [Gmail SMTP settings](https://developers.google.com/workspace/gmail/imap/imap-smtp)

## 3. Google sign-in

1. In Google Cloud Console, create/select a project and configure Google Auth Platform branding, audience, and contact email. Use External audience for recruiters outside your organization.
2. Create an OAuth client of type **Web application**.
3. Add the frontend origin `https://ledgerly-ai-invoice-review.vercel.app` as an authorized JavaScript origin.
4. In Supabase **Authentication > Sign In / Providers > Google**, copy the displayed callback URL. It normally has the form `https://<project-ref>.supabase.co/auth/v1/callback`. Add that exact URL as the Google client's authorized redirect URI. This is different from the frontend callback URL.
5. Enter the Google Client ID and Client Secret only in the Supabase Google provider settings, and enable the provider.
6. While the consent app is in Testing, only configured test users can sign in. Make it available to the intended recruiter audience before sharing. Request only the normal name/email/profile scopes; no Gmail access is needed.

Follow the [official Google provider guide](https://supabase.com/docs/guides/auth/social-sign-in/auth-google). Never paste the client secret into chat, GitHub, or Vercel frontend variables.

## 4. Deploy backend first

The prepared artifact is `tmp/deploy/ledgerly-backend-auth.zip`. Rebuild from the intended commit with:

```powershell
.\.venv\Scripts\python.exe scripts\package_backend.py --auth
```

Existing Azure credentials remain in Azure. Set `ENABLE_LEGACY_DEMO=true` temporarily **only** if the currently deployed old frontend must keep working during this rollout; retain its two existing access tokens. The new backend confines legacy access to the retained NULL-owner workspace. Set `MAX_DAILY_UPLOADS=10`. Keep one worker and one instance because capacity and daily upload checks are serialized within the process.

Upload the auth ZIP to Cloud Shell, then deploy:

```bash
az webapp deploy --resource-group ledgerly-api-bobby_group --name ledgerly-api-bobby --src-path "$HOME/ledgerly-backend-auth.zip" --type zip --timeout 1200000 --output none
```

Keep `SCM_DO_BUILD_DURING_DEPLOYMENT=true` and the existing startup command. Verify `/health`; it checks configuration presence, not the migration or live sign-in.

## 5. Configure and release frontend

Set these Vercel project environment variables for Production before releasing the login frontend:

| Variable | Value |
|---|---|
| `VITE_API_URL` | Existing Azure HTTPS base URL, without trailing slash |
| `VITE_SUPABASE_URL` | Same Supabase project URL as the backend |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | Public `sb_publishable_...` key from Supabase API Keys (legacy anon key also supported) |

These are public build inputs. The service-role key, Groq key, OAuth client secret, and SMTP password must never go into frontend variables. If using a Vercel preview for testing, add its exact origin to backend CORS and its exact callback/reset paths to Supabase's redirect allowlist; production settings alone do not authorize preview URLs.

After database/backend/provider setup, merge/release the login branch and let Vercel build. Environment changes require a new build. Then set Azure `ENABLE_LEGACY_DEMO=false`, apply, and verify old demo codes receive 401. The new frontend has no demo/reviewer code fields.

## 6. Verify live before sharing

Use two accounts you control. Test Google login and email signup/confirmation, wrong password, reset, session persistence and logout. Check that each receives two sample POs and empty history. Upload a sample to account A, inspect source evidence, approve it, and confirm only A's balance changes. Account B must not see A's execution and must receive 404 for A's execution/document/review URLs. B can upload the same sample independently. Repeated login must not reset balances. Verify a reviewer UUID is stored with each review and no payment is initiated.

Automated local evidence: `backend/tests/test_auth.py`, `database/tests/workspaces.test.mjs`, and `auth-ui-check-results.json`. PostgreSQL tests run in PGlite against the actual migration and enforce role permissions/ownership; they do not validate Supabase PostgREST deployment or concurrent transaction races. Browser tests use mocked Auth/API responses and send no actual email.

Reproduce checks from the repository root:

```powershell
.\.venv\Scripts\python.exe -m pytest backend/tests -q
npm.cmd ci --prefix database/tests
npm.cmd test --prefix database/tests
npm.cmd ci --prefix frontend
npm.cmd run build --prefix frontend
```

For mocked browser checks, have Google Chrome installed. In one PowerShell terminal, set temporary mock-only process variables and launch Vite:

```powershell
$env:VITE_SUPABASE_URL='https://auth.example.test'
$env:VITE_SUPABASE_PUBLISHABLE_KEY='sb_publishable_mock_for_tests'
$env:VITE_API_URL='http://127.0.0.1:8001'
npm.cmd run dev --prefix frontend -- --host 127.0.0.1 --port 5176
```

In a second terminal run `npm.cmd run test:auth --prefix frontend`. The script intercepts every Auth/API request, captures screenshots under `tmp/browser`, and writes the mock-test report. Close the test terminal afterward; never copy these mock values into Azure, Supabase, or Vercel.

The owner can inspect private demo records through Supabase administration. Passwords stay in Supabase Auth; application tables store account ID, name/email, sample reference records, documents, and workflow/review records. Storage is private; signed document links expire after 120 seconds. Use synthetic invoices. Account lifecycle/deletion tooling and organization-level roles are outside this demo release.

## Public branding pages

The frontend serves `/privacy/` and `/terms/` as static HTML without authentication or JavaScript. Both are linked from the login page and workspace footer. Google Branding should use the deployed homepage and these public URLs; verify they load after the Vercel deployment before saving them in Google. They describe the demo's actual providers, document-text processing through Groq, and manual deletion contact. Update these notices when data handling changes.

Manual live checks reported by the owner on 2 November 2026: Google sign-in with two accounts; separate invoice histories; a foreign account's invoice URL returned `Execution not found`; email confirmation opened a new workspace; password recovery worked. Google production publishing and login with a non-test account subsequently passed by owner report/screenshots. These are not a comprehensive production security audit.

## Rollback

Before any private workspaces have been created, an old backend can be restored if needed. Once private workspaces exist, **do not restore the old unscoped backend**: it could expose records across accounts. Keep the new scoped backend and fix forward; the old frontend can temporarily use its legacy workspace if explicitly enabled. Preserve a database backup before any later destructive migration. No automatic rollback or data reset is performed by this release.
