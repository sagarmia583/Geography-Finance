/* Additional source-faithful structure for pages 11–20. Stable original keys
   are never renumbered; newly inserted printed content has descriptive keys. */
const escape = (value) =>
  value
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const editable = (key, text, style, className = "") =>
  `<div class="piece editable ${className}" data-edit="1" data-key="${key}" contenteditable="plaintext-only" role="textbox" spellcheck="false" style="${style}">${escape(text).replaceAll("\n", "<br>")}</div>`;

function divEnd(markup, start, tagName = "div") {
  const tags = new RegExp(`<\\/?${tagName}\\b[^>]*>`, "gi");
  tags.lastIndex = start;
  let depth = 0;
  for (let match; (match = tags.exec(markup));) {
    depth += match[0].startsWith("</") ? -1 : 1;
    if (depth === 0) return { close: match.index, end: tags.lastIndex };
  }
  throw new Error("Unbalanced native voucher div");
}

function transformClass(markup, className, transform) {
  const openings = /<(div|header)\b[^>]*class="([^"]*)"[^>]*>/gi;
  const blocks = [];
  for (let match; (match = openings.exec(markup));) {
    if (!match[2].split(/\s+/).includes(className)) continue;
    const bounds = divEnd(markup, match.index, match[1]);
    blocks.push({ start: match.index, ...bounds });
    openings.lastIndex = bounds.end;
  }
  for (const block of blocks.reverse()) {
    markup =
      markup.slice(0, block.start) +
      transform(markup.slice(block.start, block.end)) +
      markup.slice(block.end);
  }
  return markup;
}

function appendToBlock(block, addition) {
  const closing = block.match(/<\/(?:div|header)>$/)?.[0];
  if (!closing) throw new Error("Missing native block closing tag");
  return block.slice(0, -closing.length) + addition + closing;
}

function takeKey(markup, key) {
  const pattern = new RegExp(`<div\\b[^>]*data-key="${escapeRegex(key)}"[^>]*>`, "g");
  const match = pattern.exec(markup);
  if (!match) throw new Error(`Missing native source field ${key}`);
  const bounds = divEnd(markup, match.index);
  return {
    element: markup.slice(match.index, bounds.end),
    markup: markup.slice(0, match.index) + markup.slice(bounds.end),
  };
}

function appendStyle(element, style) {
  return element.replace(
    /^(<div\b[^>]*\bstyle=")([^"]*)(")/,
    (_whole, before, previous, after) => `${before}${previous};${style}${after}`,
  );
}

function sourceColumnShading(block, moneyIndex = 3) {
  const headers = [...block.matchAll(/<div\b[^>]*class="th\b[^"]*"[^>]*style="([^"]*)"[^>]*>/g)];
  const tableHeight = Number(block.match(/^<div\b[^>]*style="[^"]*height:([\d.]+)px/)?.[1]);
  if (headers.length < 4 || !Number.isFinite(tableHeight)) return block;
  let shades = "";
  for (const index of [0, moneyIndex]) {
    const style = headers[index][1];
    const left = Number(style.match(/(?:^|;)left:([\d.]+)px/)?.[1]);
    const width = Number(style.match(/(?:^|;)width:([\d.]+)px/)?.[1]);
    const height = Number(style.match(/(?:^|;)height:([\d.]+)px/)?.[1]);
    if (![left, width, height].every(Number.isFinite)) continue;
    shades += `<div class="source-column-shade" aria-hidden="true" style="position:absolute;left:${left}px;top:${height}px;width:${width}px;height:${tableHeight - height}px;background:#f2f2f2"></div>`;
  }
  return block.replace(/^(<div\b[^>]*>)/, `$1${shades}`);
}

