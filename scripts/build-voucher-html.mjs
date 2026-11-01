import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { normalizePrintedText, printedDefaultMatches } from "../public/voucher-studio-content.js";

// The calibrated native design grid is the source of truth for the editable
// artwork. The reference PDF is used separately to extract small logos only.
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const source = fs.readFileSync(
  path.join(root, "public/voucher-studio-unique-headers.html"),
  "utf8",
);
const templateData = JSON.parse(source.match(/const TEMPLATE_DATA\s*=\s*(\[[\s\S]*?\]);/)[1]);
const styles = [...source.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/gi)].map((match) => match[1]);
const referenceGroups = ["01-10", "11-20", "21-30"];
const referenceText = Object.assign(
  {},
  ...referenceGroups.map((group) => {
    const file = path.join(root, `scripts/voucher-reference-${group}.json`);
    return fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, "utf8")) : {};
  }),
);
const correctedKeys = new Set();
const referenceTransforms = [];
for (const group of referenceGroups) {
  const file = path.join(root, `scripts/voucher-reference-${group}.mjs`);
  if (fs.existsSync(file))
    referenceTransforms.push((await import(pathToFileURL(file).href)).default);
}
const escapeHtml = (value) =>
  value
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
const plainText = (value) =>
  value
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]*>/g, "")
    .replaceAll("&amp;", "&")
    .replaceAll("&quot;", '"')
    .replaceAll("&#39;", "'")
    .replaceAll("&nbsp;", " ")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">");

const keyedElement = () => /<(div|span)(\b[^>]*\bdata-key="([^"]+)"[^>]*)>([\s\S]*?)<\/\1>/g;
const previousDefaults = new Map();
const generatedPath = path.join(root, "public/voucher-templates.html");
if (fs.existsSync(generatedPath)) {
  for (const [, , attributes, key, body] of fs
    .readFileSync(generatedPath, "utf8")
    .matchAll(keyedElement())) {
    const historyAttribute = attributes.match(/\bdata-source-history="([^"]*)"/)?.[1];
    const history = historyAttribute ? JSON.parse(plainText(historyAttribute)) : [];
    previousDefaults.set(key, { text: plainText(body), history });
  }
}

function finishPrintedText(markup) {
  return markup.replace(keyedElement(), (_element, tag, attributes, key, body) => {
    // Normalize text nodes, retaining source line breaks and semantic spans.
    const normalized = body
      .split(/(<[^>]*>)/g)
      .map((part) => (part.startsWith("<") ? part : normalizePrintedText(part)))
      .join("");
    const text = plainText(normalized);
    const previous = previousDefaults.get(key);
    const history = [...new Set(previous?.history || [])];
    if (text.trim() && previous?.text.trim() && !printedDefaultMatches(text, [previous.text]))
      history.push(previous.text);
    const known = [...new Set(history)].filter(
      (old) => old.trim() && !printedDefaultMatches(text, [old]),
    );
    const cleanAttributes = attributes.replace(/\sdata-source-history="[^"]*"/g, "");
    const metadata =
      text.trim() && known.length
        ? ` data-source-history="${escapeHtml(JSON.stringify(known))}"`
        : "";
    return `<${tag}${cleanAttributes}${metadata}>${normalized}</${tag}>`;
  });
}

function correctReferenceText(markup) {
  return markup.replace(
    /<(div|span)(\b[^>]*\bdata-key="([^"]+)"[^>]*)>([\s\S]*?)<\/\1>/g,
    (element, tag, attributes, key, body) => {
      if (!Object.hasOwn(referenceText, key)) return element;
      correctedKeys.add(key);
      const previous = plainText(body);
      const text = escapeHtml(referenceText[key]).replaceAll("\n", "<br>");
      const content = body.includes('class="fit-text"')
        ? `<span class="fit-text">${text}</span>`
        : text;
      return `<${tag}${attributes} data-source-previous="${escapeHtml(previous)}" data-reference-corrected="true">${content}</${tag}>`;
    },
  );
}

