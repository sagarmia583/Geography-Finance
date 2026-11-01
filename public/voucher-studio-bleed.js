import { artworkTransform, CUTTING_BLEED_MM, MM_TO_PX } from "./voucher-studio-layout.js";

// Only these flat printed backgrounds reach a native voucher's trim edge.
// Keep the bleed as HTML/CSS color strips so editable text, logos and table
// borders are never copied or stretched into the cutting allowance.
const EDGE_BACKGROUNDS = new Map([
  [24, { edge: "top", start: 5 / 805, end: 798 / 805, color: "#0f734f" }],
  [27, { edge: "bottom", start: 330 / 435, end: 425 / 435, color: "#113bdc" }],
]);

/** Return colored bleed rectangles in physical millimetres on the A4 sheet. */
export function bleedBackgrounds(templateId, pixelWidth, pixelHeight, position) {
  const background = EDGE_BACKGROUNDS.get(Number(templateId));
  if (!background) return [];

  const { leftMm, topMm, widthMm, heightMm, rotation = 0, contentOffsetTopMm = 0 } = position;
  const scale =
    artworkTransform(pixelWidth, pixelHeight, widthMm, heightMm, rotation).scale / MM_TO_PX;
  const depth = CUTTING_BLEED_MM / scale;
  const x0 = background.start * pixelWidth;
  const x1 = background.end * pixelWidth;
  const y0 = background.edge === "top" ? -depth : pixelHeight;
  const y1 = background.edge === "top" ? 0 : pixelHeight + depth;

  const rotated = (x, y) => {
    if (rotation === 90) return [pixelHeight - y, x];
    if (rotation === 180) return [pixelWidth - x, pixelHeight - y];
    if (rotation === 270) return [y, pixelWidth - x];
    return [x, y];
  };
  const points = [rotated(x0, y0), rotated(x1, y0), rotated(x0, y1), rotated(x1, y1)];
  const minX = Math.min(...points.map(([x]) => x));
  const maxX = Math.max(...points.map(([x]) => x));
  const minY = Math.min(...points.map(([, y]) => y));
  const maxY = Math.max(...points.map(([, y]) => y));

  return [
    {
      left: leftMm + minX * scale,
      top: topMm + contentOffsetTopMm + minY * scale,
      width: (maxX - minX) * scale,
      height: (maxY - minY) * scale,
      color: background.color,
    },
  ];
}
