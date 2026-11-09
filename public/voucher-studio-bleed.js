import { artworkTransform, CUTTING_BLEED_MM, MM_TO_PX } from "./voucher-studio-layout.js";

// Only these printed backgrounds reach a native voucher's trim edge.
// Keep the bleed as HTML/CSS color strips so editable text, logos and table
// borders are never copied or stretched into the cutting allowance.
const ISLAM_HEIGHT = (1000 * 8.5) / 5.6;
const EDGE_BACKGROUNDS = new Map([
  [24, { edge: "top", start: 5 / 805, end: 798 / 805, color: "#0f734f" }],
  [27, { edge: "bottom", start: 330 / 435, end: 425 / 435, color: "#113bdc" }],
  [
    31,
    [
      {
        edge: "top",
        start: 0,
        end: 1,
        corners: true,
        color: (rotation) =>
          `linear-gradient(${115 + rotation}deg,#8cbcf1 0%,#cee5fa 38%,#edf5fd 100%)`,
      },
      { edge: "left", start: 0, end: 225 / ISLAM_HEIGHT, color: "#8cbcf1" },
      { edge: "right", start: 0, end: 225 / ISLAM_HEIGHT, color: "#edf5fd" },
      {
        edge: "bottom",
        start: 0,
        end: 1,
        corners: true,
        color: (rotation) => `linear-gradient(${90 + rotation}deg,#123e89,#14539e,#163c83)`,
      },
      { edge: "left", start: 1456 / ISLAM_HEIGHT, end: 1, color: "#123e89" },
      { edge: "right", start: 1456 / ISLAM_HEIGHT, end: 1, color: "#163c83" },
    ],
  ],
]);

/** Return colored bleed rectangles in physical millimetres on the A4 sheet. */
export function bleedBackgrounds(templateId, pixelWidth, pixelHeight, position) {
  const entry = EDGE_BACKGROUNDS.get(Number(templateId));
  if (!entry) return [];
  const backgrounds = Array.isArray(entry) ? entry : [entry];

  const { leftMm, topMm, widthMm, heightMm, rotation = 0, contentOffsetTopMm = 0 } = position;
  const scale =
    artworkTransform(pixelWidth, pixelHeight, widthMm, heightMm, rotation).scale / MM_TO_PX;
  const depth = CUTTING_BLEED_MM / scale;
  const rotated = (x, y) => {
    if (rotation === 90) return [pixelHeight - y, x];
    if (rotation === 180) return [pixelWidth - x, pixelHeight - y];
    if (rotation === 270) return [y, pixelWidth - x];
    return [x, y];
  };
  return backgrounds.map((background) => {
    const horizontal = background.edge === "top" || background.edge === "bottom";
    // Full-width header/footer strips also paint the four bleed corners.
    // Side strips follow only their colored source band, keeping the invoice
    // body's white side edges free of header or footer color.
    const extension = background.corners ? depth : 0;
    const x0 = horizontal
      ? background.start * pixelWidth - extension
      : background.edge === "left"
        ? -depth
        : pixelWidth;
    const x1 = horizontal
      ? background.end * pixelWidth + extension
      : background.edge === "left"
        ? 0
        : pixelWidth + depth;
    const y0 = horizontal
      ? background.edge === "top"
        ? -depth
        : pixelHeight
      : background.start * pixelHeight;
    const y1 = horizontal
      ? background.edge === "top"
        ? 0
        : pixelHeight + depth
      : background.end * pixelHeight;
    const points = [rotated(x0, y0), rotated(x1, y0), rotated(x0, y1), rotated(x1, y1)];
    const minX = Math.min(...points.map(([x]) => x));
    const maxX = Math.max(...points.map(([x]) => x));
    const minY = Math.min(...points.map(([, y]) => y));
    const maxY = Math.max(...points.map(([, y]) => y));
    return {
      left: leftMm + minX * scale,
      top: topMm + contentOffsetTopMm + minY * scale,
      width: (maxX - minX) * scale,
      height: (maxY - minY) * scale,
      color: typeof background.color === "function" ? background.color(rotation) : background.color,
    };
  });
}
