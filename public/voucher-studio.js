import {
  artworkTransform,
  cuttingGeometry,
  CUTTING_OUTER_CLEARANCE_MM,
  fitOriginalCutting,
  MM_TO_PX,
  planLayout,
  slotPosition,
} from "./voucher-studio-layout.js";
import { bleedBackgrounds } from "./voucher-studio-bleed.js";
import { printedDefaultMatches } from "./voucher-studio-content.js";
import { fitVoucherElement, fitVoucherText } from "./voucher-studio-text.js";
import { createDesignEditor } from "./voucher-studio-design.js";
import { applyPrintSizes } from "./voucher-studio-sizes.js";

const $ = (id) => document.getElementById(id);
const controls = ["voucherWidth", "voucherHeight", "voucherCount", "pageMargin", "gapX", "gapY"];
let templates = [];
let source = null;
let rotations = [0];
let annotations = {};
let storageKey = "";
let addingText = false;
let renderId = 0;
let currentPlan = null;
let nativeLayouts = new Map();
let nativePages = new Map();
let logoAssets = [];
let nativeFields = {};
let fieldStorageKey = "";
let templateLibrary = null;
const annotationSpaces = new WeakMap();
const selected = () => templates.find((item) => String(item.id) === $("voucherDesign").value);
const mode = () => $("layoutMode").value;
const numeric = (id) => ($(id).value.trim() === "" ? NaN : Number($(id).value));
const mm = (value) => `${value}mm`;
const designEditor = createDesignEditor({
  root: $("previewStack"),
  getPage: () => selected()?.id,
  getStorageKey: () => (source?.sha256 ? `voucher-native-designs:${source.sha256}:v1` : ""),
  refit: (element) => {
    fitVoucherElement(element);
    fitVoucherText(element);
  },
  onApplied: limitEditingToVisibleReceipt,
  onModeChange: (active) => {
    setAddingText(false);
    $("addTextBtn").disabled = active;
  },
});

// Fit only the on-screen preview. Print CSS always uses the native A4 dimensions.
const previewViewport = document.querySelector(".preview-scroll");
const zoomSteps = [10, 25, 33, 50, 67, 75, 90, 100, 125, 150, 175, 200, 250, 300];
let previewZoom = null;
let previewScale = 1;
const fitPreview = (preserveCenter = false) => {
  const fitScale = Math.min(1, Math.max(0.1, (previewViewport.clientWidth - 6) / (210 * MM_TO_PX)));
  const scale = previewZoom === null ? fitScale : previewZoom / 100;
  const center = previewViewport.scrollLeft + previewViewport.clientWidth / 2;
  const previousScale = previewScale;
  previewScale = scale;
  document.documentElement.style.setProperty("--preview-scale", String(scale));
  $("previewZoom").options[0].textContent = `মানান · ${Math.round(fitScale * 100)}%`;
  $("previewZoom").value = previewZoom === null ? "fit" : String(previewZoom);
  $("zoomFit").setAttribute("aria-pressed", String(previewZoom === null));
  $("zoomOut").disabled = scale <= zoomSteps[0] / 100 + 1e-6;
  $("zoomIn").disabled = scale >= zoomSteps.at(-1) / 100 - 1e-6;
  if (preserveCenter)
    previewViewport.scrollLeft = (center * scale) / previousScale - previewViewport.clientWidth / 2;
  designEditor.reposition();
};
const setPreviewZoom = (percent) => {
  previewZoom = percent;
  fitPreview(true);
};
$("zoomOut").addEventListener("click", () =>
  setPreviewZoom(zoomSteps.findLast((step) => step < previewScale * 100 - 0.01) ?? zoomSteps[0]),
);
$("zoomIn").addEventListener("click", () =>
  setPreviewZoom(zoomSteps.find((step) => step > previewScale * 100 + 0.01) ?? zoomSteps.at(-1)),
);
$("zoomActual").addEventListener("click", () => setPreviewZoom(100));
$("zoomFit").addEventListener("click", () => setPreviewZoom(null));
$("previewZoom").addEventListener("change", () =>
  setPreviewZoom($("previewZoom").value === "fit" ? null : Number($("previewZoom").value)),
);
new ResizeObserver(() => fitPreview()).observe(previewViewport);
fitPreview();

