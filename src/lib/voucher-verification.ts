export type VerifiedVoucherRecord = Record<string, unknown>;

export type VoucherVerificationResult =
  | { status: "verified"; voucher: VerifiedVoucherRecord }
  | { status: "not_found" | "unavailable"; voucher: null };

export type VoucherVerificationState =
  VoucherVerificationResult | { status: "missing_id" | "loading"; voucher: null };

export function normalizeVoucherId(value: unknown): string {
  return typeof value === "string" ? value.trim().toUpperCase() : "";
}

export function voucherIdsMatch(left: unknown, right: unknown): boolean {
  const id = normalizeVoucherId(left);
  return id.length > 0 && id === normalizeVoucherId(right);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

/** A verification response belongs to one exact requested ID, never a suffix. */
export function validateVoucherVerification(
  requestedId: string,
  response: unknown,
): VoucherVerificationResult {
  if (!isRecord(response)) return { status: "unavailable", voucher: null };
  if (response["status"] === "not_found") return { status: "not_found", voucher: null };
  if (response["status"] !== "verified") return { status: "unavailable", voucher: null };
  const voucher = response["voucher"];
  if (!isRecord(voucher)) return { status: "unavailable", voucher: null };
  if (!voucherIdsMatch(requestedId, voucher["id"] || voucher["voucherId"])) {
    return { status: "not_found", voucher: null };
  }
  return { status: "verified", voucher };
}

/** Do not render the old voucher while a different URL ID is loading. */
export function currentVoucherVerification(
  requestedId: string,
  loaded: { requestedId: string } & VoucherVerificationState,
): VoucherVerificationState {
  if (!normalizeVoucherId(requestedId)) return { status: "missing_id", voucher: null };
  if (!voucherIdsMatch(requestedId, loaded.requestedId)) {
    return { status: "loading", voucher: null };
  }
  if (loaded.status === "missing_id" || loaded.status === "loading") {
    return { status: loaded.status, voucher: null };
  }
  return validateVoucherVerification(requestedId, loaded);
}

/** Only a saved snapshot for this remote record can supply an official copy. */
export function verifiedVoucherSnapshot(
  voucher: VerifiedVoucherRecord | null,
): Record<string, unknown> | null {
  if (!voucher) return null;
  let snapshot = voucher["fullState"];
  if (typeof snapshot === "string") {
    try {
      snapshot = JSON.parse(snapshot);
    } catch {
      return null;
    }
  }
  if (!isRecord(snapshot)) return null;
  if (!voucherIdsMatch(voucher["id"] || voucher["voucherId"], snapshot["id"])) return null;
  const arrays = ["qs", "admin", "duty", "percentRows", "earnings", "expenses"];
  if (!arrays.every((key) => Array.isArray(snapshot[key]) && snapshot[key].every(isRecord))) {
    return null;
  }
  if (typeof snapshot["examName"] !== "string" || typeof snapshot["date"] !== "string") {
    return null;
  }
  return snapshot;
}

export function verificationMessage(status: VoucherVerificationState["status"]): {
  title: string;
  detail: string;
} {
  switch (status) {
    case "verified":
      return {
        title: "সার্ভারে সংরক্ষিত ভাউচার পাওয়া গেছে",
        detail:
          "এই আইডির রেকর্ড সার্ভারের সঙ্গে মিলেছে। চালানের সত্যতা সরকারি পোর্টালে আলাদাভাবে যাচাই করুন।",
      };
    case "not_found":
      return {
        title: "ভাউচার পাওয়া যায়নি",
        detail: "এই সম্পূর্ণ আইডির কোনো সংরক্ষিত রেকর্ড পাওয়া যায়নি। আইডি বা QR লিংক পরীক্ষা করুন।",
      };
    case "unavailable":
      return {
        title: "এখন যাচাই করা যাচ্ছে না",
        detail:
          "সার্ভারের রেকর্ড যাচাই করা যায়নি। সংযোগ ঠিক হলে আবার চেষ্টা করুন। এই ভাউচারকে যাচাইকৃত ধরা হচ্ছে না।",
      };
    case "missing_id":
      return {
        title: "ভাউচার আইডি প্রয়োজন",
        detail: "ভাউচারের QR কোড স্ক্যান করুন অথবা সম্পূর্ণ আইডিসহ যাচাই লিংক খুলুন।",
      };
    case "loading":
      return {
        title: "ভাউচার যাচাই হচ্ছে…",
        detail: "সার্ভার থেকে এই আইডির রেকর্ড পরীক্ষা করা হচ্ছে।",
      };
  }
}
