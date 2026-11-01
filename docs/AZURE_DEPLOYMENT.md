# Azure deployment using existing student credits

Decision recorded 1 November 2026: existing Azure student credits may be consumed. Out-of-pocket spending must remain INR 0. Keep the subscription spending limit enabled and do not upgrade to pay-as-you-go. Azure Basic compute is credit-funded, not a permanently free service.

## Deployment status

The initial backend is deployed as `ledgerly-api-bobby` in `ledgerly-api-bobby_group`, Central India, Linux B1/Python 3.13. The candidate verified `/health` and the public invoice approval workflow. The new OCR/review-filter backend is deployed. Public health, authenticated database connectivity, approved/pending filters, CORS, and one real scanned-invoice workflow were verified on 2 November (Asia/Calcutta). The matching frontend release is in progress. No authenticated Azure CLI or App Service connector is available in this workspace; deployment uses the candidate's Cloud Shell session.

## Resource configuration

| Setting | Value |
|---|---|
| Subscription | Candidate's verified credit-backed student subscription |
| Resource group | `ledgerly-api-bobby_group` |
| Service | App Service Web App, code deployment |
| Operating system | Linux |
| Python | 3.13 if offered; verify available runtime before creating the app |
| Plan | Basic B1, one instance, only if available and covered by credits |
| Always On | Enabled |
| Startup command | `python -m uvicorn app.main:app --host 0.0.0.0 --port 8000 --workers 1` |
| Health check | `/health` |
| HTTPS only | Enabled |
| Database and documents | Existing Supabase project; no Azure database or storage resource needed |
| AI | Existing Groq free-plan organization |

Use one worker and one instance because active-job admission is held in process memory. Always On prevents idle unloading; it does not make in-process tasks durable across restarts/deployments. Do not deploy during active runs. Keep the existing interruption/retry behavior.

## First: verify the subscription

In Azure Portal, open **Subscriptions**, select the student subscription, and inspect its offer/type, active state, credit balance/currency and expiry, and spending-limit status. The Education overview screenshot alone does not verify every billing detail. Do not click **Remove spending limit** or **Upgrade**. Budget alerts can help monitor credits, but are not a spending cap.

Before submitting Create, review the selected region's B1 estimate and subscription coverage. Do not substitute a larger SKU if student-region quota prevents creation; inspect the error first. Keep optional paid monitoring, databases, and networking out of the initial deployment.

## Prepare the deployment ZIP

From repository root in PowerShell:

```powershell
cd E:\ZAMP_AI_ANALYST
.\.venv\Scripts\python.exe scripts\package_backend.py
```

Output: `tmp/deploy/ledgerly-backend.zip`. The package has `requirements.txt` and `app/` at its root. It excludes `.env`, local virtual environments, scripts, tests, logs, and sample invoices.

## App settings (set privately in Azure)

Set `SCM_DO_BUILD_DURING_DEPLOYMENT=true` so Azure installs the pinned Python dependencies. Set `APP_ENV=production` and copy the backend configuration values privately from the local environment file:

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `SUPABASE_STORAGE_BUCKET=ap-invoices`
- `GROQ_API_KEY`
- `GROQ_MODEL=openai/gpt-oss-20b`
- `DEMO_ACCESS_TOKEN`
- `REVIEW_ACCESS_TOKEN`
- `CORS_ORIGINS` equal to the exact Vercel frontend origin once available

Do not paste secrets into chat, commit them, package them, or print app settings in CLI output. Use the portal for setting secret values. Reuse the current Supabase schema and reference data; do not reset the successful tests.

## Update the existing app (backend first)

1. Run the packager above. When no invoices are processing, open Azure Cloud Shell in Bash and use **Manage files > Upload** to upload `tmp/deploy/ledgerly-backend.zip` from your computer.
2. Run:

```bash
az webapp deploy --resource-group ledgerly-api-bobby_group --name ledgerly-api-bobby --src-path "$HOME/ledgerly-backend.zip" --type zip --timeout 1200000 --output none
```

The timeout is 20 minutes, expressed in milliseconds. OCR adds native wheels and bundled models; the first build will download more dependencies. If the CLI times out, inspect the deployment before retrying:

```bash
az webapp log deployment show --resource-group ledgerly-api-bobby_group --name ledgerly-api-bobby --output table
curl --max-time 30 -i https://ledgerly-api-bobby-h3e4dnf4g3hsh9ej.centralindia-01.azurewebsites.net/health
```

3. Require successful deployment logs and health HTTP 200 with `configured: true`. Health alone does not verify OCR. Keep existing app settings/startup command; no new keys or database migration are required.
4. Release the frontend commit to `main`, which triggers the connected Vercel deployment. Keep root `frontend`, Vite, `npm run build`, output `dist`, and the existing Azure `VITE_API_URL`. Keep `CORS_ORIGINS=https://ledgerly-ai-invoice-review.vercel.app`.
5. In the public frontend, verify themes, Approved/Pending filters, then upload `sample_data/06-scanned-invoice.pdf`. Confirm the extraction stage explicitly records OCR page 1 and inspect the original PDF against the excerpts. Record elapsed time and check Azure memory; no B1 OCR performance claim has been made yet.

The new frontend must not be published against the old backend: the old API ignores the new approval filters and does not run OCR. The current production text-invoice workflow remains available while this update is prepared.

## Verification gates

1. Azure build logs show dependencies installed and Uvicorn starts on the configured port.
2. Public `/health` returns 200 and `configured: true`; `/api/readiness` confirms live database access with the demo code.
3. Public React upload calls Azure, real Groq extraction completes, and Supabase persists the run.
4. Use fresh invoice/PO identities for a new happy path; existing approved inputs should still be detected as duplicates.
5. Repeat edge cases, review authorization, private document access, and history-after-restart checks through the public URL.
6. Inspect actual Azure credit consumption. Record frontend, backend, Swagger, and GitHub URLs only after they exist and have been checked.

## Official references

- [Python/FastAPI on App Service](https://learn.microsoft.com/en-us/azure/app-service/quickstart-python)
- [Configure Linux Python apps](https://learn.microsoft.com/en-us/azure/app-service/configure-language-python)
- [ZIP deployment and build automation](https://learn.microsoft.com/en-us/azure/app-service/deploy-zip)
- [Azure spending limits](https://learn.microsoft.com/en-us/azure/cost-management-billing/manage/spending-limit)

The original `render.yaml` is retained only as a free-tier fallback, not the selected deployment target.
