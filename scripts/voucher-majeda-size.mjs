// Reflow horizontal boxes instead of stretching the canvas or its lettering.
// The physical trim and the cropped native grid must have the same aspect
// ratio because artworkTransform and cuttingGeometry preserve proportions.
export function majedaHorizontalScale(crop, printSize) {
  const values = [crop?.w, crop?.h, printSize?.widthMm, printSize?.heightMm];
  if (!values.every((value) => Number.isFinite(value) && value > 0))
    throw new Error("Majeda needs valid native bounds and a configured print size.");
  return (crop.h * printSize.widthMm) / (crop.w * printSize.heightMm);
}

export function resizeMajedaMarkup(markup, scale) {
  if (!Number.isFinite(scale) || scale <= 0)
    throw new Error("Majeda's horizontal layout scale must be positive and finite.");
  return markup.replace(/\bstyle="([^"]*)"/g, (_attribute, style) => {
    const resized = style.replace(
      /(^|;)(\s*(?:left|--x|width|--w|--tag|right)\s*:\s*)(-?(?:\d+(?:\.\d*)?|\.\d+))(\s*)(px)?(?=\s*(?:!important)?\s*(?:;|$))/g,
      (_declaration, separator, property, value, space, unit = "") =>
        `${separator}${property}${Number(value) * scale}${space}${unit}`,
    );
    return `style="${resized}"`;
  });
}
