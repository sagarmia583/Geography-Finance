import assert from "node:assert/strict";
import test from "node:test";
import {
  IDENTITY_MATRIX,
  SnapshotHistory,
  composeObjectTransform,
  invertMatrix,
  multiplyMatrices,
  normalizeTransform,
  sanitizeDesignState,
  sanitizeObjectEdit,
  sanitizeStyle,
  screenDeltaToLocal,
  snapValue,
  transformPoint,
} from "../public/voucher-studio-design-math.js";

function close(actual, expected, tolerance = 1e-8) {
  assert.ok(
    Math.abs(actual - expected) <= tolerance,
    `${actual} should be within ${tolerance} of ${expected}`,
  );
}

function closePoint(actual, expected) {
  assert.ok(actual);
  close(actual.x, expected.x);
  close(actual.y, expected.y);
}

function rotation(degrees) {
  const radians = (degrees * Math.PI) / 180;
  return {
    a: Math.cos(radians),
    b: Math.sin(radians),
    c: -Math.sin(radians),
    d: Math.cos(radians),
    e: 0,
    f: 0,
  };
}

test("native coordinates round-trip through nested rotation, nonuniform header scale and preview zoom", () => {
  const preview = { a: 0.43, b: 0, c: 0, d: 0.43, e: 319, f: -128 };
  const header = { a: 1.77, b: 0, c: 0, d: 1.2744, e: 106, f: 46 };
  for (const degrees of [0, 90, 180, 270]) {
    const slot = { ...rotation(degrees), e: 75, f: 129 };
    const matrix = multiplyMatrices(preview, multiplyMatrices(slot, header));
    const inverse = invertMatrix(matrix);
    assert.ok(inverse, `The ${degrees} degree voucher remains editable`);
    for (const point of [
      { x: 0, y: 0 },
      { x: 217.5, y: 31.25 },
      { x: -10, y: 800 },
    ]) {
      closePoint(transformPoint(inverse, transformPoint(matrix, point)), point);
    }
    const identity = multiplyMatrices(matrix, inverse);
    for (const key of Object.keys(IDENTITY_MATRIX)) close(identity[key], IDENTITY_MATRIX[key]);
  }
});

test("drag deltas follow each voucher orientation independently of page translation", () => {
  const scale = 0.25;
  for (const [degrees, expected] of [
    [0, { x: 40, y: 80 }],
    [90, { x: 80, y: -40 }],
    [180, { x: -40, y: -80 }],
    [270, { x: -80, y: 40 }],
  ]) {
    const matrix = multiplyMatrices(
      { a: scale, b: 0, c: 0, d: scale, e: 1600, f: -900 },
      rotation(degrees),
    );
    closePoint(screenDeltaToLocal(10, 20, matrix), expected);
  }
});

test("dragging a child of an edited, rotated header respects both parent axes", () => {
  const parent = multiplyMatrices(
    { a: 0.5, b: 0, c: 0, d: 0.5, e: 10, f: 1000 },
    multiplyMatrices(rotation(270), { a: 2, b: 0, c: 0, d: 3, e: 30, f: 90 }),
  );
  // In local coordinates (+12, -8) becomes a screen movement of (-12, -12).
  closePoint(screenDeltaToLocal(-12, -12, parent), { x: 12, y: -8 });
});

test("singular or corrupt coordinate data cannot produce NaN drag updates", () => {
  const invalid = [
    null,
    {},
    { ...IDENTITY_MATRIX, a: NaN },
    { ...IDENTITY_MATRIX, e: Infinity },
    { a: 1, b: 2, c: 2, d: 4, e: 0, f: 0 },
    { a: 0, b: 0, c: 0, d: 0, e: 0, f: 0 },
  ];
  for (const matrix of invalid) {
    assert.equal(invertMatrix(matrix), null);
    assert.equal(screenDeltaToLocal(4, 8, matrix), null);
  }
  assert.equal(screenDeltaToLocal(NaN, 8, IDENTITY_MATRIX), null);
  assert.equal(transformPoint(IDENTITY_MATRIX, { x: Infinity, y: 0 }), null);
  assert.equal(multiplyMatrices(IDENTITY_MATRIX, {}), null);
  const smallZoom = { a: 1e-8, b: 0, c: 0, d: 2e-8, e: 0, f: 0 };
  closePoint(screenDeltaToLocal(3e-8, 8e-8, smallZoom), { x: 3, y: 4 });
});

