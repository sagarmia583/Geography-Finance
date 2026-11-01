// Standard CSS/DOMMatrix affine coordinates: x' = ax + cy + e; y' = bx + dy + f.
// These helpers stay independent of the DOM so preview zoom and rotated vouchers
// can use the same editing geometry as their printed artwork.
export const IDENTITY_MATRIX = Object.freeze({ a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 });
export const DEFAULT_OBJECT_TRANSFORM = Object.freeze({
  x: 0,
  y: 0,
  scaleX: 1,
  scaleY: 1,
  rotation: 0,
});

export function clamp(value, minimum, maximum) {
  return Math.min(maximum, Math.max(minimum, value));
}

function finite(value, fallback) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function validMatrix(matrix) {
  return (
    matrix && [matrix.a, matrix.b, matrix.c, matrix.d, matrix.e, matrix.f].every(Number.isFinite)
  );
}

export function multiplyMatrices(left, right) {
  if (!validMatrix(left) || !validMatrix(right)) return null;
  const result = {
    a: left.a * right.a + left.c * right.b,
    b: left.b * right.a + left.d * right.b,
    c: left.a * right.c + left.c * right.d,
    d: left.b * right.c + left.d * right.d,
    e: left.a * right.e + left.c * right.f + left.e,
    f: left.b * right.e + left.d * right.f + left.f,
  };
  return validMatrix(result) ? result : null;
}

export function invertMatrix(matrix) {
  if (!validMatrix(matrix)) return null;
  const determinant = matrix.a * matrix.d - matrix.b * matrix.c;
  // Scale the singularity tolerance to the matrix, so a very small but usable
  // preview zoom is not mistaken for a collapsed axis.
  const magnitude = Math.max(
    Math.abs(matrix.a),
    Math.abs(matrix.b),
    Math.abs(matrix.c),
    Math.abs(matrix.d),
  );
  if (
    !Number.isFinite(determinant) ||
    magnitude === 0 ||
    Math.abs(determinant) <= Number.EPSILON * magnitude * magnitude * 8
  )
    return null;
  const result = {
    a: matrix.d / determinant,
    b: -matrix.b / determinant,
    c: -matrix.c / determinant,
    d: matrix.a / determinant,
    e: (matrix.c * matrix.f - matrix.d * matrix.e) / determinant,
    f: (matrix.b * matrix.e - matrix.a * matrix.f) / determinant,
  };
  return validMatrix(result) ? result : null;
}

export function transformPoint(matrix, point) {
  if (!validMatrix(matrix) || !point || !Number.isFinite(point.x) || !Number.isFinite(point.y))
    return null;
  const result = {
    x: matrix.a * point.x + matrix.c * point.y + matrix.e,
    y: matrix.b * point.x + matrix.d * point.y + matrix.f,
  };
  return Number.isFinite(result.x) && Number.isFinite(result.y) ? result : null;
}

export function screenDeltaToLocal(dx, dy, matrix) {
  if (!Number.isFinite(dx) || !Number.isFinite(dy)) return null;
  if (!validMatrix(matrix)) return null;
  const inverse = invertMatrix({ a: matrix.a, b: matrix.b, c: matrix.c, d: matrix.d, e: 0, f: 0 });
  if (!inverse) return null;
  return transformPoint({ ...inverse, e: 0, f: 0 }, { x: dx, y: dy });
}

export function snapValue(value, grid = 1, enabled = true) {
  if (!Number.isFinite(value)) return 0;
  if (!enabled || !Number.isFinite(grid) || grid <= 0) return value;
  const result = Math.round(value / grid) * grid;
  if (!Number.isFinite(result)) return value;
  return Object.is(result, -0) ? 0 : Number(result.toFixed(8));
}

export function normalizeTransform(edit = {}) {
  const candidate = edit && typeof edit === "object" ? edit : {};
  const angle = finite(candidate.rotation, 0);
  const rotation = (((angle % 360) + 540) % 360) - 180;
  return {
    x: clamp(finite(candidate.x, 0), -10000, 10000),
    y: clamp(finite(candidate.y, 0), -10000, 10000),
    scaleX: clamp(finite(candidate.scaleX, 1), 0.1, 8),
    scaleY: clamp(finite(candidate.scaleY, 1), 0.1, 8),
    rotation: Object.is(rotation, -0) ? 0 : rotation,
  };
}

function cssNumber(value) {
  return Number(value.toFixed(8));
}

export function composeObjectTransform(base, edit) {
  const { x, y, scaleX, scaleY, rotation } = normalizeTransform(edit);
  const nativeTransform = typeof base === "string" && base.trim() !== "none" ? base.trim() : "";
  return `translate(${cssNumber(x)}px, ${cssNumber(y)}px) ${nativeTransform} rotate(${cssNumber(rotation)}deg) scale(${cssNumber(scaleX)}, ${cssNumber(scaleY)})`.replace(
    / {2,}/g,
    " ",
  );
}