function message(text, error = false) {
  $("warning").textContent = text;
  $("warning").hidden = !text;
  $("warning").classList.toggle("error", error);
}

function setAddingText(active) {
  addingText = active;
  $("addTextBtn").setAttribute("aria-pressed", String(active));
  document.body.classList.toggle("adding-text", active);
}

function saveAnnotations() {
  try {
    localStorage.setItem(storageKey, JSON.stringify(annotations));
  } catch {
    /* Editing still works if browser storage is unavailable. */
  }
}

function saveNativeFields() {
  try {
    localStorage.setItem(fieldStorageKey, JSON.stringify(nativeFields));
  } catch {
    /* Keep edits in memory if storage is unavailable. */
  }
}

function restoreField(element, value) {
  const fitText = element.querySelector(".native-text-content,.fit-text");
  if (fitText) fitText.textContent = value;
  else {
    element.textContent = value;
    if (!element.classList.contains("headline")) element.style.whiteSpace = "pre-wrap";
  }
}

function bindNativeFields(artwork, slot) {
  const key = `${selected().id}:${slot}`;
  const values = (nativeFields[key] ||= {});
  artwork.querySelectorAll("[data-key]").forEach((element) => {
    const field = element.dataset.key;
    element.dataset.editInstance = `${key}:${field}`;
    if (Object.hasOwn(values, field)) restoreField(element, values[field]);
    element.spellcheck = false;
    element.addEventListener("input", (event) => {
      values[field] = element.innerText.slice(0, 6000);
      const changed = [element];
      document.querySelectorAll("#previewStack [data-edit-instance]").forEach((other) => {
        if (other !== element && other.dataset.editInstance === element.dataset.editInstance) {
          restoreField(other, values[field]);
          changed.push(other);
        }
      });
      saveNativeFields();
      if (!event.isComposing) requestAnimationFrame(() => changed.forEach(fitVoucherElement));
    });
    element.addEventListener("compositionend", () =>
      requestAnimationFrame(() => fitVoucherElement(element)),
    );
    element.addEventListener("blur", () => fitVoucherElement(element));
    element.addEventListener("dblclick", (event) => event.stopPropagation());
  });
}

function fitHeadings() {
  fitVoucherText($("previewStack"));
}

function limitEditingToVisibleReceipt() {
  document.querySelectorAll("#previewStack .artwork").forEach((artwork) => {
    const clip = artwork.getBoundingClientRect();
    artwork.querySelectorAll("[data-key]").forEach((field) => {
      const bounds = field.getBoundingClientRect();
      const visible =
        bounds.right > clip.left &&
        bounds.left < clip.right &&
        bounds.bottom > clip.top &&
        bounds.top < clip.bottom;
      // A source canvas may contain another receipt outside this crop. Its
      // fields must never receive keyboard focus or appear as editable inputs.
      field.contentEditable = visible ? "plaintext-only" : "false";
      field.tabIndex = visible ? 0 : -1;
      if (visible) field.removeAttribute("aria-hidden");
      else field.setAttribute("aria-hidden", "true");
    });
  });
}

