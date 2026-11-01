import { DEFAULT_SCRIPT_URL, DEFAULT_SHEET_ID } from "./config";

export type SheetValues = string[][];
export type ScriptRecord = Record<string, unknown>;
const ALLOWED_SHEETS = new Set([
  "Settings",
  "Rates",
  "Products",
  "Percentages",
  "Teachers",
  "Sectors",
]);
const SCRIPT_ERROR_MESSAGES: Record<string, string> = {
  "API configuration is incomplete":
    "Apps Script-এর Project Settings → Script properties-এ APP_SECRET ও SPREADSHEET_ID নেই বা সঠিক নয়। .security/apps-script-properties.json থেকে দুটি মান বসিয়ে Save করুন।",
  Unauthorized:
    "Apps Script-এর APP_SECRET স্থানীয় GOOGLE_APPS_SCRIPT_SECRET-এর সঙ্গে মিলছে না। .security/apps-script-properties.json-এর APP_SECRET হুবহু Script properties-এ বসান।",
  "Spreadsheet is not allowed":
    "Apps Script-এর SPREADSHEET_ID ও ওয়েবসাইটের GOOGLE_SHEET_ID মিলছে না। .security/apps-script-properties.json-এর ID দিয়ে Script property ঠিক করুন।",
  "Unsupported action":
    "Apps Script-এর পুরোনো version চলছে। বর্তমান GoogleAppsScript_Code.js দিয়ে Manage deployments → Edit → New version → Deploy করুন।",
  "API operation failed":
    "Apps Script Sheet-এ কাজ করতে পারেনি। Editor থেকে testConnection চালিয়ে Sheet access ও authorization পরীক্ষা করুন।",
  "API is busy; retry shortly": "Apps Script-এ অন্য একটি কাজ চলছে। কিছুক্ষণ পরে আবার চেষ্টা করুন।",
};

function serverSheetConfig() {
  const secret = process.env["GOOGLE_APPS_SCRIPT_SECRET"]?.trim() || "";
  const sheetId =
    process.env["GOOGLE_SHEET_ID"]?.trim() ||
    process.env["VITE_SHEET_ID"]?.trim() ||
    DEFAULT_SHEET_ID;
  const scriptUrl =
    process.env["GOOGLE_SCRIPT_URL"]?.trim() ||
    process.env["VITE_SCRIPT_URL"]?.trim() ||
    DEFAULT_SCRIPT_URL;
  const url = new URL(scriptUrl);
  if (
    url.protocol !== "https:" ||
    url.hostname !== "script.google.com" ||
    !/^\/macros\/s\/[\w-]+\/exec$/.test(url.pathname) ||
    url.search ||
    url.hash ||
    url.username ||
    url.password
  ) {
    throw new Error("সার্ভারের Apps Script URL সঠিক নয়।");
  }
  if (secret.length < 32 || !/^[\w-]+$/.test(sheetId)) {
    throw new Error("সার্ভারের Google Sheet সংযোগ নিরাপদভাবে কনফিগার করা হয়নি।");
  }
  return { secret, sheetId, scriptUrl };
}

export function assertConfiguredSheet(id?: unknown) {
  if (id !== undefined && id !== serverSheetConfig().sheetId)
    throw new Error("এই স্প্রেডশীট ব্যবহারের অনুমতি নেই।");
}

export async function callSheetScript(
  action: string,
  data: ScriptRecord = {},
): Promise<ScriptRecord> {
  const config = serverSheetConfig();
  assertConfiguredSheet(data["id"]);
  assertConfiguredSheet(data["sheetId"]);
  const response = await fetch(config.scriptUrl, {
    method: "POST",
    headers: { "Content-Type": "text/plain;charset=utf-8" },
    body: JSON.stringify({ ...data, action, id: config.sheetId, secret: config.secret }),
    signal: AbortSignal.timeout(20000),
    cache: "no-store",
  });
  if (!response.ok) throw new Error("Google Sheet সার্ভারের সঙ্গে সংযোগ করা যায়নি।");
  let result: unknown;
  try {
    result = JSON.parse(await response.text());
  } catch {
    throw new Error("Apps Script থেকে সঠিক JSON পাওয়া যায়নি। নতুন নিরাপদ সংস্করণ deploy করুন।");
  }
  if (
    !result ||
    typeof result !== "object" ||
    Array.isArray(result) ||
    (result as ScriptRecord)["success"] !== true
  ) {
    const error =
      result && typeof result === "object" && !Array.isArray(result)
        ? (result as ScriptRecord)["error"]
        : null;
    const message =
      typeof error === "string" && Object.hasOwn(SCRIPT_ERROR_MESSAGES, error)
        ? SCRIPT_ERROR_MESSAGES[error]
        : undefined;
    // Only our known messages are safe to show; upstream text may contain secrets.
    throw new Error(
      message || "Apps Script অনুরোধ গ্রহণ করেনি। সার্ভারের secret ও deployment পরীক্ষা করুন।",
    );
  }
  return result as ScriptRecord;
}

function organizationRows(rows: string[][]): string[][] {
  const allowed =
    /^(dept|department|departmentname|college|collegename|institution|institutionname|mobile|phone|telephone|contact|email|mail|web|website|url|বিভাগ|বিভাগেরনাম|কলেজ|কলেজেরনাম|প্রতিষ্ঠান|প্রতিষ্ঠানেরনাম|মোবাইল|ফোন|যোগাযোগ|ইমেইল|ইমেল|ইমেইলঠিকানা|ওয়েব|ওয়েব|ওয়েবসাইট|ওয়েবসাইট)$/;
  const key = (value: string) =>
    value
      .toLowerCase()
      .normalize("NFC")
      .replace(/[\s:：_-]/g, "");
  const headers = rows[0] || [];
  if (headers.filter((header) => allowed.test(key(header))).length >= 2 && rows[1]) {
    return headers.flatMap((header, index) =>
      allowed.test(key(header)) ? [[header, rows[1]?.[index] || ""]] : [],
    );
  }
  return rows.filter((row) => allowed.test(key(row[0] || ""))).map((row) => row.slice(0, 2));
}

export async function fetchSheetValues(
  spreadsheetId: string,
  range: string,
  sheetName?: string,
): Promise<SheetValues> {
  assertConfiguredSheet(spreadsheetId);
  const [rangeSheet, cellRange] = range.split("!");
  const name = sheetName || rangeSheet;
  if (
    !name ||
    !ALLOWED_SHEETS.has(name) ||
    rangeSheet !== name ||
    !cellRange ||
    !/^[A-Z]{1,2}\d*(?::[A-Z]{1,2}\d*)?$/.test(cellRange)
  ) {
    throw new Error("এই শীট বা রেঞ্জ পড়ার অনুমতি নেই।");
  }
  const result = await callSheetScript("readSheet", { range, sheetName: name });
  const values = result["values"];
  if (!Array.isArray(values) || values.some((row) => !Array.isArray(row)))
    throw new Error("শীটের তথ্যের বিন্যাস সঠিক নয়।");
  const rows = values.map((row: unknown[]) => row.map((cell) => String(cell ?? "")));
  return name === "Settings" ? organizationRows(rows) : rows;
}
