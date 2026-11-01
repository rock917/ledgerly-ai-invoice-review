# OCR implementation and verification

Implemented locally on 1 November 2026. On 2 November (Asia/Calcutta), the public Azure backend processed the image-only sample successfully in 35.687 seconds with all 11 rules passing. No approval was performed and PO balances were unchanged. See [Azure results](azure-ocr-check-results.json).

## Reading pipeline

The existing 5 MB / 5 page PDF limits still apply. pypdf reads native text first. Pages with fewer than 80 text characters, or a directly referenced raster image of at least 500,000 pixels, use OCR. Native pages retain their text and page numbers. Large images inside nested PDF form objects are not currently detected by the image heuristic; sparse text still triggers OCR.

A separate Python process uses PDFium to render selected pages at at most 144 DPI and 2,000 pixels per side. RapidOCR 3.10.0 uses its bundled ONNX detection, recognition and orientation models through CPU ONNX Runtime. Model paths are explicit; processing does not download models or call an OCR service. Rendering/inference is serial, one OCR document at a time, one inference thread, inside the existing two-workflow admission limit. The worker is killed on a 90-second timeout or cancellation; the whole workflow retains its 180-second deadline.

Each selected page's OCR text replaces its native text, avoiding duplicate or conflicting amount lists. The combined 20,000-character cap applies after OCR. Page-level provenance is saved in the extraction stage, and the UI labels excerpts as transcriptions requiring comparison with the original PDF. AI quotes are checked against the resulting text, not claimed to be pixel-level proof.

OCR lines below a raw model score of 0.85 flag extraction uncertainty; this threshold is a conservative heuristic, not calibrated accuracy. An unreadable page also flags review. Fully unreadable documents skip Groq. Worker failure/timeout is a technical failure, never a successful extraction. Clear scans still require normal checks and human approval. English printed invoices are the tested scope; handwriting, heavy skew, complex layouts and poor scans are not guaranteed.

The process has bounded raster dimensions and execution time, but no hard process-memory ceiling. B1 memory and multi-page latency must be measured after deployment. Keep one worker/instance. No schema migration or new API credentials are required.

## Reproduce checks

From the repository root:

```powershell
.\.venv\Scripts\python.exe backend\scripts\generate_ocr_sample.py
.\.venv\Scripts\python.exe backend\scripts\check_ocr.py
.\.venv\Scripts\python.exe backend\scripts\check_ocr.py --live
```

The final command uses the existing Groq key and reads Supabase vendors, POs and duplicate history. It performs **zero database writes** and no approvals. It writes a non-secret report to `tmp/ocr-check.json`.

Verified locally: image-only scan, mixed native/scanned pages, blank page routing, and real Groq extraction plus Supabase reference reads. The synthetic INR 5,000 scan passed all 11 business rules. Single-page OCR took 5.75 seconds on this Windows machine; this is not an Azure latency claim. Regression coverage includes uncertain output, character limits, missing pages, timeout/cancellation cleanup, and preventing AI calls after OCR failure. See [recorded results](ocr-check-results.json).

## Azure rollout

Deploy the rebuilt backend ZIP first; its requirements install the OCR libraries and bundled models. Retain the current startup command, credentials and single worker. Then release the frontend changes. Test `06-scanned-invoice.pdf` through the deployed app and inspect the OCR stage, source evidence and result. Do not approve it merely to test OCR; repeated uploads after a completed run will exercise duplicate detection.

The public Azure check used execution `f72c2c0a-b057-4416-bda8-d7c17fea9151`. It is now a real pending-review record; re-uploading the same invoice should trigger duplicate handling. The Vercel frontend was subsequently verified in a real browser, including the saved OCR stage and invoice fields. See `production-ui-check-results.json`.
