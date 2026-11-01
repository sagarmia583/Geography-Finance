"""Record native receipt placements measured from the thirty reference PDF pages.

The source PDF and its page images are references, never executable input. The
native Studio uses these coordinates to lay out HTML/CSS vouchers, not full-page
or full-voucher images. Slot extents are in page orientation; rotation describes
the clockwise turn from an upright HTML receipt into that slot.
"""

import json
from pathlib import Path


ROOT = Path(__file__).resolve().parent.parent

# Second receipt origins measured in the lossless 150 dpi reference page raster.
# Values were checked against both full-page views and a contact sheet with the
# first and second source rectangles drawn over the reference artwork.
SECOND_ORIGINS = {
    4: (108, 858),
    8: (6, 948),
    9: (30, 924),
    10: (702, 24),
    13: (48, 882),
    14: (12, 900),
    15: (108, 948),
    17: (72, 924),
    22: (0, 786),
    23: (24, 786),
    25: (24, 786),
    26: (0, 882),
    27: (12, 786),
    28: (108, 882),
    29: (0, 852),
    30: (642, 0),
}

TEMPLATE_IDS = {10: 11, 15: 16, 22: 6, 25: 23, 28: 16, 29: 8}


def main():
    manifest = json.loads(
        (ROOT / "public/voucher-assets/manifest.json").read_text(encoding="utf-8")
    )
    pages = []
    for entry in manifest["templates"]:
        page_id = entry["id"]
        crop = entry["crop"]
        reference = entry["referencePixels"]
        px_to_mm_x = entry["pageWidthMm"] / reference["width"]
        px_to_mm_y = entry["pageHeightMm"] / reference["height"]
        origins = [(crop["x"], crop["y"])]
        if entry["copies"] == 2:
            origins.append(SECOND_ORIGINS[page_id])
        copies = []
        for x, y in origins:
            # The second decorator receipt reaches the page edge. Respect that
            # boundary instead of adding four nonexistent pixels to the page.
            width = min(crop["width"], reference["width"] - x)
            height = min(crop["height"], reference["height"] - y)
            copies.append(
                {
                    "leftMm": round(x * px_to_mm_x, 4),
                    "topMm": round(y * px_to_mm_y, 4),
                    "widthMm": round(width * px_to_mm_x, 4),
                    "heightMm": round(height * px_to_mm_y, 4),
                    "rotation": (360 - entry["rotation"]) % 360,
                }
            )
        page = {
            "id": page_id,
            "templateId": TEMPLATE_IDS.get(page_id, page_id),
            "name": entry["name"],
            "variant": entry["variant"],
            "pageWidthMm": round(entry["pageWidthMm"], 4),
            "pageHeightMm": round(entry["pageHeightMm"], 4),
            "copies": copies,
        }
        # The first National Electric letterhead is lower in its otherwise
        # blank source rectangle than the second scan. Shift its content,
        # retaining the measured nonoverlapping paper rectangles and scale.
        if page_id == 22:
            page["copies"][0]["contentOffsetTopMm"] = 6.8
        if page_id in (9, 17, 25, 29):
            page["grayscale"] = True
        pages.append(page)
    output = {"version": 1, "pages": pages}
    path = ROOT / "public/voucher-native-pages.json"
    path.write_text(
        json.dumps(output, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    for page in pages:
        assert len(page["copies"]) in (1, 2)
        for copy in page["copies"]:
            assert copy["leftMm"] >= 0 and copy["topMm"] >= 0
            assert copy["widthMm"] > 0 and copy["heightMm"] > 0
            assert copy["leftMm"] + copy["widthMm"] <= 210.001
            assert copy["topMm"] + copy["heightMm"] <= 297.001
    print(f"Saved all {len(pages)} native page arrangements ({sum(len(p['copies']) for p in pages)} receipts).")


if __name__ == "__main__":
    main()
