// This postprocessor runs after original stable data-key assignment. It edits
// only structure corroborated by the reference PDF, without renumbering keys.
const attr = (tag, name) => tag.match(new RegExp(`\\b${name}="([^"]*)"`))?.[1] || "";
const escape = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
function changeStyle(tag, changes) {
  const styles = new Map(
    attr(tag, "style")
      .split(";")
      .filter(Boolean)
      .map((item) => {
        const colon = item.indexOf(":");
        return [item.slice(0, colon).trim(), item.slice(colon + 1).trim()];
      }),
  );
  Object.entries(changes).forEach(([key, value]) => styles.set(key, String(value)));
  const style = [...styles].map(([key, value]) => `${key}:${value}`).join(";");
  return /\bstyle="/.test(tag)
    ? tag.replace(/\bstyle="[^"]*"/, `style="${style}"`)
    : tag.replace(/>$/, ` style="${style}">`);
}
function editKey(markup, key, changes) {
  return markup.replace(new RegExp(`<[^/][^>]*\\bdata-key="${escape(key)}"[^>]*>`, "g"), (tag) =>
    changeStyle(tag, changes),
  );
}
function removeKey(markup, key) {
  return markup.replace(
    new RegExp(`<([a-z]+)\\b[^>]*\\bdata-key="${escape(key)}"[^>]*>[\\s\\S]*?<\\/\\1>`, "g"),
    "",
  );
}
function tables(markup, transform) {
  let output = "";
  let cursor = 0;
  const starts = /<div\b[^>]*class="[^"]*\btable-block\b[^"]*"[^>]*>/g;
  for (const start of markup.matchAll(starts)) {
    const tags = /<\/?div\b[^>]*>/g;
    tags.lastIndex = start.index;
    let depth = 0;
    let end = start.index;
    for (let next = tags.exec(markup); next; next = tags.exec(markup)) {
      depth += next[0].startsWith("</") ? -1 : 1;
      if (depth === 0) {
        end = tags.lastIndex;
        break;
      }
    }
    output += markup.slice(cursor, start.index) + transform(markup.slice(start.index, end));
    cursor = end;
  }
  return output + markup.slice(cursor);
}
function rules(markup, transform) {
  return markup.replace(/<div\b[^>]*class="rule"[^>]*>/g, (tag) => {
    const style = attr(tag, "style");
    const number = (property) =>
      Number(style.match(new RegExp(`(?:^|;)${property}:([\\d.]+)px`))?.[1]);
    return transform(tag, {
      x: number("left"),
      y: number("top"),
      w: number("width"),
      h: number("height"),
    });
  });
}
function writingRule(x, y, width) {
  return `<div class="source-writing-rule" style="left:${x}px;top:${y}px;width:${width}px"></div>`;
}
function appendCanvas(markup, addition) {
  return markup.replace(/<\/div><\/section>$/, `${addition}</div></section>`);
}

