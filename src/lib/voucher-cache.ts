import { normalizeVoucherId, voucherIdsMatch } from "./voucher-verification.ts";

type CacheStorage = Pick<Storage, "length" | "key" | "getItem" | "setItem" | "removeItem">;

function storedIdMatches(value: unknown, id: string): boolean {
  if (typeof value === "string") return voucherIdsMatch(value, id);
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const entry = value as Record<string, unknown>;
  return voucherIdsMatch(entry["id"] || entry["voucherId"], id);
}

/** Remove this exact voucher's cache variants, preserving every other voucher. */
export function purgeVoucherCaches<T>(
  id: string,
  memory: Map<string, T>,
  storages: readonly CacheStorage[],
): void {
  const normalizedId = normalizeVoucherId(id);
  if (!normalizedId) return;
  for (const key of memory.keys()) {
    if (voucherIdsMatch(key, normalizedId)) memory.delete(key);
  }

  for (const storage of storages) {
    try {
      for (let index = storage.length - 1; index >= 0; index--) {
        const key = storage.key(index);
        if (!key) continue;
        const lowerKey = key.toLowerCase();
        const voucherPrefix = ["kgc-temp-voucher:", "kgc-geo-voucher:"].find((prefix) =>
          lowerKey.startsWith(prefix),
        );
        if (voucherPrefix && voucherIdsMatch(key.slice(voucherPrefix.length), normalizedId)) {
          storage.removeItem(key);
          continue;
        }
        if (lowerKey.startsWith("kgc-geo-last:")) {
          const raw = storage.getItem(key);
          let value: unknown = raw;
          try {
            value = JSON.parse(raw || "null");
          } catch {
            // Older versions stored the last voucher ID as an unquoted string.
          }
          if (storedIdMatches(value, normalizedId)) storage.removeItem(key);
        } else if (lowerKey === "kgc-geo-voucher-index") {
          const raw = storage.getItem(key);
          try {
            const value: unknown = JSON.parse(raw || "null");
            if (Array.isArray(value)) {
              const remaining = value.filter((entry) => !storedIdMatches(entry, normalizedId));
              if (remaining.length !== value.length) {
                storage.setItem(key, JSON.stringify(remaining));
              }
            } else if (value && typeof value === "object") {
              const remaining = Object.fromEntries(
                Object.entries(value).filter(
                  ([entryId, entry]) =>
                    !voucherIdsMatch(entryId, normalizedId) &&
                    !storedIdMatches(entry, normalizedId),
                ),
              );
              if (Object.keys(remaining).length !== Object.keys(value).length) {
                storage.setItem(key, JSON.stringify(remaining));
              }
            }
          } catch {
            // A malformed legacy index is not used as authority for any record.
          }
        }
      }
    } catch {
      // A blocked storage backend must not prevent clearing the other backend.
    }
  }
}
