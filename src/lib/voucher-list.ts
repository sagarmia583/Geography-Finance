import { normalizeVoucherId } from "./voucher-verification.ts";

export interface VoucherEntry {
  timestamp: string;
  voucherId: string;
  configName: string;
  examName: string;
  date: string;
  income?: number | undefined;
  expenses?: number | undefined;
  distributable?: number | undefined;
  fullState: string;
  isLocal: boolean;
}

function record(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

const text = (value: unknown): string => (typeof value === "string" ? value : "");
const amount = (value: unknown): number | undefined =>
  typeof value === "number" && Number.isFinite(value) ? value : undefined;

/** Invalid responses must never be turned into a successful empty list. */
export function parseSavedVouchersResponse(responseText: string): VoucherEntry[] {
  let result: unknown;
  try {
    result = JSON.parse(responseText);
  } catch {
    throw new Error("সার্ভার থেকে সঠিক ভাউচার তালিকা পাওয়া যায়নি। আগের তালিকা রাখা হয়েছে।");
  }
  if (!record(result) || result["success"] !== true || !Array.isArray(result["vouchers"])) {
    throw new Error(
      record(result) && typeof result["error"] === "string"
        ? result["error"]
        : "সার্ভার ভাউচার তালিকা নিশ্চিত করেনি। আগের তালিকা রাখা হয়েছে।",
    );
  }
  const entries = result["vouchers"].map((item: unknown): VoucherEntry => {
    if (!record(item) || !normalizeVoucherId(item["id"] || item["voucherId"])) {
      throw new Error("সার্ভারের ভাউচার তালিকা অসম্পূর্ণ। আগের তালিকা রাখা হয়েছে।");
    }
    const date = text(item["date"]);
    return {
      timestamp: date || text(item["timestamp"]),
      voucherId: text(item["id"]) || text(item["voucherId"]),
      configName: text(item["type"]) || text(item["configName"]),
      examName: text(item["examTitle"]) || text(item["examName"]),
      date,
      income: amount(item["income"]),
      expenses: amount(item["expenses"]),
      distributable: amount(item["distributable"]),
      fullState:
        typeof item["fullState"] === "string"
          ? item["fullState"]
          : JSON.stringify(item["fullState"] || {}),
      isLocal: false,
    };
  });
  return entries.sort(
    (left, right) => (Date.parse(right.timestamp) || 0) - (Date.parse(left.timestamp) || 0),
  );
}

/** Only the newest request can update the list; deleted records stay removed. */
export class VoucherListRequests {
  private version = 0;
  private deletedIds = new Set<string>();

  begin(): number {
    return ++this.version;
  }

  isCurrent(version: number): boolean {
    return version === this.version;
  }

  invalidate(): void {
    this.version++;
  }

  deleted(id: string): void {
    const normalizedId = normalizeVoucherId(id);
    if (normalizedId) this.deletedIds.add(normalizedId);
    this.invalidate();
  }

  keepCurrent(records: readonly VoucherEntry[]): VoucherEntry[] {
    return records.filter((item) => !this.deletedIds.has(normalizeVoucherId(item.voucherId)));
  }
}
