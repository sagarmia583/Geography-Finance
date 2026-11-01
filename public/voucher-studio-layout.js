const A4_WIDTH = 210;
const A4_HEIGHT = 297;
export const MM_TO_PX = 96 / 25.4;
export const CUTTING_BLEED_MM = 3;
const CUTTING_MARK_GAP_MM = 0.5;
const CUTTING_MARK_LENGTH_MM = 3;
export const CUTTING_CLEARANCE_MM = CUTTING_BLEED_MM + CUTTING_MARK_GAP_MM + CUTTING_MARK_LENGTH_MM;
// Keep even the outermost crop marks away from an ordinary printer's
// unprintable paper edge. This inset belongs outside the whole finishing area,
// not between vouchers and not inside their requested trim dimensions.
export const PRINT_SAFE_INSET_MM = 5;
export const CUTTING_OUTER_CLEARANCE_MM = CUTTING_CLEARANCE_MM + PRINT_SAFE_INSET_MM;

export function planLayout(options) {
  const { mode, pages, count, width, height } = options;
  let { gapX, gapY, margin } = options;
  const invalid = (error) => ({ valid: false, error, capacity: 0, perPage: 0 });
  if (!Number.isInteger(pages) || pages < 1 || pages > 20) {
    return invalid("১ থেকে ২০টি পেজ নির্বাচন করুন।");
  }
  if (mode === "original") {
    const { pageWidthMm, pageHeightMm } = options;
    if (
      ![pageWidthMm, pageHeightMm].every(Number.isFinite) ||
      pageWidthMm <= 0 ||
      pageHeightMm <= 0 ||
      pageWidthMm > A4_WIDTH + 0.01 ||
      pageHeightMm > A4_HEIGHT + 0.01
    ) {
      return invalid("মূল PDF পেজের মাপ সঠিক নয়।");
    }
    return {
      valid: true,
      columns: 1,
      rows: 1,
      capacity: 1,
      perPage: 1,
      pageCount: pages,
      width: pageWidthMm,
      height: pageHeightMm,
      gapX: 0,
      gapY: 0,
      margin: 0,
      warning: "",
    };
  }
  if (mode !== "custom") return invalid("লেআউট নির্বাচন করুন।");
  if (
    !Number.isInteger(count) ||
    count < 1 ||
    count > 12 ||
    ![width, height, gapX, gapY, margin].every(Number.isFinite) ||
    width <= 0 ||
    height <= 0 ||
    gapX < 0 ||
    gapY < 0 ||
    margin < 0
  ) {
    return invalid(
      "সঠিক মাপ দিন। প্রতি পেজে ১–১২টি ভাউচার; সাইজ ধনাত্মক এবং gap / margin শূন্য বা তার বেশি হতে হবে।",
    );
  }
  // Reserve the complete finishing footprint without reducing the requested
  // custom dimensions. Callers without finishing retain their packing rules.
  const clearance = options.cutting ? CUTTING_CLEARANCE_MM : 0;
  const outerClearance = options.cutting ? CUTTING_OUTER_CLEARANCE_MM : 0;
  const adjusted = margin < outerClearance || gapX < 2 * clearance || gapY < 2 * clearance;
  margin = Math.max(margin, outerClearance);
  gapX = Math.max(gapX, 2 * clearance);
  gapY = Math.max(gapY, 2 * clearance);
  const columns = Math.max(0, Math.floor((A4_WIDTH - 2 * margin + gapX + 1e-8) / (width + gapX)));
  const rows = Math.max(0, Math.floor((A4_HEIGHT - 2 * margin + gapY + 1e-8) / (height + gapY)));
  const capacity = columns * rows;
  if (capacity === 0)
    return invalid(
      options.cutting
        ? "এই মাপের সঙ্গে bleed, কাটার মার্ক ও প্রিন্টারের জন্য ৫ মিমি নিরাপদ সীমানা A4 পেজে বসবে না। ভাউচারের মাপ কমান।"
        : "এই মাপ ও margin অনুযায়ী A4 পেজে একটি ভাউচারও পুরোপুরি বসবে না। সাইজ বা margin কমান।",
    );
  return {
    valid: true,
    columns,
    rows,
    capacity,
    perPage: Math.min(count, capacity),
    pageCount: pages,
    width,
    height,
    gapX,
    gapY,
    margin,
    warning: [
      capacity < count ? `প্রতি পেজে ${count}টির বদলে সর্বোচ্চ ${capacity}টি ভাউচার বসবে।` : "",
      adjusted
        ? "Bleed ও কাটার মার্কসহ প্রিন্টারের জন্য বাইরে ৫ মিমি নিরাপদ সীমানা রাখতে margin অন্তত ১১.৫ মিমি এবং ভাউচারের ফাঁক অন্তত ১৩ মিমি রাখা হয়েছে।"
        : "",
    ]
      .filter(Boolean)
      .join(" "),
  };
}

export function slotPosition(plan, index) {
  return {
    left: plan.margin + (index % plan.columns) * (plan.width + plan.gapX),
    top: plan.margin + Math.floor(index / plan.columns) * (plan.height + plan.gapY),
  };
}

export function artworkTransform(pixelWidth, pixelHeight, widthMm, heightMm, rotation = 0) {
  if (
    ![pixelWidth, pixelHeight, widthMm, heightMm].every((v) => Number.isFinite(v) && v > 0) ||
    ![0, 90, 180, 270].includes(rotation)
  )
    throw new Error("Invalid artwork geometry");
  const sideways = rotation === 90 || rotation === 270;
  const scale = Math.min(
    (widthMm * MM_TO_PX) / (sideways ? pixelHeight : pixelWidth),
    (heightMm * MM_TO_PX) / (sideways ? pixelWidth : pixelHeight),
  );
  const x = rotation === 90 ? pixelHeight * scale : rotation === 180 ? pixelWidth * scale : 0;
  const y = rotation === 270 ? pixelWidth * scale : rotation === 180 ? pixelHeight * scale : 0;
  return { scale, css: `translate(${x}px,${y}px) rotate(${rotation}deg) scale(${scale})` };
}

