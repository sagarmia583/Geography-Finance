import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { privateResponse, requireSession } from "./auth.server";
import { callSheetScript, fetchSheetValues } from "./sheets.server";
import {
  normalizeVoucherId,
  voucherIdsMatch,
  validateVoucherVerification,
  type VoucherVerificationResult,
} from "./voucher-verification";

const readSheetRequest = createServerFn({ method: "POST" })
  .validator(
    z.object({
      spreadsheetId: z.string().min(1).max(200),
      range: z.string().min(1).max(100),
      sheetName: z.string().max(50).optional(),
    }),
  )
  .handler(async ({ data }) => {
    await requireSession();
    return { values: await fetchSheetValues(data.spreadsheetId, data.range, data.sheetName) };
  });

export const importSheetValues = (data: {
  spreadsheetId: string;
  range: string;
  sheetName?: string;
}) => readSheetRequest({ data });

// Compatibility inputs cannot select the URL or action used by the server.
const voucherInput = z.object({ scriptUrl: z.string().max(500), payload: z.record(z.unknown()) });
type VoucherInput = z.infer<typeof voucherInput>;

const saveRequest = createServerFn({ method: "POST" })
  .validator(voucherInput)
  .handler(async ({ data }) => {
    await requireSession();
    if (typeof data.payload["voucherId"] !== "string" || !data.payload["voucherId"].trim())
      throw new Error("ভাউচার আইডি দিন।");
    return { text: JSON.stringify(await callSheetScript("saveVoucher", data.payload)) };
  });

const listRequest = createServerFn({ method: "POST" })
  .validator(voucherInput)
  .handler(async ({ data }) => {
    await requireSession();
    const result = await callSheetScript("getVouchers", { id: data.payload["id"] });
    if (!Array.isArray(result["vouchers"])) throw new Error("ভাউচার তালিকার বিন্যাস সঠিক নয়।");
    return { text: JSON.stringify(result) };
  });

const deleteRequest = createServerFn({ method: "POST" })
  .validator(voucherInput)
  .handler(async ({ data }) => {
    await requireSession();
    if (typeof data.payload["voucherId"] !== "string" || !data.payload["voucherId"].trim())
      throw new Error("ভাউচার আইডি দিন।");
    return {
      text: JSON.stringify(
        await callSheetScript("deleteVoucher", {
          id: data.payload["id"],
          voucherId: data.payload["voucherId"],
        }),
      ),
    };
  });

export const saveVoucherToServer = (data: VoucherInput) => saveRequest({ data });
export const getVouchersFromServer = (data: VoucherInput) => listRequest({ data });
export const deleteVoucherFromServer = (data: VoucherInput) => deleteRequest({ data });

const verificationRequest = createServerFn({ method: "POST" })
  .validator(z.object({ voucherId: z.string().trim().min(1).max(200) }))
  .handler(
    async ({
      data,
    }): Promise<{
      status: "verified" | "not_found" | "unavailable";
      voucherJson: string | null;
    }> => {
      privateResponse();
      try {
        const result = await callSheetScript("verifyVoucher", {
          voucherId: normalizeVoucherId(data.voucherId),
        });
        const voucher = result["voucher"];
        if (voucher === null) return { status: "not_found", voucherJson: null };
        if (!voucher || typeof voucher !== "object" || Array.isArray(voucher))
          return { status: "unavailable", voucherJson: null };
        const record = voucher as Record<string, unknown>;
        if (!voucherIdsMatch(data.voucherId, record["id"] || record["voucherId"]))
          return { status: "not_found", voucherJson: null };
        return { status: "verified", voucherJson: JSON.stringify(record) };
      } catch {
        return { status: "unavailable", voucherJson: null };
      }
    },
  );

export const verifyVoucherFromServer = async (data: {
  voucherId: string;
}): Promise<VoucherVerificationResult> => {
  const result = await verificationRequest({ data });
  if (result.status !== "verified" || !result.voucherJson)
    return { status: result.status === "not_found" ? "not_found" : "unavailable", voucher: null };
  try {
    return validateVoucherVerification(data.voucherId, {
      status: "verified",
      voucher: JSON.parse(result.voucherJson),
    });
  } catch {
    return { status: "unavailable", voucher: null };
  }
};