test("grid snapping is optional and handles fractional and negative coordinates", () => {
  assert.equal(snapValue(13.6, 2), 14);
  assert.equal(snapValue(-13.6, 2), -14);
  assert.equal(snapValue(0.36, 0.25), 0.25);
  assert.equal(snapValue(13.6, 2, false), 13.6);
  assert.equal(snapValue(13.6, 0), 13.6);
  assert.equal(snapValue(NaN, 2), 0);
  assert.equal(Object.is(snapValue(-0.01, 1), -0), false);
});

test("saved transforms retain native scaling while constraining invalid dimensions", () => {
  const normalized = normalizeTransform({
    x: 20000,
    y: -20000,
    scaleX: 0,
    scaleY: 40,
    rotation: 810,
  });
  assert.deepEqual(normalized, {
    x: 10000,
    y: -10000,
    scaleX: 0.1,
    scaleY: 8,
    rotation: 90,
  });
  assert.deepEqual(normalizeTransform({ x: "10", y: NaN, rotation: Infinity }), {
    x: 0,
    y: 0,
    scaleX: 1,
    scaleY: 1,
    rotation: 0,
  });
  const base = "matrix(1.77, 0, 0, 1.2744, 0, 0)";
  const css = composeObjectTransform(base, { x: 12, y: -8, rotation: 15, scaleX: 2, scaleY: 1.5 });
  assert.equal(css, `translate(12px, -8px) ${base} rotate(15deg) scale(2, 1.5)`);
  assert.equal(css.split(base).length - 1, 1);
  assert.doesNotMatch(composeObjectTransform("none", {}), /none|undefined|NaN/);
});

test("persisted styles allow typography and colors without accepting CSS payloads", () => {
  const style = sanitizeStyle({
    color: "#abc",
    backgroundColor: "rgba(10, 20, 30, 0.5)",
    borderColor: "url(https://example.com/tracker)",
    fill: "red; background-image:url(https://example.com)",
    stroke: "hsl(120 50% 40%)",
    fontSize: 9999,
    lineHeight: -1,
    letterSpacing: 999,
    opacity: -5,
    borderWidth: NaN,
    strokeWidth: 5,
    textAlign: "center",
    fontWeight: 700,
    fontStyle: "italic",
    textDecoration: "underline",
    position: "fixed",
    transform: "translate(100000px)",
    cssText: "display:none",
  });
  assert.deepEqual(style, {
    fontSize: 160,
    lineHeight: 0.8,
    letterSpacing: 30,
    opacity: 0,
    strokeWidth: 5,
    color: "#abc",
    backgroundColor: "rgba(10, 20, 30, 0.5)",
    stroke: "hsl(120 50% 40%)",
    textAlign: "center",
    fontWeight: "700",
    fontStyle: "italic",
    textDecoration: "underline",
  });
  assert.deepEqual(sanitizeStyle(null), {});
  assert.deepEqual(sanitizeStyle({ fontSize: "18", textAlign: "invalid" }), {});
});

test("design restore ignores malformed entries and prototype keys", () => {
  const persisted = JSON.parse(
    '{"__proto__":{"hidden":true},"constructor":{"hidden":true},"prototype":{"hidden":true},"text:p1.label.2":{"transform":{"x":10,"scaleX":-1},"hidden":true,"locked":false,"order":99999,"style":{"color":"#214d81"}},"broken":null,"array":[],"string":"bad"}',
  );
  const restored = sanitizeDesignState(persisted);
  assert.deepEqual(Object.keys(restored), ["text:p1.label.2"]);
  assert.equal(restored["text:p1.label.2"].transform.x, 10);
  assert.equal(restored["text:p1.label.2"].transform.scaleX, 0.1);
  assert.equal(restored["text:p1.label.2"].order, 10000);
  assert.equal(restored["text:p1.label.2"].hidden, true);
  assert.equal({}.hidden, undefined);
  assert.deepEqual(sanitizeDesignState([]), {});
  assert.equal(sanitizeObjectEdit("bad"), null);
});

