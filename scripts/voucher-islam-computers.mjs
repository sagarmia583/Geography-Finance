// A native, editable reconstruction of the supplied Islam Computers invoice.
// The single isolated IC emblem is the only image used by this design.
const width = 1000;
const height = (width * 8.5) / 5.6;
const ruleWeight = 1.6;
const scope = '.voucher-native:is(#page-31,[data-template-page="page-31"])';
const escape = (value) =>
  String(value)
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
const rect = (x, y, w, h) => `--x:${x}px;--y:${y}px;--w:${w}px;--h:${h}px`;
const label = (key, text, x, y, w, h, size, classes = "", extra = "") =>
  `<div class="piece editable ${classes}" data-edit="1" data-key="p31.label.${key}" contenteditable="plaintext-only" spellcheck="false" style="${rect(x, y, w, h)};--fs:${size}px;${extra}">${escape(text)}</div>`;
const field = (key, x, y, w, h, classes = "", size = 20) =>
  `<div class="field ${classes}" data-field="p31.copy0.${key}" data-key="p31.copy0.${key}" contenteditable="plaintext-only" spellcheck="false" aria-label="${escape(key.replaceAll("-", " "))}" style="left:${x}px;top:${y}px;width:${w}px;height:${h}px;font-size:${size}px"></div>`;
const frame = (x, y, w, h, classes = "") =>
  `<div class="piece box islam-frame ${classes}" aria-hidden="true" style="${rect(x, y, w, h)}"></div>`;
const rule = (x, y, w, h = ruleWeight, classes = "") =>
  `<div class="rule ${classes}" aria-hidden="true" style="left:${x}px;top:${y}px;width:${w}px;height:${h}px"></div>`;

const columns = [
  { key: "serial", title: "SL NO.", left: 0, width: 73, size: 23 },
  { key: "description", title: "DESCRIPTION", left: 73, width: 517, size: 24 },
  { key: "quantity", title: "QTY", left: 590, width: 61, size: 23 },
  { key: "unit-price", title: "U. PRICE", left: 651, width: 118, size: 23 },
  { key: "amount", title: "AMOUNT", left: 769, width: 127, size: 23 },
];
const table = `<div class="table-block islam-table" style="left:54px;top:463px;width:896px;height:735px">
  <div class="islam-watermark native-watermark" aria-hidden="true"></div>
  ${rule(0, 0, 896)}${rule(0, 33.5, 896)}${rule(0, 735 - ruleWeight, 896)}
  ${[0, 73, 590, 651, 769, 896 - ruleWeight].map((x) => rule(x, 0, ruleWeight, 735)).join("")}
  ${columns.map((column) => `<div class="th editable" data-edit="1" data-key="p31.label.column-${column.key}" contenteditable="plaintext-only" spellcheck="false" style="left:${column.left + 1.2}px;top:1.2px;width:${column.width - 2.4}px;height:31.1px;font-size:${column.size}px">${column.title}</div>`).join("")}
  ${columns.map((column) => field(`items.${column.key}`, column.left + 2, 36, column.width - 4, 696, column.key === "description" ? "" : "amount")).join("")}
</div>`;

