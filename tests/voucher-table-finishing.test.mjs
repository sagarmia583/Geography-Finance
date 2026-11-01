import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const artwork = readFileSync(new URL("../public/voucher-templates.html", import.meta.url), "utf8");

// Retain element nesting: table cells, printed labels, and shade pieces are
// adjacent divs, so matching only through the first closing div loses the grid.
function parseElements(html) {
  const root = { tag: "root", attributes: {}, children: [] };
  const stack = [root];
  const voidTags = new Set([
    "area",
    "base",
    "br",
    "col",
    "embed",
    "hr",
    "img",
    "input",
    "link",
    "meta",
    "param",
    "source",
    "track",
    "wbr",
  ]);
  for (const match of html.matchAll(/<\/?([a-z][\w:-]*)\b(?:"[^"]*"|'[^']*'|[^'">])*>/gi)) {
    const tag = match[1].toLowerCase();
    if (match[0].startsWith("</")) {
      const index = stack.findLastIndex((node) => node.tag === tag);
      if (index > 0) stack.splice(index);
      continue;
    }
    const attributes = Object.fromEntries(
      [...match[0].matchAll(/([\w:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g)].map(
        ([, name, doubleQuoted, singleQuoted]) => [name, doubleQuoted ?? singleQuoted],
      ),
    );
    const node = { tag, attributes, children: [] };
    stack.at(-1).children.push(node);
    if (!voidTags.has(tag) && !match[0].endsWith("/>")) stack.push(node);
  }
  return root;
}

function* descendants(node) {
  for (const child of node.children) {
    yield child;
    yield* descendants(child);
  }
}

function hasClass(node, className) {
  return (node.attributes.class || "").split(/\s+/).includes(className);
}

function rectangle(node) {
  const style = Object.fromEntries(
    (node.attributes.style || "")
      .split(";")
      .filter((declaration) => declaration.includes(":"))
      .map((declaration) => {
        const separator = declaration.indexOf(":");
        return [declaration.slice(0, separator).trim(), declaration.slice(separator + 1).trim()];
      }),
  );
  return Object.fromEntries(
    [
      ["x", "left", "--x"],
      ["y", "top", "--y"],
      ["width", "width", "--w"],
      ["height", "height", "--h"],
    ].map(([axis, absolute, custom]) => {
      const value = style[absolute] ?? style[custom];
      assert.match(value || "", /^-?\d+(?:\.\d+)?(?:px)?$/, `${axis}: ${value}`);
      return [axis, parseFloat(value)];
    }),
  );
}

const nodes = [...descendants(parseElements(artwork))];
const sections = nodes.filter((node) => node.tag === "section");
const tables = sections.flatMap((section) =>
  [...descendants(section)]
    .filter((node) => hasClass(node, "table-block"))
    .map((table, copy) => ({ page: section.attributes.id, copy, table })),
);
const page08 = tables.filter(({ page }) => page === "page-08");
const shadeClasses = [
  "table-shade",
  "brand-pink",
  "brand-battery",
  "brand-chicken",
  "source-quantity-shade",
  "source-column-shade",
  "source-words-shade",
];

test("both Barek headers keep their phone lines beside the handset and clear of the memo", () => {
  const section = sections.find((node) => node.attributes.id === "page-08");
  const headers = [...descendants(section)].filter((node) => hasClass(node, "barek"));
  assert.equal(headers.length, 2);
  const phoneKeys = ["p8.label.168", "p8.label.175"];
  const bismillahKeys = ["p8.label.166", "p8.label.173"];

  for (const [copy, header] of headers.entries()) {
    const pieces = [...descendants(header)];
    const icon = pieces.find((node) => hasClass(node, "source-phone-icon"));
    const phone = pieces.find((node) => node.attributes["data-key"] === phoneKeys[copy]);
    const bismillah = pieces.find((node) => node.attributes["data-key"] === bismillahKeys[copy]);
    const memo = pieces.find((node) => hasClass(node, "pill"));
    const title = pieces.find((node) => hasClass(node, "headline"));
    assert.ok(icon && phone && bismillah && memo && title, `Barek header ${copy + 1}`);

    const iconBox = rectangle(icon);
    const phoneBox = rectangle(phone);
    const headingBox = rectangle(bismillah);
    const memoBox = rectangle(memo);
    assert.ok(iconBox.width >= 20 && iconBox.height >= 38, "The original handset stays legible");
    assert.ok(phoneBox.x > iconBox.x + iconBox.width, "Phone numbers follow the handset");
    assert.ok(phoneBox.x - iconBox.x - iconBox.width <= 5, "The handset-to-number gap stays small");
    assert.equal(phoneBox.y, iconBox.y, "The phone cluster shares its top anchor");
    assert.ok(phoneBox.height >= iconBox.height, "Both phone lines fit beside the handset");
    assert.ok(phoneBox.x + phoneBox.width <= rectangle(header).width);
    assert.ok(headingBox.x + headingBox.width <= iconBox.x, "Bismillah cannot reach the handset");
    assert.ok(memoBox.x + memoBox.width <= iconBox.x, "The memo badge cannot reach the handset");
    assert.ok(headingBox.y + headingBox.height <= memoBox.y, "Bismillah stays above the memo");
    assert.ok(phoneBox.y + phoneBox.height < rectangle(title).y);
    assert.match(phone.attributes.style, /(?:^|;)text-align:left(?:;|$)/);
    assert.match(phone.attributes.style, /(?:^|;)--fs:21px(?:;|$)/);
    assert.equal(phone.attributes.contenteditable, "plaintext-only");
    assert.equal([...descendants(phone)].filter((node) => node.tag === "br").length, 1);
    assert.match(
      artwork,
      new RegExp(
        `data-key="${phoneKeys[copy].replaceAll(".", "\\.")}"[^>]*>01792-291448<br\\s*/?>01881-189310</div>`,
      ),
      "Both original phone values retain their stable editable key and explicit line break",
    );
  }

  const nativePages = JSON.parse(
    readFileSync(new URL("../public/voucher-native-pages.json", import.meta.url), "utf8"),
  ).pages;
  const monochrome = nativePages.find((page) => page.id === 29);
  assert.equal(
    monochrome.templateId,
    8,
    "The corrected header also supplies the monochrome design",
  );
  assert.equal(monochrome.grayscale, true);
  assert.equal(monochrome.copies.length, 2);
});

test("Barek table bottom separator spans the complete grid above the merged words row", () => {
  assert.equal(page08.length, 2);
  for (const { copy, table } of page08) {
    const { width } = rectangle(table);
    const separators = table.children
      .filter((child) => hasClass(child, "rule"))
      .map(rectangle)
      .filter((box) => box.x === 0 && box.y === 363 && box.width === width && box.height === 1);
    assert.equal(separators.length, 1, `Barek copy ${copy + 1} needs one complete words separator`);
  }
});

test("Barek gradients fill their own columns while leaving the merged words row writable", () => {
  const expected = [
    [
      { x: 0, y: 27, width: 36, height: 336 },
      { x: 222, y: 27, width: 56, height: 336 },
      { x: 343, y: 27, width: 84, height: 363 },
    ],
    [
      { x: 0, y: 27, width: 35, height: 336 },
      { x: 219, y: 27, width: 55, height: 336 },
      { x: 339, y: 27, width: 85, height: 363 },
    ],
  ];
  for (const { copy, table } of page08) {
    const shades = table.children
      .filter((child) => hasClass(child, "brand-pink") || hasClass(child, "source-quantity-shade"))
      .map(rectangle)
      .sort((first, second) => first.x - second.x);
    assert.deepEqual(shades, expected[copy]);
    assert.equal(shades[0].y + shades[0].height, 363);
    assert.equal(shades[1].y + shades[1].height, 363);
    assert.equal(shades[2].y + shades[2].height, rectangle(table).height);

    const words = nodes.filter((node) => node.attributes["data-key"] === `p8.copy${copy}.words`);
    assert.equal(words.length, 1);
    assert.equal(words[0].attributes.contenteditable, "plaintext-only");
    assert.equal(words[0].attributes["data-field"], `p8.copy${copy}.words`);
    const tableBox = rectangle(table);
    assert.deepEqual(rectangle(words[0]), {
      x: tableBox.x + 68.32,
      y: tableBox.y + 365,
      width: 207,
      height: 23,
    });
    assert.ok(
      ![...descendants(table)].includes(words[0]),
      "Words stay independent of shaded columns",
    );
  }
});

test("every generated table retains its grid and column shades inside its printable rectangle", () => {
  assert.equal(tables.length, 28);
  let ruleCount = 0;
  let shadeCount = 0;
  for (const { page, copy, table } of tables) {
    const bounds = rectangle(table);
    const pieces = table.children.filter((node) => {
      if (hasClass(node, "rule")) {
        ruleCount++;
        return true;
      }
      if (shadeClasses.some((className) => hasClass(node, className))) {
        shadeCount++;
        return true;
      }
      return false;
    });
    assert.ok(pieces.length, `${page} copy ${copy + 1} must retain a grid`);
    for (const piece of pieces) {
      const box = rectangle(piece);
      const description = `${page} copy ${copy + 1} ${piece.attributes.class}`;
      assert.ok(box.width > 0 && box.height > 0, description);
      assert.ok(box.x >= 0 && box.y >= 0, description);
      assert.ok(box.x + box.width <= bounds.width + 0.001, `${description}: right edge`);
      assert.ok(box.y + box.height <= bounds.height + 0.001, `${description}: bottom edge`);
    }
  }
  assert.equal(ruleCount, 542, "The existing grid rules must remain present");
  assert.equal(shadeCount, 29);
});

test("open words areas on Battery and Mohammadiya tables keep their partial bottom borders", () => {
  const partialBottoms = [];
  for (const { page, copy, table } of tables) {
    const bounds = rectangle(table);
    const bottoms = table.children
      .filter((node) => hasClass(node, "rule"))
      .map(rectangle)
      .filter(
        (box) => box.width > box.height && Math.abs(box.y + box.height - bounds.height) < 0.001,
      );
    if (!bottoms.some((box) => box.x === 0 && box.width === bounds.width))
      partialBottoms.push({ page, copy, spans: bottoms.map(({ x, width }) => [x, width]) });
  }
  assert.deepEqual(partialBottoms, [
    { page: "page-04", copy: 0, spans: [[524, 278]] },
    { page: "page-04", copy: 1, spans: [[524, 278]] },
    { page: "page-07", copy: 0, spans: [[386, 216]] },
  ]);
});