function safeColor(value) {
  if (typeof value !== "string" || value.length > 100) return null;
  const color = value.trim();
  if (
    /^#[\da-f]{3,4}$/i.test(color) ||
    /^#[\da-f]{6}(?:[\da-f]{2})?$/i.test(color) ||
    /^[a-z]{1,30}$/i.test(color)
  )
    return color;
  if (/^(?:rgb|rgba|hsl|hsla)\([\d\s.,%+\-/]+\)$/i.test(color)) return color;
  return null;
}

// Numeric text dimensions use CSS pixels; lineHeight and opacity are unitless.
export function sanitizeStyle(style = {}) {
  if (!style || typeof style !== "object") return {};
  const result = {};
  const bounds = {
    fontSize: [4, 160],
    lineHeight: [0.8, 4],
    letterSpacing: [-4, 30],
    opacity: [0, 1],
    strokeWidth: [0, 30],
    borderWidth: [0, 30],
  };
  for (const [key, [minimum, maximum]] of Object.entries(bounds)) {
    if (typeof style[key] === "number" && Number.isFinite(style[key]))
      result[key] = clamp(style[key], minimum, maximum);
  }
  for (const key of ["color", "backgroundColor", "borderColor", "fill", "stroke"]) {
    const color = safeColor(style[key]);
    if (color) result[key] = color;
  }
  if (["left", "center", "right", "justify"].includes(style.textAlign))
    result.textAlign = style.textAlign;
  if (
    ["normal", "bold", "100", "200", "300", "400", "500", "600", "700", "800", "900"].includes(
      String(style.fontWeight),
    )
  )
    result.fontWeight = String(style.fontWeight);
  if (["normal", "italic"].includes(style.fontStyle)) result.fontStyle = style.fontStyle;
  if (["none", "underline", "line-through"].includes(style.textDecoration))
    result.textDecoration = style.textDecoration;
  return result;
}

export function sanitizeObjectEdit(edit) {
  if (!edit || typeof edit !== "object" || Array.isArray(edit)) return null;
  const result = {
    transform: normalizeTransform(edit.transform),
    style: sanitizeStyle(edit.style),
  };
  if (
    edit.size &&
    typeof edit.size === "object" &&
    [edit.size.width, edit.size.height].every(
      (value) => typeof value === "number" && Number.isFinite(value) && value > 0,
    )
  ) {
    result.size = {
      width: clamp(edit.size.width, 0.5, 10000),
      height: clamp(edit.size.height, 0.5, 10000),
    };
  }
  if (typeof edit.content === "string") result.content = edit.content.slice(0, 6000);
  if (typeof edit.hidden === "boolean") result.hidden = edit.hidden;
  if (typeof edit.locked === "boolean") result.locked = edit.locked;
  if (Number.isInteger(edit.order)) result.order = clamp(edit.order, -10000, 10000);
  return result;
}

export function sanitizeDesignState(state) {
  if (!state || typeof state !== "object" || Array.isArray(state)) return {};
  const result = {};
  for (const [key, edit] of Object.entries(state).slice(0, 5000)) {
    if (!key || key.length > 200 || ["__proto__", "prototype", "constructor"].includes(key))
      continue;
    const sanitized = sanitizeObjectEdit(edit);
    if (sanitized) result[key] = sanitized;
  }
  return result;
}

function stableSerialize(value) {
  // Sorting object keys makes a reordered style object the same undo state.
  return JSON.stringify(value, (_key, candidate) => {
    if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) return candidate;
    return Object.fromEntries(
      Object.keys(candidate)
        .sort()
        .map((key) => [key, candidate[key]]),
    );
  });
}

export class SnapshotHistory {
  constructor(initial = {}, limit = 100) {
    this.limit = clamp(Number.isInteger(limit) ? limit : 100, 2, 100);
    this.snapshots = [stableSerialize(initial)];
    this.index = 0;
  }

  get current() {
    return JSON.parse(this.snapshots[this.index]);
  }

  get canUndo() {
    return this.index > 0;
  }

  get canRedo() {
    return this.index < this.snapshots.length - 1;
  }

  commit(state) {
    const serialized = stableSerialize(state);
    if (serialized === this.snapshots[this.index]) return false;
    this.snapshots.splice(this.index + 1);
    this.snapshots.push(serialized);
    if (this.snapshots.length > this.limit) this.snapshots.shift();
    this.index = this.snapshots.length - 1;
    return true;
  }

  undo() {
    if (!this.canUndo) return null;
    this.index -= 1;
    return this.current;
  }

  redo() {
    if (!this.canRedo) return null;
    this.index += 1;
    return this.current;
  }
}
