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

## Embedded quick-tour video

The sign-in page has an expandable **See how Ledgerly works** player, available without an account. Signed-in users can follow **Watch the quick tour** from Overview or New invoice. The player has native playback, seek and fullscreen controls, no autoplay, a poster and a readable transcript. It loads the video only when requested (`preload="none"`).

The expanded MP4 covers approval and all three business edge cases, with English AI narration (Neerja, Indian English), instructions burned into each scene, and optional English narration subtitles. Native controls allow muting. It uses screenshots captured from the real local frontend with mocked authentication and API responses, labeled **GUIDED DEMO · STAGED SAMPLE RESULTS** throughout. Each screen is held for its narration. It is a how-to demonstration, not evidence of live provider execution speed, accuracy or database writes. No real passwords, tokens or accounts appear. It is served as an ordinary Vercel static asset without a paid video service. Written steps provide an alternative.

To reproduce from the repository root (Chrome installed):

```powershell
npx.cmd --prefix frontend playwright install ffmpeg
# In a dedicated terminal, set these process-only fake values. Do not edit .env.
$env:VITE_SUPABASE_URL='https://auth.example.test'
$env:VITE_SUPABASE_PUBLISHABLE_KEY='sb_publishable_mock_for_tests'
$env:VITE_API_URL='http://127.0.0.1:8001'
$env:VITE_ENABLE_ERPNEXT='false'
npm.cmd run dev --prefix frontend -- --host 127.0.0.1 --port 5180
```

In another terminal:

```powershell
npm.cmd run record:walkthrough --prefix frontend
# Free local build tooling, separate from application dependencies:
.venv/Scripts/python.exe -m pip install edge-tts==7.3.1 imageio-ffmpeg==0.8.0
# The recorder writes one screenshot and caption per chapter.
.venv/Scripts/python.exe frontend/scripts/narrate-walkthrough.py
$env:AUTH_TEST_URL='http://127.0.0.1:5180'
npm.cmd run test:tutorial --prefix frontend
# Inspect the exported encoded frames and the sample-guide poster.
npm.cmd run build --prefix frontend
```

The recorder blocks requests outside the local frontend and its two fake Auth/API origins. Its output is `frontend/public/assets/tutorial/ledgerly-walkthrough.webm`; temporary recordings, chapter notes and QA frames remain under ignored `tmp/tutorial/`. Use a 1280 × 960 capture: the height is divisible by 16, and the extra document space keeps review buttons above the caption strip. Avoid setting fake environment values in the terminal used for a production build.

The narration builder sends only the public tutorial script to the online Edge speech service through edge-tts. It uses no API key or paid subscription; service availability may change. Playback uses the generated static MP4 and makes no speech-service calls. Each captured screen stays visible for its complete narration, with a short pause before the next scene. The builder also writes `narration.vtt` and an ignored timing report. Narration is explicitly labeled AI-generated in the player description.

## Suggested five-minute assessment recording outline

This is a proposed recording structure, not a claim about the assessment's required video length. Check the candidate guide before final submission.

| Time | Show | Explain |
| --- | --- | --- |
| 0:00–0:30 | Sign-in page, then a prepared demo workspace | “Ledgerly helps AP reviewers find invoice exceptions before approval. Every account has a private demo workspace.” |
| 0:30–1:30 | Sample walkthrough, valid PDF, source evidence and rules | “AI extracts the fields. Deterministic checks evaluate vendor identity, amounts, duplicates, currency and PO balance.” |
| 1:30–2:15 | Review notes, approval, Purchase orders | “A human records the decision. Accepted PO balances change only after approval; no payment is made.” |
| 2:15–3:30 | Duplicate and overage results, then missing-number result | “Business exceptions remain visible in the audit trail. A completed workflow can still be blocked or require attention.” |
| 3:30–4:15 | Previously processed scan and original PDF | “OCR supports clear printed English scans. The reviewer compares source evidence; uncertain output requires attention.” |
| 4:15–5:00 | Run history, theme controls, repository | “The system separates execution, validation and human decisions. It uses Vercel, Azure student credits, Supabase and Groq. An optional ERPNext connector was verified locally; the public demo works without ERP hosting.” |

Use prepared results for the exception and OCR sections if processing would make the recording too long. Identify them as earlier runs; do not imply they completed instantly. Hide passwords, recovery links, tokens, provider configuration, and unrelated personal tabs while recording.

## Sample maintenance and validation

Source fixtures live in `sample_data/`. Public copies live in `frontend/public/assets/samples/` so Vercel can build from the frontend root without needing outside-root files. If a fixture changes, update its corresponding public copy, then run `python scripts/package_samples.py` to rebuild the downloadable ZIP containing all five PDFs and `TEST-INSTRUCTIONS.txt`. The mocked browser test downloads all five served samples and compares their bytes with the source PDFs, checks selection does not submit, and validates the explicit multipart upload contains the selected file.

The browser checks do not call live Groq or mutate Supabase. Historical real workflow results are documented separately in `live-test-results.json` and `azure-ocr-check-results.json`.