// Physical millimetres on the A4 sheet; marks are deliberately outside both
// the trim and the 3 mm white bleed, independent of artwork scaling/rotation.
export function cuttingGeometry(pixelWidth, pixelHeight, position) {
  const { leftMm, topMm, widthMm, heightMm, rotation = 0, contentOffsetTopMm = 0 } = position;
  const scale =
    artworkTransform(pixelWidth, pixelHeight, widthMm, heightMm, rotation).scale / MM_TO_PX;
  const sideways = rotation === 90 || rotation === 270;
  const trim = {
    left: leftMm,
    top: topMm + contentOffsetTopMm,
    width: (sideways ? pixelHeight : pixelWidth) * scale,
    height: (sideways ? pixelWidth : pixelHeight) * scale,
  };
  const bleed = {
    left: trim.left - CUTTING_BLEED_MM,
    top: trim.top - CUTTING_BLEED_MM,
    width: trim.width + 2 * CUTTING_BLEED_MM,
    height: trim.height + 2 * CUTTING_BLEED_MM,
  };
  const offset = CUTTING_BLEED_MM + CUTTING_MARK_GAP_MM;
  const length = CUTTING_MARK_LENGTH_MM;
  const stroke = 0.2;
  const marks = [];
  for (const x of [trim.left, trim.left + trim.width]) {
    for (const y of [trim.top, trim.top + trim.height]) {
      marks.push(
        {
          left: x === trim.left ? x - offset - length : x + offset,
          top: y - stroke / 2,
          width: length,
          height: stroke,
        },
        {
          left: x - stroke / 2,
          top: y === trim.top ? y - offset - length : y + offset,
          width: stroke,
          height: length,
        },
      );
    }
  }
  return { trim, bleed, marks };
}

export function fitOriginalCutting(instances) {
  if (!Array.isArray(instances) || instances.length === 0)
    throw new Error("At least one original voucher is required");
  const clearance = CUTTING_OUTER_CLEARANCE_MM;
  const gap = 2 * CUTTING_CLEARANCE_MM;
  const available = { width: A4_WIDTH - 2 * clearance, height: A4_HEIGHT - 2 * clearance };
  const trims = instances.map((instance) => {
    if (
      !instance?.crop ||
      ![instance.leftMm, instance.topMm, instance.contentOffsetTopMm ?? 0].every(Number.isFinite)
    )
      throw new Error("Invalid original voucher geometry");
    return cuttingGeometry(instance.crop.w, instance.crop.h, instance).trim;
  });
  const centers = trims.map((trim) => ({
    x: trim.left + trim.width / 2,
    y: trim.top + trim.height / 2,
  }));
  const spread = (coordinate) =>
    Math.max(...centers.map((center) => center[coordinate])) -
    Math.min(...centers.map((center) => center[coordinate]));
  const horizontal = spread("x") > spread("y");
  const axis = horizontal ? "left" : "top";
  const dimension = horizontal ? "width" : "height";
  const axisSpace = available[dimension] - gap * (instances.length - 1);
  if (axisSpace <= 0) throw new Error("Original voucher finishing cannot fit on A4");
  // Only shrink artwork when its trim plus physical finishing clearance cannot
  // fit. Source slot padding is excluded so existing visible sizes are retained.
  const scale = Math.min(
    1,
    available.width / Math.max(...trims.map((trim) => trim.width)),
    available.height / Math.max(...trims.map((trim) => trim.height)),
    axisSpace / trims.reduce((total, trim) => total + trim[dimension], 0),
  );
  const clamp = (value, minimum, maximum) => Math.max(minimum, Math.min(value, maximum));
  const fitted = trims.map((trim) => {
    const width = trim.width * scale;
    const height = trim.height * scale;
    return {
      left: clamp(trim.left, clearance, A4_WIDTH - clearance - width),
      top: clamp(trim.top, clearance, A4_HEIGHT - clearance - height),
      width,
      height,
    };
  });
  const order = trims
    .map((trim, index) => ({ index, center: trim[axis] + trim[dimension] / 2 }))
    .sort((a, b) => a.center - b.center || a.index - b.index)
    .map(({ index }) => index);
  // Forward/backward constraints retain source positions where possible while
  // leaving enough room for both vouchers' bleed and marks in every gutter.
  for (let index = 1; index < order.length; index++) {
    const previous = fitted[order[index - 1]];
    const current = fitted[order[index]];
    current[axis] = Math.max(current[axis], previous[axis] + previous[dimension] + gap);
  }
  const axisEnd = (horizontal ? A4_WIDTH : A4_HEIGHT) - clearance;
  for (let index = order.length - 1; index >= 0; index--) {
    const current = fitted[order[index]];
    const next = fitted[order[index + 1]];
    const end = next ? next[axis] - gap : axisEnd;
    current[axis] = Math.min(current[axis], end - current[dimension]);
  }
  return {
    instances: instances.map((instance, index) => ({
      ...instance,
      leftMm: fitted[index].left,
      topMm: fitted[index].top,
      widthMm: fitted[index].width,
      heightMm: fitted[index].height,
      contentOffsetTopMm: 0,
    })),
    scale,
    adjusted: fitted.some((trim, index) =>
      ["left", "top", "width", "height"].some(
        (property) => Math.abs(trim[property] - trims[index][property]) > 1e-7,
      ),
    ),
  };
}
