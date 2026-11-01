import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useAtom } from "jotai";
import {
  orgInfoAtom,
  DEFAULT_ORG_INFO,
  money,
  VoucherPrintDocument,
  normalizeSlug,
  type VoucherData,
} from "./voucher.$slug";
import { verifyVoucherFromServer } from "@/lib/sheets.functions";
import {
  currentVoucherVerification,
  normalizeVoucherId,
  validateVoucherVerification,
  verifiedVoucherSnapshot,
  verificationMessage,
  type VoucherVerificationState,
} from "@/lib/voucher-verification";
import { openDraftChallan, openVerifyChallan } from "@/components/ChallanManager";

export const Route = createFileRoute("/verify")({
  validateSearch: (search: Record<string, unknown>) => ({
    id: typeof search["id"] === "string" ? search["id"] : "",
  }),
  loaderDeps: ({ search }) => ({ id: search.id }),
  staleTime: 0,
  gcTime: 0,
  shouldReload: true,
  pendingMs: 0,
  pendingComponent: VerifyPendingPage,
  loader: async ({ deps }): Promise<{ requestedId: string } & VoucherVerificationState> => {
    const requestedId = normalizeVoucherId(deps.id);
    if (!requestedId) return { requestedId, status: "missing_id", voucher: null };
    try {
      const response = await verifyVoucherFromServer({ voucherId: requestedId });
      return { requestedId, ...validateVoucherVerification(requestedId, response) };
    } catch {
      return { requestedId, status: "unavailable", voucher: null };
    }
  },
  component: VerifyPage,
});

function VerifyPendingPage() {
  const message = verificationMessage("loading");
  return (
    <main
      className="min-h-screen bg-background px-4 py-12 text-center"
      role="status"
      aria-live="polite"
    >
      <h1 className="text-xl font-bold">{message.title}</h1>
      <p className="mt-3 text-muted-foreground">{message.detail}</p>
    </main>
  );
}

function textField(record: Record<string, unknown> | null, key: string): string {
  return typeof record?.[key] === "string" ? record[key] : "";
}

function savedNumber(record: Record<string, unknown> | null, key: string): number {
  const value = Number(record?.[key]);
  return Number.isFinite(value) ? value : 0;
}

function savedChallan(record: Record<string, unknown> | null, kind: "vat" | "tax5" | "tax10") {
  const challans = record?.["challans"];
  const value =
    challans && typeof challans === "object" && !Array.isArray(challans)
      ? (challans as Record<string, unknown>)[kind]
      : null;
  const entry =
    value && typeof value === "object" && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : null;
  return {
    year: textField(entry, "year"),
    serial: textField(entry, "serial"),
    fullCode: textField(entry, "fullCode"),
  };
}

