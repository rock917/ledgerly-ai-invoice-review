# Azure deployment using existing student credits

Decision recorded 1 November 2026: existing Azure student credits may be consumed. Out-of-pocket spending must remain INR 0. Keep the subscription spending limit enabled and do not upgrade to pay-as-you-go. Azure Basic compute is credit-funded, not a permanently free service.

## Deployment status

Backend source and a ZIP packager are prepared. No Azure resources have been created. Subscription credit coverage, spending-limit state, region quota, and estimated price have not yet been verified. No authenticated Azure CLI or App Service connector is available in this workspace.

## Proposed resource configuration

| Setting | Proposed value |
|---|---|
| Subscription | Candidate's verified credit-backed student subscription |
| Resource group | `rg-ledgerly-demo` |
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

## Deploy after account and resource verification

An authenticated Azure CLI, VS Code Azure tooling, or a configured GitHub deployment can deploy the prepared code. For an already-created app, Azure CLI ZIP deployment takes this form (replace names with verified resources):

```powershell
az webapp deploy --resource-group rg-ledgerly-demo --name <verified-app-name> --src-path E:\ZAMP_AI_ANALYST\tmp\deploy\ledgerly-backend.zip --type zip --output none
```

This command is a template, not a deployment already performed. Linux App Service does not support the Kudu drag-and-drop ZIP UI; use a supported deployment path. A GitHub repository is useful for ongoing delivery but is not a technical prerequisite for ZIP deployment.

Frontend stays on Vercel Hobby subject to eligibility. Set `VITE_API_URL` to the verified Azure HTTPS origin, rebuild/redeploy React, and set backend CORS to the resulting frontend origin.

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