const html = `<section data-template-page="page-31" aria-label="ইসলাম কম্পিউটার্স" class="voucher-native" data-page="31" id="page-31"><div class="canvas" style="--height:${height}px;--ink:#153d87">
  <header class="header-group islam-header" style="left:0px;top:0px;width:1000px;height:225px">
    <div class="piece box islam-header-paint" aria-hidden="true" style="${rect(0, 0, 1000, 225)}"></div>
    <div class="piece box islam-angle islam-angle-one" aria-hidden="true" style="${rect(0, 0, 510, 225)}"></div>
    <div class="piece box islam-angle islam-angle-two" aria-hidden="true" style="${rect(105, 0, 280, 225)}"></div>
    <div class="piece box islam-angle islam-angle-three" aria-hidden="true" style="${rect(188, 0, 332, 225)}"></div>
    <div class="logo-islam-computers" aria-hidden="true" style="position:absolute;left:53px;top:69px;width:76px;height:87px"></div>
    ${label("brand", "ISLAM COMPUTERS", 140, 83, 478, 69, 50, "islam-brand heavy")}
    ${label("phone", "+88 01776-385225", 648, 54, 262, 35, 27, "right islam-contact")}
    ${label("email", "islamcomputerss@gmail.com", 637, 97, 273, 29, 20, "right islam-contact")}
    ${label("facebook", "facebook.com/islamcom007", 646, 138, 264, 29, 20, "right islam-contact")}
    ${label("website", "www.islamcomputers.com", 652, 179, 258, 29, 20, "right islam-contact")}
    <div class="islam-icon islam-phone" aria-hidden="true" style="left:919px;top:54px"></div>
    <div class="islam-icon islam-email" aria-hidden="true" style="left:919px;top:96px"></div>
    <div class="islam-icon islam-facebook" aria-hidden="true" style="left:919px;top:137px"></div>
    <div class="islam-icon islam-globe" aria-hidden="true" style="left:919px;top:178px"></div>
  </header>
  ${label("invoice", "INVOICE/BILL", 376, 239, 271, 43, 27, "islam-invoice bold center")}
  ${frame(54, 295, 594, 34)}${frame(656, 295, 294, 34)}
  ${label("bill-prefix", "Bill No. ICT-", 63, 297, 151, 29, 25, "islam-english")}
  ${field("bill-number", 214, 297, 431, 29)}
  ${label("date", "Date:", 665, 297, 65, 29, 25, "islam-english")}
  ${field("date", 732, 297, 215, 29)}
  ${frame(54, 347, 896, 103)}${rule(54, 379.5, 896)}${rule(644, 347, ruleWeight, 103)}
  ${label("name-address", "NAME AND ADDRESS", 56, 348, 586, 30, 25, "islam-english center")}
  ${label("special-note", "SPECIAL NOTE", 646, 348, 302, 30, 25, "islam-english center")}
  ${field("name-address", 57, 382, 584, 65)}${field("special-note", 647, 382, 300, 65)}
  ${table}
  ${frame(706, 1198, 244, 103, "islam-totals-frame")}
  ${rule(823, 1198, ruleWeight, 103)}${rule(706, 1232, 244)}${rule(706, 1266, 244)}
  ${label("total", "Total", 713, 1199, 108, 31, 22, "islam-english")}${field("total0", 826, 1200, 121, 29, "amount")}
  ${label("adjustment", "Add/less", 713, 1234, 108, 30, 22, "islam-english")}${field("total1", 826, 1234, 121, 29, "amount")}
  ${label("grand-total", "Grand Total", 713, 1268, 108, 30, 21, "islam-english")}${field("total2", 826, 1268, 121, 29, "amount")}
  ${label("words", "Taka in Words", 61, 1213, 117, 26, 19, "islam-english")}
  ${rule(180, 1227, 511, 0, "islam-dotted")}${field("words", 181, 1204, 510, 26)}
  ${rule(61, 1252, 630, 0, "islam-dotted")}${field("words-continuation", 62, 1230, 629, 25)}
  ${label("warranty", "** Warranty will be void if the product is physically damaged or stickers are removed.", 59, 1262, 632, 27, 18, "islam-english")}
  ${label("returns", "** Sold goods are not returnable.", 59, 1290, 632, 27, 19, "islam-english")}
  ${field("received-by", 62, 1346, 287, 48)}${field("authorized-by", 660, 1346, 287, 48)}
  ${frame(60, 1400, 292, 40)}${frame(657, 1400, 292, 40)}
  ${label("received-by", "RECEIVED BY", 62, 1402, 288, 35, 21, "islam-english center")}
  ${label("authorized-by", "FOR ISLAM COMPUTERS", 659, 1402, 288, 35, 21, "islam-english center")}
  <div class="piece box islam-footer-paint" aria-hidden="true" style="${rect(0, 1456, width, height - 1456)}"></div>
  ${label("address", "Head office: Souhardo Plaza, Club Road, Branch: Sawkat Ali Talukder (Capsule) Super Market, Victoria Road, Tangail.", 40, 1469, 920, 36, 17, "islam-english islam-footer center")}
</div></section>`;

