import { useState, useMemo } from "react";
import { notifyFeedback } from "@/lib/feedback";
import { VoucherQRCode, makeVerifyUrl } from "@/components/VoucherQRCode";

/* =============================================================================
 *  ই-চালান (e-Challan) কনস্ট্যান্ট ও অফিসিয়াল ইউআরএল
 * ========================================================================== */

export const DRAFT_CHALLAN_BASE_URL =
  "https://www.achallan.gov.bd/acs/general/ChallanSlipDraftViewPage?challanNo=";

export const VERIFY_CHALLAN_BASE_URL =
  "https://challanverification.finance.gov.bd/echalan/details.php?challanNo=";

export type ChallanItem = {
  year: string; // যেমন: "2025-2026"
  serial: string; // যেমন: "0013566489"
  fullCode: string; // যেমন: "2526-0013566489"
  date?: string; // চালানের তারিখ (ঐচ্ছিক)
  amount?: number; // চালানের টাকার পরিমাণ (ঐচ্ছিক)
};

export type VoucherChallans = {
  vat?: ChallanItem;
  tax5?: ChallanItem;
  tax10?: ChallanItem;
  vatItems?: Record<string, ChallanItem>;
  tax5Items?: Record<string, ChallanItem>;
};

/** অর্থবছর থেকে ২+২ ডিজিটের কোড তৈরি (যেমন: "2025-2026" -> "2526") */
export function yearToCode(yearText: string): string {
  const match = String(yearText || "").match(/^(\d{4})-(\d{4})$/);
  if (!match || !match[1] || !match[2]) return "";
  return match[1].slice(-2) + match[2].slice(-2);
}

/** অর্থবছর কোড (যেমন: "2526") থেকে অর্থবছর ("2025-2026") তৈরি */
export function codeToYear(code: string): string {
  const m = String(code || "").match(/^(\d{2})(\d{2})$/);
  if (!m || !m[1] || !m[2]) return "";
  return `20${m[1]}-20${m[2]}`;
}

/** ফুল চালান নম্বর তৈরি (যেমন: 2526-0013566489) */
export function makeFullChallanNumber(year: string, serial: string): string {
  const cleanSerial = String(serial || "").trim().replace(/\s+/g, "");
  if (!cleanSerial) return "";

  // যদি সরাসরি পুরো কোড পেস্ট করা থাকে (যেমন: 2526-0013566489)
  const fullMatch = cleanSerial.match(/^(\d{4})[-–](\d+)$/);
  if (fullMatch && fullMatch[1] && fullMatch[2]) {
    return `${fullMatch[1]}-${fullMatch[2]}`;
  }

  const yearCode = yearToCode(year);
  if (!yearCode) return cleanSerial;

  if (cleanSerial.startsWith(yearCode + "-")) {
    return cleanSerial;
  }
  if (cleanSerial.length > 4 && cleanSerial.startsWith(yearCode)) {
    return yearCode + "-" + cleanSerial.substring(4);
  }
  return yearCode + "-" + cleanSerial;
}

/** ডিফল্ট অর্থবছর নির্ধারণ (জুলাই ১ থেকে শুরু) */
export function getDefaultChallanYear(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth() + 1;
  if (m >= 7) {
    return `${y}-${y + 1}`;
  }
  return `${y - 1}-${y}`;
}

/** অর্থবছরের ড্রপডাউন তালিকা */
export function getChallanYearList(): string[] {
  const currentYear = new Date().getFullYear();
  const list: string[] = [];
  for (let y = currentYear + 1; y >= currentYear - 8; y--) {
    list.push(`${y}-${y + 1}`);
  }
  return list;
}

/** সরকারি সাইট থেকে ড্রাফট চালান ওপেন ও প্রিন্ট ডায়ালগ কল */
export function openDraftChallan(challanNo: string) {
  if (!challanNo) {
    notifyFeedback.error("চালান নম্বর পাওয়া যায়নি", "অনুগ্রহ করে চালান নম্বর দিন।");
    return;
  }
  const url = DRAFT_CHALLAN_BASE_URL + encodeURIComponent(challanNo);
  const draftWindow = window.open(
    url,
    "DraftChallanWindow",
    "width=1100,height=850,menubar=no,toolbar=no,location=yes,status=yes,scrollbars=yes,resizable=yes",
  );

  if (!draftWindow) {
    notifyFeedback.error(
      "পপ-আপ ব্লক করা হয়েছে",
      "ব্রাউজার সেটিংসে গিয়ে এই ওয়েবসাইটের জন্য Pop-up allow করুন।",
    );
    return;
  }

  notifyFeedback.info("Draft Challan ওপেন হচ্ছে...", `চালান নং: ${challanNo}`);
  setTimeout(() => {
    try {
      draftWindow.focus();
      draftWindow.print();
    } catch (e) {
      console.log("Auto-print restriction:", e);
    }
  }, 1600);
}

