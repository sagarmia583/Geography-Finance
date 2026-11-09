import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";
import { bleedBackgrounds } from "../public/voucher-studio-bleed.js";
import {
  artworkTransform,
  cuttingGeometry,
  fitOriginalCutting,
  MM_TO_PX,
  planLayout,
  PRINT_SAFE_INSET_MM,
  slotPosition,
} from "../public/voucher-studio-layout.js";

const read = (path) => readFileSync(new URL(`../public/${path}`, import.meta.url), "utf8");
const additional = JSON.parse(read("voucher-additional-designs.json"));
const template = additional.templates.find((entry) => entry.id === 31);
const page = additional.pages.find((entry) => entry.id === 31);
const layout = JSON.parse(read("voucher-native-layouts.json")).find((entry) => entry.id === 31);
const html = read("voucher-templates.html");
const section = [...html.matchAll(/<section\b[^>]*>[\s\S]*?<\/section>/g)].find((match) =>
  /\bid="page-31"/.test(match[0]),
)?.[0];

function close(actual, expected, tolerance = 1e-7) {
  assert.ok(
    Math.abs(actual - expected) <= tolerance,
    `${actual} should equal ${expected} within ${tolerance}`,
  );
}

function insidePrintableSheet({ left, top, width, height }) {
  assert.ok(left >= PRINT_SAFE_INSET_MM - 1e-7);
  assert.ok(top >= PRINT_SAFE_INSET_MM - 1e-7);
  assert.ok(left + width <= 210 - PRINT_SAFE_INSET_MM + 1e-7);
  assert.ok(top + height <= 297 - PRINT_SAFE_INSET_MM + 1e-7);
}

test("Islam Computers is an additional image-reference design without changing the thirty PDF pages", () => {
  assert.ok(template && page && layout && section);
  assert.equal(template.source.kind, "image");
  assert.equal(template.source.file, "Islam Coputer.jpg");
  assert.match(template.source.sha256, /^[a-f0-9]{64}$/);
  assert.equal(template.copies, 1);
  assert.equal(page.templateId, 31);
  assert.equal(page.copies.length, 1);
  assert.equal(layout.pageId, "page-31");
  assert.deepEqual(layout.crop, {
    x: 0,
    y: 0,
    w: layout.sourceWidth,
    h: layout.sourceHeight,
  });
  close(layout.crop.w / layout.crop.h, 5.6 / 8.5);
  const original = JSON.parse(read("voucher-assets/manifest.json"));
  assert.equal(original.source.pageCount, 30);
  assert.equal(original.templates.length, 30);
  assert.equal(JSON.parse(read("voucher-native-pages.json")).pages.length, 30);
});

test("both layout modes retain the requested 5.6 by 8.5 inch trim with safe physical finishing", () => {
  const width = 5.6 * 25.4;
  const height = 8.5 * 25.4;
  close(template.voucher.widthMm, width);
  close(template.voucher.heightMm, height);
  assert.equal(page.pageWidthMm, 210);
  assert.equal(page.pageHeightMm, 297);
  const copy = page.copies[0];
  close(copy.widthMm, width);
  close(copy.heightMm, height);
  assert.equal(copy.rotation, 0);
  const original = fitOriginalCutting([{ ...copy, crop: layout.crop }]);
  assert.equal(original.scale, 1, "The requested dimensions fit A4 without being reduced");
  assert.equal(original.adjusted, false);
  const custom = planLayout({
    mode: "custom",
    pages: 1,
    count: 1,
    width,
    height,
    margin: 8,
    gapX: 4,
    gapY: 4,
    cutting: true,
  });
  assert.equal(custom.valid, true);
  assert.equal(custom.perPage, 1);
  close(custom.width, width);
  close(custom.height, height);
  const customPosition = slotPosition(custom, 0);
  for (const position of [
    original.instances[0],
    {
      leftMm: customPosition.left,
      topMm: customPosition.top,
      widthMm: custom.width,
      heightMm: custom.height,
      rotation: 0,
    },
  ]) {
    const transform = artworkTransform(layout.crop.w, layout.crop.h, width, height, 0);
    close((layout.crop.w * transform.scale) / MM_TO_PX, width);
    close((layout.crop.h * transform.scale) / MM_TO_PX, height);
    const finish = cuttingGeometry(layout.crop.w, layout.crop.h, position);
    close(finish.trim.width, width);
    close(finish.trim.height, height);
    close(finish.bleed.width, width + 6);
    close(finish.bleed.height, height + 6);
    assert.equal(finish.marks.length, 8);
    insidePrintableSheet(finish.bleed);
    for (const mark of finish.marks) insidePrintableSheet(mark);
  }
});

