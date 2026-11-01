"""Bounded, isolated OCR for pages without a usable text layer."""
import asyncio
import json
import os
import sys
from dataclasses import dataclass
from io import BytesIO
from pathlib import Path

from pypdf import PdfReader

from app.core.errors import ServiceError

OCR_TIMEOUT = 90
ocr_slot = asyncio.Semaphore(1)


@dataclass
class DocumentText:
    pages: list[str]
    ocr_pages: list[int]
    warnings: list[str]


def candidate_pages(data: bytes, pages: list[str]) -> list[int]:
    reader = PdfReader(BytesIO(data))
    candidates = []
    for index, (page, text) in enumerate(zip(reader.pages, pages, strict=True)):
        # A scan can have a digital header/watermark. Also inspect large raster
        # resources without decoding their pixels. Small logos do not trigger OCR.
        resources = page.get('/Resources', {})
        resources = resources.get_object() if resources else {}
        objects = resources.get('/XObject', {})
        objects = objects.get_object() if objects else {}
        large_image = any(
            (obj := ref.get_object()).get('/Subtype') == '/Image'
            and int(obj.get('/Width', 0)) * int(obj.get('/Height', 0)) >= 500_000
            for ref in objects.values()
        )
        if len(text.strip()) < 80 or large_image:
            candidates.append(index)
    return candidates


def merge_results(pages: list[str], selected: list[int], results: list[dict]) -> DocumentText:
    if [item.get('index') for item in results] != selected:
        raise ServiceError('OCR returned an incomplete page result. Retry with a clearer PDF.', 502, 'ocr_invalid_output')
    merged, warnings = list(pages), []
    for item in results:
        index, text = item['index'], item['text'].strip()
        scores = item['scores']
        # OCR replaces the entire selected page; do not concatenate a second,
        # potentially conflicting set of native amounts or identifiers.
        merged[index] = text
        if len(text) < 40:
            warnings.append(f'Page {index + 1}: OCR found insufficient readable text. Request a clearer scan.')
        elif not scores or min(scores) < 0.85:
            warnings.append(f'Page {index + 1}: OCR contains uncertain text. Verify identifiers and amounts against the original PDF.')
    if sum(len(page) for page in merged) > 20_000:
        raise ServiceError('The document exceeds the 20,000-character processing limit after OCR.', 422, 'document_too_long')
    return DocumentText(merged, [i + 1 for i in selected], warnings)


async def prepare_document(data: bytes, pages: list[str]) -> DocumentText:
    selected = await asyncio.to_thread(candidate_pages, data, pages)
    if not selected:
        return DocumentText(pages, [], [])
    async with ocr_slot:
        # The subprocess can be killed on timeout/cancellation, including native
        # rendering/inference. Credentials are not needed by this offline worker.
        env = {key: value for key, value in os.environ.items()
               if not key.upper().startswith(('SUPABASE_', 'GROQ_', 'DEMO_ACCESS_', 'REVIEW_ACCESS_'))}
        env.update(OMP_NUM_THREADS='1', OPENBLAS_NUM_THREADS='1', PYTHONIOENCODING='utf-8')
        process = await asyncio.create_subprocess_exec(
            sys.executable, '-m', 'app.services.ocr_worker', ','.join(map(str, selected)),
            cwd=str(Path(__file__).resolve().parents[2]), env=env,
            stdin=asyncio.subprocess.PIPE, stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE,
        )
        try:
            stdout, _ = await asyncio.wait_for(process.communicate(data), timeout=OCR_TIMEOUT)
            if process.returncode:
                raise ServiceError('Local OCR failed. Check that the OCR dependencies and bundled models are installed, or upload a text PDF.', 503, 'ocr_failed')
            try:
                results = json.loads(stdout)
                return merge_results(pages, selected, results)
            except (ValueError, KeyError, TypeError, IndexError) as exc:
                raise ServiceError('OCR returned invalid page data. No extraction was accepted.', 502, 'ocr_invalid_output') from exc
        except TimeoutError as exc:
            raise ServiceError('OCR exceeded its 90-second limit. Upload a smaller, clearer PDF.', 504, 'ocr_timeout') from exc
        finally:
            if process.returncode is None:
                process.kill()
                await process.wait()