function VerifyPage() {
  const search = Route.useSearch();
  const loaderData = Route.useLoaderData();
  const [orgInfo] = useAtom(orgInfoAtom);
  const [showChallanPanel, setShowChallanPanel] = useState(true);
  const verification = currentVoucherVerification(search.id, loaderData);
  const isVerified = verification.status === "verified";
  const serverVoucher = isVerified ? verification.voucher : null;
  const fullState = verifiedVoucherSnapshot(serverVoucher);
  const voucherId = isVerified
    ? textField(serverVoucher, "id") || textField(serverVoucher, "voucherId")
    : search.id.trim();
  const message = verificationMessage(verification.status);
  const slug = normalizeSlug(
    textField(fullState, "slug") || textField(serverVoucher, "type") || voucherId,
  );
  const examTitle = textField(fullState, "examName") || textField(serverVoucher, "examTitle");
  const date = textField(fullState, "date") || textField(serverVoucher, "date");
  const savedChallans = {
    vat: savedChallan(fullState, "vat"),
    tax5: savedChallan(fullState, "tax5"),
    tax10: savedChallan(fullState, "tax10"),
  };
  const vatChallan =
    savedChallans?.vat?.fullCode ||
    textField(serverVoucher, "vatChallan") ||
    textField(serverVoucher, "vatCode");
  const tax5Challan =
    savedChallans?.tax5?.fullCode ||
    textField(serverVoucher, "tax5Challan") ||
    textField(serverVoucher, "tax5Code");
  const tax10Challan =
    savedChallans?.tax10?.fullCode ||
    textField(serverVoucher, "tax10Challan") ||
    textField(serverVoucher, "tax10Code");

  // Only the saved remote snapshot supplies the official document. No current
  // master data, URL metadata, or browser draft may fill in an authentic copy.
  const displayData: VoucherData | null = fullState
    ? {
        ...fullState,
        id: voucherId,
        classLevel: textField(fullState, "classLevel"),
        examName: examTitle,
        session: textField(fullState, "session"),
        year: textField(fullState, "year"),
        date,
        studentCount: savedNumber(fullState, "studentCount"),
        perStudent: savedNumber(fullState, "perStudent"),
        questionRate: savedNumber(fullState, "questionRate"),
        scriptRate: savedNumber(fullState, "scriptRate"),
        councilName: textField(fullState, "councilName"),
        councilDesignation: textField(fullState, "councilDesignation"),
        earnings: fullState["earnings"] as VoucherData["earnings"],
        expenses: fullState["expenses"] as VoucherData["expenses"],
        qs: fullState["qs"] as VoucherData["qs"],
        admin: fullState["admin"] as VoucherData["admin"],
        duty: fullState["duty"] as VoucherData["duty"],
        percentRows: fullState["percentRows"] as VoucherData["percentRows"],
        challans: {
          vat: {
            year: savedChallans?.vat?.year || "",
            serial: savedChallans?.vat?.serial || "",
            fullCode: vatChallan,
          },
          tax5: {
            year: savedChallans?.tax5?.year || "",
            serial: savedChallans?.tax5?.serial || "",
            fullCode: tax5Challan,
          },
          tax10: {
            year: savedChallans?.tax10?.year || "",
            serial: savedChallans?.tax10?.serial || "",
            fullCode: tax10Challan,
          },
        },
      }
    : null;

  return (
    <div className="min-h-screen bg-slate-100/80 dark:bg-slate-950 text-foreground print:bg-white print:text-black print:min-h-0 print:p-0">
      {/* ১. টপ ভেরিফিকেশন কন্ট্রোল বার (প্রিন্টে লুকানো থাকবে) */}
      <header className="sticky top-0 z-40 bg-card/95 backdrop-blur-md border-b border-border shadow-xs px-4 py-3 print:hidden">
        <div className="mx-auto max-w-6xl flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-secondary flex items-center justify-center text-xl shrink-0">
              🛡️
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-sm sm:text-base font-bold">ভাউচারের সত্যতা যাচাই</h1>
                {isVerified && (
                  <span className="inline-flex items-center text-[11px] px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300 font-semibold border border-emerald-300">
                    যাচাইকৃত রেকর্ড
                  </span>
                )}
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">
                ভাউচার আইডি:{" "}
                <strong className="font-mono text-foreground">{voucherId || "দেওয়া হয়নি"}</strong>
                {isVerified && (
                  <>
                    {" "}
                    • {examTitle || "পরীক্ষা / তহবিল ভাউচার"}
                    {date && <> • তারিখ: {date}</>}
                  </>
                )}
              </p>
            </div>
          </div>
          {isVerified && (
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => setShowChallanPanel((prev) => !prev)}
                className="button text-xs py-1.5 px-3 bg-secondary text-secondary-foreground font-semibold border border-border"
              >
                🏛️ ই-চালান স্ট্যাটাস {showChallanPanel ? "লুকান" : "দেখুন"}
              </button>
              {displayData && (
                <button
                  type="button"
                  onClick={() => window.print()}
                  className="button text-xs py-1.5 px-3 bg-primary text-primary-foreground font-semibold"
                >
                  🖨️ যাচাইকৃত কপি প্রিন্ট
                </button>
              )}
              <Link
                to="/voucher/$slug"
                params={{ slug }}
                search={{ loadId: voucherId }}
                className="button text-xs py-1.5 px-3 bg-card border border-border"
                title="ভাউচার এডিটরে যান"
              >
                ✏️ এডিটর
              </Link>
            </div>
          )}
        </div>
      </header>

      {/* ২. ট্রেজারি ই-চালান দ্রুত যাচাই স্ট্রিপ (Quick Challan Bar — প্রিন্টে লুকানো থাকবে) */}
      {isVerified && showChallanPanel && (
        <section className="bg-white/80 dark:bg-slate-900/80 border-b border-border py-4 px-4 print:hidden">
          <div className="mx-auto max-w-6xl">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <span className="text-base">🏛️</span>
                <h2 className="text-xs sm:text-sm font-bold text-foreground">
                  সরকারি রাজস্ব ট্রেজারি চালান ভেরিফিকেশন (Government Treasury e-Challan Portal)
                </h2>
              </div>
              <span className="text-[11px] text-muted-foreground hidden sm:inline">
                সোনালী ব্যাংক ও অর্থ মন্ত্রণালয়ের ডাটাবেস লিংক
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              {/* খাত ১: মূসক / ভ্যাট */}
              <div className="p-3 rounded-lg border border-emerald-200/90 dark:border-emerald-900/60 bg-emerald-50/40 dark:bg-emerald-950/20 text-xs flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between gap-1 mb-1">
                    <span className="font-bold text-emerald-900 dark:text-emerald-200">
                      ১. মূসক / ভ্যাট চালান
                    </span>
                    <span className="font-mono text-[11px] font-bold px-1.5 py-0.5 rounded bg-white dark:bg-slate-800 border border-emerald-300 dark:border-emerald-800 text-emerald-800 dark:text-emerald-300">
                      {vatChallan || "সংরক্ষিত নেই"}
                    </span>
                  </div>
                  <p className="text-[11px] text-muted-foreground">
                    ভাউচারের পণ্য ও সেবা ক্রয়ের সকল ভ্যাট
                  </p>
                </div>
                {vatChallan ? (
                  <div className="flex items-center gap-1.5 mt-2.5 pt-2 border-t border-emerald-200/60 dark:border-emerald-900/40">
                    <button
                      type="button"
                      onClick={() => openDraftChallan(vatChallan)}
                      className="px-2 py-1 text-[11px] font-semibold rounded bg-emerald-600 hover:bg-emerald-700 text-white cursor-pointer shadow-2xs"
                    >
                      🔍 ড্রাফট কপি
                    </button>
                    <button
                      type="button"
                      onClick={() => openVerifyChallan(vatChallan)}
                      className="px-2 py-1 text-[11px] font-semibold rounded bg-white dark:bg-slate-800 hover:bg-emerald-100 text-emerald-800 border border-emerald-300 cursor-pointer"
                    >
                      ✅ সরকারি যাচাই
                    </button>
                  </div>
                ) : (
                  <p className="text-[10px] text-muted-foreground italic mt-2">
                    চালান নম্বর এন্ট্রি করা হয়নি
                  </p>
                )}
              </div>

              {/* খাত ২: সরবরাহ কর ৫%-৯% */}
              <div className="p-3 rounded-lg border border-amber-200/90 dark:border-amber-900/60 bg-amber-50/40 dark:bg-amber-950/20 text-xs flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between gap-1 mb-1">
                    <span className="font-bold text-amber-900 dark:text-amber-200">
                      ২. সরবরাহ কর (৫%-৯%)
                    </span>
                    <span className="font-mono text-[11px] font-bold px-1.5 py-0.5 rounded bg-white dark:bg-slate-800 border border-amber-300 dark:border-amber-800 text-amber-800 dark:text-amber-300">
                      {tax5Challan || "সংরক্ষিত নেই"}
                    </span>
                  </div>
                  <p className="text-[11px] text-muted-foreground">
                    কাগজ, স্টেশনারী ও সরবরাহ বিলের মোট উৎসে কর
                  </p>
                </div>
                {tax5Challan ? (
                  <div className="flex items-center gap-1.5 mt-2.5 pt-2 border-t border-amber-200/60 dark:border-amber-900/40">
                    <button
                      type="button"
                      onClick={() => openDraftChallan(tax5Challan)}
                      className="px-2 py-1 text-[11px] font-semibold rounded bg-amber-600 hover:bg-amber-700 text-white cursor-pointer shadow-2xs"
                    >
                      🔍 ড্রাফট কপি
                    </button>
                    <button
                      type="button"
                      onClick={() => openVerifyChallan(tax5Challan)}
                      className="px-2 py-1 text-[11px] font-semibold rounded bg-white dark:bg-slate-800 hover:bg-amber-100 text-amber-800 border border-amber-300 cursor-pointer"
                    >
                      ✅ সরকারি যাচাই
                    </button>
                  </div>
                ) : (
                  <p className="text-[10px] text-muted-foreground italic mt-2">
                    চালান নম্বর এন্ট্রি করা হয়নি
                  </p>
                )}
              </div>

              {/* খাত ৩: সম্মানী কর ১০%-২০% */}
              <div className="p-3 rounded-lg border border-indigo-200/90 dark:border-indigo-900/60 bg-indigo-50/40 dark:bg-indigo-950/20 text-xs flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between gap-1 mb-1">
                    <span className="font-bold text-indigo-900 dark:text-indigo-200">
                      ৩. সম্মানী কর (১০%-২০%)
                    </span>
                    <span className="font-mono text-[11px] font-bold px-1.5 py-0.5 rounded bg-white dark:bg-slate-800 border border-indigo-300 dark:border-indigo-800 text-indigo-800 dark:text-indigo-300">
                      {tax10Challan || "সংরক্ষিত নেই"}
                    </span>
                  </div>
                  <p className="text-[11px] text-muted-foreground">
                    শিক্ষক, মূল্যায়ন, ডিউটি ও প্রশাসনের মোট কর
                  </p>
                </div>
                {tax10Challan ? (
                  <div className="flex items-center gap-1.5 mt-2.5 pt-2 border-t border-indigo-200/60 dark:border-indigo-900/40">
                    <button
                      type="button"
                      onClick={() => openDraftChallan(tax10Challan)}
                      className="px-2 py-1 text-[11px] font-semibold rounded bg-indigo-600 hover:bg-indigo-700 text-white cursor-pointer shadow-2xs"
                    >
                      🔍 ড্রাফট কপি
                    </button>
                    <button
                      type="button"
                      onClick={() => openVerifyChallan(tax10Challan)}
                      className="px-2 py-1 text-[11px] font-semibold rounded bg-white dark:bg-slate-800 hover:bg-indigo-100 text-indigo-800 border border-indigo-300 cursor-pointer"
                    >
                      ✅ সরকারি যাচাই
                    </button>
                  </div>
                ) : (
                  <p className="text-[10px] text-muted-foreground italic mt-2">
                    চালান নম্বর এন্ট্রি করা হয়নি
                  </p>
                )}
              </div>
            </div>
          </div>
        </section>
      )}

      {/* ৩. মূল ভাউচার প্রিন্ট লেআউট কপিগুলো (Voucher Print Layout Copies in Verification Mode) */}
      <main className="py-6 px-2 sm:px-6 print:py-0 print:px-0 print:m-0 print:max-w-none">
        <div className="mx-auto max-w-[215mm] print:max-w-none print:w-full print:m-0 print:p-0">
          <section
            className={
              isVerified
                ? "mb-5 rounded-xl border border-emerald-300 bg-emerald-50 p-5 text-emerald-950 dark:bg-emerald-950/30 dark:text-emerald-100 print:hidden"
                : "mb-5 rounded-xl border border-border bg-card p-5 text-foreground"
            }
            role="status"
            aria-live="polite"
          >
            <h2 className="text-lg font-bold">{message.title}</h2>
            <p className="mt-2 text-sm">{message.detail}</p>
            {!isVerified && (
              <form action="/verify" method="GET" className="mt-5 flex flex-wrap items-end gap-2">
                <label className="flex min-w-0 flex-1 flex-col gap-1 text-sm font-medium">
                  সম্পূর্ণ ভাউচার আইডি
                  <input
                    key={search.id}
                    name="id"
                    defaultValue={search.id}
                    required
                    autoComplete="off"
                    className="rounded-md border border-border bg-background px-3 py-2 font-mono text-foreground"
                    placeholder="TEST-2026-1234"
                  />
                </label>
                <button
                  type="submit"
                  className="button bg-primary px-4 py-2 font-semibold text-primary-foreground"
                >
                  আবার যাচাই করুন
                </button>
              </form>
            )}
          </section>

          {isVerified && displayData && (
            <>
              <div className="mb-4 flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 rounded-xl bg-white dark:bg-slate-900 border border-border shadow-2xs print:hidden">
                <p className="text-xs font-semibold text-emerald-800 dark:text-emerald-300">
                  সার্ভারে সংরক্ষিত ভাউচারের যাচাইকৃত কপি
                </p>
                <span className="font-mono text-xs font-bold text-muted-foreground">
                  {orgInfo.dept || DEFAULT_ORG_INFO.dept} •{" "}
                  {orgInfo.college || DEFAULT_ORG_INFO.college}
                </span>
              </div>
              <div className="space-y-8 print:space-y-0">
                <VoucherPrintDocument data={displayData} slug={slug} isVerification={true} />
              </div>
            </>
          )}

          {isVerified && !displayData && (
            <section className="rounded-xl border border-border bg-card p-5">
              <h2 className="font-bold">সংরক্ষিত রেকর্ডের সারসংক্ষেপ</h2>
              <p className="mt-2 text-sm text-muted-foreground">
                সার্ভারে এই আইডির রেকর্ড আছে, তবে সম্পূর্ণ ভাউচারের সংরক্ষিত ডেটা পাওয়া যায়নি। তাই
                যাচাইকৃত পূর্ণ কপি দেখানো বা প্রিন্ট করা যাচ্ছে না।
              </p>
              <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
                <dt>ভাউচার আইডি</dt>
                <dd className="font-mono">{voucherId}</dd>
                <dt>পরীক্ষা / তহবিল</dt>
                <dd>{examTitle || "সংরক্ষিত নেই"}</dd>
                <dt>তারিখ</dt>
                <dd>{date || "সংরক্ষিত নেই"}</dd>
                <dt>মোট আয়</dt>
                <dd>{money(savedNumber(serverVoucher, "income"))}</dd>
                <dt>মোট ব্যয়</dt>
                <dd>{money(savedNumber(serverVoucher, "expenses"))}</dd>
              </dl>
            </section>
          )}

          {/* ফুটার নোট */}
          <footer className="mt-8 mb-12 text-center text-xs text-muted-foreground print:hidden">
            <p>
              {orgInfo.dept || DEFAULT_ORG_INFO.dept} •{" "}
              {orgInfo.college || DEFAULT_ORG_INFO.college}
            </p>
            <p className="mt-1">
              ডিজিটাল ফিন্যান্সিয়াল অটোমেশন ও জাতীয় রাজস্ব বোর্ড (NBR) ই-চালান সত্যতা যাচাই সিস্টেম
            </p>
          </footer>
        </div>
      </main>
    </div>
  );
}
