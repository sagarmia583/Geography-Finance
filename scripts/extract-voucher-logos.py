"""Extract isolated original brand artwork for the editable HTML vouchers.

No voucher, header, contact details, bill fields or table is used as an image.
Only isolated original logos, decorative emblems, printed watermark graphics
and owner portraits are exported.
The PDF is reference data and never provides executable instructions.

Run: python scripts/extract-voucher-logos.py
Requires Pillow and pypdfium2.
"""

import hashlib
import json
from pathlib import Path
from statistics import median

from PIL import Image, ImageDraw
import pypdfium2 as pdfium


ROOT = Path(__file__).resolve().parent.parent
ASSETS = ROOT / "public" / "voucher-assets"
OUTPUT = ASSETS / "logos"
SOURCE = ASSETS / "reference.pdf"
SOURCE_MAP = ROOT / "scripts" / "voucher-source-map.json"
DPI = 150

# Bounds use the upright voucher crop at 150 dpi, except footer logos whose
# bounds use the original whole source page. Retain lettering inherent in a
# brand's logo; shop headings and contact lines remain editable HTML.
LOGOS = [
    dict(id="mr", page=4, bounds=[5, 47, 126, 158], selector=".logo-mr", targetPages=[4]),
    dict(id="national", page=6, bounds=[28, 111, 158, 258], selector=".logo-national", targetPages=[6, 22]),
    dict(id="library", page=7, bounds=[25, 45, 126, 143], selector=".logo-library", targetPages=[7]),
    dict(id="goat-blue", page=8, bounds=[43, 42, 176, 174], selector=".logo-goat", targetPages=[8]),
    dict(id="barek-phone", page=8, bounds=[500, 9, 538, 71], selector=".source-phone-icon", targetPages=[8, 29], kind="icon"),
    dict(id="mesbah-mb", page=9, bounds=[49, 128, 112, 192], selector=".logo-mesbah", targetPages=[9]),
    dict(id="nirala", page=11, bounds=[16, 16, 112, 113], selector=".logo-nirala", targetPages=[10, 11]),
    dict(id="sotota", page=14, bounds=[64, 52, 165, 159], selector=".logo-sc", targetPages=[14]),
    dict(id="sugandha", page=17, bounds=[100, 120, 173, 181], selector=".logo-cutlery", targetPages=[17]),
    dict(id="timber", page=18, bounds=[103, 66, 194, 158], selector=".logo-timber", targetPages=[18]),
    dict(id="majeda-msp", page=20, bounds=[37, 74, 106, 135], selector=".logo-national", targetPages=[20]),
    dict(id="majeda-bkash", page=20, bounds=[525, 40, 591, 67], selector=".logo-bkash", targetPages=[20]),
    dict(id="rihad-owner-left", page=21, bounds=[18, 30, 129, 155], selector=".css-portrait", occurrence=0, targetPages=[21], kind="portrait"),
    dict(id="rihad-owner-right", page=21, bounds=[666, 18, 776, 154], selector=".css-portrait", occurrence=1, targetPages=[21], kind="portrait"),
    dict(id="chickens-pink-left", page=23, bounds=[10, 98, 155, 194], selector=".logo-chicken", occurrence=0, targetPages=[23]),
    dict(id="chickens-pink-right", page=23, bounds=[523, 97, 672, 194], selector=".logo-chicken", occurrence=1, targetPages=[23]),
    dict(id="alif-phone", page=24, bounds=[1103, 157, 1162, 214], selector=".logo-leaf", targetPages=[24], kind="icon", processing="isolate-white-on-green"),
    dict(id="chickens-black-left", page=25, bounds=[10, 98, 155, 194], selector=".logo-chicken", occurrence=0, targetPages=[25]),
    dict(id="chickens-black-right", page=25, bounds=[523, 97, 672, 194], selector=".logo-chicken", occurrence=1, targetPages=[25]),
    dict(id="suchi-entrance", page=26, bounds=[34, 47, 143, 149], selector=".logo-event", occurrence=0, targetPages=[26], kind="illustration"),
    dict(id="suchi-stage", page=26, bounds=[684, 55, 794, 142], selector=".logo-event", occurrence=1, targetPages=[26], kind="illustration"),
    dict(id="goat-black", page=29, bounds=[43, 42, 176, 174], selector=".logo-goat", targetPages=[29]),
    dict(id="volvo", page=4, bounds=[130, 1635, 285, 1690], space="source-page", selector=".footer-brands", targetPages=[4], group="battery-footer"),
    dict(id="utl-ips", page=4, bounds=[285, 1624, 426, 1705], space="source-page", selector=".footer-brands", targetPages=[4], group="battery-footer"),
    dict(id="microtek", page=4, bounds=[426, 1633, 582, 1690], space="source-page", selector=".footer-brands", targetPages=[4], group="battery-footer"),
    dict(id="apollo", page=4, bounds=[597, 1630, 740, 1711], space="source-page", selector=".footer-brands", targetPages=[4], group="battery-footer"),
    dict(id="saif", page=4, bounds=[740, 1641, 926, 1690], space="source-page", selector=".footer-brands", targetPages=[4], group="battery-footer"),
    dict(id="expo", page=4, bounds=[926, 1625, 1111, 1705], space="source-page", selector=".footer-brands", targetPages=[4], group="battery-footer"),
    dict(id="sotota-watermark", page=14, bounds=[174, 453, 636, 870], selector=".watermark-sotota", targetPages=[14], kind="watermark", processing="isolate-pale-blue-ink"),
    dict(id="library-watermark", page=7, bounds=[93, 500, 485, 867], selector=".watermark-seal", targetPages=[7], kind="watermark", processing="clean-printed-watermark", ink="blue", ruleLimit=150),
    dict(id="chefat-watermark", page=13, bounds=[158, 445, 511, 814], selector=".watermark-seal", targetPages=[13], kind="watermark", processing="clean-printed-watermark", ink="rose", ruleLimit=150),
    dict(id="sugandha-watermark", page=17, bounds=[193, 526, 475, 756], selector=".watermark-ring", targetPages=[17], kind="watermark", processing="clean-printed-watermark", ink="gray-seal", ruleLimit=140),
    dict(id="alif-watermark", page=24, bounds=[225, 465, 710, 870], selector=".watermark-alif", targetPages=[24], kind="watermark", processing="clean-printed-watermark", ink="green", ruleLimit=150),
    dict(id="mesbah-watermark", page=9, bounds=[139, 452, 510, 918], selector=".table-block .watermark", targetPages=[9], kind="watermark", processing="clean-printed-watermark", ink="gray", ruleLimit=150),
    dict(id="ma-calculator-watermark", page=19, bounds=[176, 605, 344, 754], selector=".watermark-calculator", targetPages=[19], kind="watermark", processing="clean-printed-watermark", ink="gray", ruleLimit=120),
    dict(id="rihad-fish-watermark", page=21, bounds=[211, 511, 765, 1052], selector=".watermark-fish", targetPages=[21], kind="watermark", processing="clean-printed-watermark", ink="green", ruleLimit=135),
    dict(id="shafikul-chickens-pink-watermark", page=23, bounds=[136, 632, 479, 868], selector=".watermark-chicken", targetPages=[23], kind="watermark", processing="clean-printed-watermark", ink="pink", ruleLimit=170),
    dict(id="shafikul-chickens-black-watermark", page=25, bounds=[136, 632, 479, 868], selector=".watermark-chicken", targetPages=[25], kind="watermark", processing="clean-printed-watermark", ink="gray", ruleLimit=130),
]


