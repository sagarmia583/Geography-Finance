import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { applyPrintSizes } from "../public/voucher-studio-sizes.js";
import {
  artworkTransform,
  cuttingGeometry,
  fitOriginalCutting,
  MM_TO_PX,
  planLayout,
  PRINT_SAFE_INSET_MM,
  slotPosition,
} from "../public/voucher-studio-layout.js";
import { majedaHorizontalScale, resizeMajedaMarkup } from "../scripts/voucher-majeda-size.mjs";

const read = (path) => readFileSync(new URL(`../public/${path}`, import.meta.url), "utf8");
const json = (path) => JSON.parse(read(path));
const additional = json("voucher-additional-designs.json");
const templates = [...json("voucher-assets/manifest.json").templates, ...additional.templates];
const pages = [...json("voucher-native-pages.json").pages, ...additional.pages];
const layout = json("voucher-native-layouts.json").find((entry) => entry.id === 20);
const section = (html) =>
  [...html.matchAll(/<section\b[^>]*>[\s\S]*?<\/section>/g)].find((match) =>
    /\bid="page-20"/.test(match[0]),
  )?.[0];
const close = (actual, expected) =>
  assert.ok(Math.abs(actual - expected) < 1e-7, `${actual} != ${expected}`);
function freeze(value) {
  if (value && typeof value === "object") {
    Object.values(value).forEach(freeze);
    Object.freeze(value);
  }
  return value;
}

test("only Majeda receives the requested print size, retaining every other design and input", () => {
  const before = structuredClone({ templates, pages, preferences: additional.printSizes });
  freeze(templates);
  freeze(pages);
  freeze(additional.printSizes);
  assert.deepEqual(
    additional.printSizes.map((size) => size.id),
    [20],
  );
  const result = applyPrintSizes(templates, pages, additional.printSizes);
  assert.equal(result.templates.length, 31);
  assert.equal(result.pages.length, 31);
  for (const [index, original] of templates.entries()) {
    if (original.id !== 20) assert.equal(result.templates[index], original);
    else {
      assert.notEqual(result.templates[index], original);
      assert.equal(result.templates[index].voucher.widthMm, 142.24);
      assert.equal(result.templates[index].voucher.heightMm, 210.82);
      assert.equal(result.templates[index].name, original.name);
      assert.equal(result.templates[index].copies, original.copies);
    }
  }
  for (const [index, original] of pages.entries()) {
    if (original.id !== 20) assert.equal(result.pages[index], original);
    else assert.notEqual(result.pages[index].copies, original.copies);
  }
  assert.deepEqual({ templates, pages, preferences: additional.printSizes }, before);
  assert.equal(result.templates.find((entry) => entry.id === 31).voucher.heightMm, 215.9);
  assert.equal(result.pages.find((entry) => entry.id === 31).copies[0].heightMm, 215.9);
});

test("catalogue sizing remains a no-op without a user size override", () => {
  const result = applyPrintSizes(templates, pages);
  assert.ok(result.templates.every((entry, index) => entry === templates[index]));
  assert.ok(result.pages.every((entry, index) => entry === pages[index]));
});

