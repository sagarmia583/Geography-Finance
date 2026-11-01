import {
  IDENTITY_MATRIX,
  multiplyMatrices,
  invertMatrix,
  transformPoint,
  screenDeltaToLocal,
  composeObjectTransform,
  normalizeTransform,
  sanitizeDesignState,
  SnapshotHistory,
  clamp,
  snapValue,
} from "./voucher-studio-design-math.js";
import { MM_TO_PX } from "./voucher-studio-layout.js";

const $ = (id) => document.getElementById(id);
const clone = (value) => JSON.parse(JSON.stringify(value));
const matrix = (element) => {
  const m = new DOMMatrix(getComputedStyle(element).transform);
  return { a: m.a, b: m.b, c: m.c, d: m.d, e: 0, f: 0 };
};
function linearMatrix(element) {
  let result = { ...IDENTITY_MATRIX };
  for (let node = element; node instanceof Element; node = node.parentElement)
    result = multiplyMatrices(matrix(node), result);
  return result;
}
function screenMatrix(element) {
  const m = linearMatrix(element),
    r = element.getBoundingClientRect();
  const w = element.offsetWidth,
    h = element.offsetHeight;
  const points = [
    [0, 0],
    [w, 0],
    [w, h],
    [0, h],
  ].map(([x, y]) => transformPoint(m, { x, y }));
  return {
    ...m,
    e: r.left - Math.min(...points.map((p) => p.x)),
    f: r.top - Math.min(...points.map((p) => p.y)),
  };
}
function hexColor(value, fallback = "#111111") {
  if (/^rgba\([^)]*,\s*0\s*\)$/.test(String(value))) return fallback;
  if (/^#[\da-f]{6}$/i.test(value)) return value;
  const rgb = String(value).match(/^rgba?\((\d+),\s*(\d+),\s*(\d+)/);
  return rgb
    ? `#${rgb
        .slice(1, 4)
        .map((n) => Number(n).toString(16).padStart(2, "0"))
        .join("")}`
    : fallback;
}
// Keep the source's monochrome appearance while allowing individually painted objects.
function prepareMonochrome(art, canvas) {
  if (!art.classList.contains("native-monochrome") || art.dataset.designMonochrome) return;
  for (const el of [canvas, ...canvas.querySelectorAll("*")]) {
    const style = getComputedStyle(el);
    for (const property of [
      "color",
      "background-color",
      "border-top-color",
      "border-right-color",
      "border-bottom-color",
      "border-left-color",
    ]) {
      const color = style.getPropertyValue(property),
        match = color.match(/^rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)$/);
      if (!match || (match[1] === match[2] && match[2] === match[3])) continue;
      const grey = Math.round(
        Number(match[1]) * 0.2126 + Number(match[2]) * 0.7152 + Number(match[3]) * 0.0722,
      );
      el.style.setProperty(property, `rgba(${grey},${grey},${grey},${match[4] ?? 1})`, "important");
    }
    if (el.matches("img"))
      el.style.filter = `${style.filter === "none" ? "" : style.filter} grayscale(1)`;
  }
  art.style.setProperty("filter", "none", "important");
  art.dataset.designMonochrome = "true";
}
function validAdded(items) {
  return (Array.isArray(items) ? items : [])
    .slice(0, 100)
    .filter(
      (item) =>
        item &&
        typeof item.id === "string" &&
        /^new:[\w-]+$/.test(item.id) &&
        ["text", "rect", "ellipse", "line", "image"].includes(item.kind) &&
        [item.x, item.y, item.width, item.height].every(Number.isFinite) &&
        item.width > 0 &&
        item.height > 0 &&
        typeof item.scope === "string" &&
        (item.kind !== "image" ||
          /^data:image\/(?:png|jpeg|webp);base64,[\da-z+/=]+$/i.test(item.src || "")),
    )
    .map((item) => ({
      id: item.id,
      kind: item.kind,
      scope: item.scope,
      x: clamp(item.x, -10000, 10000),
      y: clamp(item.y, -10000, 10000),
      width: clamp(item.width, 1, 10000),
      height: clamp(item.height, 1, 10000),
      text: String(item.text || "").slice(0, 6000),
      ...(item.kind === "image" ? { src: item.src.slice(0, 2800000) } : {}),
    }));
}

