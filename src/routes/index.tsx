import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useAtom } from "jotai";
import {
  importSheetValues,
  getVouchersFromServer,
  deleteVoucherFromServer,
} from "@/lib/sheets.functions";
import { getSheetId, getScriptUrl } from "@/lib/config";
import { notifyFeedback } from "@/lib/feedback";
import { getSessionStatus, logout } from "@/lib/auth.functions";
import { ChangePasswordDialog } from "@/components/ChangePasswordDialog";
import {
  parseSavedVouchersResponse,
  VoucherListRequests,
  type VoucherEntry,
} from "@/lib/voucher-list";
import { voucherIdsMatch } from "@/lib/voucher-verification";
import {
  VOUCHERS,
  CLASSES,
  dbAtom,
  orgInfoAtom,
  parseOrgSettings,
  storeTempVoucher,
  purgeCachedVoucher,
  calculateVoucherFinancials,
  money,
  type VoucherConfig,
  type MasterDB,
} from "./voucher.$slug";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "ভূগোল ও পরিবেশ বিভাগ — ফাইন্যান্স ও ভাউচার সিস্টেম" },
      {
        name: "description",
        content:
          "কুমুদিনী সরকারি কলেজ, টাঙ্গাইল — ভূগোল ও পরিবেশ বিভাগের পরীক্ষা ও ফী বন্টনের হিসাব ও প্রিন্ট-রেডি ভাউচার।",
      },
      { property: "og:title", content: "ভূগোল ও পরিবেশ বিভাগ — ফাইন্যান্স ভাউচার" },
      {
        property: "og:description",
        content: "পরীক্ষা ও ফী বন্টনের স্বয়ংক্রিয় হিসাব এবং প্রিন্ট-রেডি ভাউচার।",
      },
      { property: "og:image", content: "/logo.jpg" },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Home,
});