// Single-copy bounds in the untransformed 1000 px design grid. Unlike the
// retired builder's generic crop boxes, these include the entire printed
// header, table, serial number, signatures, and blank letterhead body.
const crops = {
  1: [274, 20, 695, 1095],
  2: [0, 65, 660, 1330],
  3: [27.5, 95, 481, 1287],
  4: [90, 28, 820, 638],
  5: [20, 0, 550, 1110],
  6: [40, 135, 880, 1260],
  7: [30, 18, 625, 975],
  8: [15, 0, 445, 707],
  9: [47, 18, 361, 670],
  11: [200, 20, 610, 1330],
  12: [0, 45, 660, 1350],
  13: [15, 70, 360, 637],
  14: [15, 0, 470, 707],
  16: [115, 35, 785, 1210],
  17: [101, 44, 370, 620],
  18: [0, 30, 900, 1365],
  19: [30, 35, 633, 1020],
  20: [25, 10, 633, 1025],
  21: [29, 29, 632, 974],
  23: [25, 0, 395, 690],
  24: [195, 0, 805, 610],
  26: [0, 0, 490, 707],
  27: [0, 0, 435, 707],
  30: [0, 0, 470, 1230],
};

function splitSelectors(value) {
  const result = [];
  let depth = 0;
  let quote = "";
  let start = 0;
  for (let index = 0; index < value.length; index += 1) {
    const character = value[index];
    if (quote) {
      if (character === quote && value[index - 1] !== "\\") quote = "";
    } else if (character === '"' || character === "'") quote = character;
    else if (character === "(" || character === "[") depth += 1;
    else if (character === ")" || character === "]") depth -= 1;
    else if (character === "," && depth === 0) {
      result.push(value.slice(start, index).trim());
      start = index + 1;
    }
  }
  result.push(value.slice(start).trim());
  return result;
}