export default function correctReference11To20(markup, page) {
  if (page === 14) {
    // These captions sit at opposite ends of the same printed band. Use
    // layout instead of a run of spaces so normal word spacing is preserved.
    for (const key of ["p14.label.474", "p14.label.486"]) {
      const { element } = takeKey(markup, key);
      const split = element
        .replace(/class="([^"]*)"/, 'class="$1 source-signature-split"')
        .replace(
          />([\s\S]*)<\/div>$/,
          "><span>Received by</span> <span>For: Sotota Computers</span></div>",
        );
      markup = markup.replace(element, split);
    }
  }
  if (page === 16 || page === 19)
    markup = transformClass(markup, "table-block", (block) =>
      sourceColumnShading(block, page === 19 ? 4 : 3),
    );

  if (page === 17) {
    // Only the two empty outer frames. Editable date boxes and the table
    // borders remain intact, and existing field keys are preserved.
    markup = markup.replace(/<div class="piece box" style="[^"]*"><\/div>/g, "");
    markup = transformClass(markup, "sugandha", (block) => {
      const copy = block.includes('data-key="p17.label.512"') ? "copy0" : "copy1";
      const cells = Array.from({ length: 3 }, (_, index) => {
        const key = `p17.source.${copy}.date${index}`;
        return `<div class="field source-date-cell" data-field="${key}" data-key="${key}" contenteditable="plaintext-only" role="textbox" aria-label="তারিখ ${index + 1}" spellcheck="false" style="left:${358 + index * (142 / 3)}px;top:118px;width:${142 / 3}px;height:27px;font-size:19px"></div>`;
      }).join("");
      return appendToBlock(block, cells);
    });
    markup = transformClass(markup, "table-block", (block) => {
      const totalKey = block.includes('data-key="p17.label.547"')
        ? "p17.label.547"
        : "p17.label.579";
      const suffix = totalKey.endsWith("547") ? "copy0" : "copy1";
      const rowTop = suffix === "copy0" ? 362 : 361;
      const banner = editable(
        `p17.source.${suffix}.thanks`,
        "ধন্যবাদ আবার আসবেন",
        `left:0;top:${rowTop}px;width:204px;height:18px;--fs:13px`,
        "source-thanks-banner",
      );
      const totalBackground = `<div class="source-total-background" aria-hidden="true" style="position:absolute;left:204px;top:${rowTop}px;width:48px;height:18px;background:#555"></div>`;
      // Keep the source's editable total label above its reversed oval badge.
      const taken = takeKey(block, totalKey);
      const total = appendStyle(
        taken.element,
        `left:209px;top:${rowTop + 2}px;width:38px;height:14px;background:#fff;color:#555;border-radius:50%;text-align:center`,
      );
      return appendToBlock(taken.markup, banner + totalBackground + total);
    });
  }

  if (page === 19) {
    markup = transformClass(markup, "canvas", (block) =>
      appendToBlock(
        block,
        editable(
          "p19.source.thanksWatermark",
          "ধন্যবাদ আবার আসবেন",
          "left:140px;top:740px;width:290px;height:40px;--fs:25px;transform:rotate(-30deg);transform-origin:left center",
          "source-thanks-watermark",
        ),
      ),
    );
  }

  if (page === 20) {
    const owner = takeKey(markup, "p20.label.616").element;
    // Keep one editable value while restoring the original reversed label.
    markup = markup.replace(
      owner,
      owner.replace(/>(প্রোপ্রাইটর:)\s+/, '><span class="source-owner-prefix">$1</span> '),
    );
    const wordsLabel = takeKey(markup, "p20.label.646");
    const wordsInput = takeKey(wordsLabel.markup, "p20.copy0.words");
    markup = wordsInput.markup;
    markup = transformClass(markup, "table-block", (block) => {
      const label = appendStyle(wordsLabel.element, "left:10px;top:8px;width:70px;height:24px");
      const input = appendStyle(
        wordsInput.element,
        "left:78px;top:6px;width:310px;height:62px;line-height:32px;padding:0",
      );
      const merged = `<div class="source-words-merged" style="position:absolute;left:0;top:483px;width:400px;height:106px;background:#fff;border:1px solid var(--ink)">${label}${input}<div class="source-dotted-rule" style="left:12px;top:33px;width:375px"></div><div class="source-dotted-rule" style="left:12px;top:68px;width:375px"></div></div>`;
      return appendToBlock(block, merged);
    });
    markup = transformClass(markup, "model", (block) =>
      appendToBlock(
        block,
        editable(
          "p20.source.religiousNote",
          "আল্লাহ ব্যবসাকে করেছেন হালাল\nও সুদকে করেছেন হারাম।",
          "left:0;top:0;width:150px;height:36px;--fs:11px",
          "source-religious-note",
        ) +
          '<div class="logo logo-bkash" aria-label="bKash" style="left:390px;top:24px;width:46px;height:19px"></div>',
      ),
    );
    markup = transformClass(markup, "canvas", (block) =>
      appendToBlock(
        block,
        editable(
          "p20.source.returnCondition",
          "বি. দ্র.: বিক্রীত মাল ফেরত নেওয়া হয় না।",
          "left:185px;top:1007px;width:310px;height:25px;--fs:15px",
          "source-return-condition",
        ),
      ),
    );
  }
  return markup;
}