test("Islam Computers preserves editable printed information and leaves receipt data blank", () => {
  assert.ok(section);
  const printed = section.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ");
  for (const text of [
    "ISLAM COMPUTERS",
    "INVOICE/BILL",
    "Bill No. ICT-",
    "Date:",
    "NAME AND ADDRESS",
    "SPECIAL NOTE",
    "DESCRIPTION",
    "QTY",
    "U. PRICE",
    "AMOUNT",
    "Grand Total",
    "RECEIVED BY",
    "FOR ISLAM COMPUTERS",
    "islamcomputerss@gmail.com",
    "facebook.com/islamcom007",
    "www.islamcomputers.com",
    "Souhardo Plaza",
    "Victoria Road",
    "Tangail",
  ])
    assert.ok(printed.includes(text), `Missing source information: ${text}`);
  assert.ok(printed.replace(/\s/g, "").includes("+8801776-385225"));
  assert.doesNotMatch(
    printed,
    /\b5058\b/,
    "A scanned receipt number must not become a printed default",
  );
  const keyed = [...section.matchAll(/<([a-z][\w-]*)\b([^>]*\bdata-key="([^"]+)"[^>]*)>/g)];
  assert.ok(keyed.length >= 20, "Labels and writing areas remain independently editable");
  assert.equal(new Set(keyed.map((match) => match[3])).size, keyed.length);
  for (const [, , attributes, key] of keyed) {
    assert.match(key, /^p31\./);
    assert.match(attributes, /contenteditable="plaintext-only"/);
  }
  const writable = [
    ...section.matchAll(/<div\b([^>]*\bdata-field="([^"]+)"[^>]*)>([\s\S]*?)<\/div>/g),
  ];
  assert.ok(
    writable.length >= 15,
    "The bill, address, table, totals, words and signature data stay writable",
  );
  for (const [, attributes, key, content] of writable) {
    assert.match(attributes, /contenteditable="plaintext-only"/);
    assert.ok(key.startsWith("p31."));
    assert.equal(content.replace(/<[^>]*>/g, "").trim(), "", `Unexpected default data in ${key}`);
  }
  assert.doesNotMatch(section, /<(?:canvas|iframe|script)\b|data:image|\.jpe?g\b|\.webp\b/i);
});

test("five independent item columns fit below the table header without overlapping each other", () => {
  const rectangle = (tag) => {
    assert.ok(tag, "The table, header cell and writable body cell must exist");
    const style = Object.fromEntries(
      tag
        .match(/\bstyle="([^"]*)"/)[1]
        .split(";")
        .filter(Boolean)
        .map((declaration) => {
          const separator = declaration.indexOf(":");
          return [declaration.slice(0, separator), declaration.slice(separator + 1)];
        }),
    );
    const box = Object.fromEntries(
      ["left", "top", "width", "height"].map((property) => [
        property,
        Number.parseFloat(style[property]),
      ]),
    );
    assert.ok(Object.values(box).every(Number.isFinite));
    return box;
  };
  const table = rectangle(section.match(/<div\b[^>]*class="table-block islam-table"[^>]*>/)?.[0]);
  const bodyColumns = ["serial", "description", "quantity", "unit-price", "amount"].map((name) => {
    const key = `p31.copy0.items.${name}`;
    const box = rectangle(
      section.match(
        new RegExp(`<div\\b[^>]*data-field="${key.replaceAll(".", "\\.")}"[^>]*>`),
      )?.[0],
    );
    const heading = rectangle(
      section.match(new RegExp(`<div\\b[^>]*data-key="p31\\.label\\.column-${name}"[^>]*>`))?.[0],
    );
    assert.ok(box.left >= 0 && box.width > 0 && box.top > 0 && box.height > 0);
    assert.ok(box.left + box.width <= table.width);
    assert.ok(box.top + box.height < table.height);
    assert.ok(box.top > heading.top + heading.height, "Product data must start below the heading");
    assert.ok(box.left >= heading.left);
    assert.ok(box.left + box.width <= heading.left + heading.width);
    return box;
  });
  for (const [index, column] of bodyColumns.entries()) {
    assert.equal(column.top, bodyColumns[0].top);
    assert.equal(column.height, bodyColumns[0].height);
    if (index > 0)
      assert.ok(bodyColumns[index - 1].left + bodyColumns[index - 1].width < column.left);
  }
});