export function createDesignEditor({
  root,
  getPage,
  getStorageKey,
  refit,
  onApplied,
  onModeChange,
}) {
  const saved = {};
  const histories = new Map();
  const bases = new WeakMap();
  let loaded = false,
    currentPage = null,
    state = { edits: {}, added: [] };
  let records = [],
    selected = null,
    active = false,
    editing = null,
    drag = null;
  let frame = null,
    refreshing = false;
  const controls = [
    "designX",
    "designY",
    "designWidth",
    "designHeight",
    "designRotation",
    "designOpacity",
    "designFontSize",
    "designColor",
    "designFill",
    "designStroke",
    "designStrokeWidth",
    "designBold",
    "designAlignLeft",
    "designAlignCenter",
    "designAlignRight",
    "designBringForward",
    "designSendBackward",
    "designDuplicate",
    "designDelete",
    "designReset",
    "designNoFill",
    "designNoStroke",
    "designCenterX",
    "designCenterY",
  ];
  const history = () => histories.get(currentPage);
  const editFor = (id) => (state.edits[id] ||= { transform: normalizeTransform(), style: {} });
  const selectedRecord = () =>
    selected?.isConnected ? records.find((r) => r.el === selected) : null;
  const matches = (id) => records.filter((r) => r.id === id);
  function loadPage() {
    if (editing && !editing.isConnected) {
      editing = null;
      history()?.commit(state);
    }
    if (!loaded && getStorageKey()) {
      try {
        Object.assign(saved, JSON.parse(localStorage.getItem(getStorageKey()) || "{}"));
      } catch {
        /* usable without storage */
      }
      loaded = true;
    }
    const page = String(getPage() || "");
    if (page === currentPage) return;
    if (drag) cancelDrag();
    if (currentPage !== null) history()?.commit(state);
    editing = null;
    currentPage = page;
    const data = saved[page] || {};
    state = { edits: sanitizeDesignState(data.edits), added: validAdded(data.added) };
    if (!histories.has(page)) histories.set(page, new SnapshotHistory(state));
    selected = null;
  }
  function save() {
    saved[currentPage] = clone(state);
    try {
      localStorage.setItem(getStorageKey(), JSON.stringify(saved));
      $("designSaveStatus").textContent = "সেভ হয়েছে · এই ব্রাউজারে ডিজাইন থাকবে";
    } catch {
      $("designSaveStatus").textContent =
        "এই পরিবর্তন এখন দেখা যাচ্ছে; ব্রাউজারের জায়গা কম থাকায় সেভ হয়নি।";
    }
  }
  function finishChange() {
    history()?.commit(state);
    save();
    updateInspector();
    updateLayers();
  }
  function capture(el) {
    if (!bases.has(el)) {
      const s = getComputedStyle(el),
        [ox, oy] = s.transformOrigin.split(" ").map(Number.parseFloat);
      const transform =
        s.transform === "none"
          ? ""
          : `translate(${ox || 0}px, ${oy || 0}px) ${s.transform} translate(${-ox || 0}px, ${-oy || 0}px)`;
      bases.set(el, {
        css: el.style.cssText,
        transform,
        font: el.dataset.textFontSize || s.fontSize,
        html: el.innerHTML,
        wrapperStyles: [
          ...el.querySelectorAll(":scope > .native-text-content,:scope > .fit-text"),
        ].map((child) => child.style.cssText),
        applied: false,
        content: false,
        inCrop: (() => {
          const art = el.closest(".artwork");
          if (!art) return false;
          const a = art.getBoundingClientRect(),
            r = el.getBoundingClientRect();
          return r.right > a.left && r.left < a.right && r.bottom > a.top && r.top < a.bottom;
        })(),
      });
    }
    return bases.get(el);
  }
  function applyRecord(record) {
    const { el, id } = record,
      base = capture(el),
      edit = state.edits[id];
    if (!edit && !base.applied) return;
    el.style.cssText = base.css;
    el.dataset.textFontSize = base.font;
    delete el.dataset.designFont;
    if (base.content && edit?.content === undefined) {
      el.innerHTML = base.html;
      base.content = false;
    }
    [...el.querySelectorAll(":scope > .native-text-content,:scope > .fit-text")].forEach(
      (child, index) => {
        child.style.cssText = base.wrapperStyles[index] || "";
      },
    );
    if (!edit) {
      base.applied = false;
      refit(el);
      return;
    }
    base.applied = true;
    el.style.setProperty("transform-origin", "0 0", "important");
    el.style.setProperty(
      "transform",
      composeObjectTransform(base.transform, edit.transform),
      "important",
    );
    if (edit.size)
      for (const axis of ["width", "height"])
        el.style.setProperty(axis, `${edit.size[axis]}px`, "important");
    if (edit.content !== undefined && el !== editing) {
      const content = el.querySelector(":scope > .native-text-content,:scope > .fit-text") || el;
      content.textContent = edit.content;
      base.content = true;
    }
    refit(el);
    const style = edit.style || {};
    for (const [key, value] of Object.entries(style)) {
      const css = key.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);
      const actual = ["fontSize", "letterSpacing", "strokeWidth", "borderWidth"].includes(key)
        ? `${value}px`
        : String(value);
      el.style.setProperty(css, actual, "important");
      if (
        [
          "fontSize",
          "fontWeight",
          "fontStyle",
          "textAlign",
          "color",
          "lineHeight",
          "letterSpacing",
        ].includes(key)
      ) {
        for (const child of el.querySelectorAll(":scope > .native-text-content,:scope > .fit-text"))
          child.style.setProperty(css, actual, "important");
      }
    }
    if (style.fontSize) {
      el.dataset.designFont = "true";
      el.style.setProperty("--text-font-size", `${style.fontSize}px`);
      el.style.setProperty("line-height", String(style.lineHeight || 1.35), "important");
      for (const child of el.querySelectorAll(":scope > .native-text-content"))
        child.style.lineHeight = String(style.lineHeight || 1.35);
    }
    if (style.borderWidth !== undefined)
      el.style.setProperty("border-style", style.borderWidth ? "solid" : "none", "important");
    if (edit.hidden) el.style.setProperty("display", "none", "important");
    if (edit.order !== undefined) el.style.setProperty("z-index", String(edit.order), "important");
  }
  function applyAll() {
    records.forEach(applyRecord);
    onApplied();
    setEditable();
    updateInspector();
  }
  function makeAdded(art, item) {
    const canvas = art.querySelector(".canvas"),
      crop = JSON.parse(art.dataset.designCrop);
    const el = document.createElement(item.kind === "image" ? "img" : "div");
    el.className = `design-added design-added-${item.kind}`;
    el.dataset.designId = item.id;
    if (item.kind === "image") {
      el.src = item.src;
      el.alt = "যোগ করা লোগো";
      el.draggable = false;
    } else if (item.kind === "text") {
      el.textContent = item.text;
      el.contentEditable = "plaintext-only";
      el.setAttribute("role", "textbox");
      el.setAttribute("aria-label", "ডিজাইনের নতুন লেখা");
    }
    Object.assign(el.style, {
      position: "absolute",
      left: `${crop.x + item.x}px`,
      top: `${crop.y + item.y}px`,
      width: `${item.width}px`,
      height: `${item.height}px`,
      boxSizing: "border-box",
      color: "#111",
      backgroundColor: ["text", "image"].includes(item.kind)
        ? "transparent"
        : item.kind === "line"
          ? "#173a91"
          : "#e9f2fa",
      border: item.kind === "text" || item.kind === "image" ? "0" : "1px solid #173a91",
      borderRadius: item.kind === "ellipse" ? "50%" : "0",
      fontFamily: "Kalpurush, Arial, sans-serif",
      fontSize: "20px",
      lineHeight: "1.35",
      whiteSpace: "pre-wrap",
      overflow: "hidden",
      objectFit: "contain",
      zIndex: "3",
    });
    canvas.appendChild(el);
    return el;
  }
  function visible(el, art) {
    if (state.edits[el.dataset.designId]?.hidden) return true;
    const a = art.getBoundingClientRect(),
      b = el.getBoundingClientRect();
    return (
      b.width > 0 &&
      b.height > 0 &&
      b.right > a.left &&
      b.left < a.right &&
      b.bottom > a.top &&
      b.top < a.bottom
    );
  }
  function refresh() {
    if (refreshing) return;
    refreshing = true;
    loadPage();
    const keep = selected?.dataset.designId;
    records = [];
    for (const art of root.querySelectorAll(".artwork")) {
      const canvas = art.querySelector(".canvas");
      if (!canvas || !art.dataset.designCrop) continue;
      prepareMonochrome(art, canvas);
      const candidates = [
        ...canvas.querySelectorAll(
          ".header-group,.table-block,.fieldline,.piece[data-key],.tag[data-key],.th[data-key],.cell-label[data-key],.field[data-key],[data-native-logo],.native-watermark,.piece.box,.canvas>.rule",
        ),
        ...art.querySelectorAll(".annotation[data-entry]"),
      ];
      const counters = {};
      for (const el of candidates) {
        if (el.closest(".design-added")) continue;
        let kind =
          el.dataset.key || el.matches(".annotation")
            ? "text"
            : el.matches("[data-native-logo],.native-watermark")
              ? "image"
              : el.matches(".header-group")
                ? "header"
                : el.matches(".table-block")
                  ? "table"
                  : el.matches(".fieldline")
                    ? "row"
                    : "shape";
        const index = counters[kind] || 0;
        counters[kind] = index + 1;
        const id = el.dataset.entry
          ? `annotation:${el.dataset.entry}`
          : el.dataset.key
            ? `text:${el.dataset.key}`
            : `${kind}:${index}`;
        el.dataset.designId = id;
        const base = capture(el);
        const record = { el, id, kind, art };
        applyRecord(record);
        if (base.inCrop && (visible(el, art) || state.edits[id])) {
          el.classList.add("design-object");
          records.push(record);
        }
      }
      for (const item of state.added.filter((item) => item.scope === art.dataset.designScope)) {
        let el = [...canvas.querySelectorAll(".design-added")].find(
          (e) => e.dataset.designId === item.id,
        );
        if (!el) el = makeAdded(art, item);
        el.classList.add("design-object");
        capture(el);
        records.push({ el, id: item.id, kind: item.kind, art, added: true });
      }
      for (const old of canvas.querySelectorAll(".design-added"))
        if (
          !state.added.some(
            (item) => item.id === old.dataset.designId && item.scope === art.dataset.designScope,
          )
        )
          old.remove();
    }
    selected =
      records.find((r) => r.el === selected)?.el || records.find((r) => r.id === keep)?.el || null;
    applyAll();
    updateLayers();
    refreshing = false;
  }
  function setEditable() {
    for (const art of root.querySelectorAll(".artwork")) {
      for (const el of art.querySelectorAll("[data-key],.design-added-text,.annotation")) {
        const shown =
          el.offsetWidth > 0 && el.offsetHeight > 0 && el.getAttribute("aria-hidden") !== "true";
        if (active) {
          el.contentEditable = el === editing ? "plaintext-only" : "false";
          el.tabIndex = -1;
        } else if (shown) {
          el.contentEditable = "plaintext-only";
          el.tabIndex = 0;
        }
      }
    }
  }
  function units(record) {
    const m = screenMatrix(record.el),
      am = screenMatrix(record.art),
      sheet = record.art.closest(".preview-sheet");
    const zoom = Math.hypot(matrix(sheet).a, matrix(sheet).b) || 1;
    const local = transformPoint(invertMatrix(am), { x: m.e, y: m.f });
    const artMm = Math.hypot(matrix(record.art).a, matrix(record.art).b) / MM_TO_PX;
    return {
      x: local.x * artMm,
      y: local.y * artMm,
      mmX: Math.hypot(m.a, m.b) / (zoom * MM_TO_PX),
      mmY: Math.hypot(m.c, m.d) / (zoom * MM_TO_PX),
      artMm,
      zoom,
      m,
      am,
    };
  }
  function updateFrame() {
    frame?.remove();
    frame = null;
    root
      .querySelectorAll(".design-selected")
      .forEach((el) => el.classList.remove("design-selected"));
    if (!active || !selected?.isConnected || state.edits[selected.dataset.designId]?.hidden) return;
    const r = selected.getBoundingClientRect(),
      m = screenMatrix(selected),
      inverse = invertMatrix({ ...m, e: 0, f: 0 });
    if (!r.width || !r.height) return;
    selected.classList.add("design-selected");
    frame = document.createElement("div");
    frame.className = "design-selection";
    frame.setAttribute("aria-hidden", "true");
    Object.assign(frame.style, {
      position: "fixed",
      left: "0px",
      top: "0px",
      width: `${selected.offsetWidth}px`,
      height: `${selected.offsetHeight}px`,
      transformOrigin: "0 0",
      transform: `matrix(${m.a},${m.b},${m.c},${m.d},${m.e},${m.f})`,
    });
    for (const handle of ["nw", "n", "ne", "e", "se", "s", "sw", "w"]) {
      const node = document.createElement("div");
      node.className = "design-handle";
      node.dataset.handle = handle;
      if (inverse)
        node.style.transform = `matrix(${inverse.a},${inverse.b},${inverse.c},${inverse.d},0,0)`;
      node.addEventListener("pointerdown", (event) => startDrag(event, handle));
      frame.appendChild(node);
    }
    document.body.appendChild(frame);
  }
  function updateInspector() {
    const record = selectedRecord();
    for (const id of controls) $(id).disabled = !record;
    $("designUndo").disabled = !history()?.canUndo;
    $("designRedo").disabled = !history()?.canRedo;
    $("designObjectName").textContent = record ? label(record) : "ভাউচারে একটি উপাদান বেছে নিন";
    if (record) {
      const s = getComputedStyle(record.el),
        u = units(record),
        edit = state.edits[record.id];
      const text = record.kind === "text";
      const values = {
        designX: u.x,
        designY: u.y,
        designWidth: record.el.offsetWidth * u.mmX,
        designHeight: record.el.offsetHeight * u.mmY,
        designRotation: edit?.transform.rotation || 0,
        designOpacity: Number(s.opacity) * 100,
        designFontSize: (Number.parseFloat(s.fontSize) * u.mmY * 72) / 25.4,
        designStrokeWidth: Number.parseFloat(s.borderTopWidth) * u.mmY,
      };
      for (const [id, value] of Object.entries(values))
        if (document.activeElement !== $(id)) {
          $(id).value = Number(value.toFixed(2));
          $(id).dataset.designValue = $(id).value;
        }
      $("designColor").value = hexColor(s.color);
      $("designFill").value = hexColor(s.backgroundColor, "#ffffff");
      $("designStroke").value = hexColor(s.borderTopColor);
      $("designNoFill").setAttribute(
        "aria-pressed",
        String(
          s.backgroundColor === "transparent" || /^rgba\([^)]*,\s*0\s*\)$/.test(s.backgroundColor),
        ),
      );
      $("designNoStroke").setAttribute(
        "aria-pressed",
        String(Number.parseFloat(s.borderTopWidth) === 0),
      );
      for (const id of ["designColor", "designFill", "designStroke"])
        $(id).dataset.designValue = $(id).value;
      for (const id of [
        "designFontSize",
        "designColor",
        "designBold",
        "designAlignLeft",
        "designAlignCenter",
        "designAlignRight",
      ])
        $(id).disabled = !text;
      $("designBold").setAttribute("aria-pressed", String(Number(s.fontWeight) >= 600));
      for (const align of ["Left", "Center", "Right"])
        $("designAlign" + align).setAttribute(
          "aria-pressed",
          String(s.textAlign === align.toLowerCase()),
        );
      $("designDuplicate").disabled = ![
        "text",
        "image",
        "rect",
        "ellipse",
        "line",
        "shape",
      ].includes(record.kind);
      $("designDuplicate").title = "লেখা, লোগো বা shape নকল করুন";
    }
    updateFrame();
  }
  function label(record) {
    if (record.kind === "text" && !record.el.innerText.trim()) {
      const key = record.el.dataset.key || "",
        cell = key.match(/\.r(\d+)\.c(\d+)$/);
      if (cell) return `টেবিলের ঘর · সারি ${Number(cell[1]) + 1}, কলাম ${Number(cell[2]) + 1}`;
      const name = {
        name: "নাম",
        address: "ঠিকানা",
        serial: "ক্রমিক নং",
        date: "তারিখ",
        words: "কথায়",
        total0: "মোট",
      }[key.split(".").at(-1)];
      return name ? `${name} লেখার ঘর` : "খালি লেখার ঘর";
    }
    const names = {
      text: "লেখা",
      image: "লোগো",
      header: "হেডার",
      table: "টেবিল",
      row: "লেখার ঘর",
      shape: "রেখা / বক্স",
      rect: "আয়তক্ষেত্র",
      ellipse: "বৃত্ত",
      line: "রেখা",
    };
    return `${names[record.kind] || "উপাদান"} · ${record.kind === "text" ? record.el.innerText.replace(/\s+/g, " ").slice(0, 48) : record.id}`;
  }
  function updateLayers() {
    const list = $("designLayers");
    list.replaceChildren();
    const seen = new Set();
    for (const record of records) {
      if (seen.has(record.id)) continue;
      seen.add(record.id);
      const button = document.createElement("button");
      button.type = "button";
      const item = document.createElement("div");
      item.setAttribute("role", "listitem");
      button.textContent = (state.edits[record.id]?.hidden ? "◌ " : "") + label(record);
      button.setAttribute("aria-pressed", String(selected?.dataset.designId === record.id));
      button.addEventListener("click", () => select(record.el));
      item.appendChild(button);
      list.appendChild(item);
    }
  }
  function select(el) {
    if (editing && editing !== el) editing.blur();
    selected = el;
    updateInspector();
    updateLayers();
  }
  function setActive(value) {
    if (editing) editing.blur();
    active = value;
    document.body.classList.toggle("design-mode", active);
    $("designPanel").hidden = !active;
    $("designModeBtn").setAttribute("aria-pressed", String(active));
    $("designModeBtn").setAttribute("aria-expanded", String(active));
    onModeChange(active);
    setEditable();
    updateInspector();
  }
  function targetFor(event) {
    let el = event.target.closest?.("[data-design-id]");
    if (!el || !records.some((r) => r.el === el)) return null;
    if (!event.altKey) {
      const table = el.closest(".table-block[data-design-id]");
      if (table) el = table;
    }
    return el;
  }
  function startDrag(event, handle = null) {
    if (event.button !== 0 || !selectedRecord()) return;
    event.preventDefault();
    event.stopPropagation();
    const record = selectedRecord(),
      initial = clone(state),
      edit = clone(state.edits[record.id] || { transform: normalizeTransform(), style: {} });
    drag = {
      record,
      handle,
      x: event.clientX,
      y: event.clientY,
      edit: clone(edit),
      parent: linearMatrix(record.el.parentElement),
      own: linearMatrix(record.el),
      width: record.el.offsetWidth,
      height: record.el.offsetHeight,
      start: initial,
      moved: false,
    };
    document.body.classList.add("design-dragging");
    document.addEventListener("pointermove", moveDrag);
    document.addEventListener("pointerup", endDrag, { once: true });
    document.addEventListener("pointercancel", cancelDrag, { once: true });
  }
  function moveDrag(event) {
    if (!drag) return;
    const { record, handle } = drag,
      dx = event.clientX - drag.x,
      dy = event.clientY - drag.y;
    drag.moved ||= Math.abs(dx) + Math.abs(dy) > 1;
    const edit = clone(drag.edit),
      t = edit.transform;
    if (!handle) {
      const local = screenDeltaToLocal(dx, dy, drag.parent);
      if (!local) return;
      if (event.shiftKey) {
        if (Math.abs(local.x) >= Math.abs(local.y)) local.y = 0;
        else local.x = 0;
      }
      const physical = units(record).zoom * MM_TO_PX;
      local.x = snapValue(
        local.x,
        (0.25 * physical) / Math.hypot(drag.parent.a, drag.parent.b),
        !event.altKey,
      );
      local.y = snapValue(
        local.y,
        (0.25 * physical) / Math.hypot(drag.parent.c, drag.parent.d),
        !event.altKey,
      );
      t.x += local.x;
      t.y += local.y;
    } else {
      const local = screenDeltaToLocal(dx, dy, drag.own);
      if (!local) return;
      const sx = handle.includes("w") ? -1 : handle.includes("e") ? 1 : 0;
      const sy = handle.includes("n") ? -1 : handle.includes("s") ? 1 : 0;
      let width = Math.max(2, drag.width + local.x * sx),
        height = Math.max(2, drag.height + local.y * sy);
      if (record.kind === "text") edit.size = { width, height };
      else {
        let rx = width / drag.width,
          ry = height / drag.height;
        if (event.shiftKey || ["image", "table", "header"].includes(record.kind)) {
          const ratio =
            sx && !sy ? rx : sy && !sx ? ry : Math.abs(rx - 1) > Math.abs(ry - 1) ? rx : ry;
          rx = ry = ratio;
          width = drag.width * ratio;
          height = drag.height * ratio;
        }
        t.scaleX *= rx;
        t.scaleY *= ry;
      }
      const offset = { x: sx < 0 ? drag.width - width : 0, y: sy < 0 ? drag.height - height : 0 };
      const screen = transformPoint({ ...drag.own, e: 0, f: 0 }, offset),
        parent = screenDeltaToLocal(screen.x, screen.y, drag.parent);
      t.x += parent.x;
      t.y += parent.y;
    }
    edit.transform = normalizeTransform(t);
    state.edits[record.id] = edit;
    matches(record.id).forEach(applyRecord);
    updateInspector();
  }
  function stopDrag() {
    document.removeEventListener("pointermove", moveDrag);
    document.removeEventListener("pointerup", endDrag);
    document.removeEventListener("pointercancel", cancelDrag);
    document.body.classList.remove("design-dragging");
    drag = null;
  }
  function endDrag() {
    if (!drag) return;
    if (!drag.moved) {
      state = drag.start;
      stopDrag();
      applyAll();
      return;
    }
    stopDrag();
    onApplied();
    setEditable();
    finishChange();
  }
  function cancelDrag() {
    if (!drag) return;
    state = drag.start;
    stopDrag();
    applyAll();
  }
  function mutate(callback) {
    const record = selectedRecord();
    if (!record) return;
    callback(editFor(record.id), record);
    matches(record.id).forEach(applyRecord);
    onApplied();
    setEditable();
    finishChange();
  }
  function setPosition(edit, record, axis, value) {
    const u = units(record),
      delta = (value - u[axis]) / u.artMm;
    const screen = transformPoint(
      { ...u.am, e: 0, f: 0 },
      { x: axis === "x" ? delta : 0, y: axis === "y" ? delta : 0 },
    );
    const local = screenDeltaToLocal(screen.x, screen.y, linearMatrix(record.el.parentElement));
    edit.transform.x += local.x;
    edit.transform.y += local.y;
  }
  function property(id, fn) {
    const commit = () => {
      const value = Number($(id).value);
      if ($(id).value === $(id).dataset.designValue) return;
      if ($(id).value.trim() && Number.isFinite(value)) {
        mutate((edit, record) => fn(edit, record, value));
        $(id).dataset.designValue = $(id).value;
      } else updateInspector();
    };
    $(id).addEventListener("change", commit);
    $(id).addEventListener("blur", commit);
  }
  property("designX", (e, r, v) => setPosition(e, r, "x", v));
  property("designY", (e, r, v) => setPosition(e, r, "y", v));
  for (const [id, axis, unit] of [
    ["designWidth", "width", "mmX"],
    ["designHeight", "height", "mmY"],
  ])
    property(id, (e, r, v) => {
      if (v <= 0) return;
      const u = units(r);
      if (r.kind === "text")
        e.size = {
          width: r.el.offsetWidth,
          height: r.el.offsetHeight,
          ...e.size,
          [axis]: v / u[unit],
        };
      else {
        const ratio = v / (r.el[axis === "width" ? "offsetWidth" : "offsetHeight"] * u[unit]);
        e.transform[axis === "width" ? "scaleX" : "scaleY"] *= ratio;
        if (["image", "table", "header"].includes(r.kind))
          e.transform[axis === "width" ? "scaleY" : "scaleX"] *= ratio;
        e.transform = normalizeTransform(e.transform);
      }
    });
  property("designRotation", (e, _r, v) => (e.transform.rotation = v));
  property("designOpacity", (e, _r, v) => (e.style.opacity = clamp(v / 100, 0, 1)));
  property(
    "designFontSize",
    (e, r, v) => (e.style.fontSize = clamp((v * 25.4) / 72 / units(r).mmY, 4, 160)),
  );
  property(
    "designStrokeWidth",
    (e, r, v) => (e.style.borderWidth = clamp(v / units(r).mmY, 0, 30)),
  );
  for (const [id, key] of [
    ["designColor", "color"],
    ["designFill", "backgroundColor"],
    ["designStroke", "borderColor"],
  ]) {
    const commit = () => {
      if ($(id).value !== $(id).dataset.designValue) mutate((e) => (e.style[key] = $(id).value));
    };
    $(id).addEventListener("change", commit);
    $(id).addEventListener("blur", commit);
  }
  $("designNoFill").addEventListener("click", () =>
    mutate((e) => (e.style.backgroundColor = "transparent")),
  );
  $("designNoStroke").addEventListener("click", () => mutate((e) => (e.style.borderWidth = 0)));
  for (const [id, axis] of [
    ["designCenterX", "x"],
    ["designCenterY", "y"],
  ])
    $(id).addEventListener("click", () =>
      mutate((edit, record) => {
        const u = units(record),
          inverse = invertMatrix(u.am);
        if (!inverse) return;
        const points = [
          [0, 0],
          [record.el.offsetWidth, 0],
          [record.el.offsetWidth, record.el.offsetHeight],
          [0, record.el.offsetHeight],
        ].map(([x, y]) => transformPoint(inverse, transformPoint(u.m, { x, y })));
        const min = Math.min(...points.map((p) => p[axis])),
          max = Math.max(...points.map((p) => p[axis]));
        const size = record.art[axis === "x" ? "offsetWidth" : "offsetHeight"];
        setPosition(edit, record, axis, u[axis] + ((size - (max - min)) / 2 - min) * u.artMm);
      }),
    );
  $("designBold").addEventListener("click", () =>
    mutate(
      (e, r) =>
        (e.style.fontWeight = Number(getComputedStyle(r.el).fontWeight) >= 600 ? "400" : "700"),
    ),
  );
  for (const align of ["Left", "Center", "Right"])
    $("designAlign" + align).addEventListener("click", () =>
      mutate((e) => (e.style.textAlign = align.toLowerCase())),
    );
  for (const [id, amount] of [
    ["designBringForward", 1],
    ["designSendBackward", -1],
  ])
    $(id).addEventListener("click", () =>
      mutate(
        (e, r) => (e.order = (e.order ?? (Number(getComputedStyle(r.el).zIndex) || 0)) + amount),
      ),
    );
  $("designDelete").addEventListener("click", () => mutate((e) => (e.hidden = true)));
  $("designReset").addEventListener("click", () => {
    const r = selectedRecord();
    if (!r) return;
    delete state.edits[r.id];
    applyAll();
    finishChange();
  });
  $("designResetAll").addEventListener("click", () => {
    if (editing) editing.blur();
    state = { edits: {}, added: [] };
    refresh();
    finishChange();
  });
  function restoreHistory(direction) {
    if (editing) editing.blur();
    const previous = history()?.[direction]();
    if (!previous) return;
    state = previous;
    refresh();
    save();
  }
  $("designUndo").addEventListener("click", () => restoreHistory("undo"));
  $("designRedo").addEventListener("click", () => restoreHistory("redo"));
  function add(kind, src = null, sourceRecord = null) {
    if (!active) setActive(true);
    const art = sourceRecord?.art || selectedRecord()?.art || root.querySelector(".artwork");
    if (!art) return;
    const crop = JSON.parse(art.dataset.designCrop),
      artMm = Math.hypot(matrix(art).a, matrix(art).b) / MM_TO_PX;
    if (state.added.length >= 100) {
      $("designSaveStatus").textContent = "এই ভাউচারে সর্বোচ্চ ১০০টি নতুন উপাদান রাখা যাবে।";
      return;
    }
    const item = {
      id: `new:${globalThis.crypto?.randomUUID?.() || Date.now() + "-" + Math.random().toString(36).slice(2)}`,
      kind,
      scope: art.dataset.designScope,
      x: crop.w * 0.15,
      y: crop.h * 0.22,
      width: Math.min(crop.w * 0.6, 45 / artMm),
      height: kind === "line" ? 0.5 / artMm : kind === "text" ? 12 / artMm : 25 / artMm,
      text: kind === "text" ? sourceRecord?.el.innerText || "নতুন লেখা" : "",
      ...(src ? { src } : {}),
    };
    state.added.push(item);
    state.edits[item.id] = {
      transform: normalizeTransform(),
      style: kind === "text" ? { fontSize: (12 * 25.4) / 72 / artMm } : {},
    };
    refresh();
    selected = records.find((r) => r.id === item.id)?.el || null;
    if (sourceRecord) {
      const u = units(sourceRecord),
        e = editFor(item.id),
        newRecord = selectedRecord();
      setPosition(e, newRecord, "x", u.x + 2);
      applyRecord(newRecord);
      setPosition(e, newRecord, "y", u.y + 2);
      const newUnits = units(newRecord);
      e.size = {
        width: (sourceRecord.el.offsetWidth * u.mmX) / newUnits.mmX,
        height: (sourceRecord.el.offsetHeight * u.mmY) / newUnits.mmY,
      };
      if (kind === "text") {
        const s = getComputedStyle(sourceRecord.el);
        e.style = {
          fontSize: (Number.parseFloat(s.fontSize) * u.mmY) / newUnits.mmY,
          color: s.color,
          fontWeight: s.fontWeight,
          textAlign: s.textAlign,
        };
      } else if (kind !== "image") {
        const s = getComputedStyle(sourceRecord.el);
        e.style = {
          backgroundColor: s.backgroundColor,
          borderColor: s.borderTopColor,
          borderWidth: (Number.parseFloat(s.borderTopWidth) * u.mmY) / newUnits.mmY,
          opacity: Number(s.opacity),
        };
      }
      applyAll();
    }
    finishChange();
  }
  for (const [id, kind] of [
    ["designAddText", "text"],
    ["designAddRect", "rect"],
    ["designAddEllipse", "ellipse"],
    ["designAddLine", "line"],
  ])
    $(id).addEventListener("click", () => add(kind));
  $("designAddImage").addEventListener("click", () => $("designImageFile").click());
  $("designImageFile").addEventListener("change", async () => {
    const file = $("designImageFile").files[0];
    if (!file) return;
    if (!/^image\/(png|jpeg|webp)$/.test(file.type) || file.size > 2 * 1024 * 1024) {
      $("designSaveStatus").textContent = "PNG, JPG বা WebP ছবি দিন; সর্বোচ্চ ২ MB।";
      return;
    }
    const reader = new FileReader();
    const page = currentPage;
    reader.onload = () => {
      if (currentPage === page) add("image", reader.result);
    };
    reader.onerror = () => {
      $("designSaveStatus").textContent = "ছবিটি পড়া যায়নি। অন্য একটি ছবি দিন।";
    };
    reader.readAsDataURL(file);
    $("designImageFile").value = "";
  });
  $("designDuplicate").addEventListener("click", () => {
    const r = selectedRecord();
    if (!r) return;
    if (r.added) {
      if (state.added.length >= 100) {
        $("designSaveStatus").textContent = "এই ভাউচারে সর্বোচ্চ ১০০টি নতুন উপাদান রাখা যাবে।";
        return;
      }
      const original = state.added.find((i) => i.id === r.id);
      const item = {
        ...clone(original),
        id: `new:${globalThis.crypto?.randomUUID?.() || Date.now() + "-copy"}`,
      };
      state.added.push(item);
      state.edits[item.id] = clone(editFor(r.id));
      state.edits[item.id].transform.x += 8;
      state.edits[item.id].transform.y += 8;
      refresh();
      select(records.find((n) => n.id === item.id).el);
      finishChange();
    } else if (r.kind === "text") add("text", null, r);
    else if (r.kind === "image") {
      const image = r.el.matches("img") ? r.el : r.el.querySelector("img");
      if (image) {
        const page = currentPage;
        fetch(image.src)
          .then((response) => {
            if (!response.ok) throw new Error("image");
            return response.blob();
          })
          .then((blob) => {
            const reader = new FileReader();
            reader.onload = () => {
              if (currentPage === page && r.art.isConnected) add("image", reader.result, r);
            };
            reader.readAsDataURL(blob);
          })
          .catch(() => {
            $("designSaveStatus").textContent = "লোগোটি নকল করা যায়নি। আবার চেষ্টা করুন।";
          });
      }
    } else add("rect", null, r);
  });
  $("designModeBtn").addEventListener("click", () => setActive(!active));
  root.addEventListener(
    "pointerdown",
    (event) => {
      if (!active || event.button !== 0) return;
      if (editing?.contains(event.target)) return;
      const el = targetFor(event);
      if (!el) {
        selected = null;
        updateInspector();
        return;
      }
      select(el);
      startDrag(event);
    },
    true,
  );
  root.addEventListener(
    "dblclick",
    (event) => {
      if (!active) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      const el = event.target.closest("[data-design-id]");
      const r = records.find((r) => r.el === el);
      if (r?.kind !== "text") return;
      editing = el;
      select(el);
      setEditable();
      el.focus();
      const range = document.createRange();
      range.selectNodeContents(el);
      const selection = window.getSelection();
      selection.removeAllRanges();
      selection.addRange(range);
    },
    true,
  );
  root.addEventListener(
    "input",
    (event) => {
      const el = event.target.closest?.("[data-design-id]"),
        r = records.find((r) => r.el === el);
      if (
        r &&
        r.kind === "text" &&
        !active &&
        !r.added &&
        state.edits[r.id]?.content === undefined
      ) {
        const base = capture(el);
        if (!base.content) base.html = el.innerHTML;
        queueMicrotask(() => {
          for (const other of matches(r.id)) {
            if (other.el.dataset.editInstance !== el.dataset.editInstance) continue;
            const otherBase = capture(other.el);
            if (!otherBase.content) otherBase.html = other.el.innerHTML;
          }
        });
        return;
      }
      if (
        !r ||
        r.kind !== "text" ||
        (!active && !r.added && state.edits[r.id]?.content === undefined)
      )
        return;
      event.stopImmediatePropagation();
      const text = el.innerText.slice(0, 6000);
      editFor(r.id).content = text;
      for (const other of matches(r.id))
        if (other.el !== el) {
          const content = other.el.querySelector(".native-text-content,.fit-text") || other.el;
          content.textContent = text;
        }
      save();
    },
    true,
  );
  root.addEventListener(
    "focusout",
    (event) => {
      const el = event.target.closest?.("[data-design-id]"),
        record = records.find((r) => r.el === el);
      if (
        event.target === editing ||
        (record?.kind === "text" && (record.added || state.edits[record.id]?.content !== undefined))
      ) {
        editing = null;
        applyAll();
        finishChange();
      }
    },
    true,
  );
  document.addEventListener("keydown", (event) => {
    if (!active) return;
    const typing = event.target.closest?.("input,textarea,select,[contenteditable=plaintext-only]");
    if (event.key === "Escape") {
      if (drag) cancelDrag();
      else if (editing) editing.blur();
      else {
        selected = null;
        updateInspector();
      }
      event.preventDefault();
      return;
    }
    if (typing) return;
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "z") {
      event.preventDefault();
      restoreHistory(event.shiftKey ? "redo" : "undo");
      return;
    }
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "y") {
      event.preventDefault();
      restoreHistory("redo");
      return;
    }
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "d") {
      event.preventDefault();
      $("designDuplicate").click();
      return;
    }
    if (event.key === "Delete" || event.key === "Backspace") {
      event.preventDefault();
      $("designDelete").click();
      return;
    }
    const arrows = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
    if (arrows[event.key] && selectedRecord()) {
      event.preventDefault();
      const [x, y] = arrows[event.key];
      mutate((e, r) => {
        const factor = units(r).zoom * MM_TO_PX * (event.shiftKey ? 2.5 : 0.25),
          p = screenDeltaToLocal(x * factor, y * factor, linearMatrix(r.el.parentElement));
        e.transform.x += p.x;
        e.transform.y += p.y;
      });
    }
  });
  document.addEventListener(
    "scroll",
    () => {
      if (active) updateFrame();
    },
    true,
  );
  window.addEventListener("resize", () => {
    if (active) requestAnimationFrame(updateInspector);
  });
  window.addEventListener("blur", () => {
    if (drag) cancelDrag();
  });
  window.addEventListener("beforeprint", () => {
    if (editing) editing.blur();
    frame?.remove();
  });
  window.addEventListener("afterprint", updateInspector);
  updateInspector();
  return {
    refresh,
    setActive,
    reposition: updateInspector,
    get active() {
      return active;
    },
  };
}