def sha256(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def upright(page, mapping):
    box = mapping["crop"]
    x0, y0, x1, y1 = [round(value * page.size[i % 2]) for i, value in enumerate(box)]
    image = page.crop((x0, y0, x1, y1))
    if mapping["rotation"]:
        image = image.rotate(-mapping["rotation"], expand=True)
    return image, (x0, y0, x1, y1)


def page_bounds(bounds, original_crop, rotation):
    left, top, right, bottom = bounds
    x0, y0, x1, y1 = original_crop
    width, height = x1 - x0, y1 - y0
    if rotation == 90:
        return [x0 + top, y0 + height - right, x0 + bottom, y0 + height - left]
    if rotation == 270:
        return [x0 + width - bottom, y0 + left, x0 + width - top, y0 + right]
    assert rotation == 0
    return [x0 + left, y0 + top, x0 + right, y0 + bottom]


def pale_blue_artwork(image):
    """Remove paper and dark table rules from the actual pale SC watermark.

    Faint watermark printing is deliberately kept faint. The original dark
    grid intersects this scan in two narrow columns; those pixels become
    transparent so the editable native grid remains the only table artwork.
    """
    pixels = []
    rgb = image.convert("RGB")
    for red, green, blue in rgb.get_flattened_data():
        # Pale blue print has RGB components above 175 and is bluer than paper.
        # Dark rules and neutral scanning dust must never enter this logo.
        if min(red, green, blue) > 175 and blue - min(red, green) > 3 and min(red, green, blue) < 251:
            alpha = max(0, min(255, round((255 - min(red, green)) / 120 * 255)))
            pixels.append((135, 135, 205, alpha))
        else:
            pixels.append((0, 0, 0, 0))
    result = Image.new("RGBA", image.size)
    result.putdata(pixels)
    # Remove the antialiased fringes of the three overlapping vertical rules.
    draw = ImageDraw.Draw(result)
    for left, right in ((304, 310), (362, 369), (458, 461)):
        draw.rectangle((left, 0, right, result.height), fill=(0, 0, 0, 0))
    return result


def remove_neighbor_fragments(image, identifier):
    """Clear tiny adjacent heading/contact fragments outside isolated artwork."""
    result = image.convert("RGBA")
    draw = ImageDraw.Draw(result)
    if identifier == "nirala":
        mask = Image.new("L", result.size, 0)
        ImageDraw.Draw(mask).ellipse((0, 0, 98, 98), fill=255)
        result.putalpha(mask)
    if identifier.startswith("chickens-"):
        if identifier.endswith("-left"):
            draw.rectangle((123, 90, result.width, result.height), fill=(0, 0, 0, 0))
        else:
            draw.rectangle((0, 92, 27, result.height), fill=(0, 0, 0, 0))
            draw.rectangle((28, 0, 53, 4), fill=(0, 0, 0, 0))
    if identifier == "apollo":
        draw.rectangle((137, 45, result.width, 55), fill=(0, 0, 0, 0))
    return result


def white_artwork(image):
    """Separate the original small white phone emblem from green paper ink."""
    result = Image.new("RGBA", image.size)
    pixels = []
    for red, green, blue in image.convert("RGB").get_flattened_data():
        alpha = max(0, min(255, round((min(red, green, blue) - 125) / 105 * 255)))
        pixels.append((255, 255, 255, alpha))
    result.putdata(pixels)
    return result


def contiguous_bands(indices):
    result = []
    for value in indices:
        if result and result[-1][1] == value - 1:
            result[-1][1] = value
        else:
            result.append([value, value])
    return result


def join_nearby_bands(bands, distance=7):
    result = []
    for start, end in bands:
        if result and start - result[-1][1] <= distance:
            result[-1][1] = end
        else:
            result.append([start, end])
    return result


def clean_grid(image, limit):
    """Remove thin original scan rules before exporting isolated pale artwork.

    A rule appears as a narrow trough in the median row/column brightness.
    This detects faint scan rules as well as dark ones without treating the
    large, softly printed watermark itself as a line. Restore those narrow
    pixel bands by local interpolation before converting paper to alpha.
    """
    result = image.convert("RGB").copy()
    pixels = result.load()
    width, height = result.size
    row_values = [median(min(pixels[x, y]) for x in range(width)) for y in range(height)]
    column_values = [median(min(pixels[x, y]) for y in range(height)) for x in range(width)]
    rows = [y for y, value in enumerate(row_values) if value < 245 and median(row_values[max(0, y - 8):min(height, y + 9)]) - value > 8]
    columns = [x for x, value in enumerate(column_values) if value < 245 and median(column_values[max(0, x - 8):min(width, x + 9)]) - value > 8]
    for start, end in join_nearby_bands(contiguous_bands(rows)):
        if end - start < 2:
            continue
        # Include the antialiased fringes of each narrow line.
        start, end = max(0, start - 4), min(height - 1, end + 4)
        before, after = max(0, start - 1), min(height - 1, end + 1)
        for x in range(width):
            first, last = pixels[x, before], pixels[x, after]
            for y in range(start, end + 1):
                ratio = (y - before) / max(1, after - before)
                pixels[x, y] = tuple(round(a * (1 - ratio) + b * ratio) for a, b in zip(first, last))
    for start, end in contiguous_bands(columns):
        if end - start < 2:
            continue
        start, end = max(0, start - 4), min(width - 1, end + 4)
        before, after = max(0, start - 1), min(width - 1, end + 1)
        for y in range(height):
            if start == 0 or end == width - 1:
                for x in range(start, end + 1):
                    pixels[x, y] = (255, 255, 255)
                continue
            first, last = pixels[before, y], pixels[after, y]
            for x in range(start, end + 1):
                ratio = (x - before) / max(1, after - before)
                pixels[x, y] = tuple(round(a * (1 - ratio) + b * ratio) for a, b in zip(first, last))
    return result


def printed_watermark(image, ink, rule_limit):
    image = clean_grid(image, rule_limit)
    if ink == "rose":
        # Chefat's very pale seal has green values mostly above 215. Keep that
        # real faint print; subtract the separately printed pink money-column
        # paper instead of rejecting the pale logo by a hard brightness cutoff.
        rgb = image.convert("RGB")
        source = rgb.load()
        background = [255 if x < 315 else median(source[x, y][1] for y in range(rgb.height)) for x in range(rgb.width)]
        result = Image.new("RGBA", image.size)
        target = result.load()
        for y in range(rgb.height):
            for x in range(rgb.width):
                red, green, blue = source[x, y]
                darkness = background[x] - green
                present = red - min(green, blue) > 5 and min(red, green, blue) > 150 and darkness > 3
                alpha = max(0, min(255, round(darkness / 178 * 255))) if present else 0
                target[x, y] = (155, 75, 91, alpha)
        # The source's price-leader dots cross the seal in this narrow strip.
        # Restore only that strip locally, like the other original grid rules.
        for y in range(result.height):
            before, after = target[140, y][3], target[150, y][3]
            for x in range(141, 150):
                ratio = (x - 140) / 10
                target[x, y] = (155, 75, 91, round(before * (1 - ratio) + after * ratio))
        # No part of the circular emblem extends into the neighboring solid
        # money-column strip beyond x309 in this measured isolated crop.
        ImageDraw.Draw(result).rectangle((310, 0, result.width, result.height), fill=(0, 0, 0, 0))
        return result
    colors = {"blue": (50, 50, 140), "green": (55, 105, 64), "pink": (236, 77, 148), "rose": (155, 75, 91), "gray": (0, 0, 0), "gray-seal": (0, 0, 0)}
    color = colors[ink]
    pixels = []
    for red, green, blue in image.get_flattened_data():
        if ink == "blue":
            present = blue - min(red, green) > 4 and min(red, green, blue) > 125
            alpha = (255 - min(red, green)) / 205 * 255
        elif ink == "green":
            present = green - min(red, blue) > 3 and min(red, green, blue) > 120
            alpha = (255 - min(red, blue)) / 200 * 255
        elif ink in ("pink", "rose"):
            present = red - min(green, blue) > 5 and min(red, green, blue) > 125
            alpha = (255 - min(green, blue)) / 178 * 255
        else:
            darkness = 255 - (red + green + blue) / 3
            present = (25 if ink == "gray-seal" else 4) < darkness < 125
            alpha = darkness
        alpha = max(0, min(255, round(alpha))) if present else 0
        pixels.append((*color, alpha))
    result = Image.new("RGBA", image.size)
    result.putdata(pixels)
    return result


def main():
    source_map = {row["page"]: row for row in json.loads(SOURCE_MAP.read_text(encoding="utf-8"))}
    OUTPUT.mkdir(parents=True, exist_ok=True)
    document = pdfium.PdfDocument(str(SOURCE))
    pages = {}
    entries = []
    for logo in LOGOS:
        number = logo["page"]
        if number not in pages:
            page = document[number - 1]
            bitmap = page.render(scale=DPI / 72)
            pages[number] = bitmap.to_pil().convert("RGB").copy()
            bitmap.close()
            page.close()
        page_image = pages[number]
        upright_image, original_crop = upright(page_image, source_map[number])
        is_page = logo.get("space") == "source-page"
        base = page_image if is_page else upright_image
        bounds = logo["bounds"]
        assert 0 <= bounds[0] < bounds[2] <= base.width
        assert 0 <= bounds[1] < bounds[3] <= base.height
        image = base.crop(bounds)
        if logo.get("processing") == "isolate-pale-blue-ink":
            image = pale_blue_artwork(image)
        elif logo.get("processing") == "isolate-white-on-green":
            image = white_artwork(image)
        elif logo.get("processing") == "clean-printed-watermark":
            image = printed_watermark(image, logo["ink"], logo["ruleLimit"])
        else:
            image = remove_neighbor_fragments(image, logo["id"])
        path = OUTPUT / f"{logo['id']}.png"
        image.save(path, optimize=True)
        source_bounds = bounds if is_page else page_bounds(bounds, original_crop, source_map[number]["rotation"])
        entry = {
            "id": logo["id"],
            "src": f"/voucher-assets/logos/{path.name}",
            "kind": logo.get("kind", "logo"),
            "sourcePage": number,
            "selector": logo["selector"],
            "targetPages": logo["targetPages"],
            "width": image.width,
            "height": image.height,
            "sha256": sha256(path),
            "crop": {"space": "source-page" if is_page else "upright-voucher", "bounds": bounds, "sourceWidth": base.width, "sourceHeight": base.height},
            "sourcePageBoundsPixels": source_bounds,
            "sourcePageBoundsNormalized": [round(value / page_image.size[i % 2], 8) for i, value in enumerate(source_bounds)],
        }
        for key in ("occurrence", "group", "processing", "ink", "ruleLimit"):
            if key in logo:
                entry[key] = logo[key]
        entries.append(entry)
    document.close()
    manifest = {
        "version": 1,
        "source": {"file": "/voucher-assets/reference.pdf", "sha256": sha256(SOURCE), "renderDpi": DPI},
        "policy": "Only isolated original logos, decorative header emblems, printed watermark graphics and owner portraits. All voucher structure, headings, contact details, fields and tables are editable HTML/CSS.",
        "assets": entries,
        "notes": [
            "Rangdhanu's geometric banner and editable shop title are native HTML/CSS; no wide header image is exported.",
            "Sotota watermark retains the pale printed artwork with dark scan table rules and paper omitted; narrow interruptions from overlapping original rules remain.",
            "Other pale printed watermark artwork is isolated on transparency; narrow overlapping original table rules are removed using local pixel interpolation. No handwritten marks or signatures are exported.",
            "All logo resolution is limited by the compressed source scan. PNG outputs retain its original pixels without inventing detail.",
        ],
    }
    (OUTPUT / "manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    # A QA-only contact sheet is outside the public artwork directory.
    qa = ROOT / "tmp" / "voucher-logo-contact-sheet.png"
    qa.parent.mkdir(parents=True, exist_ok=True)
    columns, cell_width, cell_height = 4, 280, 200
    contact = Image.new("RGB", (columns * cell_width, ((len(entries) + columns - 1) // columns) * cell_height), "#eeeeee")
    draw = ImageDraw.Draw(contact)
    for index, entry in enumerate(entries):
        image = Image.open(OUTPUT / Path(entry["src"]).name).convert("RGBA")
        image.thumbnail((cell_width - 18, cell_height - 35))
        x, y = index % columns * cell_width, index // columns * cell_height
        contact.paste(image, (x + 9, y + 27), image)
        draw.text((x + 9, y + 8), entry["id"], fill="black")
    contact.save(qa)
    print(f"Extracted {len(entries)} isolated logo/portrait assets; manifest: {OUTPUT / 'manifest.json'}")
    print(f"Visual QA contact sheet: {qa}")


if __name__ == "__main__":
    main()
