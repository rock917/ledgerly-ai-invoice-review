# Ledgerly reviewer walkthrough

Open https://ledgerly-ai-invoice-review.vercel.app and sign in with Google or confirmed email/password. No demo access code is needed. New accounts receive their own sample vendors and POs, with no uploaded invoices. Use only synthetic documents.

From an empty Overview, select **Open sample walkthrough**, or open **New invoice** and follow **Try the sample walkthrough**. Each card has **Download PDF** and **Use sample**. Use sample selects the PDF in the upload form without processing it. **Start workflow** explicitly submits it and counts toward the account's upload limit (currently 10 per rolling 24 hours). OCR takes longer than native text extraction.

## Suggested order

Begin with a workspace where these invoice numbers have not been processed and Northstar PO-2026-1001 has INR 100,000 remaining. Existing accounts can still explore the guide, but their previous history and approvals affect outcomes. Do not reset data to rehearse.

| Step | File | Inspect and act | Expected result under these preconditions |
| --- | --- | --- | --- |
| 1 | `01-valid-partial-invoice.pdf` | Inspect source evidence and rules; enter a meaningful review note of at least 5 characters; approve | Ready, then Approved. Northstar PO accepted INR 60,000; remaining INR 40,000 |
| 2 | `03-duplicate-renamed.pdf` | Inspect the duplicate rule and original execution reference; reject the duplicate with a note if desired | Blocked even though the filename changed. No extra PO balance consumed |
| 3 | `04-partial-invoice-overage.pdf` | Compare INR 45,000 with INR 40,000 remaining | Needs attention, INR 5,000 overage; approval unavailable |
| 4 | `02-missing-invoice-number.pdf` | Inspect the missing invoice-number check; choose Request information with a note | Needs attention; no approval or PO balance change |
| 5 | `06-scanned-invoice.pdf` | Wait for OCR; compare original scan and extracted evidence | OCR runs on the image-only PDF; inspect all checks before reviewing the INR 5,000 invoice |

If the OCR invoice passes and you approve it after step 1, accepted becomes INR 65,000 and remaining becomes INR 35,000. Leaving it unapproved preserves the earlier balance. AI output may vary; these are scenario expectations, not fixed responses.

Approved and rejected invoices remain in Run history and the Overview filters. Pending reviews contains records awaiting a final human decision. Approval records a demo decision and updates the PO balance; it never initiates payment.

## Suggested five-minute recording outline

This is a proposed recording structure, not a claim about the assessment's required video length. Check the candidate guide before final submission.

| Time | Show | Explain |
| --- | --- | --- |
| 0:00–0:30 | Sign-in page, then a prepared demo workspace | “Ledgerly helps AP reviewers find invoice exceptions before approval. Every account has a private demo workspace.” |
| 0:30–1:30 | Sample walkthrough, valid PDF, source evidence and rules | “AI extracts the fields. Deterministic checks evaluate vendor identity, amounts, duplicates, currency and PO balance.” |
| 1:30–2:15 | Review notes, approval, Purchase orders | “A human records the decision. Accepted PO balances change only after approval; no payment is made.” |
| 2:15–3:30 | Duplicate and overage results, then missing-number result | “Business exceptions remain visible in the audit trail. A completed workflow can still be blocked or require attention.” |
| 3:30–4:15 | Previously processed scan and original PDF | “OCR supports clear printed English scans. The reviewer compares source evidence; uncertain output requires attention.” |
| 4:15–5:00 | Run history, theme controls, repository | “The system separates execution, validation and human decisions. It uses Vercel, Azure student credits, Supabase and Groq. ERPNext is currently a documented integration plan.” |

Use prepared results for the exception and OCR sections if processing would make the recording too long. Identify them as earlier runs; do not imply they completed instantly. Hide passwords, recovery links, tokens, provider configuration, and unrelated personal tabs while recording.

## Sample maintenance and validation

Source fixtures live in `sample_data/`. Public copies live in `frontend/public/assets/samples/` so Vercel can build from the frontend root without needing outside-root files. If a fixture changes, update its corresponding public copy. The mocked browser test downloads all five served samples and compares their bytes with the source PDFs, checks selection does not submit, and validates the explicit multipart upload contains the selected file.

The browser checks do not call live Groq or mutate Supabase. Historical real workflow results are documented separately in `live-test-results.json` and `azure-ocr-check-results.json`.
