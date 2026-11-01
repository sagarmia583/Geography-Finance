// Printed defaults share one spacing convention. User-entered text is never
// rewritten; the runtime only uses exact known defaults for safe migration.
export function normalizePrintedText(value) {
  return String(value)
    .normalize("NFC")
    .split(/\r?\n/)
    .map((line) =>
      line
        .replace(/[\t\u00a0\u2000-\u200a\u202f ]+/g, " ")
        .replace(/ +([:;,।!?])/g, "$1")
        .replace(/([:;,])(?=[^\s])/g, "$1 ")
        .trim(),
    )
    .join("\n");
}

export function printedDefaultMatches(value, defaults) {
  const comparable = (text) => String(text).normalize("NFC").replace(/\s+/g, " ").trim();
  const current = comparable(value);
  return defaults.some((previous) => comparable(previous) === current);
}
