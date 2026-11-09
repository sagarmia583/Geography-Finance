// Native text remains HTML. Canvas is used only to measure the loaded font.
const fontRatios = new Map();
let fontMeasure;

export function textInsets(width, height, fontSize) {
  return {
    x: Math.max(0, Math.min(5, fontSize * 0.16, width * 0.08)),
    y: Math.max(0, Math.min(1.5, fontSize * 0.08, height * 0.05)),
  };
}

export function fittingFontSize(maximum, fits) {
  if (fits(maximum)) return maximum;
  let low = Math.min(1, maximum);
  let high = maximum;
  for (let step = 0; step < 10; step++) {
    const candidate = (low + high) / 2;
    if (fits(candidate)) low = candidate;
    else high = candidate;
  }
  return low;
}

export function textFitsBox(contentWidth, contentHeight, width, height) {
  return contentWidth <= Math.ceil(width) && contentHeight <= Math.ceil(height);
}

export function textLineRatio(sourceValue, measuredRatio = 1.35) {
  const sourceRatio = Number(sourceValue);
  return Number.isFinite(sourceRatio) && sourceRatio > 0
    ? sourceRatio
    : Math.max(1.35, measuredRatio);
}

function lineRatio(style, sourceValue) {
  const key = `${style.fontWeight} ${style.fontFamily}`;
  if (!fontRatios.has(key)) {
    fontMeasure ||= document.createElement("canvas").getContext("2d");
    let ratio = 1.35;
    if (fontMeasure) {
      fontMeasure.font = `${style.fontWeight} 100px ${style.fontFamily}`;
      const sample = fontMeasure.measureText("ক্ষ্মী শ্রদ্ধা কৃষ্ণ কুঁ রু গূ 0123456789");
      const measured =
        (sample.actualBoundingBoxAscent + sample.actualBoundingBoxDescent) / 100 + 0.08;
      if (Number.isFinite(measured)) ratio = Math.max(ratio, measured);
    }
    fontRatios.set(key, ratio);
  }
  return textLineRatio(sourceValue, fontRatios.get(key));
}

function originalSize(element, style) {
  if (!element.dataset.textFontSize) element.dataset.textFontSize = style.fontSize;
  return parseFloat(element.dataset.textFontSize);
}

function contentWrapper(element) {
  let content = element.querySelector(":scope > .native-text-content");
  if (!content) {
    content = element.querySelector(":scope > .fit-text");
    if (!content) {
      // Select-all replacement can remove the wrapper. Rebuild it on blur,
      // never while an active caret or IME composition lives in these nodes.
      if (element.contains(document.activeElement)) return null;
      content = document.createElement("span");
      content.append(...element.childNodes);
      element.appendChild(content);
    }
    content.classList.add("native-text-content");
  }
  return content;
}

