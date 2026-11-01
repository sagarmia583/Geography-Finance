// Structural differences verified against original PDF pages 21-30.
// Runs after the generator has assigned every legacy editable key.
const escape = (value) =>
  value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
const keyed = (key, classes, style, text) =>
  `<div class="piece ${classes} editable" data-key="${key}" contenteditable="plaintext-only" spellcheck="false" style="${style}">${escape(text)}</div>`;
const appendCanvas = (markup, addition) =>
  markup.replace(/<\/div>\s*<\/section>$/, `${addition}</div></section>`);

function removeKey(markup, key) {
  const safe = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return markup.replace(
    new RegExp(`<div\\b(?=[^>]*\\bdata-key="${safe}")[^>]*>[\\s\\S]*?<\\/div>`, "g"),
    "",
  );
}

export default function correctReferenceStructure(markup, page) {
  if (page === 21) {
    // No amount-in-words label is printed. Retain the empty editable field
    // so an existing user's saved writing remains available.
    markup = removeKey(markup, "p21.label.716");
  }
  if (page === 24) {
    // Keep the original white writing box while omitting the printed ৪/৯.
    markup = appendCanvas(
      markup,
      keyed(
        "p24.source.serialLabel",
        "source-alif-serial-label",
        "left:220px;top:126px;width:46px;height:16px;--fs:10px;white-space:nowrap",
        "ক্রমিক নং-",
      ) +
        '<div class="field source-alif-serial" data-key="p24.source.serial" data-field="p24.source.serial" contenteditable="plaintext-only" spellcheck="false" role="textbox" aria-label="ভাউচার নম্বর" style="left:267px;top:119px;width:84px;height:28px;font-size:14px;background:#fff;border:1px solid #117352"></div>',
    );
  }
  if (page === 27) {
    // The source total row crosses all seven columns, not just the last two.
    markup = markup.replace(
      "left:296px;top:412px;width:119px;height:1px",
      "left:0px;top:412px;width:415px;height:1px",
    );
    markup = markup.replace(
      "left:297px;top:412px;width:119px;height:1px",
      "left:0px;top:412px;width:416px;height:1px",
    );
    let addition = "";
    for (const [copy, left, width] of [
      [0, 10, 415],
      [1, 449, 416],
    ]) {
      addition += `<div class="source-rangdhanu-footer" style="left:${left + width - 95}px"></div>`;
      addition += `<div class="field source-rangdhanu-words" data-key="p27.source.copy${copy}.words" contenteditable="plaintext-only" spellcheck="false" style="left:${left + 65}px;top:657px;width:${width - 147}px;height:16px;font-size:10px;border-bottom:1px solid #0f61f4"></div>`;
      addition += keyed(
        `p27.source.copy${copy}.condition1`,
        "source-rangdhanu-condition",
        `--x:${left}px;--y:675px;--w:${width - 50}px;--h:13px;--fs:9px`,
        "▪ ডেলিভারি নেওয়ার সময় অবশ্যই মেমো সঙ্গে আনবেন।",
      );
      addition += keyed(
        `p27.source.copy${copy}.condition2`,
        "source-rangdhanu-condition",
        `--x:${left}px;--y:689px;--w:${width - 48}px;--h:13px;--fs:9px`,
        "▪ ৭ (সাত) দিনের বেশি হলে আপনার প্রিন্ট নষ্ট বা হারিয়ে গেলে কর্তৃপক্ষ দায়ী নয়।",
      );
    }
    markup = appendCanvas(markup, addition);
  }
  if (page === 30) {
    let addition = "";
    for (const [copy, left] of [
      [0, 118],
      [1, 638],
    ])
      addition += keyed(
        `p30.source.copy${copy}.returnPolicy`,
        "center source-champion-return-note",
        `--x:${left}px;--y:1190px;--w:225px;--h:24px;--fs:12px`,
        "বি. দ্র.: বিক্রিত মাল ফেরত নেওয়া হয় না।",
      );
    markup = appendCanvas(markup, addition);
  }
  return markup;
}
