import { atomWithStorage } from "jotai/utils";

export const DEFAULT_SHEET_ID = "12jwGEEMkGD30FGppS9giFt5H6jb9kAaPJugnCyJYwBw";
export const DEFAULT_SCRIPT_URL =
  "https://script.google.com/macros/s/AKfycbx5QfSPC4oYlrc_1ykHESKc1sW2Y32jvMUugN3pFMw_D0GAPBOUpD90DlFiKixxkKy-/exec";

export function getSheetId(): string {
  const envVal = (import.meta.env["VITE_SHEET_ID"] as string | undefined)?.trim();
  return envVal || DEFAULT_SHEET_ID;
}

export function getScriptUrl(): string {
  const envVal = (import.meta.env["VITE_SCRIPT_URL"] as string | undefined)?.trim();
  return envVal || DEFAULT_SCRIPT_URL;
}

export type OrgInfo = {
  dept: string;
  college: string;
  phone: string;
  email: string;
  web: string;
};

export const DEFAULT_ORG_INFO: OrgInfo = {
  dept: "ভূগোল ও পরিবেশ বিভাগ",
  college: "কুমুদিনী সরকারি কলেজ, টাঙ্গাইল",
  phone: "+৮৮০২৯৯৭৭৫২৬০৯",
  email: "geography32.kgc@gmail.com",
  web: "www.kgc.ac.bd",
};

export const orgInfoAtom = atomWithStorage<OrgInfo>("kgc-org-info", DEFAULT_ORG_INFO);

export function parseOrgSettings(rows: string[][]): Partial<OrgInfo> {
  const result: Partial<OrgInfo> = {};
  if (!rows || rows.length === 0) return result;

  const normalizeKey = (k?: string) =>
    (k || "")
      .toLowerCase()
      .normalize("NFC")
      .replace(/\s+/g, "")
      .replace(/[:：_-]/g, "");

  // Option 1: Header row with column headers
  const row0 = rows[0];
  const row1 = rows[1];
  if (row0 && row1) {
    const headers = row0.map((h) => normalizeKey(h));
    headers.forEach((h, idx) => {
      const val = row1[idx]?.trim();
      if (!val) return;
      if (h.includes("dept") || h.includes("department") || h.includes("বিভাগ")) {
        result.dept = val;
      } else if (
        h.includes("college") ||
        h.includes("institution") ||
        h.includes("কলেজ") ||
        h.includes("প্রতিষ্ঠান")
      ) {
        result.college = val;
      } else if (
        h.includes("mobile") ||
        h.includes("phone") ||
        h.includes("মোবাইল") ||
        h.includes("ফোন") ||
        h.includes("যোগাযোগ")
      ) {
        result.phone = val;
      } else if (
        h.includes("email") ||
        h.includes("mail") ||
        h.includes("ইমেইল") ||
        h.includes("ই-মেইল")
      ) {
        result.email = val;
      } else if (
        h.includes("web") ||
        h.includes("url") ||
        h.includes("ওয়েব") ||
        h.includes("ওয়েব")
      ) {
        result.web = val;
      }
    });
  }

  // Option 2: Key-value rows (e.g. Column A is Key, Column B is Value)
  for (const row of rows) {
    if (!row || row.length < 2) continue;
    const key = normalizeKey(row[0]);
    const val = (row[1] || "").trim();
    if (!val) continue;

    if (key.includes("dept") || key.includes("department") || key.includes("বিভাগ")) {
      result.dept = val;
    } else if (
      key.includes("college") ||
      key.includes("institution") ||
      key.includes("কলেজ") ||
      key.includes("প্রতিষ্ঠান")
    ) {
      result.college = val;
    } else if (
      key.includes("mobile") ||
      key.includes("phone") ||
      key.includes("মোবাইল") ||
      key.includes("ফোন") ||
      key.includes("যোগাযোগ")
    ) {
      result.phone = val;
    } else if (
      key.includes("email") ||
      key.includes("mail") ||
      key.includes("ইমেইল") ||
      key.includes("ই-মেইল")
    ) {
      result.email = val;
    } else if (
      key.includes("web") ||
      key.includes("url") ||
      key.includes("ওয়েব") ||
      key.includes("ওয়েব")
    ) {
      result.web = val;
    }
  }

  return result;
}