function fitLabel(element) {
  const style = getComputedStyle(element);
  const base = originalSize(element, style);
  const heading = element.matches("[data-fit]");
  const inset =
    heading && !element.matches(".pill,.fill,.box")
      ? { x: 0, y: 0 }
      : textInsets(element.clientWidth, element.clientHeight, base);
  element.classList.add("native-text-box");
  element.style.setProperty("--text-inset-x", `${inset.x}px`);
  element.style.setProperty("--text-inset-y", `${inset.y}px`);
  const content = contentWrapper(element);
  if (!content) return;
  // A short label should keep its words together. Explicit source breaks
  // remain multiline; taller paragraphs may wrap inside their own rectangle.
  const explicitBreak = content.querySelector("br") || content.textContent.includes("\n");
  const compact = element.clientHeight < base * 2.6;
  content.style.whiteSpace = explicitBreak || !compact ? "pre-line" : "nowrap";
  // Some printed badges have their own required padding. Measure the padding
  // the browser actually applied so it cannot force otherwise readable text
  // down to the minimum size or let a line clip vertically.
  const applied = getComputedStyle(element);
  const width =
    element.clientWidth - parseFloat(applied.paddingLeft) - parseFloat(applied.paddingRight);
  const height =
    element.clientHeight - parseFloat(applied.paddingTop) - parseFloat(applied.paddingBottom);
  if (width <= 0 || height <= 0) return;
  const sourceWidth = applied.getPropertyValue("--source-text-width").trim();
  const sourceMeasure = parseFloat(sourceWidth);
  const targetWidth =
    sourceMeasure > 0
      ? Math.min(width, sourceWidth.endsWith("%") ? (width * sourceMeasure) / 100 : sourceMeasure)
      : 0;
  content.classList.toggle("native-source-text", targetWidth > 0);
  content.style.removeProperty("--text-transform");
  if (targetWidth) content.style.whiteSpace = explicitBreak ? "pre" : "nowrap";
  // Numeric source contact blocks can specify their own compact line rhythm.
  // Other labels and all writing fields retain the Bengali glyph metrics.
  const ratio = lineRatio(style, style.getPropertyValue("--source-line-ratio"));
  element.style.setProperty("--text-line-ratio", ratio);
  const setSize = (size) => element.style.setProperty("--text-font-size", `${size}px`);
  const fits = (size) => {
    setSize(size);
    // scrollWidth/scrollHeight round fractional native coordinates to whole
    // pixels. Compare with rounded inner bounds, rather than shrinking a
    // full-width wrapper forever over a subpixel rounding difference.
    // Calibrated titles have separate height and width measurements. Allow
    // moderate horizontal compression before lowering their vertical size.
    const measuredWidth = targetWidth ? content.scrollWidth * 0.7 : content.scrollWidth;
    return textFitsBox(measuredWidth, content.scrollHeight, targetWidth || width, height);
  };
  const size = fittingFontSize(Math.min(base, height / ratio), fits);
  setSize(size);
  element.style.setProperty("font-size", "var(--text-font-size)", "important");
  element.style.setProperty("line-height", "var(--text-line-ratio)", "important");
  const alignment = style.textAlign;
  content.style.alignSelf =
    alignment === "center" ? "center" : alignment === "right" ? "flex-end" : "flex-start";
  if (targetWidth && content.scrollWidth > 0) {
    const scale = Math.min(4, targetWidth / content.scrollWidth);
    content.style.setProperty("--text-transform", `scaleX(${scale})`);
    content.style.transformOrigin =
      alignment === "center" ? "center" : alignment === "right" ? "right" : "left";
  }
}

function fitField(element) {
  const style = getComputedStyle(element);
  const base = originalSize(element, style);
  const ratio = lineRatio(style);
  const width = element.clientWidth;
  const height = element.clientHeight;
  if (!width || !height) return;
  const inset = textInsets(width, height, base);
  const body = height > base * 4;
  element.style.padding = `${inset.y}px ${inset.x}px`;
  element.style.lineHeight = String(ratio);
  const setSize = (size) => element.style.setProperty("font-size", `${size}px`, "important");
  const fits = (size) => {
    setSize(size);
    return element.scrollHeight <= height + 0.5 && element.scrollWidth <= width + 0.5;
  };
  const maximum = Math.min(base, (height - 2 * inset.y) / ratio);
  const empty = !element.hasChildNodes();
  const size = empty ? maximum : fittingFontSize(maximum, fits);
  setSize(size);
  // A short single line is centered within its actual inner box. Multiline
  // bodies keep normal block editing and start at the top of the writing area.
  if (body) return;
  if (!empty) {
    const text = element.innerText;
    if (!fontMeasure || text.includes("\n")) return;
    fontMeasure.font = `${style.fontWeight} ${size}px ${style.fontFamily}`;
    if (fontMeasure.measureText(text).width > width - inset.x * 2) return;
  }
  const space = Math.max(inset.y, (height - size * ratio) / 2);
  element.style.paddingTop = `${space}px`;
  element.style.paddingBottom = `${space}px`;
}

const labels = "[data-fit],.tag[data-key],.th[data-key],.cell-label[data-key],.piece[data-key]";

export function fitVoucherElement(element) {
  if (!element.isConnected || element.getAttribute("aria-hidden") === "true") return;
  if (element.dataset.designFont === "true") return;
  if (element.matches(".field[data-key]")) fitField(element);
  else if (element.matches(labels) && !element.querySelector("[data-key]")) fitLabel(element);
}

export function fitVoucherText(root) {
  root.querySelectorAll(`.field[data-key],${labels}`).forEach(fitVoucherElement);
}
