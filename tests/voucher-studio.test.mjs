import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { dirname, relative, resolve, sep } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  artworkTransform,
  CUTTING_BLEED_MM,
  CUTTING_CLEARANCE_MM,
  CUTTING_OUTER_CLEARANCE_MM,
  cuttingGeometry,
  fitOriginalCutting,
  MM_TO_PX,
  planLayout,
  PRINT_SAFE_INSET_MM,
  slotPosition,
} from "../public/voucher-studio-layout.js";
import { bleedBackgrounds } from "../public/voucher-studio-bleed.js";
import { normalizePrintedText, printedDefaultMatches } from "../public/voucher-studio-content.js";
import {
  fittingFontSize,
  textFitsBox,
  textInsets,
  textLineRatio,
} from "../public/voucher-studio-text.js";

const publicRoot = fileURLToPath(new URL("../public/", import.meta.url));
const manifestPath = resolve(publicRoot, "voucher-assets", "manifest.json");
const custom = {
  mode: "custom",
  pages: 2,
  count: 2,
  width: 90,
  height: 130,
  gapX: 4,
  gapY: 4,
  margin: 8,
};

function approximately(actual, expected, tolerance = 1e-7) {
  assert.ok(
    Math.abs(actual - expected) <= tolerance,
    `${actual} should be within ${tolerance} of ${expected}`,
  );
}

function assertInvalid(plan) {
  assert.equal(plan.valid, false);
  assert.equal(plan.capacity, 0);
  assert.equal(plan.perPage, 0);
  assert.ok(plan.error);
}

function rectangleFitsSheet(rectangle) {
  return (
    rectangle.left >= -1e-7 &&
    rectangle.top >= -1e-7 &&
    rectangle.left + rectangle.width <= 210 + 1e-7 &&
    rectangle.top + rectangle.height <= 297 + 1e-7
  );
}

function rectangleFitsPrintableSheet(rectangle) {
  return (
    rectangle.left >= PRINT_SAFE_INSET_MM - 1e-7 &&
    rectangle.top >= PRINT_SAFE_INSET_MM - 1e-7 &&
    rectangle.left + rectangle.width <= 210 - PRINT_SAFE_INSET_MM + 1e-7 &&
    rectangle.top + rectangle.height <= 297 - PRINT_SAFE_INSET_MM + 1e-7
  );
}

function rectanglesOverlap(first, second) {
  const overlapX =
    Math.min(first.left + first.width, second.left + second.width) -
    Math.max(first.left, second.left);
  const overlapY =
    Math.min(first.top + first.height, second.top + second.height) -
    Math.max(first.top, second.top);
  return overlapX > 1e-7 && overlapY > 1e-7;
}

function finishingBounds({ bleed, marks }) {
  const rectangles = [bleed, ...marks];
  const left = Math.min(...rectangles.map((rectangle) => rectangle.left));
  const top = Math.min(...rectangles.map((rectangle) => rectangle.top));
  return {
    left,
    top,
    width: Math.max(...rectangles.map((rectangle) => rectangle.left + rectangle.width)) - left,
    height: Math.max(...rectangles.map((rectangle) => rectangle.top + rectangle.height)) - top,
  };
}

function originalCuttingFixtures() {
  const { pages } = readPublicJson("voucher-native-pages.json");
  const layouts = new Map(
    readPublicJson("voucher-native-layouts.json").map((layout) => [layout.id, layout]),
  );
  return pages
    .filter((page) => page.id <= 30)
    .map((page) => ({
      page,
      instances: page.copies.map((position, index) => {
        const layout = layouts.get(page.templateId);
        if (page.id !== 4) return { ...position, crop: { ...layout.crop } };
        // Battery's second receipt includes the footer brands from the source.
        const crop = index === 0 ? { ...layout.crop } : { x: 90, y: 686, w: 820, h: 738 };
        const scale = Math.min(
          page.pageWidthMm / layout.sourceWidth,
          page.pageHeightMm / layout.sourceHeight,
        );
        return {
          leftMm: crop.x * scale,
          topMm: crop.y * scale,
          widthMm: crop.w * scale,
          heightMm: crop.h * scale,
          rotation: 0,
          crop,
        };
      }),
    }));
}

