"""Extract only the IC emblem from the supplied invoice reference.

Run with a local source path: python scripts/extract-islam-computers-logo.py "Islam Coputer.jpg"
The invoice itself is reconstructed as editable HTML/CSS, never a raster background.
"""

import argparse
from pathlib import Path

import numpy as np
from PIL import Image, ImageFilter


parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("source", type=Path)
args = parser.parse_args()
source = Image.open(args.source).convert("RGB")
if source.size != (1686, 2554):
    raise ValueError("Use the original 1686 by 2554 pixel reference image.")
logo = source.crop((87, 111, 222, 267))
pixels = np.array(logo).astype(float)
# Retain the printed emblem contour while removing the pale halftone paper.
alpha = np.clip((150 - pixels[:, :, 0]) * 255 / 90, 0, 255)
alpha *= np.clip((150 - pixels[:, :, 1]) / 75, 0, 1)
mask = Image.fromarray(alpha.astype("uint8")).filter(ImageFilter.MedianFilter(3))
isolated = Image.new("RGBA", logo.size, (6, 35, 100, 0))
isolated.putalpha(mask)
target = Path(__file__).resolve().parent.parent / "public/voucher-assets/logos/islam-computers.png"
isolated.save(target)
print(f"Saved isolated {isolated.width} by {isolated.height} pixel logo: {target}")