function Home() {
  const navigate = useNavigate();
  const [orgInfo] = useAtom(orgInfoAtom);
  const [wizardVoucher, setWizardVoucher] = useState<VoucherConfig | null>(null);
  const [wizardClass, setWizardClass] = useState("");
  const [isAuth, setIsAuth] = useState<boolean | null>(null);
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const checkSession = async () => {
      try {
        const session = await getSessionStatus();
        if (cancelled) return;
        setIsAuth(session.authenticated);
        if (!session.authenticated) navigate({ to: "/login", replace: true });
      } catch {
        if (cancelled) return;
        setIsAuth(false);
        navigate({ to: "/login", replace: true });
      }
    };
    void checkSession();
    return () => {
      cancelled = true;
    };
  }, [navigate]);

  const handleLogout = async () => {
    setIsLoggingOut(true);
    try {
      await logout();
      setIsAuth(false);
      navigate({ to: "/login", replace: true });
    } catch {
      notifyFeedback.error("লগআউট করা যায়নি", "সংযোগ ঠিক হলে আবার চেষ্টা করুন।", "logout");
    } finally {
      setIsLoggingOut(false);
    }
  };

  if (isAuth !== true) return null;

  return (
    <main className="min-h-screen bg-background">
      <header className="bg-secondary relative">
        <div className="mx-auto max-w-7xl px-6 py-10 text-center relative">
          <div className="mb-6 flex flex-wrap items-center justify-center gap-2 sm:justify-end">
            <Link
              to="/studio"
              className="px-3 py-1.5 bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 font-semibold rounded-md border border-emerald-300 hover:bg-emerald-100 dark:hover:bg-emerald-900/60 flex items-center gap-1.5 transition-colors text-xs shadow-2xs"
              title="২৪টি ইউনিক ভেন্ডর ক্যাশ মেমো ও বিল তৈরির স্টুডিও"
            >
              <span>🧾</span>
              <span>ক্যাশ মেমো স্টুডিও</span>
            </Link>
            <SyncDBButton />
            <ChangePasswordDialog disabled={isLoggingOut} />
            <button
              onClick={handleLogout}
              disabled={isLoggingOut}
              className="px-4 py-2 bg-red-50 text-red-600 font-medium rounded hover:bg-red-100"
            >
              {isLoggingOut ? "লগআউট হচ্ছে…" : "লগআউট"}
            </button>
          </div>
          <p className="text-xs uppercase tracking-[0.3em] text-muted-foreground">
            Finance &amp; Voucher System
          </p>
          <h1 className="mt-2 text-3xl sm:text-4xl font-black text-foreground tracking-tight">
            {orgInfo.dept}
          </h1>
          <p className="mt-1 text-xl sm:text-2xl font-bold text-foreground/90">{orgInfo.college}</p>
          <p className="mt-3 flex items-center justify-center flex-wrap gap-x-2 text-sm font-medium text-foreground/80">
            <span>
              মোবাইল: <strong className="font-semibold text-foreground">{orgInfo.phone}</strong>
            </span>
            <span>•</span>
            <span>
              ই-মেইল:{" "}
              <a
                href={`mailto:${orgInfo.email}`}
                className="hover:underline font-medium"
                style={{ color: "#2563eb" }}
              >
                {orgInfo.email}
              </a>
            </span>
            <span>•</span>
            <span>
              ওয়েব:{" "}
              <a
                href={orgInfo.web?.startsWith("http") ? orgInfo.web : `https://${orgInfo.web}`}
                target="_blank"
                rel="noopener noreferrer"
                className="hover:underline font-medium"
                style={{ color: "#2563eb" }}
              >
                {orgInfo.web}
              </a>
            </span>
          </p>
        </div>
        {/* হেডার ডাবল লাইন: ওপরেরটি একটু মোটা, নিচেরটি একটু চিকন */}
        <div className="w-full space-y-[2px]" aria-hidden="true">
          <div className="border-b-[2.5px] border-border w-full" />
          <div className="border-b-[1px] border-border/80 w-full" />
        </div>
      </header>

      <div className="mx-auto max-w-7xl px-6 py-10">
        <h2 className="mb-5 text-lg font-semibold text-foreground">ভাউচারের ধরন</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          {/* ক্যাশ মেমো ও বিল স্টুডিও বিশেষ কার্ড */}
          <Link
            to="/studio"
            className="group rounded-lg border-2 border-emerald-500/50 bg-gradient-to-br from-emerald-50/70 via-card to-teal-50/30 p-5 transition-all duration-200 hover:border-emerald-600 hover:shadow-md hover:-translate-y-1 active:scale-95 active:translate-y-0 text-left dark:from-emerald-950/20 dark:via-card dark:to-teal-950/10"
          >
            <div className="flex items-baseline justify-between gap-3">
              <div className="flex items-center gap-2">
                <span className="text-xl">🏪</span>
                <h3 className="text-xl font-bold text-card-foreground group-hover:text-emerald-700 dark:group-hover:text-emerald-400 transition-colors">
                  ক্যাশ মেমো ও বিল স্টুডিও
                </h3>
              </div>
              <span className="rounded-full bg-emerald-100 dark:bg-emerald-900/60 text-emerald-800 dark:text-emerald-300 px-3 py-1 text-xs font-bold transition-colors">
                ২৪টি ডিজাইন • A4 বিল্ডার
              </span>
            </div>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
              ফটোকপি, স্টেশনারী, কম্পিউটার, আপ্যায়ন, ব্যানার ও বিভিন্ন স্থানীয় ২৪টি বাস্তব দোকানের
              ক্যাশ মেমো তৈরি, লাইভ এডিট ও A4 প্রিন্ট স্টুডিও।
            </p>
          </Link>
          {VOUCHERS.map((v) => (
            <button
              key={v.slug}
              onClick={() => {
                if (v.slug === "abedon" || v.slug === "shikkha-sofor") {
                  notifyFeedback.newDraft(v.name);
                  navigate({
                    to: "/voucher/$slug",
                    params: { slug: v.slug },
                    search: {
                      classLevel: v.slug === "abedon" ? "সেমিনার তহবিল" : "সকল বর্ষ",
                      loadId: undefined,
                    },
                  });
                } else {
                  setWizardVoucher(v);
                }
              }}
              className="group rounded-lg border border-border bg-card p-5 transition-all duration-200 hover:border-primary hover:shadow-md hover:-translate-y-1 active:scale-95 active:translate-y-0 text-left"
            >
              <div className="flex items-baseline justify-between gap-3">
                <h3 className="text-xl font-semibold text-card-foreground group-hover:text-primary transition-colors">
                  {v.name}
                </h3>
                <span className="rounded-full bg-secondary px-3 py-1 text-xs text-secondary-foreground transition-colors group-hover:bg-primary/10 group-hover:text-primary">
                  {v.pages}
                </span>
              </div>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{v.short}</p>
            </button>
          ))}
        </div>
      </div>
      <SavedVouchersList />

      {wizardVoucher && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm transition-opacity">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-md flex flex-col overflow-hidden animate-in fade-in zoom-in duration-200">
            <div className="p-4 border-b border-border flex justify-between items-center bg-secondary">
              <h2 className="text-xl font-bold">ভাউচার তৈরি</h2>
              <button
                onClick={() => {
                  setWizardVoucher(null);
                  notifyFeedback.close("ভাউচার তৈরির উইন্ডো বন্ধ করা হয়েছে।");
                }}
                className="text-muted-foreground hover:text-foreground p-1"
              >
                ✕
              </button>
            </div>
            <div className="p-4 flex flex-col gap-4">
              <p className="text-sm text-muted-foreground">
                আপনি <strong>{wizardVoucher.name}</strong> ভাউচার তৈরি করতে যাচ্ছেন। দয়া করে নিচের
                ড্রপডাউন থেকে কোর্স/বর্ষ নির্বাচন করুন, ডাটাবেস অনুযায়ী শিক্ষকরা স্বয়ংক্রিয়ভাবে
                যুক্ত হয়ে যাবেন।
              </p>
              <div>
                <label className="font-semibold block mb-2">
                  কোন শ্রেণির জন্য ভাউচার তৈরি করবেন?
                </label>
                <select
                  className="input w-full focus:ring-2 focus:ring-primary/20 transition-all"
                  value={wizardClass}
                  onChange={(e) => setWizardClass(e.target.value)}
                >
                  <option value="">— নির্বাচন করুন —</option>
                  {CLASSES.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex justify-end gap-2 mt-4">
                <button
                  className="px-4 py-2 bg-gray-200 text-gray-800 font-medium rounded hover:bg-gray-300"
                  onClick={() => {
                    setWizardVoucher(null);
                    notifyFeedback.close("ভাউচার তৈরির উইন্ডো বন্ধ করা হয়েছে।");
                  }}
                >
                  বাতিল
                </button>
                <button
                  className="button disabled:opacity-50"
                  disabled={!wizardClass}
                  onClick={() => {
                    notifyFeedback.newDraft(`${wizardVoucher.name} (${wizardClass})`);
                    navigate({
                      to: "/voucher/$slug",
                      params: { slug: wizardVoucher.slug },
                      search: { classLevel: wizardClass, loadId: undefined },
                    });
                  }}
                >
                  তৈরি করুন
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}

function SyncDBButton() {
  const [, setDb] = useAtom(dbAtom);
  const [, setOrgInfo] = useAtom(orgInfoAtom);
  const [status, setStatus] = useState("");

  const handleSync = useCallback(
    async (isManual = false) => {
      const targetSheetId = getSheetId();

      if (!targetSheetId) {
        const errMsg = "স্প্রেডশীট আইডি পাওয়া যায়নি!";
        setStatus(errMsg);
        if (isManual) notifyFeedback.error("কনফিগারেশন ত্রুটি", errMsg, "sync-db");
        return;
      }

      setStatus("সিঙ্ক হচ্ছে...");
      if (isManual) {
        notifyFeedback.loading("গুগল শীট থেকে ডাটাবেস আপডেট হচ্ছে...", "sync-db");
      }

      try {
        // 0. Settings / Organization Info (Department, College, Mobile, Email, Web)
        try {
          const rSettings = await importSheetValues({
            spreadsheetId: targetSheetId,
            range: "Settings!A1:B50",
            sheetName: "Settings",
          });
          const parsedOrg = parseOrgSettings(rSettings.values);
          if (Object.keys(parsedOrg).length > 0) {
            setOrgInfo((prev) => ({ ...prev, ...parsedOrg }));
          }
        } catch (err) {
          console.warn("Settings fetch notice:", err);
        }

        const newDb: MasterDB = { rates: [], products: [], percentages: [], teachers: [] };

        // 1. Rates
        const rRates = await importSheetValues({
          spreadsheetId: targetSheetId,
          range: "Rates!A:D",
          sheetName: "Rates",
        });
        newDb.rates = rRates.values
          .slice(1)
          .map((r) => ({
            examType: String(r[0] || "")
              .trim()
              .toUpperCase(),
            question: Number(r[1] || 0),
            script: Number(r[2] || 0),
            perStudent: Number(r[3] || 0),
          }))
          .filter((r) => r.examType);

        // 2. Products
        const rProds = await importSheetValues({
          spreadsheetId: targetSheetId,
          range: "Products!A:D",
          sheetName: "Products",
        });
        newDb.products = rProds.values
          .slice(1)
          .map((r) => ({
            name: String(r[0] || "").trim(),
            sector: String(r[1] || "").trim(),
            vat: (Number(String(r[2] || "").replace(/[^0-9.]/g, "")) || 0) / 100,
            tax: (Number(String(r[3] || "").replace(/[^0-9.]/g, "")) || 0) / 100,
          }))
          .filter((r) => r.name);

        // 3. Percentages
        const rPercs = await importSheetValues({
          spreadsheetId: targetSheetId,
          range: "Percentages!A:C",
          sheetName: "Percentages",
        });
        newDb.percentages = rPercs.values
          .slice(1)
          .map((r) => ({
            designation: String(r[0] || "").trim(),
            percent: Number(String(r[1] || "").replace(/[^0-9.]/g, "")) || 0,
            examType: String(r[2] || "").trim(),
          }))
          .filter((r) => r.designation);

        // 4. Teachers
        const rTeachers = await importSheetValues({
          spreadsheetId: targetSheetId,
          range: "Teachers!A:E",
          sheetName: "Teachers",
        });
        newDb.teachers = rTeachers.values
          .slice(1)
          .map((r) => ({
            name: String(r[0] || "").trim(),
            designation: String(r[1] || "").trim(),
            category: String(r[2] || "").trim(),
            classes: String(r[3] || "")
              .split(",")
              .map((s) => s.trim())
              .filter(Boolean),
            pages: String(r[4] || "")
              .split(",")
              .map((s) => s.trim())
              .filter(Boolean),
          }))
          .filter((r) => r.name);

        setDb(newDb);
        setStatus("সফলভাবে ডাটাবেস আপডেট হয়েছে!");
        if (isManual) {
          notifyFeedback.dbSyncSuccess(
            `মোট ${newDb.teachers.length} জন শিক্ষক ও সংশ্লিষ্ট হার সফলভাবে আপডেট হয়েছে।`,
          );
        }
        setTimeout(() => setStatus(""), 3000);
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        setStatus("ত্রুটি: " + msg);
        if (isManual) {
          notifyFeedback.error("ডাটাবেস আপডেট ব্যর্থ হয়েছে", msg, "sync-db");
        }
      }
    },
    [setDb, setOrgInfo],
  );

  useEffect(() => {
    handleSync(false);
  }, [handleSync]);

  return (
    <div className="relative flex items-center gap-2">
      {status && (
        <span className="text-xs text-blue-600 font-medium whitespace-nowrap animate-pulse">
          {status}
        </span>
      )}
      <button
        onClick={() => handleSync(true)}
        className="px-4 py-2 bg-blue-50 text-blue-600 font-medium rounded hover:bg-blue-100 flex items-center gap-1.5 transition-colors"
        title="গুগল শীট থেকে তথ্য সিঙ্ক করুন"
      >
        <span>🔄</span> ডাটাবেস আপডেট
      </button>
    </div>
  );
}

const BN_TO_EN: Record<string, string> = {
  "০": "0",
  "১": "1",
  "২": "2",
  "৩": "3",
  "৪": "4",
  "৫": "5",
  "৬": "6",
  "৭": "7",
  "৮": "8",
  "৯": "9",
};
const EN_TO_BN: Record<string, string> = {
  "0": "০",
  "1": "১",
  "2": "২",
  "3": "৩",
  "4": "৪",
  "5": "৫",
  "6": "৬",
  "7": "৭",
  "8": "৮",
  "9": "৯",
};

function toBnDigits(val: string | number): string {
  return String(val ?? "").replace(/[0-9]/g, (d) => EN_TO_BN[d] || d);
}

function toEnDigits(val: string | number): string {
  return String(val ?? "").replace(/[০-৯]/g, (d) => BN_TO_EN[d] || d);
}

const VOUCHER_PREFIX_MAP: Record<string, string> = {
  TEST: "নির্বাচনী পরীক্ষা",
  INCOURSE: "ইনকোর্স পরীক্ষা",
  MANAGEMENT: "ব্যবস্থাপনা ফী",
  ADMISSION: "ভর্তি ব্যবস্থাপনা ফী",
  CENTER: "কেন্দ্র ফী",
  TERM: "টার্ম পেপার",
  PRACTICAL: "ব্যবহারিক পরীক্ষা",
  VIVA: "মৌখিক পরীক্ষা",
  APP: "টাকা উত্তোলনের আবেদন",
  TOUR: "শিক্ষা সফর",
};

function extractVoucherDetails(v: VoucherEntry) {
  let session = "";
  let year = "";
  let type = v.configName?.trim() || "";
  let challanCodes: string[] = [];

  // ১. fullState থেকে ডাটা পড়ার চেষ্টা
  if (v.fullState) {
    try {
      const state = typeof v.fullState === "string" ? JSON.parse(v.fullState) : v.fullState;
      if (state) {
        if (state.session && typeof state.session === "string" && state.session.trim()) {
          session = state.session.trim();
        }
        if (state.year && typeof state.year === "string" && state.year.trim()) {
          year = state.year.trim();
        }
        if (!type && state.slug) {
          type = VOUCHERS.find((x) => x.slug === state.slug)?.name || "";
        }
        if (state.challans) {
          // ১. ভ্যাট চালান
          if (state.challans.vat?.fullCode) {
            challanCodes.push(`ভ্যাট: ${state.challans.vat.fullCode}`);
          } else if (state.challans.vatItems && typeof state.challans.vatItems === "object") {
            Object.values(state.challans.vatItems).forEach((c: any) => {
              if (c?.fullCode && !challanCodes.includes(`ভ্যাট: ${c.fullCode}`)) {
                challanCodes.push(`ভ্যাট: ${c.fullCode}`);
              }
            });
          }

          // ২. ট্যাক্স ৫-৯% চালান
          if (state.challans.tax5?.fullCode) {
            challanCodes.push(`ট্যাক্স ৫-৯%: ${state.challans.tax5.fullCode}`);
          } else if (state.challans.tax5Items && typeof state.challans.tax5Items === "object") {
            Object.values(state.challans.tax5Items).forEach((c: any) => {
              if (c?.fullCode && !challanCodes.includes(`ট্যাক্স ৫-৯%: ${c.fullCode}`)) {
                challanCodes.push(`ট্যাক্স ৫-৯%: ${c.fullCode}`);
              }
            });
          }

          // ৩. ট্যাক্স ১০-২০% চালান
          if (state.challans.tax10?.fullCode) {
            challanCodes.push(`ট্যাক্স ১০-২০%: ${state.challans.tax10.fullCode}`);
          }
        }
      }
    } catch {}
  }

  // ২. সেশন এক্সট্র্যাক্ট করা (পরীক্ষার নাম থেকে ফলব্যাক)
  // ফরম্যাট: (২০২৪-২৫) বা ২০২৪-২৫
  if (!session && v.examName) {
    const m = v.examName.match(/([০-৯\d]{4}\s*[-–]\s*[০-৯\d]{2,4})/);
    if (m && m[1]) {
      session = m[1].replace(/\s+/g, "").replace("–", "-");
    }
  }

  // ৩. পরীক্ষার সাল (Exam Year) এক্সট্র্যাক্ট করা
  // পরীক্ষার সাল সবসময় টাইটেলের শেষে (যেমন: -২০২৬) অথবা 'পরীক্ষা-' এর পরে থাকে (যেমন: 'পরীক্ষা-২০২৩')
  if (!year && v.examName) {
    // ক. নামের একদম শেষে থাকা ৪ ডিজিটের সাল (যেমন: -২০২৬ বা -2026)
    const endM = v.examName.match(/[-–]\s*([০-৯]{4}|20\d\d)\s*$/);
    if (endM && endM[1]) {
      year = endM[1];
    } else {
      // খ. 'পরীক্ষা' শব্দের পরবর্তী ৪ ডিজিটের সাল (যেমন: পরীক্ষা-২০২৬)
      const examAfterM = v.examName.match(/পরীক্ষা[-–\s]*([০-৯]{4}|20\d\d)/);
      if (examAfterM && examAfterM[1]) {
        year = examAfterM[1];
      }
    }
  }

  // ৪. প্রিফিক্স থেকে ধরনের ফলব্যাক
  if (!type && v.voucherId) {
    const pfx = v.voucherId.split("-")[0];
    if (pfx && VOUCHER_PREFIX_MAP[pfx]) {
      type = VOUCHER_PREFIX_MAP[pfx];
    }
  }

  return {
    session: session ? toBnDigits(session) : "",
    year: year ? toBnDigits(year) : "",
    type,
    challanCodes,
  };
}

function SavedVouchersList() {
  const navigate = useNavigate();
  const [vouchers, setVouchers] = useState<VoucherEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [filterSession, setFilterSession] = useState("all");
  const [filterYear, setFilterYear] = useState("all");
  const [filterType, setFilterType] = useState("all");
  const [filterClass, setFilterClass] = useState("all");
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const listRequests = useRef(new VoucherListRequests());

  const handleDeleteVoucher = async (vid: string, title: string) => {
    const displayTitle = title || vid;
    const confirmMsg = `আপনি কি নিশ্চিত যে "${displayTitle}" ভাউচারটি ডিলিট করতে চান?\n\nভাউচার আইডি: ${vid}`;
    if (!window.confirm(confirmMsg)) return;

    setDeletingId(vid);
    notifyFeedback.loading(`"${displayTitle}" ভাউচার ডিলিট করা হচ্ছে...`, "delete-voucher");
    const sheetId = getSheetId();
    const scriptUrl = getScriptUrl();

    if (!sheetId || !scriptUrl) {
      notifyFeedback.error(
        "কনফিগারেশন ত্রুটি",
        "গুগল শীট আইডি অথবা স্ক্রিপ্ট ইউআরএল পাওয়া যায়নি!",
        "delete-voucher",
      );
      setDeletingId(null);
      return;
    }

    try {
      const response = await deleteVoucherFromServer({
        scriptUrl,
        payload: {
          action: "deleteVoucher",
          id: sheetId,
          voucherId: vid,
        },
      });

      const text = response.text;
      if (text.toLowerCase().includes("<html")) {
        notifyFeedback.error(
          "অ্যাপস স্ক্রিপ্ট ডিপ্লয়মেন্ট আপডেট প্রয়োজন",
          "গুগল থেকে HTML রেসপন্স এসেছে। গুগল অ্যাপস স্ক্রিপ্টে deleteVoucher কোড যুক্ত করে New Version ডিপ্লয় করুন।",
          "delete-voucher",
        );
        setDeletingId(null);
        return;
      }

      const result = JSON.parse(text) as { success?: boolean; error?: string; message?: string };
      if (result.success === true) {
        listRequests.current.deleted(vid);
        purgeCachedVoucher(vid);
        setVouchers((prev) => prev.filter((v) => !voucherIdsMatch(v.voucherId, vid)));
        setLoading(false);
        notifyFeedback.dismiss("fetch-vouchers");
        notifyFeedback.delete(vid, displayTitle);
      } else {
        notifyFeedback.error(
          "ডিলিট ব্যর্থ হয়েছে",
          result.error || "অজানা ত্রুটি",
          "delete-voucher",
        );
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      notifyFeedback.error("ডিলিট রিকোয়েস্টে ত্রুটি", msg, "delete-voucher");
    } finally {
      setDeletingId(null);
    }
  };

  const fetchVouchers = useCallback(async (isManual = false) => {
    const requestVersion = listRequests.current.begin();
    setLoading(true);
    setLoadError(null);
    if (isManual) {
      notifyFeedback.loading("সার্ভার থেকে ভাউচার তালিকা রিফ্রেশ করা হচ্ছে...", "fetch-vouchers");
    }
    try {
      const sheetId = getSheetId();
      const scriptUrl = getScriptUrl();
      if (!sheetId || !scriptUrl) {
        throw new Error("গুগল শীট অথবা সার্ভার কনফিগারেশন পাওয়া যায়নি। আগের তালিকা রাখা হয়েছে।");
      }
      const response = await getVouchersFromServer({
        scriptUrl,
        payload: { action: "getVouchers", id: sheetId },
      });
      const entries = parseSavedVouchersResponse(response.text);
      if (!listRequests.current.isCurrent(requestVersion)) return;
      const currentEntries = listRequests.current.keepCurrent(entries);
      setVouchers(currentEntries);
      if (isManual) {
        notifyFeedback.success(
          "ভাউচার তালিকা হালনাগাদ হয়েছে! 🔄",
          `মোট ${toBnDigits(currentEntries.length)}টি সংরক্ষিত ভাউচার পাওয়া গেছে।`,
          "fetch-vouchers",
        );
      }
    } catch (error: unknown) {
      if (!listRequests.current.isCurrent(requestVersion)) return;
      const message =
        error instanceof Error ? error.message : "সংযোগ ব্যর্থ হয়েছে। আগের তালিকা রাখা হয়েছে।";
      setLoadError(message);
      if (isManual) {
        notifyFeedback.error("ভাউচার তালিকা হালনাগাদ হয়নি", message, "fetch-vouchers");
      }
    } finally {
      if (listRequests.current.isCurrent(requestVersion)) setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchVouchers();
    const requests = listRequests.current;
    return () => requests.invalidate();
  }, [fetchVouchers]);

  // শুধুমাত্র শীটে বিদ্যমান ভাউচারগুলো থেকে সেশনের তালিকা (নতুন সেশন যোগ হলে নিজে থেকেই আসবে)
  const sessionOptions = useMemo(() => {
    const set = new Set<string>();
    vouchers.forEach((v) => {
      const d = extractVoucherDetails(v);
      if (d.session) {
        set.add(d.session);
      }
    });
    return Array.from(set).sort((a, b) => toEnDigits(b).localeCompare(toEnDigits(a)));
  }, [vouchers]);

  // শুধুমাত্র শীটে বিদ্যমান ভাউচারগুলো থেকে পরীক্ষার সালের তালিকা (নতুন সাল যোগ হলে নিজে থেকেই আসবে)
  const yearOptions = useMemo(() => {
    const set = new Set<string>();
    vouchers.forEach((v) => {
      const d = extractVoucherDetails(v);
      if (d.year) {
        set.add(d.year);
      }
    });
    return Array.from(set).sort((a, b) => toEnDigits(b).localeCompare(toEnDigits(a)));
  }, [vouchers]);

  // শুধুমাত্র শীটে বিদ্যমান ভাউচারগুলো থেকে ধরনের তালিকা (নতুন ধরন যোগ হলে নিজে থেকেই আসবে)
  const typeOptions = useMemo(() => {
    const set = new Set<string>();
    vouchers.forEach((v) => {
      const d = extractVoucherDetails(v);
      if (d.type) {
        set.add(d.type);
      } else if (v.configName) {
        set.add(v.configName);
      }
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b, "bn"));
  }, [vouchers]);

  // শ্রেণি / বর্ষ ফিল্টার অপশন
  const classOptions = useMemo(() => {
    const set = new Set<string>();
    vouchers.forEach((v) => {
      let state: any = null;
      if (v.fullState) {
        try {
          state = typeof v.fullState === "string" ? JSON.parse(v.fullState) : v.fullState;
        } catch {}
      }
      const cl = state?.classLevel || state?.class || "";
      if (cl && cl.trim()) set.add(cl.trim());
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b, "bn"));
  }, [vouchers]);

  // ফিল্টারকৃত ভাউচার তালিকা
  const filtered = useMemo(() => {
    return vouchers.filter((v) => {
      const details = extractVoucherDetails(v);

      // ১. সেশন ফিল্টার
      if (filterSession !== "all") {
        const normFilterSession = toBnDigits(filterSession);
        const normItemSession = toBnDigits(details.session);
        const matchesSession =
          normItemSession === normFilterSession ||
          toBnDigits(v.examName).includes(`(${normFilterSession})`) ||
          toBnDigits(v.examName).includes(normFilterSession);
        if (!matchesSession) return false;
      }

      // ২. পরীক্ষার সাল ফিল্টার (Exam Year)
      // শুধুমাত্র পরীক্ষার সালের সাথে মিলবে (ভাউচার আইডি বা তৈরির তারিখ দিয়ে নয়)
      if (filterYear !== "all") {
        const normFilterYear = toBnDigits(filterYear);
        const normItemYear = toBnDigits(details.year);
        const matchesYear =
          normItemYear === normFilterYear ||
          toBnDigits(v.examName).match(new RegExp(`[-–\\s]${normFilterYear}\\s*$`)) !== null ||
          toBnDigits(v.examName).includes(`পরীক্ষা-${normFilterYear}`);
        if (!matchesYear) return false;
      }

      // ৩. ভাউচারের ধরন ফিল্টার
      if (filterType !== "all") {
        const matchesType = details.type === filterType || v.configName === filterType;
        if (!matchesType) return false;
      }

      // ৪. শ্রেণি / বর্ষ ফিল্টার
      if (filterClass !== "all") {
        let state: any = null;
        if (v.fullState) {
          try {
            state = typeof v.fullState === "string" ? JSON.parse(v.fullState) : v.fullState;
          } catch {}
        }
        const cl = state?.classLevel || state?.class || "";
        if (cl.trim() !== filterClass) return false;
      }

      // ৫. টেক্সট সার্চ
      if (search.trim()) {
        const term = search.trim().toLowerCase();
        const termBn = toBnDigits(term);
        const termEn = toEnDigits(term);
        const vid = String(v.voucherId || "").toLowerCase();
        const exName = String(v.examName || "").toLowerCase();
        const confName = String(v.configName || "").toLowerCase();

        const challanMatch = details.challanCodes.some(
          (c) =>
            c.toLowerCase().includes(term) ||
            c.toLowerCase().includes(termEn) ||
            toBnDigits(c).includes(termBn),
        );

        const match =
          vid.includes(term) ||
          vid.includes(termEn) ||
          exName.includes(term) ||
          toBnDigits(exName).includes(termBn) ||
          toEnDigits(exName).includes(termEn) ||
          confName.includes(term) ||
          challanMatch;
        if (!match) return false;
      }

      return true;
    });
  }, [vouchers, filterSession, filterYear, filterType, filterClass, search]);

  // ফিল্টারকৃত ভাউচারগুলোর মোট আয়
  const totals = useMemo(() => {
    let income = 0;

    filtered.forEach((v) => {
      let state: any = null;
      if (v.fullState) {
        try {
          state = typeof v.fullState === "string" ? JSON.parse(v.fullState) : v.fullState;
        } catch {}
      }
      const slug = VOUCHERS.find((x) => x.name === v.configName)?.slug || state?.slug;
      const fin = calculateVoucherFinancials(state, slug, v.income, v.expenses);
      income += fin.income;
    });

    return { income };
  }, [filtered]);

  const hasActiveFilter =
    filterSession !== "all" ||
    filterYear !== "all" ||
    filterType !== "all" ||
    filterClass !== "all" ||
    search.trim() !== "";

  const resetFilters = () => {
    setFilterSession("all");
    setFilterYear("all");
    setFilterType("all");
    setFilterClass("all");
    setSearch("");
  };

  return (
    <div className="mx-auto max-w-7xl px-6 py-10 border-t border-border">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-5 gap-4">
        <div>
          <h2 className="text-xl font-bold text-foreground">আগের ভাউচার খুঁজুন</h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            সেশন, পরীক্ষার সাল বা ভাউচারের ধরন অনুযায়ী সহজেই ফিল্টার ও সার্চ করুন
          </p>
        </div>
        <button
          onClick={() => fetchVouchers(true)}
          disabled={loading || deletingId !== null}
          className="button text-xs py-2 px-3.5 bg-secondary text-secondary-foreground hover:bg-secondary/80 flex items-center gap-1.5 transition-colors"
          title="সার্ভার থেকে পুনরায় লোড করুন"
        >
          <span>{loading ? "লোড হচ্ছে..." : "🔄 রিফ্রেশ"}</span>
        </button>
      </div>

      {/* ফিল্টার বক্স: session, year, voucher type, search */}
      <div className="bg-card p-4 rounded-lg border border-border shadow-sm mb-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
          {/* ১. সেশন (Session) */}
          <div>
            <label className="block text-xs font-semibold text-foreground mb-1.5">
              শিক্ষাবর্ষ / সেশন
            </label>
            <select
              className="input w-full text-xs py-2 h-9 bg-background cursor-pointer"
              value={filterSession}
              onChange={(e) => setFilterSession(e.target.value)}
            >
              <option value="all">
                সকল সেশন{" "}
                {sessionOptions.length > 0
                  ? `(${toBnDigits(sessionOptions.length)}টি)`
                  : "(সবগুলো)"}
              </option>
              {sessionOptions.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>

          {/* ২. সাল / বছর (Year) */}
          <div>
            <label className="block text-xs font-semibold text-foreground mb-1.5">
              সাল / বছর (Exam Year)
            </label>
            <select
              className="input w-full text-xs py-2 h-9 bg-background cursor-pointer"
              value={filterYear}
              onChange={(e) => setFilterYear(e.target.value)}
            >
              <option value="all">
                সকল সাল{" "}
                {yearOptions.length > 0 ? `(${toBnDigits(yearOptions.length)}টি)` : "(সবগুলো)"}
              </option>
              {yearOptions.map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>
          </div>

          {/* ৩. ভাউচারের ধরন (Voucher Type) */}
          <div>
            <label className="block text-xs font-semibold text-foreground mb-1.5">
              ভাউচারের ধরন
            </label>
            <select
              className="input w-full text-xs py-2 h-9 bg-background cursor-pointer"
              value={filterType}
              onChange={(e) => setFilterType(e.target.value)}
            >
              <option value="all">
                সকল ধরন{" "}
                {typeOptions.length > 0 ? `(${toBnDigits(typeOptions.length)}টি)` : "(সবগুলো)"}
              </option>
              {typeOptions.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </div>

          {/* ৪. শ্রেণি / বর্ষ ফিল্টার */}
          <div>
            <label className="block text-xs font-semibold text-foreground mb-1.5">
              শ্রেণি / বর্ষ
            </label>
            <select
              className="input w-full text-xs py-2 h-9 bg-background cursor-pointer"
              value={filterClass}
              onChange={(e) => setFilterClass(e.target.value)}
            >
              <option value="all">
                সকল বর্ষ{" "}
                {classOptions.length > 0 ? `(${toBnDigits(classOptions.length)}টি)` : "(সবগুলো)"}
              </option>
              {classOptions.map((cl) => (
                <option key={cl} value={cl}>
                  {cl}
                </option>
              ))}
            </select>
          </div>

          {/* ৫. সার্চ ইনপুট */}
          <div>
            <label className="block text-xs font-semibold text-foreground mb-1.5">
              নাম বা আইডি দিয়ে খুঁজুন
            </label>
            <input
              type="text"
              placeholder="সার্চ করুন..."
              className="input w-full text-xs py-2 h-9"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </div>

        {/* ফিল্টার স্ট্যাটাস ও রিসেট বার */}
        <div className="flex flex-wrap justify-between items-center mt-3 pt-3 border-t border-border/60 text-xs gap-2">
          <div className="text-muted-foreground flex flex-wrap items-center gap-2.5">
            {hasActiveFilter ? (
              <span>
                ফিল্টার অনুযায়ী পাওয়া গেছে:{" "}
                <strong className="text-primary font-semibold">
                  {toBnDigits(filtered.length)}
                </strong>{" "}
                টি ভাউচার (মোট {toBnDigits(vouchers.length)} টির মধ্যে)
              </span>
            ) : (
              <span>
                মোট সংরক্ষিত ভাউচার:{" "}
                <strong className="text-foreground font-semibold">
                  {toBnDigits(vouchers.length)}
                </strong>{" "}
                টি
              </span>
            )}
            {totals.income > 0 && (
              <span className="font-semibold text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 px-2.5 py-0.5 rounded-md">
                মোট আয়: ৳{money(totals.income)}/-
              </span>
            )}
          </div>
          {hasActiveFilter && (
            <button
              onClick={resetFilters}
              className="text-xs text-destructive hover:underline font-medium px-2 py-1 rounded hover:bg-destructive/10 transition-colors"
            >
              ✕ ফিল্টার রিসেট
            </button>
          )}
        </div>
      </div>

      {loadError && (
        <p
          role="alert"
          className="mb-4 rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive"
        >
          ভাউচার তালিকা লোড হয়নি। {loadError}
        </p>
      )}
      <div className="bg-card rounded-lg border border-border overflow-hidden">
        {filtered.length === 0 ? (
          <div className="p-8 text-center text-muted-foreground">
            {loading
              ? "ভাউচার লোড হচ্ছে..."
              : hasActiveFilter
                ? "নির্বাচিত ফিল্টারে কোনো ভাউচার পাওয়া যায়নি।"
                : "কোনো ভাউচার পাওয়া যায়নি।"}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-secondary/50">
                <tr>
                  <th className="p-3 font-semibold whitespace-nowrap text-center">তারিখ ও সময়</th>
                  <th className="p-3 font-semibold whitespace-nowrap text-center">ভাউচার আইডি</th>
                  <th className="p-3 font-semibold text-center">ভাউচারের ধরন</th>
                  <th className="p-3 font-semibold text-center">পরীক্ষার নাম</th>
                  <th className="p-3 font-semibold text-center">আয় (৳)</th>
                  <th className="p-3 font-semibold text-center whitespace-nowrap">অ্যাকশন</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filtered.map((v) => {
                  let state: any = null;
                  if (v.fullState) {
                    try {
                      state =
                        typeof v.fullState === "string" ? JSON.parse(v.fullState) : v.fullState;
                    } catch {}
                  }
                  const slug = VOUCHERS.find((x) => x.name === v.configName)?.slug || state?.slug;
                  const fin = calculateVoucherFinancials(state, slug, v.income, v.expenses);
                  const details = extractVoucherDetails(v);

                  return (
                    <tr key={v.voucherId} className="hover:bg-muted/50 transition-colors">
                      <td className="p-3 whitespace-nowrap">
                        {new Date(v.timestamp).toLocaleString("bn-BD")}{" "}
                        {v.isLocal && (
                          <span className="text-[10px] bg-yellow-100 text-yellow-800 px-1 rounded">
                            Local
                          </span>
                        )}
                      </td>
                      <td className="p-3 font-mono text-xs whitespace-nowrap">{v.voucherId}</td>
                      <td className="p-3">
                        <span className="inline-block px-2 py-0.5 rounded text-xs bg-secondary/80 font-medium">
                          {v.configName}
                        </span>
                      </td>
                      <td className="p-3 font-medium">
                        <div>{v.examName}</div>
                        {details.challanCodes.length > 0 && (
                          <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
                            {details.challanCodes.map((cc, cIdx) => (
                              <span
                                key={cIdx}
                                className="inline-flex items-center text-[10px] font-mono px-1.5 py-0.5 rounded bg-muted/80 text-muted-foreground border border-border"
                                title={`সংরক্ষিত চালান: ${cc}`}
                              >
                                🏛️ {cc}
                              </span>
                            ))}
                          </div>
                        )}
                      </td>
                      <td className="p-3 text-right font-semibold text-emerald-600 dark:text-emerald-400 num whitespace-nowrap">
                        {fin.income > 0 ? `${money(fin.income)}/-` : "—"}
                      </td>
                      <td className="p-3 text-right whitespace-nowrap">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={() => {
                              try {
                                const parsedState =
                                  typeof v.fullState === "string"
                                    ? JSON.parse(v.fullState)
                                    : v.fullState;
                                const voucherSlug =
                                  VOUCHERS.find((x) => x.name === v.configName)?.slug ||
                                  parsedState.slug ||
                                  "nirbachoni";

                                notifyFeedback.open(v.voucherId, v.examName || v.configName);

                                // সাময়িকভাবে মেমোরিতে লোড করা (লোকাল স্টোরেজে স্থায়ী সংরক্ষণ বন্ধ)
                                if (v.fullState) {
                                  storeTempVoucher(v.voucherId, parsedState);
                                }
                                navigate({
                                  to: "/voucher/$slug",
                                  params: { slug: voucherSlug },
                                  search: { loadId: v.voucherId, classLevel: undefined },
                                });
                              } catch {
                                notifyFeedback.error(
                                  "ভাউচার খুলতে সমস্যা",
                                  "ভাউচারের ডাটা লোড করা যায়নি!",
                                );
                              }
                            }}
                            className="button text-xs py-1.5 px-3 bg-primary text-primary-foreground hover:bg-primary/90"
                          >
                            খুলুন / এডিট
                          </button>
                          <button
                            onClick={() =>
                              handleDeleteVoucher(v.voucherId, v.examName || v.configName)
                            }
                            disabled={deletingId !== null}
                            className="button text-xs py-1.5 px-2.5 bg-red-100 text-red-700 hover:bg-red-600 hover:text-white transition-colors disabled:opacity-50"
                            title="ভাউচারটি মুছে ফেলুন"
                          >
                            {deletingId === v.voucherId ? "মুছছে..." : "🗑️ মুছুন"}
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot className="bg-secondary/60 border-t-2 border-border font-semibold text-sm">
                <tr>
                  <td colSpan={4} className="p-3 text-right font-bold">
                    সর্বমোট{" "}
                    {hasActiveFilter
                      ? `(ফিল্টারকৃত ${toBnDigits(filtered.length)}টি)`
                      : `(${toBnDigits(vouchers.length)}টি)`}
                    :
                  </td>
                  <td className="p-3 text-right text-emerald-600 dark:text-emerald-400 num font-bold">
                    {totals.income > 0 ? `${money(totals.income)}/-` : "—"}
                  </td>
                  <td className="p-3" />
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