test("Islam Computers extends its colored header and footer into the 3 mm bleed at every rotation", () => {
  const overlaps = (first, second) =>
    Math.min(first.left + first.width, second.left + second.width) -
      Math.max(first.left, second.left) >
      1e-7 &&
    Math.min(first.top + first.height, second.top + second.height) -
      Math.max(first.top, second.top) >
      1e-7;
  const contains = (rectangle, x, y) =>
    x >= rectangle.left &&
    x <= rectangle.left + rectangle.width &&
    y >= rectangle.top &&
    y <= rectangle.top + rectangle.height;
  for (const rotation of [0, 90, 180, 270]) {
    const position = { leftMm: 30, topMm: 40, widthMm: 100, heightMm: 150, rotation };
    const { trim, bleed, marks } = cuttingGeometry(layout.crop.w, layout.crop.h, position);
    const backgrounds = bleedBackgrounds(31, layout.crop.w, layout.crop.h, position);
    assert.equal(backgrounds.length, 6);
    for (const background of backgrounds) {
      close(Math.min(background.width, background.height), 3);
      assert.ok(background.left >= bleed.left - 1e-7);
      assert.ok(background.top >= bleed.top - 1e-7);
      assert.ok(background.left + background.width <= bleed.left + bleed.width + 1e-7);
      assert.ok(background.top + background.height <= bleed.top + bleed.height + 1e-7);
      assert.equal(overlaps(background, trim), false, "Bleed paint must not cover voucher text");
      for (const mark of marks) assert.equal(overlaps(background, mark), false);
    }
    assert.match(backgrounds[0].color, new RegExp(`^linear-gradient\\(${115 + rotation}deg,`));
    assert.match(backgrounds[3].color, new RegExp(`^linear-gradient\\(${90 + rotation}deg,`));
    for (const x of [bleed.left + 0.001, bleed.left + bleed.width - 0.001])
      for (const y of [bleed.top + 0.001, bleed.top + bleed.height - 0.001])
        assert.ok(
          backgrounds.some((background) => contains(background, x, y)),
          "Colored bleed covers the corners",
        );
    if (rotation === 0)
      for (const x of [trim.left - 1.5, trim.left + trim.width + 1.5])
        assert.equal(
          backgrounds.some((background) => contains(background, x, trim.top + trim.height / 2)),
          false,
          "The white invoice body must not receive header or footer color",
        );
  }
});

test("the additional source contributes only a small isolated logo asset", () => {
  const assets = additional.logos.filter((asset) => asset.targetPages.includes(31));
  assert.ok(assets.length > 0);
  assert.ok(section.includes("logo-islam-computers"));
  for (const asset of assets) {
    assert.match(asset.src, /^\/voucher-assets\/logos\/[\w-]+\.png$/);
    assert.equal(asset.kind, "logo");
    const bytes = readFileSync(new URL(`../public${asset.src}`, import.meta.url));
    assert.equal(createHash("sha256").update(bytes).digest("hex"), asset.sha256);
    assert.deepEqual([...bytes.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
    const width = bytes.readUInt32BE(16);
    const height = bytes.readUInt32BE(20);
    assert.equal(width, asset.width);
    assert.equal(height, asset.height);
    assert.ok(width * height < 1686 * 2554 * 0.05, "The full voucher must not be a raster asset");
  }
});