/** সরকারি সাইটে চালান ভেরিফিকেশন পেজ ওপেন */
export function openVerifyChallan(challanNo: string) {
  if (!challanNo) {
    notifyFeedback.error("চালান নম্বর পাওয়া যায়নি", "অনুগ্রহ করে চালান নম্বর দিন।");
    return;
  }
  const url = VERIFY_CHALLAN_BASE_URL + encodeURIComponent(challanNo);
  window.open(url, "_blank", "noopener,noreferrer");
  notifyFeedback.success("চালান ভেরিফিকেশন পেজ ওপেন হয়েছে", `চালান নং: ${challanNo}`);
}

/* =============================================================================
 *  ই-চালান কুইক পোর্টাল মডাল (e-Challan Portal Modal)
 *  ব্যবহারকারীর নিজস্ব কোড অনুযায়ী যে কোনো ড্রাফট চালান সার্চ ও ভেরিফাই
 * ========================================================================== */

export function ChallanPortalModal({
  isOpen,
  onClose,
  initialYear,
  initialSerial,
}: {
  isOpen: boolean;
  onClose: () => void;
  initialYear?: string | undefined;
  initialSerial?: string | undefined;
}) {
  const years = useMemo(() => getChallanYearList(), []);
  const defYear = initialYear || getDefaultChallanYear();

  // Draft state
  const [draftYear, setDraftYear] = useState(defYear);
  const [draftSerial, setDraftSerial] = useState(initialSerial || "");

  // Verify state
  const [verifyYear, setVerifyYear] = useState(defYear);
  const [verifySerial, setVerifySerial] = useState(initialSerial || "");

  const fullDraftCode = makeFullChallanNumber(draftYear, draftSerial);
  const fullVerifyCode = makeFullChallanNumber(verifyYear, verifySerial);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-card text-card-foreground rounded-2xl shadow-2xl w-full max-w-4xl max-h-[92vh] flex flex-col overflow-hidden border border-border">
        {/* Modal Header */}
        <div className="p-4 px-6 border-b border-border flex justify-between items-center bg-secondary/80">
          <div className="flex items-center gap-3">
            <span className="text-2xl p-2 rounded-xl bg-primary/10 text-primary">🧾</span>
            <div>
              <h2 className="text-xl font-bold leading-tight">e-Challan Portal</h2>
              <p className="text-xs text-muted-foreground mt-0.5">
                Draft Challan Search &amp; Official Challan Verification
              </p>
            </div>
          </div>
          <button
            onClick={() => {
              onClose();
              notifyFeedback.close("ই-চালান পোর্টাল উইন্ডো বন্ধ করা হয়েছে।");
            }}
            className="text-muted-foreground hover:text-foreground text-xl p-1.5 rounded-lg hover:bg-muted transition-colors cursor-pointer"
            title="বন্ধ করুন"
          >
            ✕
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 overflow-y-auto flex-1 space-y-5">
          {/* সরকারি চালান এন্ট্রি ও জমার মূল পোর্টাল লিংক */}
          <div className="rounded-xl border border-emerald-200 bg-emerald-50/60 dark:bg-emerald-950/20 dark:border-emerald-900 p-3.5 flex flex-wrap items-center justify-between gap-3 text-xs">
            <div className="flex items-center gap-2.5">
              <span className="text-2xl">🏛️</span>
              <div>
                <h4 className="font-bold text-emerald-950 dark:text-emerald-200 text-sm">
                  সরকারি স্বয়ংক্রিয় এ-চালান পোর্টাল (achallan.gov.bd)
                </h4>
                <p className="text-[11px] text-muted-foreground mt-0.5">
                  অনলাইনে নতুন সরকারি ট্রেজারি চালান এন্ট্রি ও সোনালী ব্যাংক/বিকাশ দিয়ে জমা দেওয়ার মূল সরকারি সাইট।
                </p>
              </div>
            </div>
            <a
              href="https://www.achallan.gov.bd"
              target="_blank"
              rel="noopener noreferrer"
              className="px-3.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs flex items-center gap-1 shadow-2xs transition"
            >
              <span>চালান সাইটে যান</span>
              <span>↗</span>
            </a>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* ১. ড্রাফট চালান */}
            <div className="bg-background rounded-xl p-5 border border-border shadow-sm flex flex-col justify-between">
              <div>
                <div className="flex items-center gap-2.5 mb-2">
                  <span className="p-2 rounded-lg bg-emerald-50 text-emerald-700 text-lg">📄</span>
                  <h3 className="font-bold text-base text-foreground">Draft Challan</h3>
                </div>
                <p className="text-xs text-muted-foreground mb-4 leading-relaxed">
                  Challan Year এবং Challan Number দিন। সরকারি aChallan সাইট থেকে ড্রাফট চালান ওপেন
                  হবে এবং স্বয়ংক্রিয় প্রিন্ট ডায়ালগ আসবে।
                </p>

                <div className="space-y-3">
                  <div>
                    <label className="block text-xs font-semibold mb-1 text-muted-foreground">
                      Challan Year
                    </label>
                    <select
                      className="input w-full text-xs py-2 bg-card cursor-pointer"
                      value={draftYear}
                      onChange={(e) => setDraftYear(e.target.value)}
                    >
                      {years.map((y) => (
                        <option key={y} value={y}>
                          {y} ({yearToCode(y)})
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold mb-1 text-muted-foreground">
                      Challan Number (Serial)
                    </label>
                    <input
                      type="text"
                      className="input w-full text-xs py-2 font-mono"
                      placeholder="যেমন: 0013566489"
                      value={draftSerial}
                      onChange={(e) => setDraftSerial(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && fullDraftCode) {
                          openDraftChallan(fullDraftCode);
                        }
                      }}
                    />
                  </div>

                  <div className="p-2.5 rounded-lg bg-muted/60 text-xs font-mono text-muted-foreground border border-border/60">
                    Full Code:{" "}
                    <strong className="text-emerald-700 dark:text-emerald-400 font-bold">
                      {fullDraftCode || "—"}
                    </strong>
                  </div>
                </div>
              </div>

              <button
                type="button"
                className="button w-full mt-4 bg-emerald-600 hover:bg-emerald-700 text-white text-xs py-2.5 font-bold flex items-center justify-center gap-2 cursor-pointer shadow-sm transition-all"
                disabled={!fullDraftCode}
                onClick={() => openDraftChallan(fullDraftCode)}
              >
                <span>🔍</span> Search &amp; Print Draft Challan
              </button>
            </div>

            {/* ২. চালান ভেরিফিকেশন */}
            <div className="bg-background rounded-xl p-5 border border-border shadow-sm flex flex-col justify-between">
              <div>
                <div className="flex items-center gap-2.5 mb-2">
                  <span className="p-2 rounded-lg bg-blue-50 text-blue-700 text-lg">✅</span>
                  <h3 className="font-bold text-base text-foreground">Challan Verification</h3>
                </div>
                <p className="text-xs text-muted-foreground mb-4 leading-relaxed">
                  Challan Year এবং Challan Number দিয়ে অর্থ মন্ত্রণালয়ের সরকারি চালান ভেরিফিকেশন পেজ
                  সরাসরি ওপেন করুন।
                </p>

                <div className="space-y-3">
                  <div>
                    <label className="block text-xs font-semibold mb-1 text-muted-foreground">
                      Challan Year
                    </label>
                    <select
                      className="input w-full text-xs py-2 bg-card cursor-pointer"
                      value={verifyYear}
                      onChange={(e) => setVerifyYear(e.target.value)}
                    >
                      {years.map((y) => (
                        <option key={y} value={y}>
                          {y} ({yearToCode(y)})
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold mb-1 text-muted-foreground">
                      Challan Number (Serial)
                    </label>
                    <input
                      type="text"
                      className="input w-full text-xs py-2 font-mono"
                      placeholder="যেমন: 0013566489"
                      value={verifySerial}
                      onChange={(e) => setVerifySerial(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && fullVerifyCode) {
                          openVerifyChallan(fullVerifyCode);
                        }
                      }}
                    />
                  </div>

                  <div className="p-2.5 rounded-lg bg-muted/60 text-xs font-mono text-muted-foreground border border-border/60">
                    Full Code:{" "}
                    <strong className="text-blue-700 dark:text-blue-400 font-bold">
                      {fullVerifyCode || "—"}
                    </strong>
                  </div>
                </div>
              </div>

              <button
                type="button"
                className="button w-full mt-4 bg-blue-600 hover:bg-blue-700 text-white text-xs py-2.5 font-bold flex items-center justify-center gap-2 cursor-pointer shadow-sm transition-all"
                disabled={!fullVerifyCode}
                onClick={() => openVerifyChallan(fullVerifyCode)}
              >
                <span>✅</span> Verify Challan
              </button>
            </div>
          </div>
        </div>

        {/* Modal Footer */}
        <div className="p-3 px-6 bg-secondary/50 border-t border-border flex justify-between items-center text-xs text-muted-foreground">
          <span>ই-চালান পোর্টাল • সোনালী ব্যাংক ও সরকারি রাজস্ব ট্র্যাকিং</span>
          <button
            onClick={() => {
              onClose();
              notifyFeedback.close();
            }}
            className="px-3 py-1.5 bg-muted hover:bg-muted/80 rounded font-medium text-foreground cursor-pointer"
          >
            বন্ধ করুন
          </button>
        </div>
      </div>
    </div>
  );
}

/* =============================================================================
 *  ভাউচারের চালান সেকশন (শুধুমাত্র ওয়েব এন্ট্রি পেজে থাকবে, প্রিন্টে থাকবে না)
 * ========================================================================== */

const BN_DIGITS = ["০", "১", "২", "৩", "৪", "৫", "৬", "৭", "৮", "৯"];
const toBnDigits = (v: number | string) =>
  String(v).replace(/\d/g, (d) => BN_DIGITS[Number(d)] || d);

const formatMoney = (n: number) => {
  const rounded = Math.round((n + Number.EPSILON) * 100) / 100;
  return toBnDigits(
    rounded.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
  );
};

export type ItemizedExpenseChallan = {
  id: string;
  name: string;
  voucherNo?: string;
  baseAmount: number;
  rate: number;
  amount: number;
};

function SingleChallanCard({
  title,
  subtitle,
  badgeText,
  badgeClass,
  btnDraftClass,
  btnVerifyClass,
  item,
  onChange,
  years,
}: {
  title: string;
  subtitle?: string;
  badgeText: string;
  badgeClass: string;
  btnDraftClass: string;
  btnVerifyClass: string;
  item: ChallanItem;
  onChange: (updated: ChallanItem) => void;
  years: string[];
}) {
  const optionsList = useMemo(() => {
    if (item.year && !years.includes(item.year)) {
      const copy = [...years, item.year];
      copy.sort().reverse();
      return copy;
    }
    return years;
  }, [years, item.year]);

  const fullCode = makeFullChallanNumber(item.year, item.serial);

  const handleUpdate = (patch: Partial<ChallanItem>) => {
    const year = patch.year !== undefined ? patch.year : item.year;
    const serial = patch.serial !== undefined ? patch.serial : item.serial;
    const date = patch.date !== undefined ? patch.date : item.date;

    let cleanSerial = serial.trim();
    let effectiveYear = year;

    // যদি পুরো চালান কোড একবারে পেস্ট করা হয় (যেমন: 2526-0013566489)
    const m = cleanSerial.match(/^(\d{4})[-–](\d+)$/);
    if (m && m[1] && m[2]) {
      const detectedYear = codeToYear(m[1]);
      if (detectedYear) {
        effectiveYear = detectedYear;
        cleanSerial = m[2];
      }
    }

    const calculatedFullCode = makeFullChallanNumber(effectiveYear, cleanSerial);

    onChange({
      year: effectiveYear,
      serial: cleanSerial,
      fullCode: calculatedFullCode,
      ...(date !== undefined ? { date } : {}),
      ...(item.amount !== undefined ? { amount: item.amount } : {}),
    });
  };

  return (
    <div className="bg-background rounded-xl p-4 border border-border/80 hover:border-primary/40 transition-colors shadow-sm">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 mb-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h4 className="text-sm font-bold text-foreground">{title}</h4>
            <span className={`text-[11px] font-bold px-2 py-0.5 rounded border ${badgeClass}`}>
              {badgeText}
            </span>
          </div>
          {subtitle && <p className="text-xs text-muted-foreground mt-0.5">{subtitle}</p>}
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            disabled={!fullCode}
            onClick={() => openDraftChallan(fullCode)}
            className={`button text-xs py-1.5 px-3 font-semibold flex items-center gap-1.5 cursor-pointer disabled:opacity-40 transition-all ${btnDraftClass}`}
            title="ড্রাফট চালান ওপেন করুন ও প্রিন্ট দিন"
          >
            <span>🔍</span> ড্রাফট চালান দেখুন / প্রিন্ট
          </button>
          <button
            type="button"
            disabled={!fullCode}
            onClick={() => openVerifyChallan(fullCode)}
            className={`button text-xs py-1.5 px-3 font-semibold flex items-center gap-1.5 cursor-pointer disabled:opacity-40 transition-all ${btnVerifyClass}`}
            title="সরকারি চালান যাচাই পেজ ওপেন করুন"
          >
            <span>✅</span> ভেরিফাই
          </button>
        </div>
      </div>

      {/* Input Fields */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 pt-2 border-t border-border/50 text-xs">
        {/* Year */}
        <div>
          <label className="block text-muted-foreground font-semibold mb-1">
            চালান অর্থবছর (Year)
          </label>
          <select
            className="input w-full text-xs py-1.5 h-9 bg-card cursor-pointer"
            value={item.year}
            onChange={(e) => handleUpdate({ year: e.target.value })}
          >
            {optionsList.map((y) => (
              <option key={y} value={y}>
                {y} ({yearToCode(y)})
              </option>
            ))}
          </select>
        </div>

        {/* Serial */}
        <div>
          <label className="block text-muted-foreground font-semibold mb-1">
            চালান নম্বর (Serial)
          </label>
          <input
            type="text"
            className="input w-full text-xs py-1.5 h-9 font-mono"
            placeholder="যেমন: 0013566489"
            value={item.serial}
            onChange={(e) => handleUpdate({ serial: e.target.value })}
          />
        </div>

        {/* Date */}
        <div>
          <label className="block text-muted-foreground font-semibold mb-1">
            চালানের তারিখ (Date)
          </label>
          <input
            type="date"
            className="input w-full text-xs py-1.5 h-9 bg-card"
            value={item.date || ""}
            onChange={(e) => handleUpdate({ date: e.target.value })}
          />
        </div>

        {/* Full Code Preview */}
        <div>
          <label className="block text-muted-foreground font-semibold mb-1">
            পূর্ণাঙ্গ চালান কোড (Full Code)
          </label>
          <div className="h-9 px-3 flex items-center bg-muted/60 rounded-lg border border-border/60 font-mono text-xs font-bold text-foreground overflow-hidden text-ellipsis whitespace-nowrap">
            {fullCode ? (
              <span className="text-primary font-bold">{fullCode}</span>
            ) : (
              <span className="text-muted-foreground italic font-normal">নম্বর দিন...</span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export type ChallanBreakdownItem = {
  label: string;
  amount?: number;
  rate?: number;
  tax: number;
};

function BreakdownBadges({
  title,
  items,
  colorClass = "text-primary",
}: {
  title: string;
  items?: ChallanBreakdownItem[];
  colorClass?: string;
}) {
  if (!items || items.length === 0) return null;
  return (
    <div className="p-3 bg-card rounded-lg border border-border text-xs mt-2.5">
      <div className="font-semibold text-muted-foreground mb-1.5 flex items-center gap-1.5">
        <span>📋</span> {title}:
      </div>
      <div className="flex flex-wrap gap-2">
        {items.map((b, i) => (
          <span
            key={i}
            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-secondary/70 border border-border/80 text-foreground"
          >
            <span>{b.label}</span>
            {b.rate !== undefined && (
              <span className="text-[10px] text-muted-foreground font-semibold">
                ({toBnDigits(Math.round(b.rate * 100))}%)
              </span>
            )}
            <strong className={`font-mono ${colorClass}`}>
              ৳{formatMoney(b.tax)}
            </strong>
          </span>
        ))}
      </div>
    </div>
  );
}

export function VoucherChallanSection({
  challans,
  onChange,
  vatTotal = 0,
  vatBreakdown = [],
  tax5to9Total = 0,
  tax5to9Breakdown = [],
  tax10to20Total = 0,
  tax10to20Breakdown = [],
  // Fallbacks
  vatAmount = 0,
  tax5Amount = 0,
  tax10Amount = 0,
  // ভাউচার ও কিউআর কোড ট্র্যাকিং
  voucherId,
  examName,
  slug,
  date,
}: {
  challans?: VoucherChallans | undefined;
  onChange: (updated: VoucherChallans) => void;
  vatTotal?: number;
  vatBreakdown?: ChallanBreakdownItem[];
  tax5to9Total?: number;
  tax5to9Breakdown?: ChallanBreakdownItem[];
  tax10to20Total?: number;
  tax10to20Breakdown?: ChallanBreakdownItem[];
  vatAmount?: number;
  tax5Amount?: number;
  tax10Amount?: number;
  voucherId?: string;
  examName?: string;
  slug?: string;
  date?: string;
}) {
  const [portalModalOpen, setPortalModalOpen] = useState(false);
  const years = useMemo(() => getChallanYearList(), []);
  const defYear = getDefaultChallanYear();

  // ১. ভ্যাটের সকল টাকা একসাথে (Single combined VAT challan)
  const effectiveVat = vatTotal || vatAmount || 0;
  const currentVat = challans?.vat || {
    year: defYear,
    serial: "",
    fullCode: "",
    amount: effectiveVat,
  };
  const updateVat = (updated: ChallanItem) => {
    onChange({
      ...challans,
      vat: updated,
    });
  };

  // ২. ৫% - ৯% ট্যাক্স সকল টাকা একসাথে (Single combined Tax 5-9% challan)
  const effectiveTax5to9 = tax5to9Total || tax5Amount || 0;
  const currentTax5 = challans?.tax5 || {
    year: defYear,
    serial: "",
    fullCode: "",
    amount: effectiveTax5to9,
  };
  const updateTax5 = (updated: ChallanItem) => {
    onChange({
      ...challans,
      tax5: updated,
    });
  };

  // ৩. ১০% - ২০% ট্যাক্স সকল টাকা একসাথে (Single combined Tax 10-20% challan)
  const effectiveTax10to20 = tax10to20Total || tax10Amount || 0;
  const currentTax10 = challans?.tax10 || {
    year: defYear,
    serial: "",
    fullCode: "",
    amount: effectiveTax10to20,
  };
  const updateTax10 = (updated: ChallanItem) => {
    onChange({
      ...challans,
      tax10: updated,
    });
  };

  const grandTaxTotal = effectiveVat + effectiveTax5to9 + effectiveTax10to20;

  return (
    <section className="rounded-xl border border-border bg-card p-5 shadow-sm print:hidden">
      {/* Header */}
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3 border-b border-border/80 pb-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-2xl">🏛️</span>
            <div>
              <h2 className="text-lg font-bold text-card-foreground">
                সরকারি কোষাগারে ই-চালান (e-Challan) ট্র্যাকিং ও সংরক্ষণ
              </h2>
              <p className="text-xs text-muted-foreground mt-0.5">
                সরকারি রাজস্ব নিয়ম অনুযায়ী ৩টি চালান: <strong>১. ভ্যাট (সকল ভ্যাট একসাথে)</strong> • <strong>২. সরবরাহ কর (৫% - ৯% কর একসাথে)</strong> • <strong>৩. সম্মানী কর (১০% - ২০% কর একসাথে)</strong>
              </p>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {grandTaxTotal > 0 && (
            <span className="text-xs font-bold px-3 py-1.5 rounded-lg bg-primary/10 text-primary border border-primary/20">
              মোট সরকারি রাজস্ব: ৳{formatMoney(grandTaxTotal)}/-
            </span>
          )}
          <a
            href="https://www.achallan.gov.bd"
            target="_blank"
            rel="noopener noreferrer"
            className="button text-xs py-1.5 px-3 bg-emerald-600 hover:bg-emerald-700 text-white flex items-center gap-1.5 cursor-pointer shadow-2xs transition-colors font-semibold"
            title="সরকারি স্বয়ংক্রিয় এ-চালান সাইট ওপেন করুন (achallan.gov.bd)"
          >
            <span>🏛️</span> সরকারি এ-চালান সাইট (achallan.gov.bd) ↗
          </a>
          <button
            type="button"
            onClick={() => setPortalModalOpen(true)}
            className="button text-xs py-1.5 px-3 bg-secondary hover:bg-secondary/80 text-secondary-foreground flex items-center gap-1.5 cursor-pointer border border-border transition-colors font-semibold"
          >
            <span>🧾</span> ই-চালান পোর্টাল (Quick Tool)
          </button>
        </div>
      </div>

      {/* ভাউচার ও চালানের ডিজিটাল সত্যতা যাচাই QR কোড প্রিভিউ বক্স */}
      {voucherId && (
        <div className="mb-6 p-4 rounded-xl border border-primary/25 bg-primary/5 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3.5">
            <VoucherQRCode
              voucherId={voucherId}
              vatCode={currentVat.fullCode}
              tax5Code={currentTax5.fullCode}
              tax10Code={currentTax10.fullCode}
              size={50}
            />
            <div>
              <div className="flex items-center gap-1.5 font-bold text-sm text-foreground">
                <span>🛡️</span>
                <span>ভাউচার ও চালান অনলাইন সত্যতা যাচাই (স্মার্ট QR কোড)</span>
              </div>
              <p className="text-xs text-muted-foreground mt-0.5 max-w-xl">
                অনলাইন ভেরিফিকেশন পোর্টালে এই ভাউচার ও সংশ্লিষ্ট সরকারি ট্রেজারি চালানের তথ্য সরাসরি যাচাই করার অফিশিয়াল পোর্টাল লিংক।
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <a
              href={makeVerifyUrl({
                voucherId,
                vatCode: currentVat.fullCode,
                tax5Code: currentTax5.fullCode,
                tax10Code: currentTax10.fullCode,
              })}
              target="_blank"
              rel="noopener noreferrer"
              className="px-3.5 py-2 text-xs font-bold rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition shadow-xs flex items-center gap-1.5 cursor-pointer"
            >
              <span>🔍</span>
              <span>যাচাই পোর্টাল প্রিভিউ দেখুন</span>
            </a>
          </div>
        </div>
      )}

      <div className="space-y-6">
        {/* ১. ভ্যাট (VAT) চালান — সকল ভ্যাট একসাথে */}
        {effectiveVat > 0 && (
          <div className="space-y-3 p-4 rounded-xl bg-emerald-50/40 dark:bg-emerald-950/15 border border-emerald-200/80 dark:border-emerald-900/60">
            <div className="flex items-center justify-between pb-2 border-b border-emerald-200/60 dark:border-emerald-900/40">
              <div className="flex items-center gap-2">
                <span className="inline-block w-2.5 h-2.5 rounded-full bg-emerald-600"></span>
                <h3 className="text-sm font-bold text-emerald-900 dark:text-emerald-200">
                  খাত ১: মূসক / ভ্যাট (VAT) চালান — সকল ভ্যাট একসাথে একটি ট্রেজারি চালান
                </h3>
              </div>
              <span className="text-xs font-bold text-emerald-800 dark:text-emerald-300">
                সর্বমোট ভ্যাট: ৳{formatMoney(effectiveVat)}/-
              </span>
            </div>

            <SingleChallanCard
              title="মূল্য সংযোজন কর (মূসক / VAT) চালান"
              subtitle="ভাউচারের সকল পণ্য ও সেবা ক্রয়ের মোট ভ্যাট (একত্রে ট্রেজারি চালানে জমা)"
              badgeText={`নির্ধারিত মোট ভ্যাট: ৳${formatMoney(effectiveVat)}/- টাকা`}
              badgeClass="bg-emerald-100 text-emerald-800 border-emerald-300"
              btnDraftClass="bg-emerald-600 hover:bg-emerald-700 text-white"
              btnVerifyClass="bg-emerald-100 text-emerald-800 hover:bg-emerald-200 border border-emerald-300"
              item={currentVat}
              onChange={updateVat}
              years={years}
            />

            <BreakdownBadges
              title="ভ্যাটভুক্ত খাতসমূহের বিবরণ"
              items={vatBreakdown}
              colorClass="text-emerald-700 dark:text-emerald-400"
            />
          </div>
        )}

        {/* ২. পণ্য ও সেবার উৎসে কর (Tax ৫% - ৯%) চালান — সব ৫-৯% কর একসাথে */}
        {effectiveTax5to9 > 0 && (
          <div className="space-y-3 p-4 rounded-xl bg-amber-50/40 dark:bg-amber-950/15 border border-amber-200/80 dark:border-amber-900/60">
            <div className="flex items-center justify-between pb-2 border-b border-amber-200/60 dark:border-amber-900/40">
              <div className="flex items-center gap-2">
                <span className="inline-block w-2.5 h-2.5 rounded-full bg-amber-600"></span>
                <h3 className="text-sm font-bold text-amber-900 dark:text-amber-200">
                  খাত ২: সরবরাহ উৎসে কর (Tax ৫% - ৯%) চালান — সব একসাথে একটি ট্রেজারি চালান
                </h3>
              </div>
              <span className="text-xs font-bold text-amber-800 dark:text-amber-300">
                সর্বমোট ৫-৯% কর: ৳{formatMoney(effectiveTax5to9)}/-
              </span>
            </div>

            <SingleChallanCard
              title="পণ্য ও সেবা সরবরাহকারীর উৎসে কর (Tax ৫% - ৯%) চালান"
              subtitle="কাগজ, স্টেশনারী, ফটোকপি ও অন্যান্য পণ্য/সেবা সরবরাহ বিলের মোট ৫-৯% কর (একত্রে ট্রেজারি চালানে জমা)"
              badgeText={`নির্ধারিত মোট কর: ৳${formatMoney(effectiveTax5to9)}/- টাকা`}
              badgeClass="bg-amber-100 text-amber-800 border-amber-300"
              btnDraftClass="bg-amber-600 hover:bg-amber-700 text-white"
              btnVerifyClass="bg-amber-100 text-amber-800 hover:bg-amber-200 border border-amber-300"
              item={currentTax5}
              onChange={updateTax5}
              years={years}
            />

            <BreakdownBadges
              title="৫-৯% করভুক্ত সরবরাহ বিলসমূহের বিবরণ"
              items={tax5to9Breakdown}
              colorClass="text-amber-700 dark:text-amber-400"
            />
          </div>
        )}

        {/* ৩. সম্মানী/পারিতোষিকের উৎসে কর (Tax ১০% - ২০%) — সব ১০-২০% কর একসাথে */}
        {effectiveTax10to20 > 0 && (
          <div className="space-y-3 p-4 rounded-xl bg-indigo-50/40 dark:bg-indigo-950/15 border border-indigo-200/80 dark:border-indigo-900/60">
            <div className="flex items-center justify-between pb-2 border-b border-indigo-200/60 dark:border-indigo-900/40">
              <div className="flex items-center gap-2">
                <span className="inline-block w-2.5 h-2.5 rounded-full bg-indigo-600"></span>
                <h3 className="text-sm font-bold text-indigo-900 dark:text-indigo-200">
                  খাত ৩: সম্মানী ও পারিতোষিক উৎসে কর (Tax ১০% - ২০%) চালান — সব একসাথে একটি ট্রেজারি চালান
                </h3>
              </div>
              <span className="text-xs font-bold text-indigo-800 dark:text-indigo-300">
                সর্বমোট ১০-২০% কর: ৳{formatMoney(effectiveTax10to20)}/-
              </span>
            </div>

            <SingleChallanCard
              title="সম্মানী ও পারিতোষিকের উৎসে কর (Tax ১০% - ২০%) চালান"
              subtitle="শিক্ষক, পরীক্ষক (বহিরাগত/অভ্যন্তরীণ), মূল্যায়নকারী, ডিউটি, প্রশাসন ও ব্যয়ের ১০-২০% সম্মানীর কর (একত্রে ট্রেজারি চালানে জমা)"
              badgeText={`নির্ধারিত মোট কর: ৳${formatMoney(effectiveTax10to20)}/- টাকা`}
              badgeClass="bg-indigo-100 text-indigo-800 border-indigo-300"
              btnDraftClass="bg-indigo-600 hover:bg-indigo-700 text-white"
              btnVerifyClass="bg-indigo-100 text-indigo-800 hover:bg-indigo-200 border border-indigo-300"
              item={currentTax10}
              onChange={updateTax10}
              years={years}
            />

            <BreakdownBadges
              title="১০-২০% করভুক্ত খাতসমূহের বিবরণ"
              items={tax10to20Breakdown}
              colorClass="text-indigo-700 dark:text-indigo-400"
            />
          </div>
        )}

        {/* যদি কোনো কর প্রযোজ্য না থাকে */}
        {effectiveVat === 0 && effectiveTax5to9 === 0 && effectiveTax10to20 === 0 && (
          <div className="p-6 text-center text-muted-foreground border border-dashed border-border rounded-xl bg-background/50">
            <p className="text-sm font-medium">বর্তমান ভাউচারে কোনো ভ্যাট বা উৎসে কর প্রযোজ্য খাতের ব্যয় অন্তর্ভুক্ত নেই।</p>
            <p className="text-xs mt-1 text-muted-foreground/80">
              ব্যয়ের তালিকায় ভ্যাট হার বা কর হার যুক্ত করলে স্বয়ংক্রিয়ভাবে এখানে ৩টি চালান ইনপুট তৈরি হবে।
            </p>
          </div>
        )}
      </div>

      {/* Portal Modal */}
      <ChallanPortalModal
        isOpen={portalModalOpen}
        onClose={() => setPortalModalOpen(false)}
        initialYear={defYear}
      />
    </section>
  );
}