const css = `
/* Islam Computers: the requested trim is 5.6 by 8.5 inches. */
${scope}{color:#153d87;--ink:#153d87;background:#fff}
${scope} .canvas{width:1000px;height:${height}px;overflow:hidden}
${scope} .islam-header{color:#072c79}
${scope} .islam-header-paint{border:0;background:linear-gradient(115deg,#8cbcf1 0%,#cee5fa 38%,#edf5fd 100%)}
${scope} .islam-angle{border:0;pointer-events:none}
${scope} .islam-angle-one{background:linear-gradient(135deg,#73a9ea88,#8abdf555);clip-path:polygon(0 0,30% 0,67% 100%,0 100%)}
${scope} .islam-angle-two{background:#377bd047;clip-path:polygon(0 0,24% 0,86% 100%,69% 100%)}
${scope} .islam-angle-three{background:#d4eaffb3;clip-path:polygon(0 0,12% 0,93% 100%,86% 100%)}
${scope} .logo-islam-computers .native-logo{display:block;width:100%;height:100%;object-fit:contain}
/* The reference is an English invoice. Only its printed English labels use
   Arial; blank customer/product fields retain the studio's Kalpurush font. */
${scope} :is(.islam-english,.islam-contact,.islam-invoice,.islam-table .th),
${scope} :is(.islam-english,.islam-contact,.islam-invoice,.islam-table .th) *{font-family:Arial,Helvetica,sans-serif!important;--source-line-ratio:1.15}
${scope} .islam-brand,${scope} .islam-brand *{font-family:'Arial Black',Arial,Helvetica,sans-serif!important;font-weight:900!important;letter-spacing:-1.9px!important;white-space:nowrap;--source-line-ratio:1.05}
${scope} .islam-brand{--source-text-width:470px;color:#092970}
${scope} .islam-invoice{border:0;border-radius:0 30px 30px 0;background:linear-gradient(90deg,#fff0,#d3dcf3 12%,#758fd0 72%,#496bb8);color:#11397f}
${scope} .islam-frame{border:${ruleWeight}px solid #153d87;background:transparent;pointer-events:none}
${scope} .rule{background:#153d87;pointer-events:none}
${scope} .islam-table .th{border:0!important;background:transparent!important;color:#153d87;font-weight:400!important;line-height:1.1}
${scope} .islam-table .field{z-index:1}
${scope} .islam-watermark{position:absolute;left:211px;top:151px;width:254px;height:316px;background:#9cbdf0;opacity:.53;mask-image:url('/voucher-assets/logos/islam-computers.png');-webkit-mask-image:url('/voucher-assets/logos/islam-computers.png');mask-size:contain;-webkit-mask-size:contain;mask-position:center;-webkit-mask-position:center;mask-repeat:no-repeat;-webkit-mask-repeat:no-repeat;pointer-events:none;z-index:0}
${scope} .islam-totals-frame{border-top:0}
${scope} .islam-dotted{height:0!important;background:transparent;border-bottom:1.3px dotted #153d87}
${scope} .islam-footer-paint{border:0;background:linear-gradient(90deg,#123e89,#14539e,#163c83)}
${scope} .islam-footer{color:#fff}
${scope} .islam-icon{position:absolute;width:31px;height:31px;border-radius:7px;background:#062e79;color:#fff;pointer-events:none}
${scope} .islam-phone::before{content:'';position:absolute;left:10px;top:6px;width:13px;height:19px;border-left:3.5px solid white;border-bottom:3.5px solid white;border-radius:6px 0 7px 9px;transform:rotate(-26deg)}
${scope} .islam-phone::after{content:'';position:absolute;left:8px;top:6px;width:5px;height:7px;border-radius:2px;background:white;transform:rotate(-25deg);box-shadow:5px 15px 0 white}
${scope} .islam-email::before{content:'';position:absolute;left:6px;top:9px;width:19px;height:13px;border:1.6px solid white;border-radius:1px}
${scope} .islam-email::after{content:'';position:absolute;left:10px;top:4px;width:11px;height:11px;border-right:1.6px solid white;border-bottom:1.6px solid white;transform:rotate(45deg)}
${scope} .islam-facebook::before{content:'f';position:absolute;left:11px;top:0;font-family:Arial,sans-serif!important;font-size:30px;font-weight:700}
${scope} .islam-globe::before{content:'';position:absolute;left:5px;top:5px;width:21px;height:21px;border:1.4px solid white;border-radius:50%;background:linear-gradient(transparent 45%,#fff 45% 51%,transparent 51%)}
${scope} .islam-globe::after{content:'';position:absolute;left:11px;top:5px;width:9px;height:21px;border:1.2px solid white;border-radius:50%}
`;

export const islamComputersTemplate = {
  id: 31,
  pageId: "page-31",
  name: "ইসলাম কম্পিউটার্স",
  sourceWidth: width,
  sourceHeight: height,
  crop: { x: 0, y: 0, w: width, h: height },
  html,
  css,
};