test("text frame dimensions survive restore without allowing collapsed or nonfinite boxes", () => {
  const text = sanitizeObjectEdit({
    size: { width: 240.5, height: 61.25 },
    content: "নতুন শিরোনাম\nদ্বিতীয় লাইন",
  });
  assert.deepEqual(text.size, { width: 240.5, height: 61.25 });
  assert.equal(text.content, "নতুন শিরোনাম\nদ্বিতীয় লাইন");
  assert.deepEqual(sanitizeObjectEdit({ size: { width: 0.1, height: 20000 } }).size, {
    width: 0.5,
    height: 10000,
  });
  for (const size of [
    { width: 0, height: 100 },
    { width: -1, height: 100 },
    { width: NaN, height: 100 },
    { width: 100, height: Infinity },
    { width: "100", height: 100 },
    { width: 100 },
  ])
    assert.equal(sanitizeObjectEdit({ size }).size, undefined);
});

test("persisted text is bounded plain content and remains undoable with frame changes", () => {
  const markup = '<img src="x" onerror="alert(1)">';
  assert.equal(sanitizeObjectEdit({ content: markup }).content, markup);
  assert.equal(sanitizeObjectEdit({ content: "ক".repeat(7000) }).content.length, 6000);
  assert.equal(sanitizeObjectEdit({ content: 123 }).content, undefined);
  const original = sanitizeDesignState({
    "text:p1.label.2": { size: { width: 240, height: 40 }, content: "পুরোনো লেখা" },
  });
  const history = new SnapshotHistory(original);
  const changed = sanitizeDesignState({
    "text:p1.label.2": { size: { width: 300, height: 80 }, content: "নতুন লেখা" },
  });
  history.commit(changed);
  assert.deepEqual(history.undo(), original);
  assert.deepEqual(history.redo(), changed);
});

test("undo snapshots are detached from both caller and returned state", () => {
  const initial = { logo: { transform: { x: 0 }, style: { color: "#123456" } } };
  const history = new SnapshotHistory(initial);
  initial.logo.transform.x = 999;
  assert.equal(history.current.logo.transform.x, 0);
  const changed = { logo: { transform: { x: 12 }, style: { color: "#123456" } } };
  history.commit(changed);
  changed.logo.transform.x = 999;
  assert.equal(history.current.logo.transform.x, 12);
  const previous = history.undo();
  previous.logo.style.color = "red";
  assert.equal(history.current.logo.style.color, "#123456");
  assert.equal(history.redo().logo.transform.x, 12);
});

test("equivalent or cancelled gestures do not create undo entries or destroy redo", () => {
  const history = new SnapshotHistory({ logo: { x: 0, y: 0 } });
  assert.equal(history.commit({ logo: { y: 0, x: 0 } }), false);
  assert.equal(history.canUndo, false);
  history.commit({ logo: { x: 12, y: 8 } });
  history.undo();
  // A cancelled pointer gesture restores the pre-drag state rather than committing its transient delta.
  const restoredAfterCancel = history.current;
  assert.equal(history.commit(restoredAfterCancel), false);
  assert.equal(history.canRedo, true);
  assert.deepEqual(history.redo(), { logo: { x: 12, y: 8 } });
});

test("new edits after undo discard the obsolete redo branch", () => {
  const history = new SnapshotHistory({ x: 0 });
  history.commit({ x: 1 });
  history.commit({ x: 2 });
  assert.deepEqual(history.undo(), { x: 1 });
  assert.equal(history.canRedo, true);
  history.commit({ x: 3 });
  assert.equal(history.canRedo, false);
  assert.equal(history.redo(), null);
  assert.deepEqual(history.undo(), { x: 1 });
  assert.deepEqual(history.undo(), { x: 0 });
  assert.equal(history.undo(), null);
});

test("history stays bounded at 100 snapshots through repeated edits", () => {
  const history = new SnapshotHistory({ x: 0 }, 10000);
  for (let index = 1; index <= 150; index++) history.commit({ x: index });
  assert.equal(history.snapshots.length, 100);
  assert.deepEqual(history.current, { x: 150 });
  let count = 0;
  while (history.canUndo) {
    history.undo();
    count++;
  }
  assert.equal(count, 99);
  assert.deepEqual(history.current, { x: 51 });
  while (history.canRedo) history.redo();
  assert.deepEqual(history.current, { x: 150 });
});
