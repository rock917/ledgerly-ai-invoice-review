"""Offline CPU worker. PDF bytes on stdin; page text/scores as JSON on stdout."""
import json
import sys
from pathlib import Path


def recognize(data: bytes, selected: list[int]) -> list[dict]:
    import cv2
    import pypdfium2 as pdfium
    import rapidocr
    from rapidocr import RapidOCR

    cv2.setNumThreads(1)
    models = Path(rapidocr.__file__).parent / 'models'
    paths = {
        'Det.model_path': models / 'PP-OCRv6_det_small.onnx',
        'Rec.model_path': models / 'PP-OCRv6_rec_small.onnx',
        'Cls.model_path': models / 'ch_ppocr_mobile_v2.0_cls_mobile.onnx',
    }
    if not all(path.is_file() for path in paths.values()):
        raise RuntimeError('Bundled OCR models missing')
    engine = RapidOCR(params={
        **{key: str(path) for key, path in paths.items()},
        'Global.log_level': 'critical',
        'Global.text_score': 0.0,  # Keep low-scoring lines so they trigger review.
        'EngineConfig.onnxruntime.intra_op_num_threads': 1,
        'EngineConfig.onnxruntime.inter_op_num_threads': 1,
        'Det.limit_type': 'max', 'Det.limit_side_len': 1600,
        'Rec.rec_batch_num': 1,
    })
    results = []
    with pdfium.PdfDocument(data) as pdf:
        if not 1 <= len(pdf) <= 5 or any(i < 0 or i >= len(pdf) for i in selected):
            raise ValueError('Page limit')
        for index in selected:
            page = pdf[index]
            try:
                width, height = page.get_size()
                # At most 2000x2000 pixels, and no more than 144 DPI.
                scale = min(2.0, 2000 / max(width, height))
                bitmap = page.render(scale=scale)
                try:
                    result = engine(bitmap.to_numpy())
                    text = '\n'.join(result.txts or ())
                    if len(text) > 20_000:
                        raise ValueError('Text limit')
                    results.append({'index': index, 'text': text,
                                    'scores': [round(float(score), 4) for score in (result.scores or ())]})
                finally:
                    bitmap.close()
            finally:
                page.close()
    return results


if __name__ == '__main__':
    try:
        content = sys.stdin.buffer.read(5 * 1024 * 1024 + 1)
        if len(content) > 5 * 1024 * 1024:
            raise ValueError('File limit')
        output = recognize(content, [int(value) for value in sys.argv[1].split(',')])
        sys.stdout.write(json.dumps(output, ensure_ascii=True))
    except Exception:
        # Never emit PDF contents or provider/environment secrets in crash logs.
        sys.stderr.write('OCR worker failed.\n')
        sys.exit(1)