test("Majeda retains a 5.6 by 8.3 inch physical trim in both layouts with complete safe finishing", () => {
  const result = applyPrintSizes(templates, pages, additional.printSizes);
  const page = result.pages.find((entry) => entry.id === 20);
  const width = 5.6 * 25.4;
  const height = 8.3 * 25.4;
  assert.equal(page.copies.length, 1);
  const copy = page.copies[0];
  close(copy.leftMm + copy.widthMm / 2, 105);
  close(copy.topMm + copy.heightMm / 2, 148.5);
  close(copy.widthMm, width);
  close(copy.heightMm, height);
  close(layout.crop.w / layout.crop.h, width / height);
  const original = fitOriginalCutting([{ ...copy, crop: layout.crop }]);
  assert.equal(original.scale, 1);
  assert.equal(original.adjusted, false);
  const plan = planLayout({
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
  assert.equal(plan.valid, true);
  assert.equal(plan.perPage, 1);
  const at = slotPosition(plan, 0);
  for (const position of [
    original.instances[0],
    {
      leftMm: at.left,
      topMm: at.top,
      widthMm: plan.width,
      heightMm: plan.height,
      rotation: 0,
    },
  ]) {
    const transform = artworkTransform(layout.crop.w, layout.crop.h, width, height);
    close((layout.crop.w * transform.scale) / MM_TO_PX, width);
    close((layout.crop.h * transform.scale) / MM_TO_PX, height);
    const finish = cuttingGeometry(layout.crop.w, layout.crop.h, position);
    close(finish.trim.width, width);
    close(finish.trim.height, height);
    close(finish.bleed.width, width + 6);
    close(finish.bleed.height, height + 6);
    assert.equal(finish.marks.length, 8);
    for (const bounds of [finish.bleed, ...finish.marks]) {
      assert.ok(bounds.left >= PRINT_SAFE_INSET_MM - 1e-7);
      assert.ok(bounds.top >= PRINT_SAFE_INSET_MM - 1e-7);
      assert.ok(bounds.left + bounds.width <= 210 - PRINT_SAFE_INSET_MM + 1e-7);
      assert.ok(bounds.top + bounds.height <= 297 - PRINT_SAFE_INSET_MM + 1e-7);
    }
  }
});

test("horizontal reflow preserves text, font sizes, vertical dimensions and transforms", () => {
  const scale = majedaHorizontalScale({ w: 633, h: 1025 }, additional.printSizes[0]);
  close(layout.crop.x, 25 * scale);
  close(layout.crop.y, 10);
  close(layout.crop.w, 633 * scale);
  close(layout.crop.h, 1025);
  const input =
    '<div data-key="p20.test" style="left:25px;top:10px;width:633px;height:1025px;--x:12px;--y:15px;--w:100px;--h:30px;--fs:19px;font-size:15px;line-height:1.35;transform:scale(1.2,1);width:50%">মাজেদা ১২৩</div>';
  const resized = resizeMajedaMarkup(input, scale);
  assert.ok(resized.includes(`left:${25 * scale}px`));
  assert.ok(resized.includes(`width:${633 * scale}px`));
  for (const unchanged of [
    'data-key="p20.test"',
    "top:10px",
    "height:1025px",
    "--y:15px",
    "--h:30px",
    "--fs:19px",
    "font-size:15px",
    "line-height:1.35",
    "transform:scale(1.2,1)",
    "width:50%",
    "মাজেদা ১২৩",
  ])
    assert.ok(resized.includes(unchanged), unchanged);
});

test("the generated Majeda keeps its original font tokens, editable keys and blank receipt number", () => {
  const generated = section(read("voucher-templates.html"));
  const source = section(read("voucher-studio-unique-headers.html"));
  assert.ok(generated && source);
  // Two source-verified supplementary notes were added before this size change.
  // All original label and field font sizes must still match the native source.
  const withoutSupplementaryNotes = generated.replace(
    /<div\b[^>]*data-key="p20\.source\.[^"]+"[^>]*>/g,
    "<div>",
  );
  const fontTokens = (markup) =>
    [...markup.matchAll(/(?:--fs|font-size):([^;"}]+)/g)].map((match) => match[0]);
  assert.deepEqual(fontTokens(withoutSupplementaryNotes), fontTokens(source));
  assert.equal([...generated.matchAll(/data-key="p20\.[^"]+"/g)].length, 99);
  assert.ok(generated.includes('data-field="p20.copy0.serial"'));
  assert.doesNotMatch(generated, /class="[^"]*\bfixed-serial\b/);
  assert.match(generated, /<div\b[^>]*data-field="p20\.copy0\.serial"[^>]*>\s*<\/div>/);
  assert.ok(generated.includes("মাজেদা স্টেশনারী এন্ড পেপার হাউজ"));
  const corrections = json("../scripts/voucher-reference-11-20.json");
  for (const [key, expected] of Object.entries(corrections).filter(([key]) =>
    key.startsWith("p20."),
  )) {
    const label = generated.match(
      new RegExp(`<div\\b[^>]*data-key="${key.replaceAll(".", "\\.")}"[^>]*>([\\s\\S]*?)<\\/div>`),
    );
    assert.ok(label, key);
    assert.equal(label[1].replace(/<[^>]*>/g, ""), expected.normalize("NFC"), key);
  }
});