function decorateNative(canvas, sourcePage) {
  const assets = logoAssets.filter((item) => item.targetPages.includes(sourcePage));
  assets
    .filter((item) => !item.group && item.kind !== "watermark")
    .forEach((item) => {
      canvas.querySelectorAll(item.selector).forEach((target, index) => {
        if (Number.isInteger(item.occurrence) && item.occurrence !== index % 2) return;
        const image = document.createElement("img");
        image.src = item.src;
        image.alt = item.id;
        image.className = "native-logo";
        image.draggable = false;
        target.replaceChildren(image);
        target.dataset.nativeLogo = "true";
        if (item.kind === "watermark") target.style.opacity = "1";
      });
    });
  const layout = nativeLayouts.get(nativePages.get(sourcePage).templateId);
  assets
    .filter((item) => item.kind === "watermark")
    .forEach((item) => {
      canvas.querySelectorAll(item.selector).forEach((target) => target.remove());
      const [left, top, right, bottom] = item.crop.bounds;
      const image = document.createElement("img");
      image.src = item.src;
      image.alt = "";
      image.className = "native-logo native-watermark";
      image.draggable = false;
      Object.assign(image.style, {
        left: `${layout.crop.x + (left / item.crop.sourceWidth) * layout.crop.w}px`,
        top: `${layout.crop.y + (top / item.crop.sourceHeight) * layout.crop.h}px`,
        width: `${((right - left) / item.crop.sourceWidth) * layout.crop.w}px`,
        height: `${((bottom - top) / item.crop.sourceHeight) * layout.crop.h}px`,
      });
      canvas.appendChild(image);
    });
  const brands = assets.filter((item) => item.group === "battery-footer");
  if (brands.length)
    canvas.querySelectorAll(".footer-brands").forEach((target) => {
      target.replaceChildren(
        ...brands.map((item) => {
          const image = document.createElement("img");
          image.src = item.src;
          image.alt = item.id;
          image.className = "native-logo";
          image.draggable = false;
          return image;
        }),
      );
      target.dataset.nativeLogo = "true";
    });
}

function annotationKey(slot) {
  return `${mode()}:${selected().id}:${slot}`;
}

