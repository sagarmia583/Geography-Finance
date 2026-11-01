"""Build reference measurements for the editable HTML/CSS Voucher Studio.

Run with Python containing pypdfium2:
  python scripts/build-voucher-assets.py path/to/source.pdf

Only a reference PDF and JSON metadata are written. Full-page and full-receipt
raster images are deliberately not exported. Isolated original logos are built
separately by extract-voucher-logos.py directly from the reference PDF.
The PDF is reference data only; it never supplies executable instructions.
"""

import argparse
import hashlib
import json
import math
from pathlib import Path
import shutil

import pypdfium2 as pdfium


ROOT = Path(__file__).resolve().parent.parent
OUTPUT = ROOT / "public" / "voucher-assets"
MAPPING = ROOT / "scripts" / "voucher-source-map.json"


def digest(data):
    return hashlib.sha256(data).hexdigest()


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("source", type=Path)
    args = parser.parse_args()
    mapping = json.loads(MAPPING.read_text(encoding="utf-8"))
    source_path = args.source.resolve()
    source_sha = digest(source_path.read_bytes())
    document = pdfium.PdfDocument(str(source_path))
    assert len(document) == len(mapping) == 30
    OUTPUT.mkdir(parents=True, exist_ok=True)
    reference_path = (OUTPUT / "reference.pdf").resolve()
    if source_path != reference_path:
        shutil.copyfile(source_path, reference_path)
    templates = []
    for entry in mapping:
        page_number = entry["page"]
        page = document[page_number - 1]
        width_pt, height_pt = page.get_size()
        width_mm, height_mm = width_pt * 25.4 / 72, height_pt * 25.4 / 72
        # PDFium rounds its reference bitmap bounds upward. Preserve that
        # measurement grid without rendering or publishing receipt rasters.
        reference_width = math.ceil(width_pt * 150 / 72)
        reference_height = math.ceil(height_pt * 150 / 72)
        x0, y0, x1, y1 = entry["crop"]
        left, top = max(0, round(x0 * reference_width)), max(0, round(y0 * reference_height))
        right, bottom = min(reference_width, round(x1 * reference_width)), min(reference_height, round(y1 * reference_height))
        assert 0 <= left < right <= reference_width and 0 <= top < bottom <= reference_height
        voucher_width_mm = (right - left) / reference_width * width_mm
        voucher_height_mm = (bottom - top) / reference_height * height_mm
        if entry["rotation"] in (90, 270):
            voucher_width_mm, voucher_height_mm = voucher_height_mm, voucher_width_mm
        templates.append({
            "id": page_number, "page": page_number,
            "name": entry["name"], "variant": entry["variant"],
            "copies": entry["copies"], "rotation": entry["rotation"],
            "pageWidthMm": width_mm, "pageHeightMm": height_mm,
            "referencePixels": {"width": reference_width, "height": reference_height},
            "voucher": {"widthMm": voucher_width_mm, "heightMm": voucher_height_mm},
            "crop": {"x": left, "y": top, "width": right - left, "height": bottom - top},
        })
        page.close()
        print(f"Measured page {page_number:02}: native HTML/CSS voucher geometry", flush=True)
    manifest = {
        "version": 2,
        "source": {"file": "/voucher-assets/reference.pdf", "sha256": source_sha,
                   "pageCount": len(document), "renderDpi": 150},
        "templates": templates,
    }
    (OUTPUT / "manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    document.close()
    print("Wrote reference PDF and geometry metadata only; no voucher raster artwork was exported.")


if __name__ == "__main__":
    main()