function assetBytes(src) {
  assert.equal(typeof src, "string");
  assert.ok(src.startsWith("/voucher-assets/"), `Unexpected asset URL: ${src}`);
  assert.doesNotMatch(src, /[?#%\\]/);
  const path = resolve(publicRoot, src.slice(1));
  const withinAssets = relative(dirname(manifestPath), path);
  assert.ok(withinAssets && !withinAssets.startsWith(`..${sep}`));
  assert.notEqual(withinAssets, "..");
  return readFileSync(path);
}

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function pngSize(bytes) {
  assert.deepEqual(bytes.subarray(0, 8), Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  assert.equal(bytes.toString("ascii", 12, 16), "IHDR");
  assert.equal(bytes.readUInt32BE(8), 13);
  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
}

function readPublicJson(filename) {
  return JSON.parse(readFileSync(resolve(publicRoot, filename), "utf8"));
}

function decodePrintedHtml(value) {
  return value
    .replaceAll("&quot;", '"')
    .replaceAll("&#39;", "'")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&nbsp;", " ")
    .replaceAll("&amp;", "&");
}

function printedLabel(html, key) {
  const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = html.match(
    new RegExp(`<(div|span)\\b([^>]*\\bdata-key="${escaped}"[^>]*)>([\\s\\S]*?)<\\/\\1>`),
  );
  assert.ok(match, `Missing printed label ${key}`);
  return {
    text: decodePrintedHtml(match[3].replace(/<br\s*\/?>/gi, "\n").replace(/<[^>]*>/g, "")),
    attribute(name) {
      const value = match[2].match(new RegExp(`\\b${name}="([^"]*)"`))?.[1];
      return value === undefined ? undefined : decodePrintedHtml(value);
    },
  };
}

test("printed spacing normalizes punctuation and Unicode without losing paragraph breaks", () => {
  const value = "  নাম\u00a0 :\tCafe\u0301\u2009  \r\n \r\nঠিকানা : ঢাকা ;বাংলাদেশ !  ";
  assert.equal(normalizePrintedText(value), "নাম: Café\n\nঠিকানা: ঢাকা; বাংলাদেশ!");
  assert.equal(normalizePrintedText("কো"), "কো".normalize("NFC"));
  assert.equal(normalizePrintedText("প্রথম লাইন\n\n\nশেষ লাইন"), "প্রথম লাইন\n\n\nশেষ লাইন");
  assert.equal(normalizePrintedText(""), "");
});

test("printed-default migration matches complete known defaults without changing custom entries", () => {
  const defaults = ["এখানে পণ্য পাইকারী বিক্রয় করা হয়।", "Cafe\u0301", "১২৫"];
  assert.equal(printedDefaultMatches(defaults[0], defaults), true);
  assert.equal(
    printedDefaultMatches("  এখানে\nপণ্য\u00a0পাইকারী বিক্রয় করা হয়।  ", defaults),
    true,
  );
  assert.equal(printedDefaultMatches("Café", defaults), true);
  for (const customEntry of [
    "পাইকারী স্টোরের হিসাব",
    "ক্রেতা: এখানে পণ্য পাইকারী বিক্রয় করা হয়।",
    "এখানে পণ্য পাইকারী বিক্রয় করা হয়। অতিরিক্ত তথ্য",
    "১২৫০",
    "মোট ১২৫ টাকা",
    "এখানে পণ্য পাইকারি বিক্রয় করা হয়।",
  ]) {
    assert.equal(printedDefaultMatches(customEntry, defaults), false, customEntry);
  }
  assert.equal(printedDefaultMatches("সাইফুল ইসলাম", []), false);
  assert.deepEqual(defaults, ["এখানে পণ্য পাইকারী বিক্রয় করা হয়।", "Cafe\u0301", "১২৫"]);
});

test("all three voucher groups publish corrected vocabulary in their editable text", () => {
  const html = readFileSync(resolve(publicRoot, "voucher-templates.html"), "utf8");
  for (const [key, expected] of [
    [
      "p3.label.29",
      "এখানে চাল, ডাল, আটা, ময়দা, তেল, চিনি ইত্যাদি দ্রব্যাদি পাইকারি ও খুচরা বিক্রয় করা হয়।",
    ],
    ["p5.label.119", "যাবতীয় সিরামিকস, পাইরেক্স, মেলামাইন, হটপট, দেশি-বিদেশি কাচের"],
    ["p4.label.96", "In Words [Taka"],
    ["p4.label.110", "In Words [Taka"],
    ["p11.label.292", "ডাল / টিক্কা"],
    [
      "p12.label.340",
      "এখানে দেশি-বিদেশি কাচ, আয়না, রাবার, হার্ডবোর্ড, পারটেক্স, ফরমিকা, সেলোলাইট, থাই",
    ],
    ["p13.label.380", "চিকেন বিরিয়ানি"],
    ["p13.label.422", "চিকেন বিরিয়ানি"],
    ["p13.label.387", "তন্দুর"],
    ["p13.label.429", "তন্দুর"],
    ["p21.label.700", "বাইম"],
    ["p21.label.706", "মলা"],
    ["p30.label.891", "যাবতীয় কসমেটিকস, গিফট আইটেম, বেবিফুড, ক্রোকারিজ, বাচ্চাদের পোশাক,"],
    ["p30.label.899", "যাবতীয় কসমেটিকস, গিফট আইটেম, বেবিফুড, ক্রোকারিজ, বাচ্চাদের পোশাক,"],
    ["p30.label.892", "খেলনা, থ্রি-পিস, গহনা, স্কুল-কলেজের খাতাপত্র, চাল, ডাল, আটা, যাবতীয়"],
    ["p30.label.900", "খেলনা, থ্রি-পিস, গহনা, স্কুল-কলেজের খাতাপত্র, চাল, ডাল, আটা, যাবতীয়"],
  ]) {
    assert.equal(printedLabel(html, key).text, expected.normalize("NFC"), key);
  }
  assert.equal(
    printedLabel(html, "p1.label.2").text,
    "আফ্রিদা ফটোস্ট্যাট এন্ড স্টেশনারী".normalize("NFC"),
    "The user-requested business name must remain unchanged",
  );
});

test("multiline contacts and product descriptions retain their deliberate line breaks", () => {
  const html = readFileSync(resolve(publicRoot, "voucher-templates.html"), "utf8");
  assert.equal(
    printedLabel(html, "p6.label.137").text,
    "দোকান ফোন: ৫১০৬১\nবাসা ফোন: ৬৪৭২৭\nমোবাইল: ০১৭১০-৮৭৯৪০১".normalize("NFC"),
  );
  assert.equal(printedLabel(html, "p7.label.145").text, "মোবাইল: 01731-209420\n01628-946635");
  for (const key of ["p27.label.847", "p27.label.857"]) {
    const lines = printedLabel(html, key).text.split("\n");
    assert.equal(lines.length, 4, key);
    assert.ok(
      lines.every((line) => line && line === line.trim()),
      key,
    );
    assert.ok(lines[0].startsWith("পিভিসি, প্যানা,"), key);
    assert.ok(lines[3].startsWith("লেজার প্রিন্টিংসহ"), key);
  }
});

test("generated default history migrates old printed text while retaining customized wording", () => {
  const html = readFileSync(resolve(publicRoot, "voucher-templates.html"), "utf8");
  const label = printedLabel(html, "p3.label.29");
  const history = JSON.parse(label.attribute("data-source-history"));
  const knownDefaults = [label.attribute("data-source-previous"), ...history];
  const previousPrintedText =
    "এখানে চাউল, ডাউল, আটা, ময়দা, তেল, চিনি ইত্যাদি দ্রব্যাদি পাইকারী ও খুচরা বিক্রয় করা হয়।";
  assert.ok(
    history.includes(previousPrintedText),
    "The last published default needs migration metadata",
  );
  assert.equal(printedDefaultMatches(previousPrintedText, knownDefaults), true);
  assert.equal(printedDefaultMatches(label.text, knownDefaults), false);
  assert.equal(printedDefaultMatches(`কাস্টম দোকান: ${previousPrintedText}`, knownDefaults), false);
  assert.equal(printedDefaultMatches("মালামাল পাইকারী বিক্রেতা রহমান", knownDefaults), false);
});

test("source numeric contact rhythm preserves phone size without changing Bengali line metrics", () => {
  const numericRatio = textLineRatio("1", 1.48);
  const bengaliRatio = textLineRatio("", 1.48);
  assert.equal(numericRatio, 1);
  assert.equal(bengaliRatio, 1.48);
  assert.equal(textLineRatio(""), 1.35);
  assert.equal(textLineRatio("", 1.1), 1.35);
  assert.equal(textLineRatio(" 1.1 ", 1.48), 1.1);

  const base = 18;
  const height = 41;
  const inset = textInsets(164, height, base);
  const innerHeight = height - 2 * inset.y;
  const fitTwoLines = (ratio) => fittingFontSize(base, (size) => size * ratio * 2 <= innerHeight);
  assert.equal(fitTwoLines(numericRatio), base);
  assert.ok(fitTwoLines(bengaliRatio) < 14);

  for (const invalid of [undefined, "", " ", "0", "-1", "Infinity", "NaN", "1px", "1.1 1.2"])
    assert.equal(textLineRatio(invalid, 1.48), bengaliRatio, String(invalid));
});

test("compact Bengali labels fit inside borders and padding without enlarging text", () => {
  for (const [width, height, fontSize] of [
    [52, 34, 18.6],
    [30, 12, 12.4],
    [16, 9.5, 7.82],
    [80, 18, 13],
  ]) {
    const inset = textInsets(width, height, fontSize);
    const availableHeight = height - 2 * inset.y;
    assert.ok(inset.x > 0 && inset.x * 2 < width);
    assert.ok(inset.y > 0 && inset.y * 2 < height);
    const fitted = fittingFontSize(fontSize, (size) => size * 1.35 <= availableHeight);
    assert.ok(fitted > 0 && fitted <= fontSize);
    assert.ok(fitted * 1.35 <= availableHeight + 0.01);
  }
  // Sotota's 14 px header has only 12 px inside its two borders.
  const inset = textInsets(30, 12, 12.4);
  const fitted = fittingFontSize(12.4, (size) => size * 1.35 <= 12 - 2 * inset.y);
  assert.ok(fitted >= 7.9 && fitted <= 8.01);
  assert.equal(
    fittingFontSize(16, () => true),
    16,
  );
  // A 59.36 px wrapper reports a rounded scrollWidth of 60. It must not
  // shrink an otherwise fitting label to the minimum size.
  assert.equal(
    fittingFontSize(18, () => textFitsBox(60, 23, 59.36, 23.5)),
    18,
  );
  assert.equal(textFitsBox(61, 23, 59.36, 23.5), false);
});

test("original mode preserves source page size and ignores custom controls", () => {
  const plan = planLayout({
    mode: "original",
    pages: 2,
    pageWidthMm: 209.9,
    pageHeightMm: 296.9,
    count: 12,
    width: -1,
    height: Number.NaN,
    gapX: -5,
    gapY: 50,
    margin: 40,
  });
  assert.equal(plan.valid, true);
  assert.equal(plan.pageCount, 2);
  assert.equal(plan.perPage, 1);
  assert.equal(plan.capacity, 1);
  assert.equal(plan.width, 209.9);
  assert.equal(plan.height, 296.9);
  assert.equal(plan.margin, 0);
  assert.equal(plan.gapX, 0);
  assert.equal(plan.gapY, 0);
  assert.deepEqual(slotPosition(plan, 0), { left: 0, top: 0 });
  assert.equal(plan.warning, "");
});

test("original mode validates physical dimensions and requested pages", () => {
  const original = {
    mode: "original",
    pages: 1,
    pageWidthMm: 210,
    pageHeightMm: 297,
  };
  assert.equal(planLayout(original).valid, true);
  for (const override of [
    { pageWidthMm: 0 },
    { pageHeightMm: -1 },
    { pageWidthMm: 220 },
    { pageHeightMm: 310 },
    { pageWidthMm: Number.NaN },
    { pageHeightMm: Number.POSITIVE_INFINITY },
    { pages: 0 },
    { pages: 21 },
    { pages: 1.5 },
  ]) {
    assertInvalid(planLayout({ ...original, ...override }));
  }
});

test("custom layout keeps vouchers per page separate from page copies", () => {
  for (const pages of [1, 2, 20]) {
    const plan = planLayout({ ...custom, pages });
    assert.equal(plan.valid, true);
    assert.equal(plan.pageCount, pages);
    assert.equal(plan.perPage, 2);
    assert.equal(plan.capacity, 4);
    assert.equal(plan.columns, 2);
    assert.equal(plan.rows, 2);
    assert.deepEqual(slotPosition(plan, 0), { left: 8, top: 8 });
    assert.deepEqual(slotPosition(plan, 1), { left: 102, top: 8 });
  }
});

test("custom layout respects requested count and preserves explicit dimensions", () => {
  const options = { ...custom, count: 3, width: 75.5, height: 120 };
  const plan = planLayout(options);
  assert.equal(plan.valid, true);
  assert.equal(plan.perPage, 3);
  assert.equal(plan.width, 75.5);
  assert.equal(plan.height, 120);
  assert.deepEqual(options, { ...custom, count: 3, width: 75.5, height: 120 });
  assert.deepEqual(slotPosition(plan, 2), { left: 8, top: 132 });
});

test("overflow caps each page and every placed voucher remains within margins", () => {
  const plan = planLayout({ ...custom, count: 12 });
  assert.equal(plan.valid, true);
  assert.equal(plan.perPage, 4);
  assert.equal(plan.pageCount, 2);
  assert.ok(plan.warning);
  for (let index = 0; index < plan.perPage; index++) {
    const position = slotPosition(plan, index);
    assert.ok(position.left >= 8);
    assert.ok(position.top >= 8);
    assert.ok(position.left + plan.width <= 202);
    assert.ok(position.top + plan.height <= 289);
  }
});

test("exact printable bounds fit and oversize vouchers cannot be clipped", () => {
  const exact = planLayout({ ...custom, width: 194, height: 281 });
  assert.equal(exact.valid, true);
  assert.equal(exact.capacity, 1);
  assert.equal(exact.perPage, 1);
  assertInvalid(planLayout({ ...custom, width: 194.5, height: 281 }));
  assertInvalid(planLayout({ ...custom, width: 194, height: 281.5 }));
  assertInvalid(planLayout({ ...custom, width: 210, height: 297 }));
  const fullPage = planLayout({
    ...custom,
    count: 1,
    width: 210,
    height: 297,
    margin: 0,
    gapX: 0,
    gapY: 0,
  });
  assert.equal(fullPage.valid, true);
  assert.equal(fullPage.capacity, 1);
  assert.deepEqual(slotPosition(fullPage, 0), { left: 0, top: 0 });
});

test("invalid custom inputs do not create layouts or nonfinite geometry", () => {
  for (const override of [
    { mode: "unknown" },
    { count: 0 },
    { count: 13 },
    { count: 1.5 },
    { pages: 0 },
    { pages: 21 },
    { pages: Number.POSITIVE_INFINITY },
    { width: -90 },
    { width: 0 },
    { width: Number.POSITIVE_INFINITY },
    { height: Number.NaN },
    { height: -130 },
    { gapX: -4 },
    { gapY: Number.NaN },
    { margin: -8 },
    { margin: 200 },
  ]) {
    assertInvalid(planLayout({ ...custom, ...override }));
  }
});

test("cutting layouts reserve margin and gutters without shrinking vouchers", () => {
  const options = { ...custom, width: 80, count: 12, margin: 0, gapX: 0, gapY: 0, cutting: true };
  const plan = planLayout(options);
  assert.equal(plan.valid, true);
  assert.equal(CUTTING_CLEARANCE_MM, 6.5);
  assert.equal(PRINT_SAFE_INSET_MM, 5);
  assert.equal(CUTTING_OUTER_CLEARANCE_MM, 11.5);
  assert.equal(plan.margin, 11.5);
  assert.equal(plan.gapX, 13);
  assert.equal(plan.gapY, 13);
  assert.equal(plan.width, 80);
  assert.equal(plan.height, 130);
  assert.equal(plan.perPage, 4);
  assert.match(plan.warning, /৫ মিমি.*১১\.৫ মিমি.*১৩ মিমি/);
  assert.equal(options.margin, 0, "Planning must not alter the user's controls");

  const finishes = Array.from({ length: plan.perPage }, (_, index) => {
    const position = slotPosition(plan, index);
    return cuttingGeometry(370, 620, {
      leftMm: position.left,
      topMm: position.top,
      widthMm: plan.width,
      heightMm: plan.height,
      rotation: [0, 90, 180, 270][index],
    });
  });
  for (const [index, finish] of finishes.entries()) {
    assert.ok(rectangleFitsSheet(finishingBounds(finish)), `Finishing ${index} exceeds A4`);
    assert.ok(
      rectangleFitsPrintableSheet(finishingBounds(finish)),
      `Finishing ${index} enters the printer's 5 mm safety inset`,
    );
    for (const other of finishes.slice(index + 1))
      assert.equal(rectanglesOverlap(finishingBounds(finish), finishingBounds(other)), false);
  }

  const generous = planLayout({
    ...custom,
    width: 80,
    height: 120,
    margin: 12,
    gapX: 15,
    gapY: 17,
    cutting: true,
  });
  assert.equal(generous.margin, 12);
  assert.equal(generous.gapX, 15);
  assert.equal(generous.gapY, 17);
  assert.equal(generous.warning, "");
  assert.deepEqual(planLayout({ ...custom, cutting: false }), planLayout(custom));
  const plain = planLayout({ ...options, cutting: false });
  assert.equal(plain.margin, 0);
  assert.equal(plain.gapX, 0);
  assert.equal(plain.gapY, 0);
});

test("cutting layouts reject sizes whose finishing would enter the printer safety inset", () => {
  const exact = {
    ...custom,
    count: 1,
    width: 187,
    height: 274,
    margin: 0,
    gapX: 0,
    gapY: 0,
    cutting: true,
  };
  assert.equal(planLayout(exact).valid, true);
  assertInvalid(planLayout({ ...exact, width: 187.01 }));
  assertInvalid(planLayout({ ...exact, height: 274.01 }));
  assert.equal(planLayout({ ...exact, width: 210, height: 297, cutting: false }).valid, true);
});

test("printer safety may reduce custom capacity but never the requested trim size", () => {
  const plan = planLayout({ ...custom, count: 4, margin: 0, gapX: 0, gapY: 0, cutting: true });
  assert.equal(plan.valid, true);
  assert.equal(plan.columns, 1);
  assert.equal(plan.rows, 2);
  assert.equal(plan.perPage, 2);
  assert.equal(plan.width, custom.width);
  assert.equal(plan.height, custom.height);
  for (let index = 0; index < plan.perPage; index++) {
    const position = slotPosition(plan, index);
    // An artwork with the same aspect ratio fills the requested trim exactly.
    const finish = cuttingGeometry(custom.width, custom.height, {
      leftMm: position.left,
      topMm: position.top,
      widthMm: plan.width,
      heightMm: plan.height,
    });
    approximately(finish.trim.width, custom.width);
    approximately(finish.trim.height, custom.height);
    assert.ok(rectangleFitsPrintableSheet(finishingBounds(finish)));
  }
});

test("cutting geometry keeps 3 mm bleed and eight physical crop marks at every rotation", () => {
  assert.equal(CUTTING_BLEED_MM, 3);
  // The intentionally mismatched slot leaves unused space. Its border must
  // follow the actual rotated artwork rather than the entire slot rectangle.
  for (const rotation of [0, 90, 180, 270]) {
    const { trim, bleed, marks } = cuttingGeometry(370, 620, {
      leftMm: 20,
      topMm: 30,
      widthMm: 100,
      heightMm: 150,
      rotation,
      contentOffsetTopMm: 1.5,
    });
    const sideways = rotation === 90 || rotation === 270;
    approximately(trim.left, 20);
    approximately(trim.top, 31.5);
    approximately(trim.width, sideways ? 100 : (370 / 620) * 150);
    approximately(trim.height, sideways ? (370 / 620) * 100 : 150);
    approximately(trim.left - bleed.left, 3);
    approximately(trim.top - bleed.top, 3);
    approximately(bleed.left + bleed.width - trim.left - trim.width, 3);
    approximately(bleed.top + bleed.height - trim.top - trim.height, 3);
    assert.equal(marks.length, 8);
    const horizontal = marks.filter((mark) => mark.width > mark.height);
    const vertical = marks.filter((mark) => mark.height > mark.width);
    assert.equal(horizontal.length, 4);
    assert.equal(vertical.length, 4);
    for (const mark of horizontal) {
      approximately(mark.width, 3);
      approximately(mark.height, 0.2);
    }
    for (const mark of vertical) {
      approximately(mark.width, 0.2);
      approximately(mark.height, 3);
    }
    for (const x of [trim.left, trim.left + trim.width]) {
      for (const y of [trim.top, trim.top + trim.height]) {
        const h = horizontal.filter(
          (mark) =>
            Math.abs(mark.top + mark.height / 2 - y) < 1e-7 &&
            (x === trim.left ? mark.left < x : mark.left > x),
        );
        const v = vertical.filter(
          (mark) =>
            Math.abs(mark.left + mark.width / 2 - x) < 1e-7 &&
            (y === trim.top ? mark.top < y : mark.top > y),
        );
        assert.equal(h.length, 1, "Each corner needs one horizontal mark");
        assert.equal(v.length, 1, "Each corner needs one vertical mark");
        approximately(
          x === trim.left
            ? bleed.left - h[0].left - h[0].width
            : h[0].left - bleed.left - bleed.width,
          0.5,
        );
        approximately(
          y === trim.top ? bleed.top - v[0].top - v[0].height : v[0].top - bleed.top - bleed.height,
          0.5,
        );
      }
    }
    for (const mark of marks) assert.equal(rectanglesOverlap(mark, bleed), false);
  }
});

test("colored edge backgrounds extend exactly 3 mm into bleed at every rotation", () => {
  const layouts = new Map(
    readPublicJson("voucher-native-layouts.json").map((layout) => [layout.id, layout]),
  );
  for (const id of [24, 27]) {
    const { w, h } = layouts.get(id).crop;
    for (const rotation of [0, 90, 180, 270]) {
      const position = {
        leftMm: 30,
        topMm: 40,
        widthMm: 100,
        heightMm: 150,
        contentOffsetTopMm: 2,
        rotation,
      };
      const { trim, bleed, marks } = cuttingGeometry(w, h, position);
      const backgrounds = bleedBackgrounds(id, w, h, position);
      assert.equal(backgrounds.length, 1);
      const background = backgrounds[0];
      assert.equal(background.color, id === 24 ? "#0f734f" : "#113bdc");
      assert.equal(rectanglesOverlap(background, trim), false, "Bleed must not cover receipt text");
      assert.ok(background.left >= bleed.left - 1e-7);
      assert.ok(background.top >= bleed.top - 1e-7);
      assert.ok(background.left + background.width <= bleed.left + bleed.width + 1e-7);
      assert.ok(background.top + background.height <= bleed.top + bleed.height + 1e-7);
      const sideways = rotation === 90 || rotation === 270;
      approximately(sideways ? background.width : background.height, 3);
      const edge =
        id === 24
          ? { 0: "top", 90: "right", 180: "bottom", 270: "left" }[rotation]
          : { 0: "bottom", 90: "left", 180: "top", 270: "right" }[rotation];
      if (edge === "top") approximately(background.top + background.height, trim.top);
      if (edge === "bottom") approximately(background.top, trim.top + trim.height);
      if (edge === "left") approximately(background.left + background.width, trim.left);
      if (edge === "right") approximately(background.left, trim.left + trim.width);
      for (const mark of marks) assert.equal(rectanglesOverlap(background, mark), false);
    }
  }
  for (let id = 1; id <= 30; id++) {
    if ([24, 27].includes(id)) continue;
    assert.deepEqual(bleedBackgrounds(id, 370, 620, {}), []);
  }
});

test("both original Sugandha copies keep bleed and crop marks within A4 without overlap", () => {
  const page = readPublicJson("voucher-native-pages.json").pages.find((entry) => entry.id === 17);
  const layout = readPublicJson("voucher-native-layouts.json").find(
    (entry) => entry.id === page.templateId,
  );
  assert.equal(page.copies.length, 2);
  const finishes = page.copies.map((position) =>
    cuttingGeometry(layout.crop.w, layout.crop.h, position),
  );
  for (const finish of finishes) {
    assert.ok(rectangleFitsSheet(finishingBounds(finish)));
    assert.ok(rectangleFitsPrintableSheet(finishingBounds(finish)));
    for (const other of finishes) {
      for (const mark of finish.marks) assert.equal(rectanglesOverlap(mark, other.bleed), false);
    }
  }
  assert.equal(
    rectanglesOverlap(finishingBounds(finishes[0]), finishingBounds(finishes[1])),
    false,
  );
});

test("all 30 original layouts keep bleed and crop marks inside A4's 5 mm printer safety inset", () => {
  const fixtures = originalCuttingFixtures();
  assert.equal(fixtures.length, 30);
  for (const { page, instances } of fixtures) {
    const before = structuredClone(instances);
    const result = fitOriginalCutting(instances);
    assert.deepEqual(instances, before, `Source geometry changed on page ${page.id}`);
    assert.equal(result.instances.length, page.copies.length, `Lost a copy on page ${page.id}`);
    assert.ok(result.scale > 0 && result.scale <= 1, `Invalid scale on page ${page.id}`);

    const finishes = result.instances.map((position, index) => {
      const source = instances[index];
      assert.equal(position.rotation, source.rotation, `Changed rotation on page ${page.id}`);
      assert.deepEqual(position.crop, source.crop, `Changed source crop on page ${page.id}`);
      const original = cuttingGeometry(source.crop.w, source.crop.h, source);
      const finish = cuttingGeometry(position.crop.w, position.crop.h, position);
      approximately(finish.trim.width, original.trim.width * result.scale);
      approximately(finish.trim.height, original.trim.height * result.scale);
      approximately(finish.trim.left - finish.bleed.left, 3);
      approximately(finish.trim.top - finish.bleed.top, 3);
      approximately(finish.bleed.width - finish.trim.width, 6);
      approximately(finish.bleed.height - finish.trim.height, 6);
      assert.equal(finish.marks.length, 8);
      assert.ok(
        rectangleFitsSheet(finishingBounds(finish)),
        `Copy ${index + 1} finishing exceeds A4 on page ${page.id}`,
      );
      assert.ok(
        rectangleFitsPrintableSheet(finishingBounds(finish)),
        `Copy ${index + 1} finishing enters the printer safety inset on page ${page.id}`,
      );
      for (const mark of finish.marks) {
        assert.ok(
          rectangleFitsPrintableSheet(mark),
          `Copy ${index + 1} crop mark enters the printer safety inset on page ${page.id}`,
        );
      }
      return finish;
    });
    for (const [index, finish] of finishes.entries()) {
      for (const other of finishes.slice(index + 1)) {
        assert.equal(
          rectanglesOverlap(finishingBounds(finish), finishingBounds(other)),
          false,
          `Copy finishing overlaps on page ${page.id}`,
        );
      }
      for (const other of finishes) {
        for (const mark of finish.marks) {
          assert.equal(
            rectanglesOverlap(mark, other.bleed),
            false,
            `Crop mark crosses a bleed area on page ${page.id}`,
          );
        }
      }
    }
  }
});

test("original finishing retains fitting layouts and uniformly reduces tight pages", () => {
  const fixtures = new Map(originalCuttingFixtures().map((fixture) => [fixture.page.id, fixture]));
  const sugandha = fixtures.get(17).instances;
  const unchanged = fitOriginalCutting(sugandha);
  assert.equal(unchanged.scale, 1);
  assert.equal(unchanged.adjusted, false);
  for (const [index, position] of unchanged.instances.entries()) {
    const previous = sugandha[index];
    assert.deepEqual(
      cuttingGeometry(position.crop.w, position.crop.h, position),
      cuttingGeometry(previous.crop.w, previous.crop.h, previous),
      "Sugandha's visible size, position, bleed and marks must stay unchanged",
    );
  }

  for (const page of [26, 30]) {
    const source = fixtures.get(page).instances;
    const fitted = fitOriginalCutting(source);
    assert.equal(fitted.adjusted, true);
    assert.ok(fitted.scale < 1, `Tight page ${page} needs space for finishing`);
    for (const [index, position] of fitted.instances.entries()) {
      const previous = source[index];
      const original = cuttingGeometry(previous.crop.w, previous.crop.h, previous).trim;
      const current = cuttingGeometry(position.crop.w, position.crop.h, position).trim;
      approximately(current.width / original.width, fitted.scale);
      approximately(current.height / original.height, fitted.scale);
    }
  }

  const national = fixtures.get(22).instances;
  const fittedNational = fitOriginalCutting(national);
  assert.equal(fittedNational.scale, 1, "Page 22 can retain the original voucher dimensions");
  const first = fittedNational.instances[0];
  const firstTrim = cuttingGeometry(first.crop.w, first.crop.h, first).trim;
  approximately(firstTrim.top, CUTTING_OUTER_CLEARANCE_MM);
});

test("original finishing follows actual artwork bounds in mismatched rotated slots", () => {
  // The large slots are mostly empty. Fitting their slot rectangles would
  // unnecessarily shrink both receipts or place cut marks around empty space.
  for (const rotation of [0, 90, 180, 270]) {
    const source = [1, 0].map((order) => ({
      leftMm: 12 + order * 100,
      topMm: 30,
      widthMm: 80,
      heightMm: 100,
      rotation,
      crop: { x: order * 5, y: order * 7, w: 80, h: 160 },
      receipt: `receipt-${order}`,
    }));
    const result = fitOriginalCutting(source);
    assert.equal(result.scale, 1);
    assert.equal(result.adjusted, false);
    for (const [index, position] of result.instances.entries()) {
      assert.equal(
        position.receipt,
        source[index].receipt,
        "Copy identity and order must stay intact",
      );
      assert.deepEqual(position.crop, source[index].crop);
      const finish = cuttingGeometry(position.crop.w, position.crop.h, position);
      const original = cuttingGeometry(source[index].crop.w, source[index].crop.h, source[index]);
      assert.deepEqual(finish, original);
      const sideways = position.rotation === 90 || position.rotation === 270;
      approximately(finish.trim.width, sideways ? 80 : 50);
      approximately(finish.trim.height, sideways ? 40 : 100);
    }
  }
});

test("a tight original keeps the largest printable trim at every rotation", () => {
  for (const rotation of [0, 90, 180, 270]) {
    const source = {
      leftMm: 0,
      topMm: 0,
      widthMm: 210,
      heightMm: 297,
      rotation,
      crop: { x: 0, y: 0, w: 370, h: 620 },
    };
    const original = cuttingGeometry(source.crop.w, source.crop.h, source).trim;
    const { instances, scale } = fitOriginalCutting([source]);
    const fitted = instances[0];
    const finish = cuttingGeometry(fitted.crop.w, fitted.crop.h, fitted);
    const availableWidth = 210 - 2 * CUTTING_OUTER_CLEARANCE_MM;
    const availableHeight = 297 - 2 * CUTTING_OUTER_CLEARANCE_MM;
    approximately(
      scale,
      Math.min(1, availableWidth / original.width, availableHeight / original.height),
    );
    approximately(finish.trim.width, original.width * scale);
    approximately(finish.trim.height, original.height * scale);
    assert.ok(rectangleFitsPrintableSheet(finishingBounds(finish)));
    approximately(finish.trim.left - finish.bleed.left, CUTTING_BLEED_MM);
    approximately(finish.trim.top - finish.bleed.top, CUTTING_BLEED_MM);
    assert.equal(fitted.rotation, rotation);
  }
});

test("rotations keep all artwork corners inside the slot without distortion", () => {
  for (const [pixelWidth, pixelHeight, widthMm, heightMm] of [
    [1100, 1700, 90, 130],
    [1700, 1100, 194, 100],
  ]) {
    for (const rotation of [0, 90, 180, 270]) {
      const result = artworkTransform(pixelWidth, pixelHeight, widthMm, heightMm, rotation);
      assert.ok(Number.isFinite(result.scale) && result.scale > 0);
      const match = result.css.match(
        /^translate\(([-\d.e+]+)px,([-\d.e+]+)px\) rotate\(([-\d.]+)deg\) scale\(([-\d.e+]+)\)$/,
      );
      assert.ok(match, "Transform must specify translation, rotation and uniform scale");
      const [, x, y, angle, scale] = match.map(Number);
      approximately(scale, result.scale);
      approximately(angle, rotation);
      const radians = (angle * Math.PI) / 180;
      const corners = [
        [0, 0],
        [pixelWidth, 0],
        [0, pixelHeight],
        [pixelWidth, pixelHeight],
      ].map(([left, top]) => ({
        x: x + scale * (left * Math.cos(radians) - top * Math.sin(radians)),
        y: y + scale * (left * Math.sin(radians) + top * Math.cos(radians)),
      }));
      for (const corner of corners) {
        assert.ok(corner.x >= -1e-7 && corner.x <= widthMm * MM_TO_PX + 1e-7);
        assert.ok(corner.y >= -1e-7 && corner.y <= heightMm * MM_TO_PX + 1e-7);
      }
      approximately(
        Math.hypot(corners[1].x - corners[0].x, corners[1].y - corners[0].y) / pixelWidth,
        scale,
      );
      approximately(
        Math.hypot(corners[2].x - corners[0].x, corners[2].y - corners[0].y) / pixelHeight,
        scale,
      );
      assert.ok(
        Math.abs(Math.max(...corners.map((corner) => corner.x)) - widthMm * MM_TO_PX) < 1e-7 ||
          Math.abs(Math.max(...corners.map((corner) => corner.y)) - heightMm * MM_TO_PX) < 1e-7,
        "Artwork should fill at least one dimension of its slot",
      );
    }
  }
});

test("artwork transform rejects invalid dimensions and unsupported rotations", () => {
  for (const args of [
    [0, 100, 90, 130],
    [100, -1, 90, 130],
    [100, 100, Number.NaN, 130],
    [100, 100, 90, Number.POSITIVE_INFINITY],
    [100, 100, 90, 130, 45],
  ]) {
    assert.throws(() => artworkTransform(...args), /geometry/i);
  }
});

test("native manifest maps all 30 source pages without publishing the source PDF", () => {
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  assert.equal(manifest.source.pageCount, 30);
  assert.equal(manifest.templates.length, 30);
  assert.deepEqual(
    manifest.templates.map((template) => template.page),
    Array.from({ length: 30 }, (_, index) => index + 1),
  );
  assert.equal(new Set(manifest.templates.map((template) => template.id)).size, 30);
  assert.match(manifest.source.sha256, /^[a-f0-9]{64}$/);
  assert.equal(manifest.source.file, undefined);
  assert.equal(existsSync(resolve(publicRoot, "voucher-assets", "reference.pdf")), false);
  const studio = readFileSync(resolve(publicRoot, "voucher-studio.html"), "utf8");
  assert.doesNotMatch(studio, /sourcePdfLink|\/voucher-assets\/reference\.pdf/);
  for (const template of manifest.templates) {
    assert.ok(typeof template.name === "string" && template.name.trim());
    assert.ok(typeof template.variant === "string");
    assert.ok(Number.isInteger(template.copies) && template.copies > 0);
    assert.equal(template.image, undefined, "Full-page raster artwork must not be mapped");
    assert.equal(template.voucher.src, undefined, "Cropped voucher rasters must not be mapped");
    assert.ok(template.voucher.widthMm > 0 && template.voucher.heightMm > 0);
    const plan = planLayout({
      mode: "original",
      pages: 1,
      pageWidthMm: template.pageWidthMm,
      pageHeightMm: template.pageHeightMm,
    });
    assert.equal(
      plan.valid,
      true,
      `Source page ${template.page} cannot be displayed at its physical size`,
    );
  }
});

test("native page definitions map every source page to one of the 24 HTML designs", () => {
  const { templates } = readPublicJson("voucher-assets/manifest.json");
  const pages = readPublicJson("voucher-native-pages.json").pages.filter((page) => page.id <= 30);
  const layouts = readPublicJson("voucher-native-layouts.json").filter((layout) => layout.id <= 30);
  assert.equal(layouts.length, 24);
  const byId = new Map(layouts.map((layout) => [layout.id, layout]));
  assert.equal(byId.size, 24);
  assert.equal(pages.length, 30);
  assert.deepEqual(
    pages.map((page) => page.id),
    templates.map((template) => template.id),
  );
  for (const page of pages) {
    const layout = byId.get(page.templateId);
    assert.ok(layout, `Missing native design for source page ${page.id}`);
    assert.equal(layout.pageId, `page-${String(layout.id).padStart(2, "0")}`);
    const { crop, sourceWidth, sourceHeight } = layout;
    assert.ok([sourceWidth, sourceHeight, crop.x, crop.y, crop.w, crop.h].every(Number.isFinite));
    assert.ok(crop.x >= 0 && crop.y >= 0 && crop.w > 0 && crop.h > 0);
    assert.ok(crop.x + crop.w <= sourceWidth);
    // Some calibrated 707 px canvases have a signature extending a few pixels
    // below the nominal grid. The native renderer deliberately preserves it.
    assert.ok(crop.y + crop.h <= sourceHeight + 20);
    const template = templates.find((entry) => entry.id === page.id);
    approximately(page.pageWidthMm, template.pageWidthMm, 0.001);
    approximately(page.pageHeightMm, template.pageHeightMm, 0.001);
    assert.equal(page.copies.length, template.copies);
    for (const copy of page.copies) {
      assert.ok([copy.leftMm, copy.topMm, copy.widthMm, copy.heightMm].every(Number.isFinite));
      assert.ok([0, 90, 180, 270].includes(copy.rotation));
      assert.ok(copy.leftMm >= 0 && copy.topMm >= 0);
      assert.ok(copy.widthMm > 0 && copy.heightMm > 0);
      assert.ok(copy.leftMm + copy.widthMm <= page.pageWidthMm + 0.001);
      assert.ok(copy.topMm + copy.heightMm <= page.pageHeightMm + 0.001);
    }
    for (let index = 1; index < page.copies.length; index += 1) {
      const previous = page.copies[index - 1];
      const current = page.copies[index];
      const overlapX =
        Math.min(previous.leftMm + previous.widthMm, current.leftMm + current.widthMm) -
        Math.max(previous.leftMm, current.leftMm);
      const overlapY =
        Math.min(previous.topMm + previous.heightMm, current.topMm + current.heightMm) -
        Math.max(previous.topMm, current.topMm);
      assert.ok(overlapX <= 0.001 || overlapY <= 0.001, `Copies overlap on page ${page.id}`);
    }
  }
  for (const [sourcePage, designId] of [
    [10, 11],
    [15, 16],
    [22, 6],
    [25, 23],
    [28, 16],
    [29, 8],
  ]) {
    assert.equal(pages.find((page) => page.id === sourcePage).templateId, designId);
  }
});

test("native voucher artwork contains editable HTML structure and local Kalpurush", () => {
  const html = readFileSync(resolve(publicRoot, "voucher-templates.html"), "utf8");
  const css = readFileSync(resolve(publicRoot, "voucher-templates.css"), "utf8");
  const layouts = readPublicJson("voucher-native-layouts.json");
  const sections = [...html.matchAll(/<section\b[^>]*>[\s\S]*?<\/section>/gi)];
  const pdfSections = sections.filter((section) =>
    /\bdata-page="(?:[1-9]|[12]\d|30)"/.test(section[0]),
  );
  assert.equal(pdfSections.length, 24);
  const pdfHtml = pdfSections.map((section) => section[0]).join("");
  assert.doesNotMatch(pdfHtml, /<(?:img|svg|canvas|iframe|script)\b/i);
  assert.doesNotMatch(html, /data:image|background-image|\.webp\b/i);
  assert.doesNotMatch(css, /background(?:-image)?\s*:[^;}]*url\(/i);
  const editableKeys = [...html.matchAll(/data-key="([^\"]+)"/g)].map((match) => match[1]);
  assert.equal([...pdfHtml.matchAll(/data-key="([^\"]+)"/g)].length, 3238);
  assert.equal(new Set(editableKeys).size, editableKeys.length);
  assert.equal([...html.matchAll(/contenteditable="plaintext-only"/g)].length, editableKeys.length);
  assert.ok(html.includes("মাজেদা স্টেশনারী এন্ড পেপার হাউজ"));
  assert.ok(!html.includes("মডেল স্টেশনারী"));
  for (const layout of layouts) {
    const section = sections.find((match) => match[0].includes(`id="${layout.pageId}"`));
    assert.ok(section, layout.pageId);
    assert.match(section[0], /class="voucher-native(?:\s|"|$)/);
    assert.ok(section[0].includes(`data-template-page="${layout.pageId}"`));
    assert.match(section[0], /class="canvas"/);
    assert.match(section[0], /class="header-group\s/);
    assert.match(section[0], /data-key=/);
  }
  for (const page of [2, 6, 12, 18, 26]) {
    const section = sections.find((match) => match[0].includes(`data-page="${page}"`))[0];
    assert.ok(section.includes(`data-field="p${page}.copy0.body"`));
    assert.doesNotMatch(section, /class="table-block/);
  }
  const fontSource = "/fonts/kalpurush.woff2";
  assert.ok(css.includes(fontSource));
  assert.match(
    css,
    /\.voucher-native,\.voucher-native \*\{font-family:Kalpurush,Arial,sans-serif!important/,
  );
  assert.doesNotMatch(css, /VoucherBangla|url\([^)]*bangla-(?:sans|serif)/);
  const fontBytes = readFileSync(resolve(publicRoot, fontSource.slice(1)));
  assert.equal(fontBytes.toString("ascii", 0, 4), "wOF2");
  assert.ok(fontBytes.length > 1000);
});

test("printed receipt numbers are removed while row numbers and saved-edit keys remain", () => {
  const html = readFileSync(resolve(publicRoot, "voucher-templates.html"), "utf8");
  assert.doesNotMatch(html, /class="[^"]*\bfixed-serial\b/);
  const blanks = [
    ...html.matchAll(/<div\b[^>]*data-source-number="([^"]+)"[^>]*>([\s\S]*?)<\/div>/g),
  ];
  assert.equal(blanks.length, 4);
  assert.deepEqual(blanks.map((match) => match[1]).sort(), ["1321", "1321", "1524", "1524"]);
  assert.ok(blanks.every((match) => match[2].trim() === ""));
  assert.ok(html.includes('data-field="p1.copy0.serial"'));
  assert.ok(html.includes('data-field="p4.memo"'));
  assert.ok(html.includes('data-key="p27.label.845"'));
  assert.match(html, /<div\b[^>]*data-key="p24\.source\.serial"[^>]*>\s*<\/div>/);
  const contact = html.match(/<div\b[^>]*data-key="p7\.label\.145"[^>]*>([\s\S]*?)<\/div>/);
  assert.ok(contact?.[1].includes("01628-946635"));
  assert.match(html, /class="[^"]*cell-label[^\"]*"[^>]*>১<\/div>/);
});

test("PDF review restores source conditions, date cells and original graphic placeholders", () => {
  const html = readFileSync(resolve(publicRoot, "voucher-templates.html"), "utf8");
  for (const copy of [0, 1]) {
    for (const date of [0, 1, 2])
      assert.ok(html.includes(`data-key="p17.source.copy${copy}.date${date}"`));
    for (const condition of [1, 2])
      assert.ok(html.includes(`data-key="p27.source.copy${copy}.condition${condition}"`));
    assert.ok(html.includes(`data-key="p30.source.copy${copy}.returnPolicy"`));
  }
  for (const key of ["p3.copy0.words", "p21.copy0.words", "p20.source.religiousNote"])
    assert.ok(html.includes(`data-key="${key}"`));
  for (const key of ["p3.label.72", "p21.label.716"])
    assert.ok(!html.includes(`data-key="${key}"`));
  assert.ok(html.includes("০১৭১৬-৬৫১৬৫০"));
  assert.ok(html.includes("০১৭০১-৩৩৮৩৮৩"));
  assert.ok(html.includes("০১৭৪২-৬৩৫১২০"));
  assert.ok(html.includes("TOTAL TAKA -"));
  for (const graphic of ["logo-bkash", "logo-mesbah", "source-phone-icon"])
    assert.ok(html.includes(graphic));
  assert.ok(
    html.includes("data-source-previous="),
    "Old printed defaults can migrate without deleting user input",
  );
});

test("Sugandha loses only its outer frames and retains editable date boxes and tables", () => {
  const html = readFileSync(resolve(publicRoot, "voucher-templates.html"), "utf8");
  const sections = [...html.matchAll(/<section\b[^>]*>[\s\S]*?<\/section>/gi)].map(
    (match) => match[0],
  );
  const sugandha = sections.find((section) => section.includes('id="page-17"'));
  assert.ok(sugandha);
  assert.doesNotMatch(sugandha, /<div class="piece box" style="[^"]*"><\/div>/);
  assert.equal([...sugandha.matchAll(/class="table-block\b/g)].length, 2);
  for (const key of ["p17.label.512", "p17.label.518"]) {
    const dateBox = sugandha.match(
      new RegExp(`<div\\b[^>]*data-key="${key.replaceAll(".", "\\.")}"[^>]*>`),
    );
    assert.ok(dateBox, `Missing existing date box ${key}`);
    assert.match(dateBox[0], /class="piece box /);
    assert.match(dateBox[0], /contenteditable="plaintext-only"/);
  }
  for (const copy of [0, 1]) {
    for (const index of [0, 1, 2])
      assert.match(
        sugandha,
        new RegExp(
          `class="field source-date-cell"[^>]*data-key="p17\\.source\\.copy${copy}\\.date${index}"[^>]*contenteditable="plaintext-only"`,
        ),
      );
  }
  const unrelated = sections.find((section) => section.includes('id="page-09"'));
  assert.equal(
    [...unrelated.matchAll(/<div class="piece box" style="[^"]*"><\/div>/g)].length,
    2,
    "Other voucher designs must retain their existing frames",
  );
});

test("only isolated PDF logos and graphics are stored as raster artwork", () => {
  const manifest = readPublicJson("voucher-assets/logos/manifest.json");
  const source = readPublicJson("voucher-assets/manifest.json").source;
  assert.equal(manifest.source.sha256, source.sha256);
  assert.equal(manifest.source.file, undefined);
  assert.equal(manifest.assets.length, 38);
  const ids = new Set();
  const sources = new Set();
  for (const asset of manifest.assets) {
    assert.ok(!ids.has(asset.id), `Duplicate logo ID: ${asset.id}`);
    assert.ok(!sources.has(asset.src), `Duplicate logo file: ${asset.src}`);
    ids.add(asset.id);
    sources.add(asset.src);
    assert.match(asset.src, /^\/voucher-assets\/logos\/[\w-]+\.png$/);
    assert.ok(["logo", "portrait", "icon", "illustration", "watermark"].includes(asset.kind));
    assert.ok(
      Number.isInteger(asset.sourcePage) && asset.sourcePage >= 1 && asset.sourcePage <= 30,
    );
    assert.ok(asset.targetPages.length > 0);
    assert.ok(asset.targetPages.every((page) => Number.isInteger(page) && page >= 1 && page <= 30));
    const bytes = assetBytes(asset.src);
    assert.equal(sha256(bytes), asset.sha256, asset.src);
    assert.deepEqual(pngSize(bytes), { width: asset.width, height: asset.height }, asset.src);
    const { bounds, sourceWidth, sourceHeight } = asset.crop;
    assert.equal(bounds.length, 4);
    const [left, top, right, bottom] = bounds;
    assert.ok(bounds.every(Number.isInteger));
    assert.ok(left >= 0 && top >= 0 && right > left && bottom > top);
    assert.ok(right <= sourceWidth && bottom <= sourceHeight);
    assert.equal(right - left, asset.width);
    assert.equal(bottom - top, asset.height);
    // Printed watermark groups can cover a third of a receipt. Their isolated
    // artwork needs transparency; no asset may contain the whole bill.
    const maximumArea = asset.kind === "watermark" ? 0.35 : 0.2;
    assert.ok((asset.width * asset.height) / (sourceWidth * sourceHeight) < maximumArea);
    if (asset.kind === "watermark") assert.equal(bytes[25], 6, "Watermarks must be RGBA");
    assert.ok(asset.sourcePageBoundsNormalized.every((value) => value >= 0 && value <= 1));
  }
});

test("studio runtime renders native canvas clones and persists editable fields", () => {
  const script = readFileSync(resolve(publicRoot, "voucher-studio.js"), "utf8");
  assert.doesNotMatch(script, /template\.image\b|template\.voucher\.src\b/);
  assert.doesNotMatch(script, /voucher-\d+\.webp|page-\d+\.webp|drawImage\(/);
  assert.match(script, /querySelector\(["']\.canvas["']\)\.cloneNode\(true\)/);
  assert.match(script, /bindNativeFields\(artwork,\s*storageSlot\)/);
  assert.match(script, /querySelectorAll\(["']\[data-key\]["']\)/);
  assert.match(
    script,
    /localStorage\.setItem\(fieldStorageKey,\s*JSON\.stringify\(nativeFields\)\)/,
  );
  for (const asset of [
    "voucher-templates.html",
    "voucher-native-layouts.json",
    "voucher-native-pages.json",
    "voucher-assets/logos/manifest.json",
  ]) {
    assert.ok(script.includes(asset), `Runtime must load ${asset}`);
  }
});

test("studio enables bleed and crop marks for every design in both layout modes", () => {
  const script = readFileSync(resolve(publicRoot, "voucher-studio.js"), "utf8");
  assert.match(script, /const cutting = true;/);
  assert.doesNotMatch(script, /const cutting\s*=\s*template\.(?:page|id)\s*===/);
  assert.match(script, /original\s*\?\s*fitOriginalCutting\(sourceInstances\)/);
  assert.match(script, /for \(let index = 0; index < instances\.length; index\+\+\)/);
  assert.match(script, /cuttingGeometry\(asset\.width,\s*asset\.height,\s*position\)/);
  assert.match(script, /for \(const bounds of finishing\.marks\)/);
  assert.match(script, /bleedBackgrounds\(\s*pageDefinition\.templateId,/);
  assert.match(script, /sheet\.appendChild\(mark\)/);
  assert.doesNotMatch(script, /(?:artwork|slot)\.appendChild\(mark\)/);
});

test("battery original copies retain their distinct source crops and shared saved edits", () => {
  const script = readFileSync(resolve(publicRoot, "voucher-studio.js"), "utf8");
  assert.match(script, /const batteryOriginal = original && template\.id === 4;/);
  assert.match(
    script,
    /index === 0\s*\?\s*\{ x: 90, y: 28, w: 820, h: 638 \}\s*:\s*\{ x: 90, y: 686, w: 820, h: 738 \}/,
  );
  assert.match(script, /const storageSlot = batteryOriginal \? 0 : index;/);
  assert.match(script, /bindNativeFields\(artwork,\s*storageSlot\)/);
  assert.match(script, /setupAnnotations\(\s*artwork,\s*storageSlot,/);
  assert.match(script, /batteryOriginal\s*\?\s*\{ width: nativeLayout\.sourceWidth,/);
  assert.doesNotMatch(script, /const directPage\s*=/);
});