export default function referenceStructure(markup, page) {
  if (page === 3) {
    markup = removeKey(markup, "p3.label.72");
  }
  if (page === 5) {
    markup = markup.replace(/<div class="fieldline"[^>]*>[\s\S]*?<\/div><\/div>/g, (row) =>
      row.includes('data-key="p5.copy0.date"')
        ? row.replace('class="fieldline"', 'class="fieldline source-plain-date"')
        : row,
    );
  }
  if (page === 7) {
    markup = tables(markup, (table) =>
      rules(table, (tag, box) => {
        if (box.w === 1 && [0, 50].includes(box.x) && box.h === 590)
          return changeStyle(tag, { height: "555.5px" });
        if (box.x === 0 && box.y === 589 && box.w === 602)
          return changeStyle(tag, { left: "386px", width: "216px" });
        return tag;
      }),
    );
    markup = appendCanvas(markup, writingRule(136.32, 916, 487.62));
  }
  if (page === 8) {
    markup = markup.replace(
      /<header class="header-group barek"[^>]*>/g,
      '$&<div class="source-phone-icon" aria-hidden="true" style="position:absolute;left:290px;top:6px;width:24px;height:40px"></div>',
    );
    for (const key of ["p8.label.166", "p8.label.173"]) {
      // Bismillah belongs above the cash-memo pill, before the phone cluster.
      markup = editKey(markup, key, { "--x": "174px", "--w": "116px" });
    }
    // Anchor both phone lines beside the source handset. A wide right-aligned
    // label left a large gap and the short box made the text fitter shrink it.
    for (const key of ["p8.label.168", "p8.label.175"]) {
      markup = editKey(markup, key, {
        "--x": "318px",
        "--y": "6px",
        "--w": "146px",
        "--h": "42px",
        "--fs": "21px",
        "text-align": "left",
      });
    }
    markup = tables(markup, (table) => {
      const first = attr(table.match(/^<div[^>]*>/)[0], "style").includes("width:427px");
      const x = first ? 222 : 219;
      const quantityWidth = first ? 56 : 55;
      table = rules(table, (tag, box) => {
        if (box.w === 1 && [first ? 36 : 35, x].includes(box.x) && box.h === 390)
          return changeStyle(tag, { height: "363px" });
        // The words row is merged, but its top edge still closes the entire
        // body and both shaded columns, not just the total/amount cells.
        if (box.y === 363 && box.h === 1 && box.x === (first ? 278 : 274))
          return changeStyle(tag, { left: "0px", width: `${first ? 427 : 424}px` });
        return tag;
      });
      table = table.replace(/<div\b[^>]*class="piece brand-pink"[^>]*>/g, (tag) => {
        const pos = Number(attr(tag, "style").match(/--x:([\d.]+)px/)?.[1]);
        return pos === (first ? 343 : 339) ? changeStyle(tag, { "--h": "363px" }) : tag;
      });
      const shade = `<div class="source-quantity-shade" style="left:${x}px;top:27px;width:${quantityWidth}px;height:336px"></div>`;
      const stamp = `<div class="source-thankyou editable" data-edit="1" contenteditable="plaintext-only" spellcheck="false" data-key="p8.source.thankyou.${first ? 0 : 1}" style="left:47px;top:340px;width:165px;height:28px;font-size:17px">ধন্যবাদ আবার আসবেন</div>`;
      return table.replace(/^(<div[^>]*>)/, `$1${shade}`).replace(/<\/div>$/, `${stamp}</div>`);
    });
    for (const [copy, x, top, label] of [
      [0, 24, 235, "p8.label.190"],
      [1, 555, 248, "p8.label.204"],
    ]) {
      markup = editKey(markup, label, {
        "--x": `${x + 4}px`,
        "--y": `${top + 366}px`,
        "--h": "23px",
      });
      markup = editKey(markup, `p8.copy${copy}.words`, {
        left: `${x + 68.32}px`,
        top: `${top + 365}px`,
        width: "207px",
        height: "23px",
      });
      markup = appendCanvas(markup, writingRule(x + 68.32, top + 380, 207));
    }
  }
  if (page === 9) {
    markup = markup.replace(/<div class="logo"/g, '<div class="logo logo-mesbah"');
    markup = tables(markup, (table) => {
      table = rules(table, (tag, box) =>
        box.w === 1 && [18, 183].includes(box.x) && box.h === 433
          ? changeStyle(tag, { height: "406.5px" })
          : tag,
      );
      return table.replace(
        /^(<div[^>]*>)/,
        '$1<div class="source-words-shade" style="left:0;top:406.5px;width:319px;height:26.5px"></div>',
      );
    });
    for (const [copy, x, wordsKey] of [
      [0, 80, "p9.label.244"],
      [1, 564, "p9.label.273"],
    ]) {
      markup = editKey(markup, wordsKey, { "--x": `${x + 4}px`, "--y": "618.5px", "--h": "22px" });
      markup = editKey(markup, `p9.copy${copy}.words`, {
        left: `${x + 51.04}px`,
        top: "616.5px",
        width: "171px",
        height: "24px",
      });
      markup = editKey(markup, `p9.copy${copy}.ঠিকানা :`, { width: "105px" });
      markup = rules(markup, (tag, box) =>
        box.x === x + 73.37 && box.y === 207 ? changeStyle(tag, { width: "106.63px" }) : tag,
      );
      const phone = `<div class="piece editable" data-edit="1" contenteditable="plaintext-only" spellcheck="false" data-key="p9.source.mobile-label.${copy}" style="--x:${x + 184}px;--y:193px;--w:55px;--h:15px;--fs:11px">মোবাইল নং :</div><div class="field" role="textbox" contenteditable="plaintext-only" spellcheck="false" data-key="p9.source.mobile.${copy}" data-field="p9.source.mobile.${copy}" style="left:${x + 239}px;top:193px;width:80px;height:15px;font-size:12px"></div>`;
      markup = appendCanvas(
        markup,
        phone + writingRule(x + 239, 207, 80) + writingRule(x + 267.96, 163, 51.04),
      );
    }
  }
  return markup;
}