function annotationId() {
  // Plain HTTP on a local-network address may not expose randomUUID().
  return (
    globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`
  );
}

function addAnnotationElement(artwork, entry, key, naturalWidthMm, pixelWidth, focus = false) {
  // Page 4 used to be one full canvas. Keep its saved annotation coordinates
  // and storage key while displaying the two independently cut receipts.
  const space = annotationSpaces.get(artwork);
  const x = space ? (entry.x * space.width - space.crop.x) / space.crop.w : entry.x;
  const y = space ? (entry.y * space.height - space.crop.y) / space.crop.h : entry.y;
  if (x < 0 || x > 1 || y < 0 || y > 1) return;
  const textWidth = Math.min(0.38, 1 - entry.x) * (space ? space.width / space.crop.w : 1);
  const text = document.createElement("div");
  text.className = "annotation";
  text.contentEditable = "plaintext-only";
  text.setAttribute("role", "textbox");
  text.setAttribute("aria-label", "ভাউচারে যোগ করা লেখা");
  text.dataset.placeholder = "এখানে লিখুন";
  text.spellcheck = false;
  text.textContent = entry.text;
  text.style.left = `${x * 100}%`;
  text.style.top = `${y * 100}%`;
  text.style.width = `${Math.min(textWidth, 1 - x) * 100}%`;
  text.style.fontSize = `${(((entry.fontPt * 25.4) / 72) * pixelWidth) / naturalWidthMm}px`;
  text.addEventListener("input", () => {
    entry.text = text.innerText.slice(0, 4000);
    saveAnnotations();
    // All repeated printed pages use the same filled voucher for this slot.
    document.querySelectorAll(".annotation").forEach((other) => {
      if (other !== text && other.dataset.entry === text.dataset.entry)
        other.textContent = entry.text;
    });
  });
  text.dataset.entry = `${key}:${entry.id}`;
  text.addEventListener("dblclick", (event) => event.stopPropagation());
  text.addEventListener("blur", () => {
    if (!entry.text.trim()) {
      annotations[key] = (annotations[key] || []).filter((item) => item.id !== entry.id);
      document.querySelectorAll(".annotation").forEach((other) => {
        if (other.dataset.entry === text.dataset.entry) other.remove();
      });
      saveAnnotations();
    }
  });
  artwork.appendChild(text);
  if (focus) text.focus();
}

function setupAnnotations(artwork, slot, rotation, asset, naturalWidthMm, sourceSpace = null) {
  if (sourceSpace) annotationSpaces.set(artwork, sourceSpace);
  const key = annotationKey(slot);
  (annotations[key] || []).forEach((entry) =>
    addAnnotationElement(artwork, entry, key, naturalWidthMm, asset.width),
  );
  const place = (event) => {
    if (designEditor.active) return;
    if (
      event.target.closest(".annotation") ||
      (!addingText && event.target.closest("[contenteditable]"))
    )
      return;
    const bounds = artwork.getBoundingClientRect();
    const x = (event.clientX - bounds.left) / bounds.width;
    const y = (event.clientY - bounds.top) / bounds.height;
    const point =
      rotation === 90
        ? { x: y, y: 1 - x }
        : rotation === 180
          ? { x: 1 - x, y: 1 - y }
          : rotation === 270
            ? { x: 1 - y, y: x }
            : { x, y };
    const entry = {
      id: annotationId(),
      x: Math.max(
        0,
        Math.min(
          0.95,
          sourceSpace
            ? (sourceSpace.crop.x + point.x * sourceSpace.crop.w) / sourceSpace.width
            : point.x,
        ),
      ),
      y: Math.max(
        0,
        Math.min(
          0.97,
          sourceSpace
            ? (sourceSpace.crop.y + point.y * sourceSpace.crop.h) / sourceSpace.height
            : point.y,
        ),
      ),
      fontPt: numeric("fontSize"),
      text: "",
    };
    if ((annotations[key] || []).length >= 100) return;
    (annotations[key] ||= []).push(entry);
    // Make one matching field on each repeated page, focusing the clicked one.
    document.querySelectorAll(".artwork").forEach((other) => {
      if (other.dataset.editKey === key)
        addAnnotationElement(other, entry, key, naturalWidthMm, asset.width, other === artwork);
    });
    setAddingText(false);
  };
  artwork.dataset.editKey = key;
  artwork.addEventListener("dblclick", place);
  artwork.addEventListener("click", (event) => {
    if (addingText) place(event);
  });
}

function rotationControls(reset = false) {
  const count = numeric("voucherCount");
  if (!Number.isInteger(count) || count < 1 || count > 12) return;
  if (reset) rotations = Array(count).fill(0);
  rotations = Array.from({ length: count }, (_, index) => rotations[index] || 0);
  $("slotConfigs").replaceChildren();
  rotations.forEach((value, index) => {
    const row = document.createElement("div");
    row.className = "slot-card";
    const label = document.createElement("label");
    label.textContent = `ভাউচার ${index + 1}`;
    label.htmlFor = `rotation-${index}`;
    const select = document.createElement("select");
    select.id = label.htmlFor;
    [0, 90, 180, 270].forEach((angle) => {
      const option = document.createElement("option");
      option.value = String(angle);
      option.textContent = angle === 0 ? "সোজা" : `${angle}° ঘোরান`;
      select.appendChild(option);
    });
    select.value = String(value);
    select.addEventListener("change", () => {
      rotations[index] = Number(select.value);
      buildPreview();
    });
    row.append(label, select);
    $("slotConfigs").appendChild(row);
  });
}

function nativeSize() {
  const template = selected();
  if (!template) return;
  let { widthMm: width, heightMm: height } = template.voucher;
  // A native landscape receipt can retain its physical size by turning the slot.
  const turn =
    width > 210 - 2 * Math.max(numeric("pageMargin"), CUTTING_OUTER_CLEARANCE_MM) && height < width;
  if (turn) [width, height] = [height, width];
  $("voucherWidth").value = width.toFixed(4);
  $("voucherHeight").value = height.toFixed(4);
  rotations = Array(Math.max(1, Math.min(12, numeric("voucherCount") || 1))).fill(turn ? 90 : 0);
  rotationControls();
}

async function readyImages() {
  if (!$("previewStack").querySelector(".voucher-native"))
    throw new Error("প্রিন্ট করার জন্য কোনো ভাউচার নেই। মাপ ও লেআউট দেখুন।");
  const images = [...$("previewStack").querySelectorAll("img")];
  await Promise.all(images.map((image) => image.decode()));
  await document.fonts.ready;
  fitHeadings();
  limitEditingToVisibleReceipt();
  designEditor.refresh();
}

function buildPreview() {
  const template = selected();
  if (!template) return;
  const imageReference = template.source?.kind === "image";
  const specifiedSize = imageReference || Boolean(template.printSize);
  const generation = ++renderId;
  $("printBtn").disabled = true;
  const original = mode() === "original";
  const cutting = true;
  $("customControls").hidden = original;
  $("modeHelp").textContent = original
    ? specifiedSize
      ? `মূল মাপের ${template.copies}টি সম্পাদনাযোগ্য ভাউচার bleed-সহ A4-এ সাজানো আছে।`
      : `PDF-এর ${template.copies}টি সম্পাদনাযোগ্য কপি bleed-সহ A4-এ সাজানো আছে।`
    : "একটি সম্পাদনাযোগ্য ভাউচার। মাপ, সংখ্যা ও rotation বদলাতে পারবেন।";
  if (cutting)
    $("modeHelp").textContent +=
      " প্রতিটি ভাউচারে ৩ মিমি bleed আছে। কাটার মার্ক কাগজের ধার থেকে অন্তত ৫ মিমি ভেতরে রাখা হয়েছে।";
  const plan = planLayout({
    mode: mode(),
    pages: numeric("pageCopies"),
    count: numeric("voucherCount"),
    width: numeric("voucherWidth"),
    height: numeric("voucherHeight"),
    gapX: numeric("gapX"),
    gapY: numeric("gapY"),
    margin: numeric("pageMargin"),
    pageWidthMm: template.pageWidthMm,
    pageHeightMm: template.pageHeightMm,
    cutting,
  });
  currentPlan = plan;
  $("previewStack").replaceChildren();
  message(plan.error || plan.warning || "", !plan.valid);
  $("summary").textContent =
    `${imageReference ? "ছবি থেকে তৈরি" : `PDF পৃষ্ঠা ${template.page}`} • ${template.name} • ${template.variant}`;
  if (!plan.valid) return;
  const pageDefinition = nativePages.get(template.id);
  const nativeLayout = nativeLayouts.get(pageDefinition.templateId);
  const nativeSource = templateLibrary.querySelector(`#${nativeLayout.pageId}`);
  const batteryOriginal = original && template.id === 4;
  const pageScale = Math.min(
    template.pageWidthMm / nativeLayout.sourceWidth,
    template.pageHeightMm / nativeLayout.sourceHeight,
  );
  // Keep page 4's distinct second receipt, six brand logos and final note.
  // A first-receipt clone would silently discard that printed footer.
  const sourceInstances = pageDefinition.copies.map((copy, index) => {
    if (!batteryOriginal) return { ...copy, crop: nativeLayout.crop };
    const crop = index === 0 ? { x: 90, y: 28, w: 820, h: 638 } : { x: 90, y: 686, w: 820, h: 738 };
    return {
      leftMm: crop.x * pageScale,
      topMm: crop.y * pageScale,
      widthMm: crop.w * pageScale,
      heightMm: crop.h * pageScale,
      rotation: 0,
      crop,
    };
  });
  const fitted = original ? fitOriginalCutting(sourceInstances) : null;
  const instances = original
    ? fitted.instances
    : Array.from({ length: plan.perPage }, (_, index) => {
        const position = slotPosition(plan, index);
        return {
          leftMm: position.left,
          topMm: position.top,
          widthMm: plan.width,
          heightMm: plan.height,
          rotation: rotations[index] || 0,
          crop: nativeLayout.crop,
        };
      });
  if (fitted?.scale < 1 - 1e-7)
    $("modeHelp").textContent +=
      ` Bleed ও মার্কসহ A4-এ বসাতে মূল মাপের ${(fitted.scale * 100).toFixed(1)}% ব্যবহার করা হয়েছে।`;
  for (let page = 0; page < plan.pageCount; page++) {
    const wrapper = document.createElement("section");
    wrapper.className = "preview-page";
    const sheet = document.createElement("div");
    sheet.className = "preview-sheet";
    sheet.setAttribute("aria-label", `A4 পেজ ${page + 1}`);
    for (let index = 0; index < instances.length; index++) {
      const position = instances[index];
      const crop = position.crop;
      const asset = { width: crop.w, height: crop.h };
      const slot = document.createElement("div");
      slot.className = "voucher-slot";
      Object.assign(slot.style, {
        left: mm(position.leftMm),
        top: mm(position.topMm),
        width: mm(position.widthMm),
        height: mm(position.heightMm),
      });
      const artwork = document.createElement("div");
      artwork.className = "artwork voucher-native";
      if (nativeSource.classList.contains("soft-blue")) artwork.classList.add("soft-blue");
      if (pageDefinition.grayscale) artwork.classList.add("native-monochrome");
      artwork.dataset.sourcePage = String(template.page);
      artwork.dataset.templatePage = nativeLayout.pageId;
      artwork.dataset.designCrop = JSON.stringify(crop);
      artwork.dataset.designScope = `${crop.x}:${crop.y}`;
      const rotation = position.rotation;
      Object.assign(artwork.style, {
        top: mm(original ? position.contentOffsetTopMm || 0 : 0),
        width: `${asset.width}px`,
        height: `${asset.height}px`,
        transform: artworkTransform(
          asset.width,
          asset.height,
          position.widthMm,
          position.heightMm,
          rotation,
        ).css,
      });
      const canvas = nativeSource.querySelector(".canvas").cloneNode(true);
      Object.assign(canvas.style, { left: `${-crop.x}px`, top: `${-crop.y}px` });
      if (batteryOriginal)
        canvas.style.height = `${Math.max(nativeLayout.sourceHeight, crop.y + crop.h)}px`;
      decorateNative(canvas, template.id);
      artwork.appendChild(canvas);
      const storageSlot = batteryOriginal ? 0 : index;
      bindNativeFields(artwork, storageSlot);
      const naturalWidthMm = batteryOriginal ? crop.w * pageScale : template.voucher.widthMm;
      setupAnnotations(
        artwork,
        storageSlot,
        rotation,
        asset,
        naturalWidthMm,
        batteryOriginal
          ? { width: nativeLayout.sourceWidth, height: nativeLayout.sourceHeight, crop }
          : null,
      );
      slot.appendChild(artwork);
      if (cutting) {
        const finishing = cuttingGeometry(asset.width, asset.height, position);
        const bleed = document.createElement("div");
        bleed.className = "voucher-bleed";
        bleed.setAttribute("aria-hidden", "true");
        for (const [key, value] of Object.entries(finishing.bleed)) bleed.style[key] = mm(value);
        sheet.appendChild(bleed);
        for (const { color, ...bounds } of bleedBackgrounds(
          pageDefinition.templateId,
          asset.width,
          asset.height,
          position,
        )) {
          const background = document.createElement("div");
          background.className = "voucher-bleed voucher-bleed-color";
          background.setAttribute("aria-hidden", "true");
          background.style.background = color;
          for (const [key, value] of Object.entries(bounds)) background.style[key] = mm(value);
          sheet.appendChild(background);
        }
        for (const bounds of finishing.marks) {
          const mark = document.createElement("div");
          mark.className = `voucher-cut-mark voucher-cut-mark-${bounds.width > bounds.height ? "horizontal" : "vertical"}`;
          mark.setAttribute("aria-hidden", "true");
          for (const [key, value] of Object.entries(bounds)) mark.style[key] = mm(value);
          sheet.appendChild(mark);
        }
      }
      sheet.appendChild(slot);
    }
    const caption = document.createElement("div");
    caption.className = "sheet-caption";
    caption.textContent = `পেজ ${page + 1} / ${plan.pageCount} · ${original ? (specifiedSize ? `${template.voucher.widthMm} × ${template.voucher.heightMm} mm ভাউচার` : "PDF-এর মতো লেআউট") : `${plan.perPage}টি ভাউচার`} · ${plan.width.toFixed(2)} × ${plan.height.toFixed(2)} mm`;
    wrapper.append(sheet, caption);
    $("previewStack").appendChild(wrapper);
  }
  readyImages()
    .then(() => {
      if (generation === renderId) $("printBtn").disabled = false;
    })
    .catch(() => {
      if (generation === renderId)
        message("ভাউচারের লোগো বা ফন্ট লোড হয়নি। পেজটি রিফ্রেশ করে আবার চেষ্টা করুন।", true);
    });
}

let printRequest = null;
window.printStudio = () => {
  if (printRequest) return printRequest;
  printRequest = Promise.resolve()
    .then(async () => {
      if (!currentPlan?.valid) throw new Error("প্রিন্টের আগে ভাউচারের লেআউট ঠিক করুন।");
      // Blurring saves the currently edited field before the print snapshot.
      if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
      await readyImages();
      window.print();
    })
    .finally(() => {
      printRequest = null;
    });
  return printRequest;
};

document.addEventListener("keydown", (event) => {
  if (!(event.ctrlKey || event.metaKey) || event.altKey || event.key.toLowerCase() !== "p") return;
  event.preventDefault();
  if (!event.repeat) window.printStudio().catch((error) => message(error.message, true));
});

$("voucherDesign").addEventListener("input", () => {
  nativeSize();
  buildPreview();
});
$("layoutMode").addEventListener("input", buildPreview);
$("pageCopies").addEventListener("input", buildPreview);
controls.forEach((id) =>
  $(id).addEventListener("input", () => {
    if (id === "voucherCount") rotationControls();
    buildPreview();
  }),
);
$("nativeSizeBtn").addEventListener("click", () => {
  nativeSize();
  buildPreview();
});
$("autoSizeBtn").addEventListener("click", () => {
  const width = numeric("voucherWidth"),
    height = numeric("voucherHeight"),
    margin = Math.max(numeric("pageMargin"), CUTTING_OUTER_CLEARANCE_MM);
  const factor = Math.min(1, (210 - 2 * margin) / width, (297 - 2 * margin) / height);
  if (Number.isFinite(factor) && factor > 0) {
    $("voucherWidth").value = (Math.floor(width * factor * 10000) / 10000).toFixed(4);
    $("voucherHeight").value = (Math.floor(height * factor * 10000) / 10000).toFixed(4);
  }
  buildPreview();
});
$("resetBtn").addEventListener("click", () => {
  $("layoutMode").value = "original";
  $("pageCopies").value = "1";
  $("voucherCount").value = "1";
  $("pageMargin").value = "8";
  $("gapX").value = $("gapY").value = "4";
  nativeSize();
  buildPreview();
});
$("addTextBtn").addEventListener("click", () => setAddingText(!addingText));
$("printBtn").addEventListener("click", () =>
  window.printStudio().catch((error) => message(error.message, true)),
);

try {
  const urls = [
    "./voucher-assets/manifest.json",
    "./voucher-native-layouts.json",
    "./voucher-native-pages.json",
    "./voucher-assets/logos/manifest.json",
    "./voucher-templates.html",
    "./voucher-additional-designs.json",
  ];
  const responses = await Promise.all(urls.map((url) => fetch(new URL(url, import.meta.url))));
  if (responses.some((response) => !response.ok)) throw new Error("ভাউচারের ডিজাইন লোড হয়নি।");
  const [manifest, layouts, pages, logos, libraryMarkup, additional] = await Promise.all(
    responses.map((response, index) => (index === 4 ? response.text() : response.json())),
  );
  nativeLayouts = new Map(layouts.map((layout) => [layout.id, layout]));
  const sized = applyPrintSizes(
    [...manifest.templates, ...additional.templates],
    [...pages.pages, ...additional.pages],
    additional.printSizes,
  );
  nativePages = new Map(sized.pages.map((page) => [page.id, page]));
  logoAssets = [...logos.assets, ...additional.logos];
  templates = sized.templates;
  templateLibrary = new DOMParser()
    .parseFromString(libraryMarkup, "text/html")
    .getElementById("template-library");
  if (!templateLibrary || nativePages.size !== templates.length)
    throw new Error("ভাউচারের টেমপ্লেট সঠিক নয়।");
  source = manifest.source;
  if (!Array.isArray(templates) || !templates.length || !source?.sha256)
    throw new Error("ডিজাইনের তথ্য সঠিক নয়।");
  storageKey = `voucher-native-annotations:${source.sha256}`;
  fieldStorageKey = `voucher-native-fields:${source.sha256}`;
  try {
    const fields = JSON.parse(localStorage.getItem(fieldStorageKey) || "{}");
    if (fields && typeof fields === "object" && !Array.isArray(fields))
      for (const [key, values] of Object.entries(fields)) {
        if (values && typeof values === "object" && !Array.isArray(values))
          nativeFields[key] = Object.fromEntries(
            Object.entries(values)
              .filter(([, value]) => typeof value === "string")
              .map(([field, value]) => [
                field,
                field === "p1.label.2" && value.trim() === "আফিদা ফটোস্ট্যাট এন্ড স্টেশনারী"
                  ? "আফ্রিদা ফটোস্ট্যাট এন্ড স্টেশনারী"
                  : value.slice(0, 6000),
              ]),
          );
      }
  } catch {
    nativeFields = {};
  }
  try {
    const migrationKey = `voucher-native-source-serials-removed:${source.sha256}`;
    if (!localStorage.getItem(migrationKey)) {
      const defaults = new Map(
        [...templateLibrary.querySelectorAll("[data-source-number][data-key]")].map((element) => [
          element.dataset.key,
          element.dataset.sourceNumber,
        ]),
      );
      let changed = false;
      for (const values of Object.values(nativeFields))
        for (const [key, value] of Object.entries(values))
          if (defaults.has(key) && value.trim() === defaults.get(key)) {
            delete values[key];
            changed = true;
          }
      if (changed) localStorage.setItem(fieldStorageKey, JSON.stringify(nativeFields));
      localStorage.setItem(migrationKey, "1");
    }
  } catch {
    /* Cleared source defaults still take effect in memory without storage. */
  }
  // Adopt corrected PDF defaults only when a stored value is exactly the old
  // printed text. User-written names, amounts, and custom wording survive.
  const previousDefaults = new Map(
    [
      ...templateLibrary.querySelectorAll(
        "[data-source-previous][data-key],[data-source-history][data-key]",
      ),
    ].map((element) => [
      element.dataset.key,
      [element.dataset.sourcePrevious, ...JSON.parse(element.dataset.sourceHistory || "[]")].filter(
        (value) => typeof value === "string",
      ),
    ]),
  );
  let correctedDefault = false;
  for (const values of Object.values(nativeFields))
    for (const [key, value] of Object.entries(values))
      if (previousDefaults.has(key) && printedDefaultMatches(value, previousDefaults.get(key))) {
        delete values[key];
        correctedDefault = true;
      }
  if (correctedDefault) saveNativeFields();
  try {
    const saved = JSON.parse(localStorage.getItem(storageKey) || "{}");
    if (saved && typeof saved === "object" && !Array.isArray(saved)) {
      for (const [key, entries] of Object.entries(saved)) {
        if (!Array.isArray(entries)) continue;
        annotations[key] = entries
          .filter(
            (entry) =>
              typeof entry?.id === "string" &&
              typeof entry?.text === "string" &&
              Number.isFinite(entry.x) &&
              entry.x >= 0 &&
              entry.x <= 0.95 &&
              Number.isFinite(entry.y) &&
              entry.y >= 0 &&
              entry.y <= 0.97 &&
              [10, 12, 14, 18].includes(entry.fontPt),
          )
          .slice(0, 100)
          .map((entry) => ({ ...entry, text: entry.text.slice(0, 4000) }));
      }
    }
  } catch {
    annotations = {};
  }
  templates.forEach((template) => {
    const option = document.createElement("option");
    option.value = String(template.id);
    option.textContent = `${String(template.page).padStart(2, "0")} · ${template.name} — ${template.variant}`;
    $("voucherDesign").appendChild(option);
  });
  $("voucherDesign").disabled = false;
  $("sourceInfo").textContent =
    `${templates.length}টি ডিজাইন • সম্পাদনাযোগ্য লেখা, ঘর ও টেবিল • আসল লোগো`;
  nativeSize();
  buildPreview();
} catch (error) {
  $("previewStack").replaceChildren();
  message(error instanceof Error ? error.message : "স্টুডিও লোড হয়নি।", true);
}