const studioSelectors =
  /(?:^|[\s>+~])(?:html|body)(?:$|[\s:])|\.(?:controls|pages|sheet|editing-help|one-page|portrait|r90|r270|unique-count)(?:\b|[\s.#:])/;
function scopeSelector(input) {
  let selector = input;
  // Every printed heading is editable in the current studio.
  selector = selector.replace(/body\.edit-headings\s+/g, "");
  if (!selector || studioSelectors.test(selector)) return "";
  selector = selector.replace(/#(page-\d+)/g, ":is(#$1,[data-template-page='$1'])");
  if (selector.startsWith(":is(#page-")) return `.voucher-native${selector}`;
  // Studio placements carry the paper-colour class on the artwork root.
  // Retain support for descendants too, for independently embedded templates.
  if (selector.startsWith(".soft-blue ")) {
    return `.voucher-native.soft-blue ${selector.slice(11)},.voucher-native ${selector}`;
  }
  return `.voucher-native ${selector}`;
}

function scopeStyles(css) {
  const cleaned = css.replace(/\/\*[\s\S]*?\*\//g, "");
  let result = "";
  let start = 0;
  let quote = "";
  let parentheses = 0;
  for (let index = 0; index < cleaned.length; index += 1) {
    const character = cleaned[index];
    if (quote) {
      if (character === quote && cleaned[index - 1] !== "\\") quote = "";
      continue;
    }
    if (character === '"' || character === "'") {
      quote = character;
      continue;
    }
    if (character === "(") parentheses += 1;
    else if (character === ")") parentheses -= 1;
    if (character !== "{" || parentheses) continue;
    const selector = cleaned.slice(start, index).trim();
    let end = index + 1;
    let depth = 1;
    let bodyQuote = "";
    for (; end < cleaned.length && depth; end += 1) {
      const next = cleaned[end];
      if (bodyQuote) {
        if (next === bodyQuote && cleaned[end - 1] !== "\\") bodyQuote = "";
      } else if (next === '"' || next === "'") bodyQuote = next;
      else if (next === "{") depth += 1;
      else if (next === "}") depth -= 1;
    }
    const body = cleaned.slice(index + 1, end - 1).trim();
    if (selector.startsWith("@font-face")) {
      // The Studio and voucher artwork share the local Kalpurush face.
      // Do not load the retired embedded Sans/Serif faces from this source.
    } else if (selector.startsWith("@media print")) {
      const inner = scopeStyles(body);
      if (inner.trim()) result += `${selector}{\n${inner}}\n`;
    } else if (!selector.startsWith("@")) {
      const scoped = splitSelectors(selector).map(scopeSelector).filter(Boolean);
      if (scoped.length) result += `${scoped.join(",")}{${body}}\n`;
    }
    index = end - 1;
    start = end;
  }
  return result;
}

let headingIndex = 0;
const keyOccurrences = new Map();
const sections = [...source.matchAll(/<section\b[^>]*>[\s\S]*?<\/section>/gi)].map((match) => {
  const page = Number(match[0].match(/data-page="(\d+)"/)[1]);
  let markup = match[0].replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, "");
  markup = markup.replace(
    /class="sheet\s+[^\"]*"/,
    (classes) => `class="voucher-native${classes.includes("soft-blue") ? " soft-blue" : ""}"`,
  );
  markup = markup.replace(
    "<section ",
    `<section data-template-page="page-${String(page).padStart(2, "0")}" `,
  );
  // Stable editable keys keep heading edits independent of the surrounding
  // layout and of the other copies on a sheet.
  markup = markup.replace(
    /<[a-z][^>]*\bclass="[^\"]*\b(?:editable|field)\b[^\"]*"[^>]*>/gi,
    (tag) => {
      if (/class="[^\"]*\bfieldline\b/.test(tag)) return tag;
      let output = tag;
      const baseKey = tag.match(/data-field="([^\"]+)"/)?.[1] || `p${page}.label.${headingIndex++}`;
      const occurrence = (keyOccurrences.get(baseKey) || 0) + 1;
      keyOccurrences.set(baseKey, occurrence);
      const key = occurrence === 1 ? baseKey : `${baseKey}.instance.${occurrence}`;
      output = output.replace(/\s(?:contenteditable|spellcheck)="[^\"]*"/g, "");
      output = output.replace(
        />$/,
        ` contenteditable="plaintext-only" data-key="${key}" spellcheck="false">`,
      );
      return output;
    },
  );
  // Source page 20 reads মাজেদা; the retired hand-authored label said মডেল.
  if (page === 20) markup = markup.replaceAll("মডেল", "মাজেদা");
  if (page === 4)
    markup = markup.replace(
      /(<div class=")([^"]+)("[^>]*>Phone :<\/div>)/g,
      "$1$2 mr-phone-label$3",
    );
  // Remove printed receipt identifiers only AFTER assigning every original
  // key, so saved edits in other labels keep pointing to the same content.
  markup = markup.replace(
    /<div\b(?=[^>]*\bclass="[^"]*\bfixed-serial\b)[^>]*>[\s\S]*?<\/div>/g,
    "",
  );
  if (page === 4)
    markup = markup.replace(
      /(<div\b[^>]*\bdata-field="p4\.memo"[^>]*)(>)1321(<\/div>)/g,
      '$1 data-source-number="1321"$2$3',
    );
  if (page === 27)
    markup = markup.replace(/(<div\b[^>]*)(>)1524(<\/div>)/g, '$1 data-source-number="1524"$2$3');
  if (page === 4) {
    // The source total box occupies only RATE + AMOUNT. Its words area is
    // open underneath the data grid, with no continued SL/description rules.
    markup = markup.replace(
      /(<div class="rule" style="left:(?:0|35|411)px;top:0px;width:1px;)height:366px/g,
      "$1height:332.5px",
    );
    markup = markup.replace(
      /class="rule" style="left:0px;top:365px;width:802px;height:1px"/g,
      'class="rule" style="left:524px;top:365px;width:278px;height:1px"',
    );
  }
  markup = correctReferenceText(markup);
  for (const transform of referenceTransforms) markup = transform(markup, page);
  markup = finishPrintedText(markup);
  return markup;
});
for (const key of Object.keys(referenceText))
  if (!correctedKeys.has(key))
    throw new Error(`Reference correction has no matching editable field: ${key}`);

// Keep only the artwork rules. The old builder styles and its universal font
// override are deliberately excluded so they cannot alter the studio toolbar.
let css = [styles[0], styles[2], ...styles.slice(4)].map(scopeStyles).join("\n");
css = css.replace(/\bBangla(?:Sans|Serif)\b/g, "Kalpurush");
css += `
/* A raw native canvas is scaled/rotated only by the studio's placement wrapper. */
.voucher-native{position:relative;font-family:Kalpurush,Arial,sans-serif;font-size:16px;line-height:1.15;color:#171717;background:#fff;isolation:isolate}
.voucher-native,.voucher-native *{box-sizing:border-box}
.voucher-native .canvas{position:absolute;left:0;top:0;width:1000px;height:var(--height);transform:none;transform-origin:0 0;background:#fff;overflow:visible}
.voucher-native [contenteditable]{cursor:text;user-select:text;-webkit-user-select:text}
.voucher-native [contenteditable]:focus{outline:1px dashed #239079;background:#dbfff044}
.voucher-native .logo-extracted{position:absolute;display:block;object-fit:contain;pointer-events:none;background:transparent}
.voucher-native .fieldline .tag{white-space:nowrap;font-size:min(var(--fs),calc(var(--tag)*.27));line-height:1.1;display:flex;align-items:center}
/* The original form has blue rules with pale writable fields, not filled blue boxes. */
.voucher-native:is(#page-01,[data-template-page='page-01']) .fieldline{background:#e8edf8!important}
.voucher-native:is(#page-01,[data-template-page='page-01']) .table-block.light-head .th{background:#f4f7ff!important;color:#213d8f!important}
.voucher-native:is(#page-01,[data-template-page='page-01']) .afida .pill:not(.line){color:#fff!important;border-radius:12px}
/* Match the MR title's narrower central wordmark between the logo and memo. */
.voucher-native:is(#page-04,[data-template-page='page-04']) .mr>.piece.latin.heavy{left:148px;width:205px;color:#800b08;font-size:22px}
.voucher-native:is(#page-04,[data-template-page='page-04']) .mr .mr-contact{left:78px;width:338px;font-size:8.6px;white-space:nowrap}
.voucher-native:is(#page-04,[data-template-page='page-04']) .mr .mr-detail{left:60px;width:358px;font-size:8.4px;white-space:nowrap}
.voucher-native:is(#page-04,[data-template-page='page-04']) .mr-phone-label{font-size:12px}
/* National's printed type is narrower and lighter than the old stretched bold label. */
.voucher-native:is(#page-06,[data-template-page='page-06']) .national .headline{left:90px;width:350px;font-family:Kalpurush,Arial,sans-serif;font-size:40px!important;font-weight:650}
.voucher-native:is(#page-06,[data-template-page='page-06']) .national .pill{left:102px;width:300px;font-weight:800;color:#07814a!important;-webkit-text-stroke:1px #fff;paint-order:stroke fill;text-shadow:1px 0 #fff,-1px 0 #fff,0 1px #fff,0 -1px #fff}
.voucher-native:is(#page-06,[data-template-page='page-06']) .national>.piece:nth-child(5){left:50px;width:400px;font-size:20px;font-weight:650}
.voucher-native:is(#page-06,[data-template-page='page-06']) .national>.piece:nth-child(6){left:30px;width:430px;font-size:18px;font-weight:600;font-style:italic}
.voucher-native:is(#page-06,[data-template-page='page-06']) .national>.piece:nth-child(7){font-size:22px;font-weight:650;font-style:italic}
.voucher-native:is(#page-06,[data-template-page='page-06']) .canvas>.piece.pill.line{height:49px;color:#fff!important;padding:5px 8px;border-width:1.5px;border-radius:40px;background:linear-gradient(90deg,#099765 0 36%,#fff 36% 100%)}
/* The Alif reference prints white type on a green header. Place its text in
   the calibrated header band so it cannot overlap the first writable row. */
.voucher-native:is(#page-24,[data-template-page='page-24']) .header-group.alif{left:195px!important;top:0!important;width:805px!important;height:145px!important;transform:none!important;--ink:#fff}
.voucher-native:is(#page-24,[data-template-page='page-24']) .alif>.piece{color:#fff!important;line-height:1.05;white-space:nowrap}
.voucher-native:is(#page-24,[data-template-page='page-24']) .alif>.piece:nth-child(1){left:314px;top:20px;width:90px;height:18px;color:#117352!important;background:#fff;font-size:14px;padding:1px 3px}
.voucher-native:is(#page-24,[data-template-page='page-24']) .alif .headline{left:118px;top:40px;width:480px;height:48px;color:#fff!important;font-size:38px!important;font-weight:750}
.voucher-native:is(#page-24,[data-template-page='page-24']) .alif>.piece:nth-child(3){left:172px;top:91px;width:395px;height:18px;font-size:14px}
.voucher-native:is(#page-24,[data-template-page='page-24']) .alif>.piece:nth-child(4){left:172px;top:108px;width:395px;height:18px;font-size:14px}
.voucher-native:is(#page-24,[data-template-page='page-24']) .alif>.piece:nth-child(5){left:172px;top:126px;width:395px;height:20px;font-size:16px}
.voucher-native:is(#page-24,[data-template-page='page-24']) .alif>.piece:nth-child(6){left:608px;top:68px;width:185px;height:20px;font-size:15px}
.voucher-native:is(#page-24,[data-template-page='page-24']) .alif>.logo{left:633px!important;top:92px!important;width:34px!important;height:33px!important;color:#fff}
.voucher-native:is(#page-24,[data-template-page='page-24']) .alif>.piece:nth-child(8){left:672px;top:91px;width:125px;height:42px;font-size:16px;line-height:1.1}
.voucher-native:is(#page-24,[data-template-page='page-24']) .alif>.piece:nth-child(9){left:614px;top:130px;width:174px;height:15px;font-size:11.5px}
/* Rangdhanu's angled navy/cyan print decoration is native CSS geometry. */
.voucher-native:is(#page-27,[data-template-page='page-27']) .rangdhanu .rainbow-accent{left:0!important;top:0!important;width:125px!important;height:205px!important;background:linear-gradient(115deg,#1da8ea,#78ddf0)!important;clip-path:polygon(0 0,100% 0,22% 100%,0 100%)}
.voucher-native:is(#page-27,[data-template-page='page-27']) .rangdhanu>.rainbow-panel:nth-child(2){left:0!important;top:26px!important;width:272px!important;height:91px!important;background:linear-gradient(130deg,#0737e8,#082eb7)!important;clip-path:polygon(0 0,100% 10%,87% 100%,0 100%)}
.voucher-native:is(#page-27,[data-template-page='page-27']) .rangdhanu>.rainbow-panel:nth-child(3){left:0!important;top:0!important;width:95px!important;height:177px!important;background:linear-gradient(115deg,#0b4bdc,#0519ad)!important;clip-path:polygon(0 0,83% 0,22% 100%,0 100%)}
.voucher-native:is(#page-27,[data-template-page='page-27']) .rangdhanu::before{content:'';position:absolute;left:0;top:116px;width:112px;height:62px;background:linear-gradient(115deg,#124fe5 0 34%,#155cec 34% 65%,#0825c3 65%);clip-path:polygon(30% 0,100% 0,82% 100%,0 100%);pointer-events:none}
.voucher-native:is(#page-27,[data-template-page='page-27']) .rangdhanu>.piece{z-index:1}
.voucher-native:is(#page-27,[data-template-page='page-27']) .rangdhanu>.piece:nth-child(4){left:185px;width:110px;font-size:18px;font-style:italic}
.voucher-native:is(#page-27,[data-template-page='page-27']) .rangdhanu .headline{left:70px;top:33px;width:175px;height:66px;font-size:55px!important;color:#fff!important}
.voucher-native:is(#page-27,[data-template-page='page-27']) .rangdhanu>.piece:nth-child(6){left:117px;top:93px;width:100px;height:25px;font-size:22px;color:#fff!important}
.voucher-native:is(#page-27,[data-template-page='page-27']) .rangdhanu>.piece:nth-child(7){left:115px;top:120px;width:155px;height:35px;font-size:28px;background:transparent;letter-spacing:4px}
.voucher-native:is(#page-27,[data-template-page='page-27']) .rangdhanu>.piece:nth-child(8){left:35px;top:155px;width:70px;height:18px;font-size:12px;color:#fff!important}
.voucher-native:is(#page-27,[data-template-page='page-27']) .rangdhanu>.piece:nth-child(9){left:120px;top:156px;width:75px;height:30px;font-size:24px}
@media print{.voucher-native [contenteditable]{outline:none!important}.voucher-native,.voucher-native *{-webkit-print-color-adjust:exact;print-color-adjust:exact}}
`;

// Hover feedback must not replace a voucher object's actual paint in the design inspector.
css = css.replace(/background:\s*#b8efe12b;?/gi, "");
css = `@font-face{font-family:Kalpurush;src:url('/fonts/kalpurush.woff2') format('woff2');font-weight:400;font-style:normal;font-display:swap}\n${css}`;
css += `
/* One readable font throughout the native voucher, including pasted input. */
.voucher-native,.voucher-native *{font-family:Kalpurush,Arial,sans-serif!important;-webkit-text-stroke:0!important;text-shadow:none!important}
.voucher-native .piece,.voucher-native .field,.voucher-native .cell-label{font-weight:400!important}
.voucher-native .headline,.voucher-native .bold,.voucher-native .heavy,.voucher-native .th,.voucher-native .tag{font-weight:700!important}
.voucher-native .headline{letter-spacing:normal!important;line-height:1.2}
.voucher-native .field{line-height:1.2}
.voucher-native .table-block .field,.voucher-native .table-block .cell-label{padding-top:0;padding-bottom:0;line-height:1.05}
/* Keep the printed grid above writable fills, with the reversed header on top.
   Borders must never intercept clicks intended for an editable cell. */
.voucher-native .table-block>.rule{z-index:2;pointer-events:none}
.voucher-native .table-block>.th{z-index:3}
`;
css = css.replace(
  /font-weight:\s*(\d+)/g,
  (_declaration, weight) => `font-weight:${Number(weight) < 500 ? 400 : 700}`,
);
const colorOverrides = path.join(root, "scripts/voucher-color-overrides.css");
if (fs.existsSync(colorOverrides)) css += `\n${fs.readFileSync(colorOverrides, "utf8")}\n`;
css += `\n${fs.readFileSync(path.join(root, "scripts/voucher-text-layout.css"), "utf8")}\n`;
for (const group of [...referenceGroups, "structure"])
  if (fs.existsSync(path.join(root, `scripts/voucher-reference-${group}.css`)))
    css += `\n${fs.readFileSync(path.join(root, `scripts/voucher-reference-${group}.css`), "utf8")}\n`;

const layouts = templateData.map((template) => {
  const [x, y, w, h] = crops[template.id];
  return {
    id: template.id,
    name: template.name.replaceAll("মডেল", "মাজেদা"),
    pageId: template.pageId,
    crop: { x, y, w, h },
    sourceWidth: template.sourceWidth,
    sourceHeight: template.sourceHeight,
  };
});

if (sections.length !== 24 || layouts.length !== 24)
  throw new Error("The source must contain all 24 distinct native designs.");
const editableKeys = sections.flatMap((section) =>
  [...section.matchAll(/\bdata-key="([^"]+)"/g)].map((match) => match[1]),
);
if (new Set(editableKeys).size !== editableKeys.length)
  throw new Error(
    "Every editable field, including reference corrections, needs a unique stable key.",
  );
if (
  sections.some((section) => /<img\b|<svg\b|<canvas\b|data:image|background-image/i.test(section))
) {
  throw new Error("Native voucher bodies must not contain full artwork raster assets.");
}

fs.writeFileSync(
  path.join(root, "public/voucher-templates.html"),
  `<!-- Generated by scripts/build-voucher-html.mjs; editable HTML artwork, no raster voucher images. -->\n<div id="template-library">\n${sections.join("\n")}\n</div>\n`,
);
fs.writeFileSync(
  path.join(root, "public/voucher-templates.css"),
  `/* Generated by scripts/build-voucher-html.mjs. All artwork selectors are scoped to .voucher-native. */\n${css}`,
);
fs.writeFileSync(
  path.join(root, "public/voucher-native-layouts.json"),
  `${JSON.stringify(layouts, null, 2)}\n`,
);
console.log(
  `Created ${sections.length} editable HTML/CSS templates and ${layouts.length} calibrated layouts.`,
);
