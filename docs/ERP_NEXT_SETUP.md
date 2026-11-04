# ERPNext draft-invoice pilot

The connector and UI are implemented locally. Deployment to Azure/Vercel and the live Supabase migration are separate steps; do not describe the public app as ERP-connected until those steps have been verified. The local evaluation stack is adapted from [Frappe Docker](https://github.com/frappe/frappe_docker), using ERPNext `v16.53.0`.

## What it adds

1. Import a real submitted ERPNext purchase order and its supplier into one explicitly connected private Ledgerly workspace.
2. Upload an invoice through the existing extraction, validation and human-review workflow.
3. After approval, explicitly export a **draft Purchase Invoice** to ERPNext.
4. Verify the ERP-calculated total, supplier, bill number/date and PO line mapping before saving the ERP document ID in Supabase.

The connector never submits an invoice or creates a payment. Frappe token credentials remain on the backend. [Frappe REST API](https://docs.frappe.io/framework/user/en/api/rest)

## Deliberate limits

- One connected owner UUID and one ERP company. Other private workspaces do not see the ERP controls or records.
- Unbilled, submitted, open INR POs only, with one enabled non-stock item and no taxes or discounts.
- One invoice line; the rate must equal the imported PO rate and the quantity must fit the PO. Existing Ledgerly approval rules still enforce the remaining accepted balance.
- ERP procurement data must still match the imported snapshot at export time. Changed records need investigation, rather than silent replacement of balances.
- This is a draft handoff, not a complete accounting synchronization system. It does not reconcile later ERP submissions, cancellations, payments, taxes or multi-line allocations.

## Local setup

Docker Desktop must have its Linux engine running. From the repository root:

1. Copy `integrations/erpnext/.env.example` to `.env` in the same folder and replace both placeholders with different strong random passwords. The `.env` file is ignored by Git.
2. Start the isolated evaluation project:

```powershell
docker compose --project-name ledgerly-erpnext -f integrations/erpnext/compose.yaml --env-file integrations/erpnext/.env up -d
docker compose --project-name ledgerly-erpnext -f integrations/erpnext/compose.yaml --env-file integrations/erpnext/.env ps -a
```

Wait for `create-site` to exit successfully. A pre-existing site directory is not proof of a completed installation: check `bench --site frontend list-apps` if setup was interrupted. Do not delete volumes as a troubleshooting shortcut.

3. Bootstrap synthetic reference records and the restricted integration user:

```powershell
docker cp integrations/erpnext/bootstrap.py ledgerly-erpnext-backend-1:/tmp/ledgerly_bootstrap.py
docker cp integrations/erpnext/bootstrap.sh ledgerly-erpnext-backend-1:/tmp/ledgerly_bootstrap.sh
docker exec ledgerly-erpnext-backend-1 bash /tmp/ledgerly_bootstrap.sh
```

This creates company `Ledgerly Demo`, supplier `Ledgerly Demo Supplies`, a non-stock item, a submitted INR 100,000 PO, and a unique external-reference field. It checks that the integration user can create drafts but cannot write/submit invoices or create/submit payments. It never resets existing records. Credentials are written to a private file inside the site and are not printed.

4. Copy that private file to the ignored local test folder, then run the bounded real-ERP check:

```powershell
New-Item -ItemType Directory -Force tmp/erpnext | Out-Null
docker cp ledgerly-erpnext-backend-1:/home/frappe/frappe-bench/sites/frontend/private/ledgerly-credentials.json tmp/erpnext/credentials.json
.venv/Scripts/python.exe integrations/erpnext/verify_live.py
```

The script creates a synthetic draft, simulates a lost local acknowledgement, checks reconciliation returns the same draft, and rejects an unapproved export. It uses real ERP HTTP calls with an in-memory Ledgerly persistence adapter; it does **not** prove deployed Supabase-to-ERP connectivity. Any generated live report explicitly states this limitation.

For a test with real Supabase persistence and Groq, resolve the explicitly selected account into ignored `tmp/erpnext/owner.json` (`owner_id`), then run:

```powershell
.venv/Scripts/python.exe integrations/erpnext/generate_sample.py
.venv/Scripts/python.exe integrations/erpnext/verify_workspace.py prepare
```

This imports the synthetic PO and saves one matching invoice awaiting human review. Repeating `prepare` reuses the recorded execution. Sign into that account in Ledgerly and approve the generated invoice after inspecting it. Only then run:

```powershell
.venv/Scripts/python.exe integrations/erpnext/verify_workspace.py export
```

The export check verifies a draft, repeat-export identity, and unchanged accepted PO balance. It never approves the invoice itself. Results are recorded in `docs/erpnext-workspace-check-results.json`, with the local hosting limitation explicit.

ERPNext is bound only to `http://127.0.0.1:18080`. Administrator uses the password in the ignored Compose `.env`. Keep this evaluation stack local; its public deployment requires a separately hardened setup.

## Connect Ledgerly

Apply `database/migrations/003_erpnext.sql` after migration 002. It adds mappings, a private export table and service-role-only functions; it does not reset existing history or accepted PO balances.

Configure these backend variables privately:

| Variable | Value |
|---|---|
| `ERPNEXT_URL` | Reachable ERP site origin; local HTTP allowed only in development |
| `ERPNEXT_API_KEY` / `ERPNEXT_API_SECRET` | Restricted ERP integration credentials |
| `ERPNEXT_COMPANY` | `Ledgerly Demo` for the local test |
| `ERPNEXT_OWNER_ID` | Exact Supabase user UUID authorized for this ERP pilot |

For the local frontend, set `VITE_ENABLE_ERPNEXT=true` and point `VITE_API_URL` at the locally running Ledgerly backend. Restart both development servers. In the connected account, open **Purchase orders → Import from ERPNext**, enter the actual generated PO reference, then process and approve an invoice for that PO. Open its execution details and choose **Export draft to ERPNext**. An export confirmation includes the verified ERP document ID.

The public recruiter app leaves `VITE_ENABLE_ERPNEXT` unset or `false`. It makes no ERP status requests and continues using its sample POs. ERPNext stays local for the interview demonstration; no additional hosting is required.

Supabase claims an export lease for three minutes. A unique ERP field prevents duplicate documents. Every retry searches for the execution reference first, including after an ambiguous HTTP timeout. A mismatched existing draft is reported for inspection and is never overwritten. A synchronized record represents the confirmed handoff time, not continuous monitoring of later ERP edits.

## Public rollout order

1. Provide a reachable HTTPS ERP deployment. Azure cannot connect to this computer's `127.0.0.1`. Use a separate resource group and verify the student-credit budget before provisioning; preserve the existing DocuMind VM.
2. Apply migration 003 and deploy the new backend first. ERP settings may remain empty while validating that normal workspaces still work.
3. Configure the restricted connection and owner UUID, then validate the API against the hosted ERP.
4. Only if a public ERP rollout is later chosen, enable `VITE_ENABLE_ERPNEXT=true` and deploy the frontend last so its status requests do not target an older backend.
5. Perform a full real workflow: ERP PO import → invoice upload/extraction → approval → ERP draft export → repeat export returning the same ID. Confirm a second account cannot access the connected owner's records.

Local automated checks cover API ownership, approval gates, timeout reconciliation, mapping changes, unique-reference enforcement, SQL leases and privileges, and browser import/export/retry controls. Mock tests and local checks are not claims of a public ERP deployment.
