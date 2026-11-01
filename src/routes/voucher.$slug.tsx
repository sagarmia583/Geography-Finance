/* =============================================================================
 *  ভূগোল ও পরিবেশ বিভাগ — কুমুদিনী সরকারি কলেজ, টাঙ্গাইল
 *  পুরো ফাইন্যান্স/ভাউচার অ্যাপের সম্পূর্ণ কোড — একটি ফাইলে।
 *  (লজিক, কনফিগ, কম্পোনেন্ট, প্রিন্ট লেআউট, এন্ট্রি ফর্ম — সব এখানেই)
 * ========================================================================== */

import { createFileRoute, Link, notFound, redirect } from "@tanstack/react-router";
import { useEffect, useMemo, useState, useRef, type ReactNode } from "react";
import { useServerFn } from "@tanstack/react-start";
import {
  importSheetValues,
  saveVoucherToServer,
  getVouchersFromServer,
} from "@/lib/sheets.functions";
import {
  getSheetId,
  getScriptUrl,
  orgInfoAtom,
  DEFAULT_ORG_INFO,
  parseOrgSettings,
  type OrgInfo,
} from "@/lib/config";
import { notifyFeedback } from "@/lib/feedback";
import { getSessionStatus } from "@/lib/auth.functions";
import { purgeVoucherCaches } from "@/lib/voucher-cache";
import {
  calculateVoucherTotals,
  nonNegativeNumber,
  questionScriptAmount,
  resolveEarningAmount,
} from "@/lib/voucher-finance";
export {
  calculateVoucherFinancials,
  type VoucherFinancials,
} from "@/lib/voucher-finance";
import {
  VoucherChallanSection,
  type VoucherChallans,
  type ChallanBreakdownItem,
  getDefaultChallanYear,
} from "@/components/ChallanManager";
import { formatChallanCodesSummary } from "@/components/VoucherQRCode";
import { useAtom } from "jotai";
import { atomWithStorage } from "jotai/utils";

/* ---------------------------------------------------------------------------
 * ১. প্রতিষ্ঠানের তথ্য (ডিফল্ট ও ডাইনামিক শীট কনফিগারেশন)
 * ------------------------------------------------------------------------ */

export { orgInfoAtom, DEFAULT_ORG_INFO, parseOrgSettings, type OrgInfo };
export const DEPT = DEFAULT_ORG_INFO.dept;
export const COLLEGE = DEFAULT_ORG_INFO.college;
export const PHONE = DEFAULT_ORG_INFO.phone;
export const EMAIL = DEFAULT_ORG_INFO.email;
export const WEB = DEFAULT_ORG_INFO.web;

/* ---------------------------------------------------------------------------
 * ২. সংখ্যা ও টাকা (বাংলা)
 * ------------------------------------------------------------------------ */

const BN_DIGITS = ["০", "১", "২", "৩", "৪", "৫", "৬", "৭", "৮", "৯"];

export function toBn(value: number | string): string {
  return String(value).replace(/\d/g, (d) => BN_DIGITS[Number(d)]!);
}

export function money(n: number): string {
  const rounded = Math.round((n + Number.EPSILON) * 100) / 100;
  return toBn(
    rounded.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
  );
}

const ONES = [
  "",
  "এক",
  "দুই",
  "তিন",
  "চার",
  "পাঁচ",
  "ছয়",
  "সাত",
  "আট",
  "নয়",
  "দশ",
  "এগারো",
  "বারো",
  "তেরো",
  "চৌদ্দ",
  "পনেরো",
  "ষোলো",
  "সতেরো",
  "আঠারো",
  "উনিশ",
  "বিশ",
  "একুশ",
  "বাইশ",
  "তেইশ",
  "চব্বিশ",
  "পঁচিশ",
  "ছাব্বিশ",
  "সাতাশ",
  "আটাশ",
  "ঊনত্রিশ",
  "ত্রিশ",
  "একত্রিশ",
  "বত্রিশ",
  "তেত্রিশ",
  "চৌত্রিশ",
  "পঁয়ত্রিশ",
  "ছত্রিশ",
  "সাঁইত্রিশ",
  "আটত্রিশ",
  "ঊনচল্লিশ",
  "চল্লিশ",
  "একচল্লিশ",
  "বিয়াল্লিশ",
  "তেতাল্লিশ",
  "চুয়াল্লিশ",
  "পঁয়তাল্লিশ",
  "ছেচল্লিশ",
  "সাতচল্লিশ",
  "আটচল্লিশ",
  "ঊনপঞ্চাশ",
  "পঞ্চাশ",
  "একান্ন",
  "বায়ান্ন",
  "তিপ্পান্ন",
  "চুয়ান্ন",
  "পঞ্চান্ন",
  "ছাপ্পান্ন",
  "সাতান্ন",
  "আটান্ন",
  "ঊনষাট",
  "ষাট",
  "একষট্টি",
  "বাষট্টি",
  "তেষট্টি",
  "চৌষট্টি",
  "পঁয়ষট্টি",
  "ছেষট্টি",
  "সাতষট্টি",
  "আটষট্টি",
  "ঊনসত্তর",
  "সত্তর",
  "একাত্তর",
  "বাহাত্তর",
  "তিয়াত্তর",
  "চুয়াত্তর",
  "পঁচাত্তর",
  "ছিয়াত্তর",
  "সাতাত্তর",
  "আটাত্তর",
  "ঊনআশি",
  "আশি",
  "একাশি",
  "বিরাশি",
  "তিরাশি",
  "চুরাশি",
  "পঁচাশি",
  "ছিয়াশি",
  "সাতাশি",
  "আটাশি",
  "ঊননব্বই",
  "নব্বই",
  "একানব্বই",
  "বিরানব্বই",
  "তিরানব্বই",
  "চুরানব্বই",
  "পঁচানব্বই",
  "ছিয়ানব্বই",
  "সাতানব্বই",
  "আটানব্বই",
  "নিরানব্বই",
];

function below100(n: number): string {
  return ONES[n] ?? "";
}

function below1000(n: number): string {
  const h = Math.floor(n / 100);
  const r = n % 100;
  const parts: string[] = [];
  if (h) parts.push(`${below100(h)}শত`);
  if (r) parts.push(below100(r));
  return parts.join(" ");
}

/** সংখ্যাকে বাংলা কথায় রূপান্তর (টাকা/পয়সা সহ) */
export function bnWords(amount: number): string {
  if (!Number.isFinite(amount)) return "শূন্য টাকা মাত্র।";
  const neg = amount < 0;
  const abs = Math.abs(Math.round((amount + Number.EPSILON) * 100) / 100);
  let taka = Math.floor(abs);
  const poisha = Math.round((abs - taka) * 100);
  if (taka === 0 && poisha === 0) return "শূন্য টাকা মাত্র।";

  const chunks: string[] = [];
  const crore = Math.floor(taka / 10000000);
  taka %= 10000000;
  const lakh = Math.floor(taka / 100000);
  taka %= 100000;
  const thousand = Math.floor(taka / 1000);
  taka %= 1000;

  if (crore) chunks.push(`${below1000(crore)} কোটি`);
  if (lakh) chunks.push(`${below100(lakh)} লক্ষ`);
  if (thousand) chunks.push(`${below100(thousand)} হাজার`);
  if (taka) chunks.push(below1000(taka));

  let out = chunks.filter(Boolean).join(" ").trim();
  out = out ? `${out} টাকা` : "শূন্য টাকা";
  if (poisha) out += ` ${below100(poisha)} পয়সা`;
  return `${neg ? "ঋণাত্মক " : ""}${out} মাত্র।`;
}

export const sum = (nums: number[]) => nums.reduce((a, b) => a + b, 0);
export const uid = () => Math.random().toString(36).slice(2, 10);

/** ভাউচার আইডি: <slug সংক্ষেপ>-<সাল>-<৪ ডিজিট নম্বর> (যেমন: TEST-2026-4821) */
export function makeVoucherId(slug: string) {
  const map: Record<string, string> = {
    nirbachoni: "TEST",
    incourse: "INCOURSE",
    "babosthapona-fee": "MANAGEMENT",
    "kendro-fee": "CENTER",
    "bhorti-babosthapona-fee": "ADMISSION",
    "term-paper": "TERM",
    mowkhik: "VIVA",
    bebaharik: "PRACTICAL",
    abedon: "APP",
    "shikkha-sofor": "TOUR",
  };
  const short = map[slug] || slug.toUpperCase().slice(0, 4);
  const y = new Date().getFullYear();
  const rand = Math.floor(1000 + Math.random() * 9000);
  return `${short}-${y}-${rand}`;
}

/** ভাউচার নম্বরের শেষের অংশ ৪ ডিজিট নিশ্চিত করা (যেমন: TEST-2026-40349213 -> TEST-2026-4034) */
export function formatVoucherNumber(id: string): string {
  if (!id) return "";
  const parts = id.trim().split("-");
  if (parts.length >= 3) {
    const last = parts[parts.length - 1]!;
    if (last.length > 4) {
      parts[parts.length - 1] = last.slice(0, 4);
      return parts.join("-");
    }
  }
  return id;
}

/* ---------------------------------------------------------------------------
 * ৩. উৎসে কর ও স্ট্যাম্প (বন্টনের ক্ষেত্রে)
 * ------------------------------------------------------------------------ */

export const CLASSES = [
  "অনার্স ১ম বর্ষ",
  "অনার্স ২য় বর্ষ",
  "অনার্স ৩য় বর্ষ",
  "অনার্স ৪র্থ বর্ষ",
  "মাস্টার্স শেষ পর্ব",
  "ডিগ্রী ৩য় বর্ষ",
  "একাদশ শ্রেণি",
  "দ্বাদশ শ্রেণি",
  "উচ্চমাধ্যমিক",
] as const;

/** পূর্ণ পরীক্ষার শিরোনাম: অনার্স ১ম বর্ষ (২০২৪-২৫) নির্বাচনী পরীক্ষা-২০২৬ */
export function examTitle(d: {
  classLevel?: string;
  session?: string;
  examName?: string;
  year?: string;
}) {
  const parts: string[] = [];
  if (d.classLevel) parts.push(d.classLevel);
  if (d.session) parts.push(`(${toBn(d.session)})`);
  const nm = d.examName?.trim();
  if (nm) parts.push(d.year ? `${nm}-${toBn(d.year)}` : nm);
  return parts.join(" ");
}

export const TAX_RATE = 0.1;
export const STAMP_THRESHOLD = 400;
export const STAMP_AMOUNT = 10;

export type PayRow = {
  id: string;
  name: string;
  designation: string;
  amount: number;
  questions?: number;
  scripts?: number;
  qsMoney?: number;
  scriptMoney?: number;
};
export type SettledRow = PayRow & { tax: number; stamp: number; net: number };

export function settle(row: PayRow): SettledRow {
  const exempt = ["কম্পিউটার অপারেটর", "অফিস সহায়ক", "অফিস সহায়ক", "অফিস", "শিক্ষক পরিষদ"];
  const d = row.designation?.trim() || "";
  const n = row.name?.trim() || "";
  const isNoTax = exempt.includes(d) || exempt.includes(n);

  const amount = nonNegativeNumber(row.amount);
  const tax = isNoTax ? 0 : Math.round(amount * TAX_RATE * 100) / 100;
  const stamp = amount >= STAMP_THRESHOLD ? STAMP_AMOUNT : 0;
  return { ...row, amount, tax, stamp, net: Math.max(0, amount - tax - stamp) };
}
export const settleAll = (rows: PayRow[]) => rows.map(settle);

/* ---------------------------------------------------------------------------
 * ৪. খাতভিত্তিক ভ্যাট ও ট্যাক্স তালিকা (ডিফল্ট — গুগল শীট থেকেও লোড হয়)
 * ------------------------------------------------------------------------ */

export type Sector = { code: string; name: string; vat: number; tax: number };

export const DEFAULT_SECTORS: Sector[] = [
  { code: "3211102", name: "পরিষ্কার পরিচ্ছন্নতা সামগ্রী", vat: 0.1, tax: 0.05 },
  { code: "3211104", name: "আনুষঙ্গিক কর্মচারী/প্রতিষ্ঠান", vat: 0, tax: 0.05 },
  {
    code: "3211106",
    name: "আপ্যায়ন ব্যয় (রেস্তোরা ৫% / নন-এসি ১০% / এসি ১৫%)",
    vat: 0.05,
    tax: 0.05,
  },
  { code: "3211110", name: "আইন সংক্রান্ত ব্যয়", vat: 0.15, tax: 0.15 },
  { code: "3211111", name: "প্রশিক্ষণ/সেমিনার/কনফারেন্স ব্যয়", vat: 0.15, tax: 0.04 },
  { code: "3211116", name: "কুরিয়ার", vat: 0.15, tax: 0.04 },
  { code: "3211117", name: "ইন্টারনেট", vat: 0.05, tax: 0.05 },
  { code: "3211125", name: "প্রচার-বিজ্ঞাপন ও পেপার বিজ্ঞাপন", vat: 0.15, tax: 0.05 },
  { code: "3211127", name: "বইপত্র সাময়িকী", vat: 0.1, tax: 0.05 },
  { code: "3211128", name: "প্রকাশনা", vat: 0.15, tax: 0.05 },
  { code: "3211129", name: "অফিস ভবন ভাড়া", vat: 0.15, tax: 0.1 },
  { code: "3211131", name: "আউটসোর্সিং / মানব সম্পদ সরবরাহ", vat: 0.15, tax: 0.05 },
  { code: "3221106", name: "পরিবহন ব্যয় (পণ্য পরিবহন)", vat: 0.15, tax: 0.02 },
  { code: "3231301", name: "প্রশিক্ষণ", vat: 0.15, tax: 0.2 },
  { code: "3252104", name: "পথ্য সামগ্রী", vat: 0.1, tax: 0.05 },
  { code: "3252108", name: "স্বাস্থ্যবিধান সামগ্রী", vat: 0.1, tax: 0.05 },
  { code: "3253103", name: "নিরাপত্তা সেবা", vat: 0.15, tax: 0.05 },
  { code: "3255101", name: "কম্পিউটার সামগ্রী", vat: 0.1, tax: 0.05 },
  { code: "3255102", name: "মুদ্রণ ও বাঁধাই", vat: 0.15, tax: 0.05 },
  { code: "3255104", name: "স্ট্যাম্প ও সিল", vat: 0.1, tax: 0.05 },
  { code: "3255105", name: "অন্যান্য মনিহারী (কাগজ, কলম, স্টেশনারী)", vat: 0.1, tax: 0.05 },
  { code: "3256103", name: "ব্যবহার্য সামগ্রী", vat: 0.1, tax: 0.05 },
  { code: "3256106", name: "পোশাক", vat: 0.1, tax: 0.05 },
  { code: "3257206", name: "সম্মানী", vat: 0, tax: 0.2 },
  { code: "3257301", name: "অনুষ্ঠান/উৎসবাদি", vat: 0.1, tax: 0.05 },
  { code: "3258101", name: "মোটরযান মেরামত", vat: 0.15, tax: 0.02 },
  { code: "3258102", name: "আসবাবপত্র মেরামত", vat: 0.15, tax: 0.02 },
  { code: "3258104", name: "কম্পিউটার মেরামত", vat: 0.15, tax: 0.02 },
  { code: "3258105", name: "অন্যান্য যন্ত্রপাতি ও সরঞ্জামাদি মেরামত", vat: 0.15, tax: 0.02 },
  { code: "3258106", name: "আবাসিক ভবন মেরামত", vat: 0.15, tax: 0.05 },
  { code: "3258107", name: "অনাবাসিক ভবন মেরামত", vat: 0.15, tax: 0.05 },
  { code: "3258108", name: "অন্যান্য ভবন ও স্থাপনা", vat: 0.15, tax: 0.05 },
  { code: "4112201", name: "তথ্য ও যোগাযোগ প্রযুক্তি সরঞ্জামাদি", vat: 0.05, tax: 0.05 },
  { code: "4112202", name: "কম্পিউটার ও আনুষঙ্গিক ক্রয়", vat: 0.1, tax: 0.05 },
  { code: "4112204", name: "টেলিযোগাযোগ সামগ্রী", vat: 0.1, tax: 0.05 },
  { code: "4112303", name: "বৈদ্যুতিক সরঞ্জামাদি", vat: 0.1, tax: 0.05 },
  { code: "4112306", name: "গবেষণাগার সরঞ্জামাদি", vat: 0.1, tax: 0.05 },
  { code: "4112110", name: "অফিস সরঞ্জামাদি", vat: 0.1, tax: 0.05 },
  { code: "4112314", name: "আসবাবপত্র ক্রয়", vat: 0.15, tax: 0.05 },
  { code: "4112316", name: "অন্যান্য যন্ত্রপাতি ও সরঞ্জামাদি", vat: 0.1, tax: 0.05 },
  { code: "4113301", name: "কম্পিউটার সফটওয়্যার", vat: 0.1, tax: 0.05 },
  { code: "purto", name: "নির্মাণ সামগ্রী / পূর্ত কাজ", vat: 0.1, tax: 0.05 },
];

export function useSectors() {
  const [sectors, setSectors] = useState<Sector[]>(DEFAULT_SECTORS);
  const save = (list: Sector[]) => {
    setSectors(list);
  };
  return { sectors, save };
}

/* ---------------------------------------------------------------------------
 * ৫. পদবীভিত্তিক বন্টনের হার (ব্যবস্থাপনা / ভর্তি ব্যবস্থাপনা / কেন্দ্র ফী)
 * ------------------------------------------------------------------------ */

export const DESIGNATIONS = [
  "অধ্যক্ষ",
  "উপাধ্যক্ষ",
  "বিভাগীয় প্রধান",
  "সহযোগী অধ্যাপক",
  "সহকারী অধ্যাপক",
  "প্রভাষক",
  "কম্পিউটার অপারেটর",
  "অফিস সহায়ক",
];

export type MasterRates = {
  examType: string;
  question: number;
  script: number;
  perStudent?: number;
};
export type MasterProduct = { name: string; sector: string; vat: number; tax: number };
export type MasterPercent = { designation: string; percent: number; examType?: string };
export interface MasterTeacher {
  name: string;
  designation: string;
  category: string;
  classes: string[];
  pages: string[];
}

export type MasterDB = {
  rates: MasterRates[];
  products: MasterProduct[];
  percentages: MasterPercent[];
  teachers: MasterTeacher[];
};

export const defaultDB: MasterDB = {
  rates: [
    { examType: "TEST", question: 400, script: 10, perStudent: 0 },
    { examType: "INCOURSE", question: 300, script: 14, perStudent: 0 },
  ],
  products: [
    { name: "কাগজ", sector: "অন্যান্য মনিহারী", vat: 0.1, tax: 0.05 },
    { name: "কলম", sector: "অন্যান্য মনিহারী", vat: 0.1, tax: 0.05 },
    { name: "সম্মানী", sector: "সম্মানী", vat: 0, tax: 0.2 },
  ],
  percentages: [],
  teachers: [],
};

export const dbAtom = atomWithStorage<MasterDB>("kgc-master-db", defaultDB);

export const rateFor = (slug: string, designation: string, db: MasterDB) => {
  const typeMap: Record<string, string> = {
    nirbachoni: "TEST",
    incourse: "INCOURSE",
    "babosthapona-fee": "MANAGEMENT",
    "kendro-fee": "CENTER",
    "bhorti-babosthapona-fee": "ADMISSION",
    "term-paper": "TERM",
  };
  const norm = (s: string) =>
    (s || "")
      .normalize("NFC")
      .replace(/য়/g, "য়")
      .replace(/ড়/g, "ড়")
      .replace(/ঢ়/g, "ঢ়")
      .replace(/\s+/g, " ")
      .trim();
  const exType = typeMap[slug] || slug.toUpperCase();
  const validRates = db.percentages.filter(
    (p) => p.examType === exType || p.examType === "ALL" || !p.examType,
  );

  const nDesig = norm(designation);
  let match = validRates.find((p) => norm(p.designation) === nDesig);

  if (!match) {
    if (nDesig.includes("বিভাগ")) {
      match = validRates.find((p) => norm(p.designation).includes("বিভাগ"));
    } else if (nDesig.includes("উপাধ্যক্ষ")) {
      match = validRates.find((p) => norm(p.designation).includes("উপাধ্যক্ষ"));
    } else if (nDesig.includes("অধ্যক্ষ") && !nDesig.includes("উপাধ্যক্ষ")) {
      match = validRates.find(
        (p) =>
          norm(p.designation).includes("অধ্যক্ষ") && !norm(p.designation).includes("উপাধ্যক্ষ"),
      );
    } else if (nDesig.includes("সহায়ক") || nDesig.includes("সহায়ক")) {
      match = validRates.find(
        (p) => norm(p.designation).includes("সহায়ক") || norm(p.designation).includes("সহায়ক"),
      );
    } else if (nDesig.includes("অফিস")) {
      match = validRates.find((p) => norm(p.designation).includes("অফিস"));
    } else if (nDesig.includes("সদস্য")) {
      match = validRates.find((p) => norm(p.designation).includes("সদস্য"));
    }
  }

  return match ? match.percent : 0;
};

export const isClassMatch = (targetClass: string, sheetClasses: string[]) => {
  if (!targetClass) return false;
  const norm = (s: string) =>
    (s || "")
      .toLowerCase()
      .normalize("NFC")
      .replace(/\s+/g, "")
      .replace(/য়/g, "য়")
      .replace(/ড়/g, "ড়")
      .replace(/ঢ়/g, "ঢ়")
      .replace("1st", "১ম")
      .replace("2nd", "২য়")
      .replace("3rd", "৩য়")
      .replace("4th", "৪র্থ")
      .replace("honours", "অনার্স")
      .replace("masters", "মাস্টার্স")
      .replace("final", "শেষপর্ব")
      .replace("year", "বর্ষ")
      .replace("degree", "ডিগ্রী")
      .replace("intermediate", "উচ্চমাধ্যমিক")
      .replace("intermidiate", "উচ্চমাধ্যমিক") // common typo
      .replace("hsc", "উচ্চমাধ্যমিক")
      .replace("class11", "একাদশশ্রেণি")
      .replace("class12", "দ্বাদশশ্রেণি");

  const nTarget = norm(targetClass);
  return sheetClasses.some((c) => {
    const nC = norm(c);
    return nC === nTarget || nC.includes(nTarget) || nTarget.includes(nC);
  });
};

/* ---------------------------------------------------------------------------
 * ৬. ভাউচারের ধরন
 * ------------------------------------------------------------------------ */

export type VoucherConfig = {
  slug: string;
  name: string;
  short: string;
  pages: string;
  sections: {
    incomeStatement: boolean;
    expenses: boolean;
    qs: boolean;
    adminDuty: boolean;
    invigilatorDuty?: boolean;
    percentRows: boolean;
    designationBased?: boolean;
    isApplication?: boolean;
  };
};

const feeSections = {
  incomeStatement: true,
  expenses: false,
  qs: false,
  adminDuty: false,
  invigilatorDuty: false,
  percentRows: true,
};

export const VOUCHERS: VoucherConfig[] = [
  {
    slug: "nirbachoni",
    name: "নির্বাচনী পরীক্ষা",
    short: "আয়, ব্যয়, প্রশাসন ও কমিটি, প্রশ্ন ও উত্তরপত্র, কক্ষ পরিদর্শক ও পিয়ন",
    pages: "৪ পাতা",
    sections: {
      incomeStatement: true,
      expenses: true,
      qs: true,
      adminDuty: true,
      invigilatorDuty: true,
      percentRows: false,
    },
  },
  {
    slug: "incourse",
    name: "ইনকোর্স পরীক্ষা",
    short: "আয়, ব্যয়, প্রশ্নপত্র প্রণয়ন ও মূল্যায়ন এবং কক্ষ প্রত্যবেক্ষক ও পিয়ন",
    pages: "৩ পাতা",
    sections: {
      incomeStatement: true,
      expenses: true,
      qs: true,
      adminDuty: false,
      invigilatorDuty: true,
      percentRows: false,
    },
  },
  {
    slug: "babosthapona-fee",
    name: "ব্যবস্থাপনা ফী",
    short: "পদবীভিত্তিক শতকরা হারে বন্টন",
    pages: "১ পাতা",
    sections: { ...feeSections, designationBased: true },
  },
  {
    slug: "bhorti-babosthapona-fee",
    name: "ভর্তি ব্যবস্থাপনা ফী",
    short: "পদবীভিত্তিক শতকরা হারে বন্টন",
    pages: "১ পাতা",
    sections: { ...feeSections, designationBased: true },
  },
  {
    slug: "kendro-fee",
    name: "কেন্দ্র ফী",
    short: "পদবীভিত্তিক শতকরা হারে বন্টন",
    pages: "১ পাতা",
    sections: { ...feeSections, designationBased: true },
  },
  {
    slug: "term-paper",
    name: "টার্ম পেপার",
    short: "শতকরা হার অনুযায়ী বন্টন",
    pages: "১ পাতা",
    sections: { ...feeSections },
  },
  {
    slug: "bebaharik",
    name: "ব্যবহারিক পরীক্ষা",
    short: "আয়-ব্যয়ের হিসাব",
    pages: "১ পাতা",
    sections: {
      incomeStatement: true,
      expenses: true,
      qs: false,
      adminDuty: false,
      invigilatorDuty: false,
      percentRows: false,
    },
  },
  {
    slug: "mowkhik",
    name: "মৌখিক পরীক্ষা",
    short: "আয়-ব্যয়ের হিসাব",
    pages: "১ পাতা",
    sections: {
      incomeStatement: true,
      expenses: true,
      qs: false,
      adminDuty: false,
      invigilatorDuty: false,
      percentRows: false,
    },
  },
  {
    slug: "abedon",
    name: "টাকা উত্তোলনের আবেদন",
    short: "সেমিনার ও অন্যান্য তহবিল হতে ব্যয় ও টাকা উত্তোলনের জন্য অধ্যক্ষ বরাবর আবেদনপত্র",
    pages: "১ পাতা",
    sections: {
      incomeStatement: false,
      expenses: true,
      qs: false,
      adminDuty: false,
      invigilatorDuty: false,
      percentRows: false,
      isApplication: true,
    },
  },
  {
    slug: "shikkha-sofor",
    name: "শিক্ষা সফর",
    short: "আয়-ব্যয়ের হিসাব বিবরণী (বর্ষভিত্তিক শিক্ষার্থী ফি ও সফর পরিচালনা ব্যয়)",
    pages: "১ পাতা",
    sections: {
      incomeStatement: true,
      expenses: true,
      qs: false,
      adminDuty: false,
      invigilatorDuty: false,
      percentRows: false,
    },
  },
];

/** ভাউচার আইডি থেকে স্বয়ংক্রিয়ভাবে slug নির্ণয় */
export function detectSlugFromId(id: string): string {
  if (!id) return "nirbachoni";
  const upper = id.trim().toUpperCase();
  if (upper.includes("SHIKKHA") || upper.includes("SOFOR") || upper.includes("TOUR")) return "shikkha-sofor";
  if (upper.includes("NIRBACHONI") || upper.includes("TEST")) return "nirbachoni";
  if (upper.includes("INCOURSE")) return "incourse";
  if (upper.includes("PRACTICAL") || upper.includes("BEBAHARIK")) return "bebaharik";
  if (upper.includes("VIVA") || upper.includes("MOWKHIK")) return "mowkhik";
  if (upper.includes("MANAGEMENT") || upper.includes("BABOSTHAPONA")) return "babosthapona-fee";
  if (upper.includes("ADMISSION") || upper.includes("BHORTI")) return "bhorti-babosthapona-fee";
  if (upper.includes("CENTER") || upper.includes("KENDRO")) return "kendro-fee";
  if (upper.includes("TERM")) return "term-paper";
  if (upper.includes("ABEDON") || upper.includes("APP")) return "abedon";
  return "nirbachoni";
}

export const getVoucherConfig = (slugOrName?: string) => {
  if (!slugOrName) return undefined;
  const s = slugOrName.trim();
  return (
    VOUCHERS.find((v) => v.slug === s || v.name === s) ||
    VOUCHERS.find((v) => s.includes(v.name) || (v.name && v.name.includes(s))) ||
    VOUCHERS.find((v) => s.toLowerCase().includes(v.slug) || (v.slug && v.slug.includes(s.toLowerCase())))
  );
};

export function normalizeSlug(slugOrNameOrId?: string): string {
  if (!slugOrNameOrId) return "nirbachoni";
  const s = slugOrNameOrId.trim();
  const config = getVoucherConfig(s);
  if (config) return config.slug;
  return detectSlugFromId(s);
}

/* ---------------------------------------------------------------------------
 * ৭. ডেটা মডেল
 * ------------------------------------------------------------------------ */

export type EarnItem = {
  id: string;
  voucherNo: string;
  desc: string;
  amount: number;
  studentCount?: number;
  rate?: number;
};
// HARDCODED SECTORS MOVED TO LOCALSTORAGE DB
// EXACT_PRODUCTS and EXACT_SECTORS are now managed via dbAtom

export type ExpenseItem = {
  id: string;
  voucherNo: string;
  desc: string;
  amount: number;
  vatRate: number;
  taxRate: number;
  productName?: string;
};
export type QsRow = {
  id: string;
  name: string;
  designation: string;
  questions: number;
  scripts: number;
};
export type AdminRow = { id: string; name: string; designation: string; percent: number };
export type DutyRow = {
  id: string;
  name: string;
  designation: string;
  role: "teacher" | "staff";
  duties: number;
};
export type PercentRow = {
  id: string;
  name: string;
  designation: string;
  percent: number;
  inCharge?: boolean;
};

export type VoucherData = {
  id: string;
  classLevel: string;
  examName: string;
  session: string;
  year: string;
  date: string;
  studentCount: number;
  perStudent: number;
  earnings: EarnItem[];
  expenses: ExpenseItem[];
  questionRate: number;
  scriptRate: number;
  qs: QsRow[];
  admin: AdminRow[];
  duty: DutyRow[];
  councilName: string;
  councilDesignation: string;
  percentRows: PercentRow[];
  challans?: VoucherChallans;
};

export const emptyVoucher = (
  slugOrName: string,
  examName: string,
  db: MasterDB,
  initClass?: string,
): VoucherData => {
  const slug = normalizeSlug(slugOrName);
  const isNirbachoni = slug === "nirbachoni";
  const defaultQRate = isNirbachoni ? 400 : 300;
  const defaultSRate = isNirbachoni ? 10 : 14;

  const typeMap: Record<string, string> = {
    nirbachoni: "TEST",
    incourse: "INCOURSE",
    "babosthapona-fee": "MANAGEMENT",
    "kendro-fee": "CENTER",
    "bhorti-babosthapona-fee": "ADMISSION",
    "term-paper": "TERM",
    mowkhik: "VIVA",
    bebaharik: "PRACTICAL",
    abedon: "APP",
  };
  const examTypeStr = typeMap[slug] || slug.toUpperCase();
  const dbRate = db.rates.find((r) => r.examType === examTypeStr);

  const qRate = dbRate?.question ?? defaultQRate;
  const sRate = dbRate?.script ?? defaultSRate;
  const perStudentFee = dbRate?.perStudent ?? 0;

  const matchedDuty: DutyRow[] = [];
  const matchedQs: QsRow[] = [];
  const matchedPercent: PercentRow[] = [];

  const matchedAdmin: AdminRow[] = [];

  const config = getVoucherConfig(slug);
  if (config && config.sections.adminDuty) {
    const principal = db.teachers.find(
      (t) => t.designation.includes("অধ্যক্ষ") && !t.designation.includes("উপাধ্যক্ষ"),
    );
    const vicePrincipal = db.teachers.find((t) => t.designation.includes("উপাধ্যক্ষ"));
    const headOfDept = db.teachers.find(
      (t) => t.designation.includes("বিভাগীয় প্রধান") || t.designation.includes("বিভাগীয় প্রধান"),
    );
    const office = db.teachers.find((t) => t.name.includes("অফিস"));

    matchedAdmin.push({
      id: uid(),
      name: principal ? principal.name : "",
      designation: principal ? principal.designation : "অধ্যক্ষ",
      percent: rateFor(slug, "অধ্যক্ষ", db),
    });

    matchedAdmin.push({
      id: uid(),
      name: vicePrincipal ? vicePrincipal.name : "",
      designation: vicePrincipal ? vicePrincipal.designation : "উপাধ্যক্ষ",
      percent: rateFor(slug, "উপাধ্যক্ষ", db),
    });

    matchedAdmin.push({
      id: uid(),
      name: headOfDept ? headOfDept.name : "",
      designation: headOfDept ? headOfDept.designation : "বিভাগীয় প্রধান",
      percent: rateFor(slug, "বিভাগীয় প্রধান", db),
    });

    // Find ALL teachers whose 'classes' (Column D) includes this initClass
    // We use a fuzzy matcher to handle spelling/unicode differences and English aliases.
    const members = db.teachers.filter((t) => isClassMatch(initClass || "", t.classes || []));

    if (members.length > 0) {
      members.forEach((m) => {
        matchedAdmin.push({
          id: uid(),
          name: m.name,
          designation: `${m.designation} ও সদস্য`,
          percent: rateFor(slug, "সদস্য", db),
        });
      });
    } else {
      // Fallback if no specific member found for this class
      matchedAdmin.push({
        id: uid(),
        name: "",
        designation: "সদস্য",
        percent: rateFor(slug, "সদস্য", db),
      });
    }

    matchedAdmin.push({
      id: uid(),
      name: office ? office.name : "অফিস",
      designation: office ? office.designation : "অফিস",
      percent: rateFor(slug, "অফিস", db),
    });
  }

  db.teachers.forEach((t) => {
    const tPages = (t.pages || []).map((p) => p.toLowerCase());

    // Column E (pages) strictly dictates these sections
    if (tPages.includes("duty")) {
      const isStaff =
        t.designation.includes("অপারেটর") ||
        t.designation.includes("সহায়ক") ||
        t.designation.includes("সহায়ক");
      matchedDuty.push({
        id: uid(),
        name: t.name,
        designation: t.designation,
        role: isStaff ? "staff" : "teacher",
        duties: 1,
      });
    }
    if (tPages.includes("qs")) {
      matchedQs.push({
        id: uid(),
        name: t.name,
        designation: t.designation,
        questions: 0,
        scripts: 0,
      });
    }
    if (tPages.includes("parcent") || tPages.includes("percent")) {
      matchedPercent.push({
        id: uid(),
        name: t.name,
        designation: t.designation,
        percent: rateFor(slug, t.designation, db),
      });
    }
  });

  const defaultEarnings: EarnItem[] =
    slug === "shikkha-sofor"
      ? [
          { id: uid(), voucherNo: "১", desc: "অনার্স ১ম বর্ষ (২০২৩-২৪)", studentCount: 89, rate: 75, amount: 6675 },
          { id: uid(), voucherNo: "২", desc: "অনার্স ২য় বর্ষ (২০২১-২২)", studentCount: 54, rate: 75, amount: 4050 },
          { id: uid(), voucherNo: "৩", desc: "অনার্স ৩য় বর্ষ (২০২০-২১)", studentCount: 42, rate: 75, amount: 3150 },
          { id: uid(), voucherNo: "৪", desc: "অনার্স ৪র্থ বর্ষ (২০১৯-২০)", studentCount: 49, rate: 50, amount: 2450 },
          { id: uid(), voucherNo: "৫", desc: "মাস্টার্স শেষ পর্ব (২০২১-২২)", studentCount: 45, rate: 120, amount: 5400 },
        ]
      : [];

  const defaultExpenses: ExpenseItem[] =
    slug === "shikkha-sofor"
      ? [
          { id: uid(), voucherNo: "১", desc: "শিক্ষা সফর পরিচালনা বাবদ ব্যয়", amount: 21725, vatRate: 0, taxRate: 0 },
        ]
      : [];

  return {
    id: makeVoucherId(slug),
    classLevel: slug === "shikkha-sofor" ? "সকল বর্ষ" : initClass || "",
    examName:
      slug === "abedon"
        ? "সেমিনার তহবিল"
        : slug === "shikkha-sofor"
        ? `শিক্ষা সফর-${toBn(new Date().getFullYear())}`
        : examName,
    session: "",
    year: String(new Date().getFullYear()),
    date: new Date().toISOString().slice(0, 10),
    studentCount: 0,
    perStudent: perStudentFee,
    earnings: defaultEarnings,
    expenses: defaultExpenses,
    questionRate: qRate,
    scriptRate: sRate,
    qs: matchedQs,
    admin: matchedAdmin,
    duty: matchedDuty,
    councilName: "",
    councilDesignation: "শিক্ষক পরিষদ",
    percentRows: matchedPercent,
    challans: {
      vat: { year: getDefaultChallanYear(), serial: "", fullCode: "" },
      tax5: { year: getDefaultChallanYear(), serial: "", fullCode: "" },
      tax10: { year: getDefaultChallanYear(), serial: "", fullCode: "" },
    },
  };
};

/* ---------------------------------------------------------------------------
 * ৮. হিসাব
 * ------------------------------------------------------------------------ */

export const qsAmount = (r: QsRow, qRate: number, sRate: number) =>
  questionScriptAmount(r, qRate, sRate);

export function computeVoucher(v: VoucherData, slugOrName?: string) {
  const slug = normalizeSlug(slugOrName || v?.id);
  const totals = calculateVoucherTotals(v, slug);
  const {
    studentIncome,
    income,
    expenseTotal,
    qsTotal,
    distributable,
    pool35,
    pool63,
    pool2,
    totalExpense,
    surplus,
  } = totals;

  // ১. ভ্যাট (সকল ভ্যাট একসাথে)
  const vatItems = v.expenses.filter((e) => e.amount > 0 && e.vatRate > 0);
  const vatTotal = sum(vatItems.map((e) => Math.round(e.amount * e.vatRate)));
  const vatBreakdown: ChallanBreakdownItem[] = vatItems.map((e) => ({
    label: e.desc || e.productName || "পণ্য/সেবা ক্রয়",
    amount: e.amount,
    rate: e.vatRate,
    tax: Math.round(e.amount * e.vatRate),
  }));

  // ২. ট্যাক্স ৫% - ৯% (সকল ৫-৯% কর একসাথে)
  // পণ্য ও সেবা সরবরাহকারী বিলের কর (যেমন: ৫%, ৪% ইত্যাদি)
  const tax5to9Items = v.expenses.filter(
    (e) => e.amount > 0 && e.taxRate >= 0.01 && e.taxRate < 0.10,
  );
  const tax5to9Total = sum(tax5to9Items.map((e) => Math.round(e.amount * e.taxRate)));
  const tax5to9Breakdown: ChallanBreakdownItem[] = tax5to9Items.map((e) => ({
    label: e.desc || e.productName || "সরবরাহ বিল",
    amount: e.amount,
    rate: e.taxRate,
    tax: Math.round(e.amount * e.taxRate),
  }));

  // ৩. ট্যাক্স ১০% - ২০% (সকল ১০-২০% কর একসাথে)
  // অন্যান্য ব্যয়ের মধ্য থেকে ১০% বা তদূর্ধ্ব করযুক্ত সম্মানী/ফি (যেমন: বহিরাগত/অভ্যন্তরীণ পরীক্ষক, ফলাফল প্রস্তুতি ইত্যাদি)
  const expenseTax10to20Items = v.expenses.filter((e) => e.amount > 0 && e.taxRate >= 0.10);
  const expenseTax10to20Total = sum(
    expenseTax10to20Items.map((e) => Math.round(e.amount * e.taxRate)),
  );

  const qsRows: PayRow[] = v.qs.map((r) => {
    // r.scripts represents the student count for this teacher (খাতা সংখ্যা)
    const questions = nonNegativeNumber(r.questions);
    const evaluatedScripts = questions * nonNegativeNumber(r.scripts);
    return {
      id: r.id,
      name: r.name,
      designation: r.designation,
      questions,
      scripts: evaluatedScripts,
      qsMoney: questions * nonNegativeNumber(v.questionRate),
      scriptMoney: evaluatedScripts * nonNegativeNumber(v.scriptRate),
      amount: questionScriptAmount(r, v.questionRate, v.scriptRate),
    };
  });

  const totalAdminPercent = sum(v.admin.map((a) => nonNegativeNumber(a.percent)));
  const adminRows: PayRow[] = v.admin.map((a) => ({
    id: a.id,
    name: a.name,
    designation: a.designation,
    amount: totalAdminPercent > 0 ? (pool35 * nonNegativeNumber(a.percent)) / totalAdminPercent : 0,
  }));

  const weight = (d: DutyRow) => nonNegativeNumber(d.duties) * (d.role === "teacher" ? 1 : 0.5);
  const totalWeight = sum(v.duty.map(weight));
  const unitRate = totalWeight > 0 ? pool63 / totalWeight : 0;
  const dutyRows: PayRow[] = v.duty.map((d) => ({
    id: d.id,
    name: d.name,
    designation: d.designation,
    amount: unitRate * weight(d),
  }));

  const councilRow: PayRow = {
    id: "council",
    name: v.councilName,
    designation: v.councilDesignation,
    amount: pool2,
  };

  const totalRatio = sum(v.percentRows.map((p) => nonNegativeNumber(p.percent)));
  const percentPayRows: PayRow[] = v.percentRows.map((p) => {
    const teacherRatio = nonNegativeNumber(p.percent);
    return {
      id: p.id,
      name: p.name,
      designation: p.designation,
      amount: totalRatio > 0 ? (distributable / totalRatio) * teacherRatio : 0,
    };
  });

  const settledAdmin = settleAll(adminRows);
  const settledDuty = settleAll(dutyRows);
  const settledQs = settleAll(qsRows);
  const settledPercent = settleAll(percentPayRows);
  const settledCouncil = settle(councilRow);

  const adminTax = sum(settledAdmin.map((r) => r.tax));
  const dutyTax = sum(settledDuty.map((r) => r.tax));
  const qsTax = sum(settledQs.map((r) => r.tax));
  const percentTax = sum(settledPercent.map((r) => r.tax));
  const councilTax = settledCouncil.tax;

  const honorariumTaxTotal = adminTax + dutyTax + qsTax + percentTax + councilTax;

  // সব ১০% - ২০% কর একসাথে (সম্মানী বন্টন + অন্যান্য ব্যয়ের ১০-২০% সম্মানী)
  const tax10to20Total = honorariumTaxTotal + expenseTax10to20Total;

  // ১০-২০% করের সমন্বিত ব্রেকডাউন তালিকা
  const tax10to20Breakdown: ChallanBreakdownItem[] = [];
  expenseTax10to20Items.forEach((e) => {
    tax10to20Breakdown.push({
      label: e.desc || e.productName || "সম্মানী/ব্যয়",
      amount: e.amount,
      rate: e.taxRate,
      tax: Math.round(e.amount * e.taxRate),
    });
  });
  if (qsTax > 0) {
    tax10to20Breakdown.push({
      label: "প্রশ্নপত্র প্রণয়ন ও উত্তরপত্র মূল্যায়ন",
      amount: sum(settledQs.map((r) => r.amount)),
      rate: 0.1,
      tax: qsTax,
    });
  }
  if (dutyTax > 0) {
    tax10to20Breakdown.push({
      label: "কক্ষ প্রত্যবেক্ষক ও কর্মচারী",
      amount: sum(settledDuty.map((r) => r.amount)),
      rate: 0.1,
      tax: dutyTax,
    });
  }
  if (adminTax > 0) {
    tax10to20Breakdown.push({
      label: "প্রশাসন ও কমিটি",
      amount: sum(settledAdmin.map((r) => r.amount)),
      rate: 0.1,
      tax: adminTax,
    });
  }
  if (percentTax > 0) {
    tax10to20Breakdown.push({
      label: "পদবীভিত্তিক সম্মানী বন্টন",
      amount: sum(settledPercent.map((r) => r.amount)),
      rate: 0.1,
      tax: percentTax,
    });
  }
  if (councilTax > 0) {
    tax10to20Breakdown.push({
      label: v.councilName ? `${v.councilName} (শিক্ষক পরিষদ)` : "শিক্ষক পরিষদ",
      amount: settledCouncil.amount,
      rate: 0.1,
      tax: councilTax,
    });
  }

  return {
    studentIncome,
    income,
    expenseTotal,
    totalIncome: totals.totalIncome,
    totalExpense,
    surplus,
    // ৩টি প্রধান চালানের হিসাব
    vatTotal,
    vatBreakdown,
    tax5to9Total,
    tax5to9Breakdown,
    tax10to20Total,
    tax10to20Breakdown,
    // পূর্ববর্তী ফিল্ডসমূহের সাথে ব্যাকওয়ার্ড সামঞ্জস্য
    taxTotal: sum(v.expenses.map((e) => e.amount * e.taxRate)),
    honorariumTaxTotal,
    total10Tax: tax10to20Total,
    tax10Breakdown: tax10to20Breakdown,
    qsRows: settledQs,
    qsTotal,
    distributable,
    pool35,
    pool63,
    pool2,
    unitRate,
    adminRows: settledAdmin,
    dutyRows: settledDuty,
    councilRow: settledCouncil,
    percentRows: settledPercent,
  };
}

/* ---------------------------------------------------------------------------
 * ৯. ড্রাফট স্টোরেজ (ভাউচার আইডি দিয়ে সংরক্ষণ ও পুনরায় খোলা)
 * ------------------------------------------------------------------------ */

const inMemoryVouchers = new Map<string, VoucherData>();

export function purgeCachedVoucher(id: string): void {
  const storages: Storage[] = [];
  try {
    if (typeof sessionStorage !== "undefined") storages.push(sessionStorage);
  } catch {
    /* This browser may block access to session storage. */
  }
  try {
    if (typeof localStorage !== "undefined") storages.push(localStorage);
  } catch {
    /* Clear memory/session cache even if local storage is unavailable. */
  }
  purgeVoucherCaches(id, inMemoryVouchers, storages);
}

export function storeTempVoucher(id: string, voucher: VoucherData) {
  if (!id) return;
  const cleanId = id.trim();
  const key = cleanId.toUpperCase();
  inMemoryVouchers.set(key, voucher);
  inMemoryVouchers.set(cleanId, voucher);
  try {
    const serialized = JSON.stringify(voucher);
    sessionStorage.setItem(`kgc-temp-voucher:${key}`, serialized);
    localStorage.setItem(`kgc-temp-voucher:${key}`, serialized);
    sessionStorage.setItem(`kgc-temp-voucher:${cleanId}`, serialized);
    localStorage.setItem(`kgc-temp-voucher:${cleanId}`, serialized);
  } catch {
    /* ignore */
  }
}

export type DraftMeta = { id: string; slug: string; examName: string; date: string; updatedAt: string };

// লোকাল স্টোরেজ ড্রাফট সেভ বন্ধ
export function listDrafts(_slug?: string): DraftMeta[] {
  return [];
}

export function loadDraft(id: string): VoucherData | null {
  if (!id) return null;
  const cleanId = id.trim();
  const key = cleanId.toUpperCase();
  if (inMemoryVouchers.has(key)) {
    return inMemoryVouchers.get(key)!;
  }
  if (inMemoryVouchers.has(cleanId)) {
    return inMemoryVouchers.get(cleanId)!;
  }
  try {
    const rawMem =
      sessionStorage.getItem(`kgc-temp-voucher:${key}`) ||
      sessionStorage.getItem(`kgc-temp-voucher:${cleanId}`);
    if (rawMem) return JSON.parse(rawMem) as VoucherData;
  } catch {
    /* ignore */
  }
  try {
    const rawLocal =
      localStorage.getItem(`kgc-temp-voucher:${key}`) ||
      localStorage.getItem(`kgc-temp-voucher:${cleanId}`);
    if (rawLocal) return JSON.parse(rawLocal) as VoucherData;
  } catch {
    /* ignore */
  }
  return null;
}

// পূর্বে সেভ থাকা পুরানো ড্রাফটগুলো লোকাল স্টোরেজ থেকে স্বয়ংক্রিয়ভাবে মুছে ফেলা
if (typeof window !== "undefined") {
  try {
    localStorage.removeItem("kgc-geo-voucher-index");
    localStorage.removeItem("kgc-geo-sectors");
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const key = localStorage.key(i);
      if (key && (key.startsWith("kgc-geo-voucher:") || key.startsWith("kgc-geo-last:"))) {
        localStorage.removeItem(key);
      }
    }
  } catch {
    /* ignore */
  }
}

function cleanAutoExpenses(slug: string, expenses?: ExpenseItem[]): ExpenseItem[] {
  if (!expenses || expenses.length === 0) return [];
  if (
    slug === "abedon" &&
    expenses.length === 7 &&
    expenses[0]?.desc === "সেমিনার সহায়কের বেতন" &&
    expenses[1]?.desc === "পত্রিকা বিল"
  ) {
    return [];
  }
  return expenses;
}

/** ড্রাফট মার্জ — slug অনুযায়ী পরীক্ষার নাম সবসময় সঠিক রাখে */
function mergeDraft(
  slug: string,
  examName: string,
  d: Partial<VoucherData>,
  db: MasterDB,
  forceId?: string,
): VoucherData {
  const belongsToOther = VOUCHERS.some((v) => v.slug !== slug && v.name === d.examName);
  const base = emptyVoucher(slug, examName, db);
  return {
    ...base,
    ...d,
    expenses: cleanAutoExpenses(slug, d.expenses),
    id: forceId || d.id || base.id,
    examName: !d.examName || belongsToOther ? examName : d.examName,
    challans: {
      vat: { ...(base.challans?.vat || { year: "", serial: "", fullCode: "" }), ...(d.challans?.vat || {}) },
      tax5: { ...(base.challans?.tax5 || { year: "", serial: "", fullCode: "" }), ...(d.challans?.tax5 || {}) },
      tax10: { ...(base.challans?.tax10 || { year: "", serial: "", fullCode: "" }), ...(d.challans?.tax10 || {}) },
    },
  } as VoucherData;
}

function useVoucher(slug: string, examName: string, initClass?: string, loadId?: string) {
  const [db] = useAtom(dbAtom);
  const [data, setData] = useState<VoucherData>(() => emptyVoucher(slug, examName, db, initClass));
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let isCancelled = false;

    if (loadId) {
      const existing = loadDraft(loadId);
      if (existing) {
        setData(mergeDraft(slug, examName, existing, db, loadId));
        setLoaded(true);
      } else {
        // মেমোরি বা সেশনে না থাকলে সরাসরি গুগল শীট / সার্ভার থেকে লোড করার চেষ্টা
        const sheetId = getSheetId();
        const scriptUrl = getScriptUrl();
        if (sheetId && scriptUrl) {
          getVouchersFromServer({
            scriptUrl,
            payload: { action: "getVouchers", id: sheetId },
          })
            .then((res) => {
              if (isCancelled) return;
              try {
                const parsedRes = JSON.parse(res.text);
                const list = (parsedRes.vouchers || []) as Array<{
                  id?: string;
                  voucherId?: string;
                  fullState?: string | Record<string, unknown>;
                }>;
                const found = list.find(
                  (v) => String(v.id || v.voucherId) === String(loadId),
                );
                if (found && found.fullState) {
                  const parsedState =
                    typeof found.fullState === "string"
                      ? JSON.parse(found.fullState)
                      : found.fullState;
                  storeTempVoucher(loadId, parsedState);
                  setData(mergeDraft(slug, examName, parsedState, db, loadId));
                } else {
                  setData(emptyVoucher(slug, examName, db, initClass));
                }
              } catch {
                setData(emptyVoucher(slug, examName, db, initClass));
              }
              setLoaded(true);
            })
            .catch(() => {
              if (!isCancelled) {
                setData(emptyVoucher(slug, examName, db, initClass));
                setLoaded(true);
              }
            });
        } else {
          setData(emptyVoucher(slug, examName, db, initClass));
          setLoaded(true);
        }
      }
    } else {
      // লোকাল স্টোরেজ থেকে অটো-লোড হবে না, সবসময় নতুন খালি ভাউচার খুলবে
      setData(emptyVoucher(slug, examName, db, initClass));
      setLoaded(true);
    }

    return () => {
      isCancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug, initClass, loadId]);

  // লোকাল স্টোরেজে কোনো অটো-সেভ হবে না (localStorage save completely off)

  const openById = (id: string) => {
    const d = loadDraft(id.trim());
    if (!d) return false;
    setData(mergeDraft(slug, examName, d, db, d.id || id.trim()));
    return true;
  };

  const newDraft = () => {
    const d = emptyVoucher(slug, examName, db, initClass);
    setData(d);
    setLoaded(true);
  };

  return { data, setData, loaded, openById, newDraft };
}

/* ---------------------------------------------------------------------------
 * ১০. প্রিন্ট লেআউট
 * ------------------------------------------------------------------------ */

/** প্রিন্টে শতকরা হার / অনুপাত মুছে দেয় */
export function stripRatio(text: string): string {
  return text
    .replace(/[—\-–(]?\s*[0-9০-৯]+(?:[.।][0-9০-৯]+)?\s*(%|শতাংশ|শতকরা)\s*\)?/g, " ")
    .replace(/\s*(অনুপাত|রেশিও|ratio)\s*[:：]?\s*[0-9০-৯:：\s]*/gi, " ")
    .replace(/\s*—\s*$/, "")
    .replace(/\(\s*\)/g, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

/**
 * ভেরিফাইড ডিজিটাল কপির সিকিউরিটি ওয়াটারমার্ক কম্পোনেন্ট
 * এটি ভেরিফিকেশন পোর্টালে এবং প্রিন্ট কপিতে পৃষ্ঠার ব্যাকগ্রাউন্ডে সূক্ষ্ম অফিশিয়াল সিল ও নিরাপত্তা ব্যান্ড প্রদর্শন করে
 */
export function VerifiedWatermark({ voucherId }: { voucherId?: string }) {
  return (
    <div
      aria-hidden="true"
      className="verified-watermark pointer-events-none select-none absolute inset-0 z-0 flex flex-col items-center justify-center overflow-hidden"
    >
      {/* উপরের কোণাকুণি ওয়াটারমার্ক স্ট্রিপ */}
      <div className="absolute top-[20%] -left-16 -right-16 rotate-[-26deg] text-center text-[13px] font-black tracking-[0.28em] uppercase text-emerald-800 dark:text-emerald-300 opacity-[0.16] print:opacity-[0.18] font-sans whitespace-nowrap">
        VERIFIED DIGITAL RECORD • ডিজিটাল সত্যতা যাচাইকৃত রেকর্ড • VERIFIED DIGITAL RECORD
      </div>

      {/* মূল সেন্ট্রাল অফিসিয়াল সিকিউরিটি সিল */}
      <div className="flex flex-col items-center justify-center rotate-[-26deg] scale-105 opacity-[0.18] print:opacity-[0.20] transition-opacity">
        <div className="w-[340px] h-[340px] rounded-full border-[5px] border-dashed border-emerald-800 dark:border-emerald-300 flex flex-col items-center justify-center p-5 text-center text-emerald-800 dark:text-emerald-300">
          <div className="w-full h-full rounded-full border-2 border-solid border-emerald-800 dark:border-emerald-300 flex flex-col items-center justify-center p-3">
            <span className="text-3xl mb-1">🛡️</span>
            <div className="text-[12px] font-black tracking-[0.25em] uppercase font-sans">
              GOVERNMENT AUDIT
            </div>
            <div className="my-1.5 py-1 px-6 border-y-2 border-emerald-800 dark:border-emerald-300 text-2xl font-black tracking-widest font-sans">
              VERIFIED
            </div>
            <div className="text-[15px] font-bold tracking-wider font-serif">
              সত্যতা যাচাইকৃত কপি
            </div>
            <div className="text-[10.5px] font-semibold tracking-wider mt-1 font-sans">
              DIGITAL FINANCIAL SYSTEM
            </div>
            {voucherId && (
              <div className="text-[10px] font-mono font-bold mt-1 tracking-widest">
                ID: {voucherId}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* নিচের কোণাকুণি ওয়াটারমার্ক স্ট্রিপ */}
      <div className="absolute bottom-[20%] -left-16 -right-16 rotate-[-26deg] text-center text-[13px] font-black tracking-[0.28em] uppercase text-emerald-800 dark:text-emerald-300 opacity-[0.16] print:opacity-[0.18] font-sans whitespace-nowrap">
        OFFICIAL FINANCIAL SYSTEM • ভূগোল ও পরিবেশ বিভাগ • OFFICIAL FINANCIAL SYSTEM
      </div>
    </div>
  );
}

export function PrintPage({
  examName,
  title,
  subtitle,
  voucherId,
  date,
  children,
  bothSignatures = false,
  hideDeptHeadSignature = false,
  slug,
  vatCode,
  tax5Code,
  tax10Code,
  isVerification = false,
  isFirstPage = false,
}: {
  examName: string;
  title: string;
  subtitle?: string | undefined;
  voucherId: string;
  date: string;
  children: ReactNode;
  bothSignatures?: boolean | undefined;
  hideDeptHeadSignature?: boolean | undefined;
  slug?: string | undefined;
  vatCode?: string | undefined;
  tax5Code?: string | undefined;
  tax10Code?: string | undefined;
  isVerification?: boolean | undefined;
  isFirstPage?: boolean | undefined;
}) {
  const [orgInfo] = useAtom(orgInfoAtom);

  return (
    <section className="print-page relative mx-auto mb-6 flex w-full max-w-[210mm] min-h-[277mm] flex-col bg-card px-[14mm] pt-[10mm] pb-[2mm] text-card-foreground shadow-[0_1px_0_0_var(--border),0_12px_32px_-20px_oklch(0_0_0/0.4)] print:mb-0 print:max-w-none print:shadow-none print:pt-[6mm] print:pb-0 overflow-hidden">
      {/* সত্যতা যাচাইকৃত সিকিউরিটি ওয়াটারমার্ক */}
      {isVerification && <VerifiedWatermark voucherId={voucherId} />}

      {isVerification && (
        <div className="relative z-10 mb-2 flex items-center justify-between rounded border border-emerald-600/30 bg-emerald-50/80 px-2.5 py-1 text-[11px] text-emerald-900 print:border-emerald-600/40">
          <div className="flex items-center gap-1.5 font-bold">
            <span>🛡️</span>
            <span>ডিজিটাল সত্যতা যাচাইকৃত অফিশিয়াল রেকর্ড (Verified Digital Record)</span>
          </div>
          <div className="font-mono text-[10px] font-semibold text-emerald-800">
            আইডি: {voucherId}
          </div>
        </div>
      )}

      <header className="relative z-10 pb-1 text-center">
        <h1 className="text-[27px] sm:text-[29px] font-black leading-tight tracking-tight text-foreground">
          {orgInfo.dept}
        </h1>
        <p className="text-[19px] sm:text-[20px] font-bold leading-snug text-foreground/90 mt-1">
          {orgInfo.college}
        </p>
        <p className="mt-2 flex items-center justify-center flex-wrap gap-x-2 text-[12.5px] font-medium text-foreground/80">
          <span>
            মোবাইল: <strong className="font-semibold text-foreground">{orgInfo.phone}</strong>
          </span>
          <span>•</span>
          <span>
            ই-মেইল:{" "}
            <span className="font-medium" style={{ color: "#2563eb" }}>
              {orgInfo.email}
            </span>
          </span>
          <span>•</span>
          <span>
            ওয়েব:{" "}
            <span className="font-medium" style={{ color: "#2563eb" }}>
              {orgInfo.web}
            </span>
          </span>
        </p>
        {/* হেডার ডাবল লাইন: ওপরেরটি একটু মোটা, নিচেরটি একটু চিকন */}
        <div className="mt-2.5 space-y-[2px] w-full" aria-hidden="true">
          <div className="border-b-[2.5px] border-foreground print:border-black w-full" />
          <div className="border-b-[1px] border-foreground print:border-black w-full" />
        </div>
      </header>

      <div className="relative z-10 mt-3 text-center">
        {examName ? <p className="text-lg font-bold leading-snug">{stripRatio(examName)}</p> : null}
      </div>

      <div className="relative z-10 mt-2 text-center">
        <h2
          className={`inline-block ${slug === "shikkha-sofor" ? "" : "border-b border-foreground"} px-4 pb-0.5 text-lg font-bold`}
        >
          {stripRatio(title)}
        </h2>
        {subtitle ? (
          <p className="mt-1 text-sm text-muted-foreground">{stripRatio(subtitle)}</p>
        ) : null}
      </div>

      <div className="relative z-10 mt-3.5 flex-1 text-sm">{children}</div>

      <div className="relative z-10 mt-6 flex items-start justify-between text-center text-sm">
        {bothSignatures ? (
          <div className="w-56 text-center leading-snug">
            <div className="mb-2 w-full border-t-2 border-dotted border-foreground/80 print:border-black" />
            <p className="font-bold text-[15px] text-foreground">অধ্যক্ষ</p>
            <p className="text-[13px] font-medium text-foreground/90">{orgInfo.college}</p>
          </div>
        ) : (
          <div className="w-56" />
        )}
        {!hideDeptHeadSignature && (
          <div className="w-56 text-center leading-snug">
            <div className="mb-2 w-full border-t-2 border-dotted border-foreground/80 print:border-black" />
            <p className="font-bold text-[15px] text-foreground">বিভাগীয় প্রধান</p>
            <p className="text-[13px] font-medium text-foreground/90">{orgInfo.dept}</p>
            <p className="text-[13px] font-medium text-foreground/90">{orgInfo.college}</p>
          </div>
        )}
      </div>

      {isFirstPage && (
        <footer className="relative z-10 mt-auto pt-2.5 pb-0 border-t border-border/60 print:border-foreground/20">
          <div className="flex items-center justify-between text-[9px] text-muted-foreground leading-tight">
            <div>
              {voucherId ? (
                <div className="inline-flex items-center gap-1 rounded border border-border/80 bg-muted/40 px-2 py-0.5 text-[9px] font-medium text-foreground print:border-foreground/30 print:bg-transparent">
                  <span className="font-bold text-[9px]">ভাউচার নং:</span>
                  <span className="font-mono tracking-tight font-semibold text-[9px]">
                    {formatVoucherNumber(voucherId)}
                  </span>
                </div>
              ) : null}
            </div>
            <div>
              {(() => {
                const challanSummary = formatChallanCodesSummary([vatCode, tax5Code, tax10Code]);
                return challanSummary ? (
                  <div className="inline-flex items-center gap-1 rounded border border-border/80 bg-muted/40 px-2 py-0.5 text-[9px] font-medium text-foreground print:border-foreground/30 print:bg-transparent">
                    <span className="font-bold text-[9px]">চালান নং:</span>
                    <span className="font-mono tracking-tight text-[9px]">{challanSummary}</span>
                  </div>
                ) : null;
              })()}
            </div>
          </div>
        </footer>
      )}
    </section>
  );
}

/* ---------------------------------------------------------------------------
 * ১১. টেবিল কম্পোনেন্ট
 * ------------------------------------------------------------------------ */

/** আয়ের টেবিল — শুধু আয় */
function EarnTable({
  rows,
  slug,
}: {
  rows: {
    voucherNo: string;
    desc: string;
    amount: number;
    vat: number;
    tax: number;
    studentCount?: number | undefined;
    rate?: number | undefined;
  }[];
  slug?: string;
}) {
  const isShikkhaSofor = slug === "shikkha-sofor";
  const total = sum(rows.map((r) => r.amount));

  if (isShikkhaSofor) {
    return (
      <div className="mb-4">
        <table className="voucher-table">
          <thead>
            <tr>
              <th className="text-center text-lg font-bold" colSpan={5}>
                আয়
              </th>
            </tr>
            <tr>
              <th className="w-16 text-center px-2">ক্রম নং</th>
              <th className="text-center px-3">বিবরণ</th>
              <th className="w-32 text-center px-2">শিক্ষার্থী সংখ্যা</th>
              <th className="w-20 text-center px-2">হার</th>
              <th className="w-36 text-center px-2">পরিমান</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={5} className="py-6 text-center text-muted-foreground">
                  কোনো আয় নেই
                </td>
              </tr>
            ) : (
              rows.map((r, i) => (
                <tr key={i}>
                  <td className="text-center">{r.voucherNo ? toBn(r.voucherNo) : toBn(i + 1)}</td>
                  <td className="p-2 text-center font-medium">{r.desc}</td>
                  <td className="p-2 text-center num">{r.studentCount != null ? toBn(r.studentCount) : "—"}</td>
                  <td className="p-2 text-center num">{r.rate != null ? toBn(r.rate) : "—"}</td>
                  <td className="p-2 text-right font-medium num">{money(r.amount)}</td>
                </tr>
              ))
            )}
          </tbody>
          <tfoot>
            <tr>
              <td colSpan={4} className="p-2 text-right font-bold pr-4">
                =
              </td>
              <td className="w-36 p-2 text-right font-bold num">
                {money(total)}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
    );
  }

  return (
    <div className="mb-3">
      <table className="voucher-table">
        <thead>
          <tr>
            <th className="text-center text-lg font-bold" colSpan={2}>
              আয়
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td colSpan={2} className="py-6 text-center text-muted-foreground">
                কোনো আয় নেই
              </td>
            </tr>
          ) : (
            rows.map((r, i) => (
              <tr key={i}>
                <td className="p-3 text-left">
                  <p className="leading-relaxed">{r.desc}</p>
                </td>
                <td className="w-44 p-3 text-right align-middle font-bold num">
                  {money(r.amount)}/-
                </td>
              </tr>
            ))
          )}
        </tbody>
        <tfoot>
          {rows.length > 1 && (
            <tr>
              <td className="p-2.5 text-right font-bold pr-4">
                মোট =
              </td>
              <td className="w-44 p-2.5 text-right align-middle font-bold num">
                {money(total)}/-
              </td>
            </tr>
          )}
          <tr>
            <td colSpan={2} className="py-1.5 px-2.5 text-sm text-left">
              <b>কথায়:</b> {bnWords(total)}
            </td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

/** ব্যয়ের টেবিল — শুধু ব্যয় */
function CostTable({ rows, slug }: { rows: ExpenseItem[]; slug?: string }) {
  const isShikkhaSofor = slug === "shikkha-sofor";
  const totalAmount = sum(rows.map((r) => r.amount));
  const totalVat = sum(rows.map((r) => r.amount * r.vatRate));
  const totalTax = sum(rows.map((r) => r.amount * r.taxRate));

  return (
    <div>
      <table className="voucher-table">
        <thead>
          <tr>
            <th className="text-center text-lg font-bold" colSpan={5}>
              ব্যয়
            </th>
          </tr>
          <tr>
            <th className="w-24 text-center px-2">
              {isShikkhaSofor ? "ক্রমিক নং" : "ভাউচার নং"}
            </th>
            <th className="text-center px-3">বিবরণ</th>
            <th className="w-32 text-center px-2">
              {isShikkhaSofor ? "পরিমান" : "পরিমাণ"}
            </th>
            <th className="w-24 text-center px-2">ভ্যাট</th>
            <th className="w-24 text-center px-2">
              {isShikkhaSofor ? "উৎসে কর" : "ট্যাক্স"}
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td colSpan={5} className="py-6 text-center text-muted-foreground">
                কোনো ব্যয় নেই
              </td>
            </tr>
          ) : (
            rows.map((r, i) => {
              const vat = r.amount * r.vatRate;
              const tax = r.amount * r.taxRate;
              return (
                <tr key={r.id}>
                  <td className="text-center">{r.voucherNo ? toBn(r.voucherNo) : toBn(i + 1)}</td>
                  <td className="text-left px-3">{r.productName || r.desc || "—"}</td>
                  <td className="num">{money(r.amount)}{isShikkhaSofor ? "" : "/-"}</td>
                  <td className="num">{vat > 0 ? `${money(vat)}${isShikkhaSofor ? "" : "/-"}` : (isShikkhaSofor ? "-" : "—")}</td>
                  <td className="num">{tax > 0 ? `${money(tax)}${isShikkhaSofor ? "" : "/-"}` : (isShikkhaSofor ? "-" : "—")}</td>
                </tr>
              );
            })
          )}
        </tbody>
        <tfoot>
          <tr>
            <td colSpan={2} className="text-right font-bold pr-4">
              মোট =
            </td>
            <td className="num font-bold">{money(totalAmount)}{isShikkhaSofor ? "" : "/-"}</td>
            <td className="num font-bold">{totalVat > 0 ? `${money(totalVat)}${isShikkhaSofor ? "" : "/-"}` : (isShikkhaSofor ? "-" : "—")}</td>
            <td className="num font-bold">{totalTax > 0 ? `${money(totalTax)}${isShikkhaSofor ? "" : "/-"}` : (isShikkhaSofor ? "-" : "—")}</td>
          </tr>
          {!isShikkhaSofor && (
            <tr>
              <td colSpan={5} className="py-1.5 px-2.5 text-sm">
                <b>কথায়:</b> {bnWords(totalAmount)}
              </td>
            </tr>
          )}
        </tfoot>
      </table>
    </div>
  );
}

/** আয়-ব্যয়ের চূড়ান্ত হিসাব সারসংক্ষেপ */
function FinancialSummaryBox({
  income,
  expense,
  expenseLabel = "মোট ব্যয়",
  surplusLabel = "উদ্বৃত্ত",
  slug,
}: {
  income: number;
  expense: number;
  expenseLabel?: string;
  surplusLabel?: string;
  slug?: string;
}) {
  const isShikkhaSofor = slug === "shikkha-sofor";
  const surplus = income - expense;

  if (isShikkhaSofor) {
    return (
      <div className="mt-6 flex justify-start pl-8">
        <div className="w-72">
          <table className="w-full text-base font-semibold leading-relaxed">
            <tbody>
              <tr>
                <td className="py-0.5 text-left font-bold text-foreground">মোট আয়</td>
                <td className="w-8 text-center font-bold text-foreground">=</td>
                <td className="text-right font-bold text-foreground num">{money(income)}</td>
              </tr>
              <tr>
                <td className="py-0.5 text-left font-bold text-foreground border-b border-foreground print:border-black">
                  {expenseLabel}
                </td>
                <td className="w-8 text-center font-bold text-foreground border-b border-foreground print:border-black">
                  =
                </td>
                <td className="text-right font-bold text-foreground num border-b border-foreground print:border-black">
                  {money(expense)}
                </td>
              </tr>
              <tr>
                <td className="pt-1.5 pb-0.5 text-left font-bold text-foreground">{surplusLabel}</td>
                <td className="pt-1.5 pb-0.5 w-8 text-center font-bold text-foreground">=</td>
                <td className="pt-1.5 pb-0.5 text-right font-bold text-foreground num">
                  {surplus > 0.5 ? money(surplus) : "নাই"}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  return (
    <div className="mt-2.5 flex flex-col items-center justify-center">
      <div className="w-64 text-center">
        <p className="mb-0.5 text-center font-bold text-[13px] text-foreground">
          আয়-ব্যয়ের চূড়ান্ত হিসাব সারসংক্ষেপ
        </p>
        <table className="w-full text-sm font-semibold">
          <tbody>
            <tr>
              <td className="py-0.5 text-left font-bold text-foreground">মোট আয়</td>
              <td className="w-6 text-center font-bold text-foreground">=</td>
              <td className="text-right font-bold text-foreground num">{money(income)}/-</td>
            </tr>
            <tr>
              <td className="py-0.5 text-left font-bold text-foreground border-b border-foreground print:border-black">
                {expenseLabel}
              </td>
              <td className="w-6 text-center font-bold text-foreground border-b border-foreground print:border-black">
                =
              </td>
              <td className="text-right font-bold text-foreground num border-b border-foreground print:border-black">
                {money(expense)}/-
              </td>
            </tr>
            <tr>
              <td className="pt-1 pb-0.5 text-left font-bold text-foreground">{surplusLabel}</td>
              <td className="pt-1 pb-0.5 w-6 text-center font-bold text-foreground">=</td>
              <td className="pt-1 pb-0.5 text-right font-bold text-foreground num">
                {surplus > 0.5 ? `${money(surplus)}/-` : "নাই"}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}

/** টাকা উত্তোলনের আবেদনপত্র — অধ্যক্ষ বরাবর ফরমাল আবেদন ও খরচের বিবরণী */
export function PrintApplicationLetter({
  data,
  examName,
  configName,
  isVerification = false,
}: {
  data: VoucherData;
  examName: string;
  configName: string;
  isVerification?: boolean | undefined;
}) {
  const [orgInfo] = useAtom(orgInfoAtom);

  const expItems = data.expenses || [];
  const totalAmount = sum(expItems.map((e) => e.amount));
  const totalVat = sum(expItems.map((e) => (e.vatRate ? Math.round(e.amount * e.vatRate) : 0)));
  const totalTax = sum(expItems.map((e) => (e.taxRate ? Math.round(e.amount * e.taxRate) : 0)));

  // Format Date in Bengali: e.g. "০৪/১০/২০২৫ খ্রি."
  const formatBnDate = (d: string) => {
    if (!d) return "তারিখ : .................... খ্রি.";
    if (d.includes("-")) {
      const parts = d.split("-");
      if (parts.length === 3 && parts[0]?.length === 4) {
        return `তারিখ : ${toBn(parts[2] || "")}/${toBn(parts[1] || "")}/${toBn(parts[0] || "")} খ্রি.`;
      }
    }
    return `তারিখ : ${toBn(d)}${d.includes("খ্রি") ? "" : " খ্রি."}`;
  };

  // College & District from orgInfo
  const collegeParts = orgInfo.college.split(",");
  const collegeLine = collegeParts[0]?.trim() || orgInfo.college;
  const districtLine = collegeParts.length > 1 ? collegeParts.slice(1).join(",").trim() : "";

  // Title / topic name
  const rawTopic = data.examName?.trim() || examName || configName || "সেমিনার তহবিল";
  const topicName = stripRatio(rawTopic);
  const fundLabel = topicName.includes("তহবিল") ? topicName : `${topicName} তহবিল`;
  const fullInWords = `${bnWords(totalAmount).replace(/।+$/, "").trim()}।`;
  const wordsOnly = bnWords(totalAmount).replace(/\s*টাকা\s*মাত্র।?$/g, "").replace(/।$/, "").trim();

  return (
    <section className="print-page relative mx-auto mb-6 flex w-full max-w-[210mm] min-h-[277mm] flex-col bg-card px-[14mm] pt-[10mm] pb-[2mm] text-card-foreground shadow-[0_1px_0_0_var(--border),0_12px_32px_-20px_oklch(0_0_0/0.4)] print:mb-0 print:max-w-none print:shadow-none print:pt-[6mm] print:pb-0 overflow-hidden font-serif">
      {/* সত্যতা যাচাইকৃত সিকিউরিটি ওয়াটারমার্ক */}
      {isVerification && <VerifiedWatermark voucherId={data.id} />}

      {isVerification && (
        <div className="relative z-10 mb-2 flex items-center justify-between rounded border border-emerald-600/30 bg-emerald-50/80 px-2.5 py-1 text-[11px] font-sans text-emerald-900 print:border-emerald-600/40">
          <div className="flex items-center gap-1.5 font-bold">
            <span>🛡️</span>
            <span>ডিজিটাল সত্যতা যাচাইকৃত আবেদনপত্র (Verified Application)</span>
          </div>
          <div className="font-mono text-[10px] font-semibold text-emerald-800">
            আইডি: {data.id}
          </div>
        </div>
      )}

      {/* ১. শীর্ষ হেডার (অন্যান্য ভাউচারের মতো হুবহু) */}
      <header className="relative z-10 pb-1 text-center">
        <h1 className="text-[27px] sm:text-[29px] font-black leading-tight tracking-tight text-foreground">
          {orgInfo.dept}
        </h1>
        <p className="text-[19px] sm:text-[20px] font-bold leading-snug text-foreground/90 mt-1">
          {orgInfo.college}
        </p>
        <p className="mt-2 flex items-center justify-center flex-wrap gap-x-2 text-[12.5px] font-medium text-foreground/80">
          <span>
            মোবাইল: <strong className="font-semibold text-foreground">{orgInfo.phone}</strong>
          </span>
          <span>•</span>
          <span>
            ই-মেইল:{" "}
            <span className="font-medium" style={{ color: "#2563eb" }}>
              {orgInfo.email}
            </span>
          </span>
          <span>•</span>
          <span>
            ওয়েব:{" "}
            <span className="font-medium" style={{ color: "#2563eb" }}>
              {orgInfo.web}
            </span>
          </span>
        </p>
        {/* হেডার ডাবল লাইন: ওপরেরটি একটু মোটা, নিচেরটি একটু চিকন */}
        <div className="mt-2.5 space-y-[2px] w-full" aria-hidden="true">
          <div className="border-b-[2.5px] border-foreground print:border-black w-full" />
          <div className="border-b-[1px] border-foreground print:border-black w-full" />
        </div>
      </header>

      {/* ২. তারিখ ও প্রাপক */}
      <div className="relative z-10 mt-4 text-[15px] leading-relaxed text-foreground">
        <p className="font-semibold">{formatBnDate(data.date)}</p>

        <div className="mt-3">
          <p className="font-semibold">বরাবর</p>
          <div className="ml-6 space-y-0.5 font-medium leading-tight text-[15px]">
            <p>অধ্যক্ষ</p>
            <p>{collegeLine},</p>
            {districtLine ? <p>{districtLine}।</p> : null}
          </div>
        </div>

        {/* ৩. বিষয় */}
        <p className="mt-3.5 font-bold text-[15.5px]">
          বিষয় : {orgInfo.dept} এর {fundLabel} থেকে টাকা উত্তোলন প্রসঙ্গে।
        </p>

        {/* ৪. মহোদয় ও মূল কথা */}
        <div className="mt-3">
          <p className="font-semibold text-[15px]">মহোদয়,</p>
          <p className="ml-6 mt-1 text-[15px] leading-relaxed">
            যথাবিহিত সম্মানপূর্বক নিবেদন এই যে, নিম্নবর্ণিত হিসাব অনুসারে {fundLabel} থেকে টাকা উত্তোলন প্রয়োজন।
          </p>
        </div>
      </div>

      {/* ৫. খরচের বিবরণী টেবিল */}
      <div className="relative z-10 mt-3.5">
        <table className="voucher-table text-[14px]">
          <thead>
            <tr>
              <th className="py-2 px-2 text-center w-14 font-bold text-[14px]">
                ক্র. নং
              </th>
              <th className="py-2 px-3 text-center font-bold text-[14px]">
                খরচের বিবরণী
              </th>
              <th className="py-2 px-2 text-center w-32 font-bold text-[14px]">
                টাকার পরিমাণ
              </th>
              <th className="py-2 px-2 text-center w-24 font-bold text-[14px]">
                ভ্যাট
              </th>
              <th className="py-2 px-2 text-center w-24 font-bold text-[14px]">
                উৎস কর
              </th>
            </tr>
          </thead>
          <tbody>
            {expItems.length === 0 ? (
              <tr>
                <td
                  colSpan={5}
                  className="py-6 text-center text-muted-foreground"
                >
                  (কোনো খরচের হিসাব এন্ট্রি করা হয়নি)
                </td>
              </tr>
            ) : (
              expItems.map((item, idx) => {
                const vat = item.vatRate > 0 ? Math.round(item.amount * item.vatRate) : 0;
                const tax = item.taxRate > 0 ? Math.round(item.amount * item.taxRate) : 0;
                return (
                  <tr key={item.id || idx}>
                    <td className="py-2 px-2 text-center num text-[14px]">
                      {toBn(idx + 1)}
                    </td>
                    <td className="py-2 px-3 text-left text-[14px]">
                      {item.desc || item.productName || "—"}
                    </td>
                    <td className="py-2 px-3 text-right font-medium num text-[14px]">
                      {money(item.amount)}/-
                    </td>
                    <td className="py-2 px-3 text-right num text-[14px]">
                      {vat > 0 ? `${money(vat)}/-` : "-"}
                    </td>
                    <td className="py-2 px-3 text-right num text-[14px]">
                      {tax > 0 ? `${money(tax)}/-` : "-"}
                    </td>
                  </tr>
                );
              })
            )}
            {/* সর্বমোট সারি */}
            <tr className="border-t-2 border-foreground font-bold text-[14.5px]">
              <td colSpan={2} className="py-2 px-3 text-right">
                সর্বমোট
              </td>
              <td className="py-2 px-3 text-right num">
                {money(totalAmount)}/-
              </td>
              <td className="py-2 px-3 text-right num">
                {totalVat > 0 ? `${money(totalVat)}/-` : "-"}
              </td>
              <td className="py-2 px-3 text-right num">
                {totalTax > 0 ? `${money(totalTax)}/-` : "-"}
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* ৬. কথায় ও অতএব */}
      <div className="relative z-10 mt-3.5 text-[15px] leading-relaxed text-foreground space-y-2">
        <p className="font-semibold">
          কথায় : {fullInWords}
        </p>
        <p className="leading-relaxed">
          অতএব, উক্ত {toBn(totalAmount)}/- ({wordsOnly}) টাকা উত্তোলনের অনুমতি দিতে মহোদয়ের সদয় মর্জি হয়।
        </p>
      </div>

      {/* ৭. বিভাগীয় প্রধানের স্বাক্ষর */}
      <div className="relative z-10 mt-12 flex justify-end text-center text-[14.5px]">
        <div className="w-56 text-center leading-snug">
          <div className="mb-2 w-full border-t-2 border-dotted border-foreground/80 print:border-black" />
          <p className="font-bold text-[15px] text-foreground">বিভাগীয় প্রধান</p>
          <p className="text-[13px] font-medium text-foreground/90">{orgInfo.dept}</p>
          <p className="text-[13px] font-medium text-foreground/90">{orgInfo.college}।</p>
        </div>
      </div>

      <footer className="relative z-10 mt-auto pt-2.5 pb-0 border-t border-border/60 print:border-foreground/20">
        <div className="flex items-center justify-between text-[9px] text-muted-foreground leading-tight">
          <div>
            {data.id ? (
              <div className="inline-flex items-center gap-1 rounded border border-border/80 bg-muted/40 px-2 py-0.5 text-[9px] font-medium text-foreground print:border-foreground/30 print:bg-transparent">
                <span className="font-bold text-[9px]">ভাউচার নং:</span>
                <span className="font-mono tracking-tight font-semibold text-[9px]">
                  {formatVoucherNumber(data.id)}
                </span>
              </div>
            ) : null}
          </div>
          <div>
            {(() => {
              const challanSummary = formatChallanCodesSummary([
                data.challans?.vat?.fullCode,
                data.challans?.tax5?.fullCode,
                data.challans?.tax10?.fullCode,
              ]);
              return challanSummary ? (
                <div className="inline-flex items-center gap-1 rounded border border-border/80 bg-muted/40 px-2 py-0.5 text-[9px] font-medium text-foreground print:border-foreground/30 print:bg-transparent">
                  <span className="font-bold text-[9px]">চালান নং:</span>
                  <span className="font-mono tracking-tight text-[9px]">{challanSummary}</span>
                </div>
              ) : null;
            })()}
          </div>
        </div>
      </footer>
    </section>
  );
}

/** বন্টনের টেবিল — শেষ কলাম স্বাক্ষর */
function PayTable({
  rows,
  withQs = false,
  isBonton = false,
}: {
  rows: SettledRow[];
  withQs?: boolean;
  isBonton?: boolean;
}) {
  const total = {
    amount: sum(rows.map((r) => r.amount)),
    tax: sum(rows.map((r) => r.tax)),
    stamp: sum(rows.map((r) => r.stamp)),
    net: sum(rows.map((r) => r.net)),
  };
  const cols = withQs ? 8 : 6;
  return (
    <div>
      <table className="voucher-table">
        <thead>
          <tr className="whitespace-nowrap">
            <th className="w-14 text-center px-2">ক্র. নং</th>
            <th className="text-center px-3 w-auto">নাম ও পদবী</th>
            {withQs ? <th className="px-2 text-center">প্রশ্নপত্র</th> : null}
            {withQs ? <th className="px-2 text-center">উত্তরপত্র</th> : null}
            <th className="px-3 text-center">পরিমাণ</th>
            <th className="px-3 text-center">উৎস কর</th>
            <th className="px-3 text-center">স্ট্যাম্প</th>
            <th className="px-3 text-center">{isBonton ? "নিট প্রাপ্য" : "নীট পরিমাণ"}</th>
            <th className="w-32 text-center px-2">স্বাক্ষর</th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td colSpan={cols + 1} className="py-6 text-center text-muted-foreground">
                কোনো এন্ট্রি নেই
              </td>
            </tr>
          ) : (
            rows.map((r, i) => (
              <tr key={r.id} className="h-[95px]">
                <td className="text-center">{toBn(i + 1)}</td>
                <td className="whitespace-nowrap px-3 text-left">
                  {r.name ? (
                    <>
                      <span className="font-semibold text-foreground">{r.name}</span>
                      <br />
                      <span className="text-[13px] font-normal text-muted-foreground">
                        {r.designation}
                      </span>
                    </>
                  ) : (
                    r.designation
                  )}
                </td>
                {withQs ? <td className="num">{r.qsMoney ? money(r.qsMoney) : "—"}</td> : null}
                {withQs ? (
                  <td className="num">{r.scriptMoney ? money(r.scriptMoney) : "—"}</td>
                ) : null}
                <td className="num">{money(r.amount)}</td>
                <td className="num">{r.tax ? money(r.tax) : "—"}</td>
                <td className="num">{r.stamp ? money(r.stamp) : "—"}</td>
                <td className="num font-semibold">{money(r.net)}</td>
                <td />
              </tr>
            ))
          )}
        </tbody>
        <tfoot>
          <tr>
            <td colSpan={withQs ? 4 : 2} className="text-right font-bold pr-4">
              মোট
            </td>
            <td className="num font-bold">{money(total.amount)}</td>
            <td className="num font-bold">{money(total.tax)}</td>
            <td className="num font-bold">{money(total.stamp)}</td>
            <td className="num font-bold">{money(total.net)}</td>
            <td />
          </tr>
        </tfoot>
      </table>
      <p className="mt-2 text-sm">
        <b>কথায়:</b> {bnWords(total.amount)}
      </p>
    </div>
  );
}

/**
 * অফিশিয়াল ভাউচার প্রিন্ট লেআউট ডকুমেন্ট
 * এটি ভাউচার পেজে প্রিন্ট ট্যাবে এবং ভেরিফিকেশন পোর্টালে (QR কোড স্ক্যানে) হুবহু একরকম অথেনটিক প্রিন্ট কপি প্রদর্শন করে
 */
export function VoucherPrintDocument({
  data,
  slug: rawSlug,
  isVerification = false,
}: {
  data: VoucherData;
  slug?: string;
  isVerification?: boolean;
}) {
  const slug = normalizeSlug(rawSlug || data?.id);
  const config = getVoucherConfig(slug) || VOUCHERS[0]!;
  const fullExam =
    slug === "abedon"
      ? (data.examName || "সেমিনার তহবিল")
      : slug === "shikkha-sofor"
      ? (data.examName || `শিক্ষা সফর-${toBn(data.year || new Date().getFullYear())}`)
      : examTitle(data);
  const calc = computeVoucher(data, slug);

  const earnRows =
    slug === "shikkha-sofor"
      ? data.earnings.map((e, idx) => ({
          voucherNo: e.voucherNo || toBn(idx + 1),
          desc: e.desc,
          studentCount: e.studentCount,
          rate: e.rate,
          amount: resolveEarningAmount(e),
          vat: 0,
          tax: 0,
        }))
      : [
          ...(data.studentCount > 0 || data.perStudent > 0
            ? [
                {
                  voucherNo: "১",
                  desc: `${fullExam} এর ভূগোল বিষয়ের ${toBn(data.studentCount)} জন ${slug === "bhorti-babosthapona-fee" ? "শিক্ষার্থীর" : "পরীক্ষার্থীর"} ${money(data.perStudent)} হারে ${slug === "bhorti-babosthapona-fee" ? "ভর্তি" : config.name.includes("পরীক্ষা") ? config.name + "র" : "পরীক্ষার"} ফি বাবদ আয় (${toBn(data.studentCount)}×${money(data.perStudent)})`,
                  amount: calc.studentIncome,
                  vat: 0,
                  tax: 0,
                },
              ]
            : []),
          ...data.earnings.map((e) => ({
            voucherNo: e.voucherNo,
            desc: e.desc,
            amount: resolveEarningAmount(e),
            vat: 0,
            tax: 0,
          })),
        ];

  if (slug === "abedon") {
    return (
      <div className="space-y-6">
        <PrintApplicationLetter
          data={data}
          examName={fullExam}
          configName={config.name}
          isVerification={isVerification}
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* ১. আয়-ব্যয়ের হিসাব বিবরণী */}
      {!["babosthapona-fee", "bhorti-babosthapona-fee", "kendro-fee", "term-paper"].includes(
        config.slug,
      ) && (
        <PrintPage
          examName={fullExam}
          title="আয়-ব্যয়ের হিসাব বিবরণী :"
          voucherId={data.id}
          date={data.date}
          bothSignatures
          slug={slug}
          vatCode={data.challans?.vat?.fullCode}
          tax5Code={data.challans?.tax5?.fullCode}
          tax10Code={data.challans?.tax10?.fullCode}
          isVerification={isVerification}
          isFirstPage={true}
        >
          <EarnTable rows={earnRows} slug={slug} />

          {config.sections.expenses ? (
            <>
              <CostTable
                slug={slug}
                rows={[
                  ...(config.sections.adminDuty && calc.pool35 > 0
                    ? [
                        {
                          id: "admin-expense",
                          voucherNo: "",
                          productName: "কলেজ প্রশাসন ও কমিটি এবং অফিস",
                          desc: "কলেজ প্রশাসন ও কমিটি এবং অফিস",
                          amount: calc.pool35,
                          vatRate: 0,
                          taxRate: sum(calc.adminRows.map((r) => r.tax)) / calc.pool35,
                        },
                      ]
                    : []),
                  ...(config.sections.qs && calc.qsTotal > 0
                    ? [
                        {
                          id: "qs-expense",
                          voucherNo: "",
                          productName: "প্রশ্নপত্র প্রণয়ন ও উত্তরপত্র মূল্যায়ন বিল",
                          desc: "প্রশ্নপত্র প্রণয়ন ও উত্তরপত্র মূল্যায়ন",
                          amount: calc.qsTotal,
                          vatRate: 0,
                          taxRate: sum(calc.qsRows.map((r) => r.tax)) / calc.qsTotal,
                        },
                      ]
                    : []),
                  ...(config.sections.invigilatorDuty && calc.pool63 > 0
                    ? [
                        {
                          id: "duty-expense",
                          voucherNo: "",
                          productName: "কক্ষ প্রত্যবেক্ষক ও পিয়ন",
                          desc: "কক্ষ প্রত্যবেক্ষক ও পিয়ন",
                          amount: calc.pool63,
                          vatRate: 0,
                          taxRate: sum(calc.dutyRows.map((r) => r.tax)) / calc.pool63,
                        },
                      ]
                    : []),
                  ...(config.sections.adminDuty && calc.pool2 > 0
                    ? [
                        {
                          id: "council-expense",
                          voucherNo: "",
                          productName: data.councilName
                            ? `${data.councilName} (শিক্ষক পরিষদ)`
                            : "শিক্ষক পরিষদ",
                          desc: "শিক্ষক পরিষদ",
                          amount: calc.pool2,
                          vatRate: 0,
                          taxRate: calc.councilRow.tax / calc.pool2,
                        },
                      ]
                    : []),
                  ...data.expenses,
                ]}
              />
              <FinancialSummaryBox
                slug={slug}
                income={calc.income}
                expense={
                  calc.expenseTotal +
                  (config.sections.qs ? calc.qsTotal : 0) +
                  (config.sections.adminDuty ? calc.pool35 : 0) +
                  (config.sections.invigilatorDuty ? calc.pool63 : 0) +
                  (config.sections.adminDuty ? calc.pool2 : 0)
                }
                expenseLabel="মোট ব্যয়"
                surplusLabel="উদ্বৃত্ত"
              />
            </>
          ) : null}
        </PrintPage>
      )}

      {/* ২. প্রশাসন ও কমিটি */}
      {config.sections.adminDuty && !["bebaharik", "mowkhik"].includes(config.slug) ? (
        <PrintPage
          hideDeptHeadSignature={config.slug === "nirbachoni" || config.slug === "incourse"}
          examName={fullExam}
          title="কলেজ প্রশাসন ও কমিটি এবং অফিস"
          voucherId={data.id}
          date={data.date}
          slug={slug}
          vatCode={data.challans?.vat?.fullCode}
          tax5Code={data.challans?.tax5?.fullCode}
          tax10Code={data.challans?.tax10?.fullCode}
          isVerification={isVerification}
        >
          <PayTable rows={calc.adminRows} />
        </PrintPage>
      ) : null}

      {/* ৩. প্রশ্ন ও উত্তরপত্র */}
      {config.sections.qs && !["bebaharik", "mowkhik"].includes(config.slug) ? (
        <PrintPage
          hideDeptHeadSignature={config.slug === "nirbachoni" || config.slug === "incourse"}
          examName={fullExam}
          title="প্রশ্নপত্র প্রণয়ন এবং উত্তরপত্র মূল্যায়ণ"
          subtitle={`প্রশ্নপত্র ${money(data.questionRate)}/- , উত্তরপত্র ${money(data.scriptRate)}/-`}
          voucherId={data.id}
          date={data.date}
          slug={slug}
          vatCode={data.challans?.vat?.fullCode}
          tax5Code={data.challans?.tax5?.fullCode}
          tax10Code={data.challans?.tax10?.fullCode}
          isVerification={isVerification}
        >
          <PayTable rows={calc.qsRows} withQs />
        </PrintPage>
      ) : null}

      {/* ৪. কক্ষ প্রত্যবেক্ষক ও পিয়ন */}
      {config.sections.invigilatorDuty && !["bebaharik", "mowkhik"].includes(config.slug) ? (
        <PrintPage
          hideDeptHeadSignature={config.slug === "nirbachoni" || config.slug === "incourse"}
          examName={fullExam}
          title="কক্ষ প্রত্যবেক্ষক ও পিয়ন"
          voucherId={data.id}
          date={data.date}
          slug={slug}
          vatCode={data.challans?.vat?.fullCode}
          tax5Code={data.challans?.tax5?.fullCode}
          tax10Code={data.challans?.tax10?.fullCode}
          isVerification={isVerification}
        >
          <PayTable rows={calc.dutyRows} />
        </PrintPage>
      ) : null}

      {/* ৫. পদবীভিত্তিক বন্টন */}
      {config.sections.percentRows && !["bebaharik", "mowkhik"].includes(config.slug) ? (
        <PrintPage
          hideDeptHeadSignature={config.slug === "nirbachoni" || config.slug === "incourse"}
          examName={
            ["babosthapona-fee", "term-paper", "kendro-fee"].includes(config.slug)
              ? fullExam.replace(/ব্যবস্থাপনা ফী|টার্ম পেপার|কেন্দ্র ফী/g, "পরীক্ষা")
              : config.slug === "bhorti-babosthapona-fee"
                ? fullExam.replace(/ভর্তি ব্যবস্থাপনা ফী/g, "ভর্তি")
                : fullExam
          }
          title={
            ["babosthapona-fee", "bhorti-babosthapona-fee", "kendro-fee", "term-paper"].includes(
              config.slug,
            )
              ? `${config.name} আয় ব্যয়ের হিসাব বিবরণী`
              : `${config.name} — বন্টন`
          }
          subtitle={
            ["babosthapona-fee", "bhorti-babosthapona-fee", "kendro-fee", "term-paper"].includes(
              config.slug,
            )
              ? `আয় : ${
                  ["babosthapona-fee", "term-paper", "kendro-fee"].includes(config.slug)
                    ? fullExam.replace(/ব্যবস্থাপনা ফী|টার্ম পেপার|কেন্দ্র ফী/g, "পরীক্ষা")
                    : config.slug === "bhorti-babosthapona-fee"
                      ? fullExam.replace(/ভর্তি ব্যবস্থাপনা ফী/g, "ভর্তি")
                      : fullExam
                } এর ভূগোল বিষয়ের ${toBn(data.studentCount)} জন পরীক্ষার্থীর ${toBn(data.perStudent)} হারে ${config.name.replace("ফী", "ফি")} বাবদ আয় (${toBn(data.studentCount)}×${toBn(data.perStudent)}) = ${toBn(calc.distributable)}/-`
              : undefined
          }
          voucherId={data.id}
          date={data.date}
          bothSignatures={true}
          slug={slug}
          vatCode={data.challans?.vat?.fullCode}
          tax5Code={data.challans?.tax5?.fullCode}
          tax10Code={data.challans?.tax10?.fullCode}
          isVerification={isVerification}
          isFirstPage={["babosthapona-fee", "bhorti-babosthapona-fee", "kendro-fee", "term-paper"].includes(
            config.slug,
          )}
        >
          <PayTable rows={calc.percentRows} isBonton />

          {["babosthapona-fee", "bhorti-babosthapona-fee", "kendro-fee", "term-paper"].includes(
            config.slug,
          ) && (
            <FinancialSummaryBox
              income={calc.income}
              expense={calc.distributable + calc.expenseTotal}
              expenseLabel="মোট ব্যয় / বন্টন"
              surplusLabel="উদ্বৃত্ত / অবশিষ্ট"
            />
          )}
        </PrintPage>
      ) : null}
    </div>
  );
}

/* ---------------------------------------------------------------------------
 * ১২. গুগল শীট ইমপোর্ট
 * ------------------------------------------------------------------------ */

function TeacherSelectionModal({
  slug,
  isOpen,
  onClose,
  data,
  update,
}: {
  slug: string;
  isOpen: boolean;
  onClose: () => void;
  data: VoucherData;
  update: (u: Partial<VoucherData>) => void;
}) {
  const [db] = useAtom(dbAtom);
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden">
        <div className="p-4 border-b border-border flex justify-between items-center bg-secondary">
          <h2 className="text-xl font-bold">শিক্ষক যোগ করুন</h2>
          <button
            onClick={() => {
              onClose();
              notifyFeedback.close("শিক্ষক নির্বাচন উইন্ডো বন্ধ করা হয়েছে।");
            }}
            className="text-muted-foreground hover:text-foreground"
          >
            ✕
          </button>
        </div>
        <div className="p-4 overflow-y-auto flex-1">
          <table className="w-full text-left text-sm border-collapse">
            <thead>
              <tr className="border-b bg-muted text-muted-foreground">
                <th className="p-2 font-medium">নাম ও পদবী</th>
                <th className="p-2 font-medium">অ্যাকশন</th>
              </tr>
            </thead>
            <tbody>
              {db.teachers.map((t, idx) => (
                <tr key={idx} className="border-b hover:bg-muted/50">
                  <td className="p-2">
                    <div className="font-semibold">{t.name}</div>
                    <div className="text-xs text-muted-foreground">{t.designation}</div>
                  </td>
                  <td className="p-2 flex flex-wrap gap-2">
                    <button
                      className="px-2 py-1 bg-blue-100 text-blue-700 rounded text-xs hover:bg-blue-200 font-medium cursor-pointer"
                      onClick={() => {
                        update({
                          duty: [
                            ...data.duty,
                            {
                              id: uid(),
                              name: t.name,
                              designation: t.designation,
                              role: "teacher",
                              duties: 1,
                            },
                          ],
                        });
                        notifyFeedback.success(`${t.name} — ডিউটিতে যুক্ত হয়েছে`, undefined, "teacher-add");
                      }}
                    >
                      + ডিউটি (কক্ষ প্রত্যবেক্ষক)
                    </button>
                    <button
                      className="px-2 py-1 bg-green-100 text-green-700 rounded text-xs hover:bg-green-200 font-medium cursor-pointer"
                      onClick={() => {
                        update({
                          qs: [
                            ...data.qs,
                            {
                              id: uid(),
                              name: t.name,
                              designation: t.designation,
                              questions: 0,
                              scripts: 0,
                            },
                          ],
                        });
                        notifyFeedback.success(`${t.name} — খাতা মূল্যায়নে যুক্ত হয়েছে`, undefined, "teacher-add");
                      }}
                    >
                      + খাতা দেখা (Evaluator)
                    </button>
                    <button
                      className="px-2 py-1 bg-purple-100 text-purple-700 rounded text-xs hover:bg-purple-200 font-medium cursor-pointer"
                      onClick={() => {
                        update({
                          admin: [
                            ...data.admin,
                            {
                              id: uid(),
                              name: t.name,
                              designation: t.designation,
                              percent: rateFor(slug, t.designation, db),
                            },
                          ],
                        });
                        notifyFeedback.success(`${t.name} — প্রশাসনে যুক্ত হয়েছে`, undefined, "teacher-add");
                      }}
                    >
                      + বন্টন (Admin)
                    </button>
                    <button
                      className="px-2 py-1 bg-orange-100 text-orange-700 rounded text-xs hover:bg-orange-200 font-medium cursor-pointer"
                      onClick={() => {
                        update({
                          percentRows: [
                            ...data.percentRows,
                            {
                              id: uid(),
                              name: t.name,
                              designation: t.designation,
                              percent: rateFor(slug, t.designation, db),
                            },
                          ],
                        });
                        notifyFeedback.success(`${t.name} — বন্টনে যুক্ত হয়েছে`, undefined, "teacher-add");
                      }}
                    >
                      + বন্টন (পার্সেন্টেজ)
                    </button>
                  </td>
                </tr>
              ))}
              {db.teachers.length === 0 && (
                <tr>
                  <td colSpan={2} className="p-4 text-center text-muted-foreground">
                    ডাটাবেসে কোনো শিক্ষকের তথ্য পাওয়া যায়নি। দয়া করে হোমপেজ থেকে ডাটাবেস সিঙ্ক করুন।
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function num(v: unknown) {
  const n = Number(String(v ?? "").replace(/,/g, ""));
  return Number.isFinite(n) ? n : 0;
}
function pct(v: unknown) {
  const s = String(v ?? "").replace(/[০-৯]/g, (d) => String(BN_DIGITS.indexOf(d)));
  const m = s.match(/[\d.]+/);
  if (!m) return 0;
  const n = Number(m[0]);
  return n > 1 ? n / 100 : n;
}
function extractId(input: string) {
  const m = input.match(/\/d\/([a-zA-Z0-9-_]+)/);
  return m ? m[1]! : input.trim();
}

/* ---------------------------------------------------------------------------
 * ১৩. রুট
 * ------------------------------------------------------------------------ */

export const Route = createFileRoute("/voucher/$slug")({
  validateSearch: (
    search: Record<string, unknown>,
  ): { classLevel?: string | undefined; loadId?: string | undefined } => {
    return {
      classLevel: search["classLevel"] ? String(search["classLevel"]) : undefined,
      loadId: search["loadId"] ? String(search["loadId"]) : undefined,
    };
  },
  loader: ({ params }) => {
    const config = getVoucherConfig(params.slug);
    if (!config) throw notFound();
    return { config };
  },
  head: ({ params }) => {
    const config = getVoucherConfig(params.slug);
    const name = config?.name ?? "ভাউচার";
    return {
      meta: [
        { title: `${name} ভাউচার — ভূগোল ও পরিবেশ বিভাগ, কুমুদিনী সরকারি কলেজ` },
        {
          name: "description",
          content: `${name}-এর আয়, ব্যয়, ভ্যাট-ট্যাক্স ও বন্টনের প্রিন্ট-রেডি ভাউচার তৈরি করুন।`,
        },
        { property: "og:title", content: `${name} ভাউচার — ভূগোল ও পরিবেশ বিভাগ` },
        { property: "og:description", content: `${name}-এর হিসাব ও প্রিন্ট-রেডি ভাউচার।` },
        { property: "og:type", content: "article" },
        { name: "twitter:card", content: "summary_large_image" },
      ],
    };
  },
  component: VoucherPage,
  errorComponent: ({ error }) => (
    <div className="p-10 text-center text-destructive">{error.message}</div>
  ),
  notFoundComponent: () => <div className="p-10 text-center">ভাউচার পাওয়া যায়নি।</div>,
});

function VoucherPage() {
  const [isSaving, setIsSaving] = useState(false);
  const [hasSavedOnce, setHasSavedOnce] = useState(false);
  const hasNotifiedOpen = useRef(false);

  const navigate = Route.useNavigate();
  const [isAuth, setIsAuth] = useState<boolean | null>(null);

  useEffect(() => {
    let cancelled = false;
    const checkSession = async () => {
      try {
        const session = await getSessionStatus();
        if (cancelled) return;
        setIsAuth(session.authenticated);
        if (!session.authenticated) {
          navigate({ to: "/login", replace: true });
        }
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

  const searchParams = Route.useSearch() as Record<string, unknown>;
  const classLevel = searchParams["classLevel"] as string | undefined;
  const loadId = searchParams["loadId"] as string | undefined;
  const { config } = Route.useLoaderData();
  const { slug } = Route.useParams();
  const { data, setData, loaded, openById, newDraft } = useVoucher(
    slug,
    config.name,
    classLevel,
    loadId,
  );
  const [db] = useAtom(dbAtom);
  const { sectors, save: saveSectors } = useSectors();
  const [tab, setTab] = useState<"entry" | "print">("entry");
  const [openId, setOpenId] = useState("");
  const [teacherModalOpen, setTeacherModalOpen] = useState(false);
  const calc = computeVoucher(data, slug);
  const drafts = useMemo(() => (loaded ? listDrafts(slug) : []), [loaded, slug]);

  const patch = (p: Partial<VoucherData>) => setData((d) => ({ ...d, ...p }));

  const fullExam =
    slug === "abedon"
      ? (data.examName || "সেমিনার তহবিল")
      : slug === "shikkha-sofor"
      ? (data.examName || `শিক্ষা সফর-${toBn(data.year || new Date().getFullYear())}`)
      : examTitle(data);

  const isExistingVoucher = Boolean(loadId) || hasSavedOnce;

  // যখন কোনো ভাউচার আইডি দিয়ে ওপেন করা হয়, তখন ওপেন নোটিফিকেশন প্রদর্শন
  useEffect(() => {
    if (loadId && loaded && !hasNotifiedOpen.current) {
      hasNotifiedOpen.current = true;
      notifyFeedback.open(loadId, fullExam);
    }
  }, [loadId, loaded, fullExam]);

  // ভাউচারের ডেটা তৈরি বা পরিবর্তন হলেই সাথে সাথে ক্যাশে সংরক্ষণ (যাতে ভেরিফিকেশন পোর্টালে সম্পূর্ণ ডেটা পাওয়া যায়)
  useEffect(() => {
    if (data?.id) {
      storeTempVoucher(data.id, data);
    }
  }, [data]);

  const handleSaveToSheet = async () => {
    const sheetId = getSheetId();
    const scriptUrl = getScriptUrl();

    if (!sheetId || !scriptUrl) {
      notifyFeedback.error(
        "কনফিগারেশন পাওয়া যায়নি",
        "গুগল শীট বা সার্ভার কনফিগারেশন পাওয়া যায়নি! দয়া করে অ্যাডমিনের সাথে যোগাযোগ করুন।",
        "save-voucher",
      );
      return;
    }

    setIsSaving(true);
    // ১. অবিলম্বে লোকাল সেশন মেমোরিতে সংরক্ষণ (যাতে ব্যবহারকারীর কোনো পরিবর্তন না হারায়)
    storeTempVoucher(data.id, data);

    const loadingMsg = isExistingVoucher
      ? `"${fullExam}" ভাউচার আপডেট করা হচ্ছে...`
      : `"${fullExam}" নতুন ভাউচার সংরক্ষণ করা হচ্ছে...`;
    notifyFeedback.loading(loadingMsg, "save-voucher");

    try {
      const expenseVoucherNos = data.expenses
        .map((e, idx) => e.voucherNo || `${idx + 1}`)
        .join(", ");

      const response = await saveVoucherToServer({
        scriptUrl,
        payload: {
          action: "saveVoucher",
          id: sheetId,
          voucherId: data.id,
          configName: config.name,
          examName: fullExam,
          date: data.date,
          income: calc.totalIncome,
          expenses: calc.expenseTotal,
          distributable: calc.distributable,
          fullState: JSON.stringify(data),
          expenseVouchers: expenseVoucherNos,
          vatChallan: data.challans?.vat?.fullCode || "",
          vatAmount: calc.vatTotal,
          vatDate: data.challans?.vat?.date || "",
          tax5Challan: data.challans?.tax5?.fullCode || "",
          tax5Amount: calc.tax5to9Total,
          tax5Date: data.challans?.tax5?.date || "",
          tax10Challan: data.challans?.tax10?.fullCode || "",
          tax10Amount: calc.tax10to20Total,
          tax10Date: data.challans?.tax10?.date || "",
        },
      });

      const text = response.text;

      if (text.toLowerCase().includes("<html")) {
        notifyFeedback.error(
          "অ্যাপস স্ক্রিপ্ট ডিপ্লয়মেন্ট আপডেট প্রয়োজন",
          "গুগল থেকে HTML রেসপন্স এসেছে। এর মানে হলো Apps Script কোড আপডেট করার পর New Version ডিপ্লয় করতে হবে।",
          "save-voucher",
        );
        return;
      }

      const result = JSON.parse(text);
      if (result.success) {
        setHasSavedOnce(true);
        storeTempVoucher(data.id, data);

        // নিশ্চিত করুন URL-এ loadId রয়েছে যাতে পেজ রিলোড বা বুকমার্কেও ভাউচার নম্বর ঠিক থাকে
        navigate({
          search: (prev: Record<string, unknown>) => ({ ...prev, loadId: data.id }),
          replace: true,
        });

        if (isExistingVoucher) {
          notifyFeedback.update(data.id, fullExam, "save-voucher");
        } else {
          notifyFeedback.newSave(data.id, fullExam, "save-voucher");
        }
      } else {
        notifyFeedback.error("সংরক্ষণ ব্যর্থ হয়েছে!", result.error || "অজানা ত্রুটি", "save-voucher");
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      notifyFeedback.error("সংরক্ষণ ব্যর্থ হয়েছে!", msg, "save-voucher");
    } finally {
      setIsSaving(false);
    }
  };

  const earnRows = [
    ...(data.studentCount > 0 || data.perStudent > 0
      ? [
          {
            voucherNo: "১",
            desc: `${fullExam} এর ভূগোল বিষয়ের ${toBn(data.studentCount)} জন ${slug === "bhorti-babosthapona-fee" ? "শিক্ষার্থীর" : "পরীক্ষার্থীর"} ${money(data.perStudent)} হারে ${slug === "bhorti-babosthapona-fee" ? "ভর্তি" : config.name.includes("পরীক্ষা") ? config.name + "র" : "পরীক্ষার"} ফি বাবদ আয় (${toBn(data.studentCount)}×${money(data.perStudent)})`,
            amount: calc.studentIncome,
            vat: 0,
            tax: 0,
          },
        ]
      : []),
    ...data.earnings.map((e) => ({
      voucherNo: e.voucherNo,
      desc: e.desc,
      amount: resolveEarningAmount(e),
      vat: 0,
      tax: 0,
    })),
  ];

  if (!loaded) return <div className="p-10 text-center text-muted-foreground">লোড হচ্ছে…</div>;
  if (isAuth !== true) return null;

  return (
    <main className="min-h-screen bg-background">
      <div className="border-b border-border bg-secondary print:hidden">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-6 py-4">
          <div>
            <button
              onClick={() => {
                notifyFeedback.close(`"${fullExam}" ভাউচার বন্ধ করে মূল তালিকায় ফিরে আসা হয়েছে।`);
                navigate({ to: "/" });
              }}
              className="text-xs text-muted-foreground hover:text-foreground hover:underline inline-flex items-center gap-1 cursor-pointer font-medium mb-1"
              title="ভাউচার বন্ধ করে সব ভাউচারের তালিকায় ফিরে যান"
            >
              ← সব ভাউচার (বন্ধ করুন)
            </button>
            <h1 className="text-2xl font-bold text-foreground">{config.name}</h1>
            <div className="flex items-center gap-2 mt-0.5">
              <p className="text-xs text-muted-foreground font-mono">আইডি: {data.id}</p>
              {isExistingVoucher ? (
                <span className="text-[10px] bg-emerald-100 text-emerald-800 px-1.5 py-0.5 rounded font-medium border border-emerald-300">
                  সংরক্ষিত
                </span>
              ) : (
                <span className="text-[10px] bg-amber-100 text-amber-800 px-1.5 py-0.5 rounded font-medium border border-amber-300">
                  নতুন খসড়া
                </span>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2">
            {slug !== "abedon" && slug !== "shikkha-sofor" && (
              <button
                className="btn-ghost text-xs cursor-pointer"
                onClick={() => setTeacherModalOpen(true)}
                title="ডাটাবেস থেকে শিক্ষক যোগ করুন"
              >
                + শিক্ষক নির্বাচন
              </button>
            )}
            <button
              className="btn-ghost text-xs text-muted-foreground hover:text-foreground cursor-pointer"
              onClick={() => {
                if (window.confirm("নতুন খালি ভাউচার তৈরি করতে চান? বর্তমান পেজের পরিবর্তনগুলো রিসেট হয়ে যাবে।")) {
                  newDraft();
                  setHasSavedOnce(false);
                  notifyFeedback.newDraft(config.name);
                }
              }}
              title="নতুন খালি ড্রাফট তৈরি করুন"
            >
              ✨ নতুন ড্রাফট
            </button>
            <TabBtn active={tab === "entry"} onClick={() => setTab("entry")}>
              এন্ট্রি
            </TabBtn>
            <TabBtn active={tab === "print"} onClick={() => setTab("print")}>
              {slug === "abedon" ? "আবেদনপত্র প্রিন্ট" : "ভাউচার প্রিন্ট"}
            </TabBtn>
            <button
              className="btn-ghost text-xs cursor-pointer font-medium border border-border hover:bg-primary/10 transition-colors"
              onClick={handleSaveToSheet}
              disabled={isSaving}
              title={isExistingVoucher ? "গুগল শীটে পরিবর্তনসমূহ আপডেট করুন" : "গুগল শীটে নতুন ভাউচার হিসেবে সেভ করুন"}
            >
              {isSaving
                ? "⏳ সংরক্ষণ হচ্ছে..."
                : isExistingVoucher
                  ? "💾 গুগল শীটে আপডেট করুন"
                  : "💾 গুগল শীটে সেভ করুন"}
            </button>
            <button
              className="btn-primary text-xs cursor-pointer flex items-center gap-1"
              onClick={() => {
                notifyFeedback.info("প্রিন্ট মোড প্রস্তুত", "প্রিন্ট বা PDF হিসেবে সংরক্ষণ করতে পারেন।", "print-action");
                window.print();
              }}
            >
              🖨️ প্রিন্ট / PDF
            </button>
          </div>
        </div>
      </div>

      <TeacherSelectionModal
        slug={slug}
        isOpen={teacherModalOpen}
        onClose={() => setTeacherModalOpen(false)}
        data={data}
        update={patch}
      />

      <datalist id="sheet-teachers-list">
        {db.teachers.map((t, idx) => (
          <option key={idx} value={t.name} />
        ))}
      </datalist>

      {tab === "entry" ? (
        <div className="mx-auto max-w-6xl space-y-8 px-6 py-8 print:hidden">
          {/* লাইভ আর্থিক বিবরণী (আয়, ব্যয় ও অবশিষ্ট) */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {/* মোট আয় */}
            <div className="rounded-xl border border-emerald-200/90 bg-emerald-50/70 p-4 shadow-sm dark:border-emerald-900/60 dark:bg-emerald-950/20">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-emerald-800 dark:text-emerald-300">
                  মোট আয় {slug === "abedon" ? "(তহবিল হতে উত্তোলন)" : ""}
                </span>
                <span className="text-xl">💰</span>
              </div>
              <div className="mt-2 text-2xl font-bold tracking-tight text-emerald-950 dark:text-emerald-100 num">
                {money(calc.totalIncome)}/-
              </div>
              <div className="mt-1 text-[11px] text-emerald-700/90 dark:text-emerald-400">
                {slug === "abedon" ? (
                  "আবেদনপত্রে আয় প্রযোজ্য নয়"
                ) : slug === "shikkha-sofor" ? (
                  `সকল বর্ষ ও সেশনের মোট শিক্ষার্থী ফি: ${money(calc.income)}/-`
                ) : (
                  <>
                    ছাত্র ফি: <span className="font-semibold num">{money(calc.studentIncome)}/-</span>
                    {data.earnings.length > 0 && (
                      <> + অন্যান্য: <span className="font-semibold num">{money(sum(data.earnings.map((e) => e.amount)))}/-</span></>
                    )}
                  </>
                )}
              </div>
            </div>

            {/* মোট ব্যয় */}
            <div className="rounded-xl border border-blue-200/90 bg-blue-50/70 p-4 shadow-sm dark:border-blue-900/60 dark:bg-blue-950/20">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-blue-800 dark:text-blue-300">
                  মোট ব্যয় {["babosthapona-fee", "bhorti-babosthapona-fee", "kendro-fee", "term-paper"].includes(slug) ? "/ বন্টন" : ""}
                </span>
                <span className="text-xl">💸</span>
              </div>
              <div className="mt-2 text-2xl font-bold tracking-tight text-blue-950 dark:text-blue-100 num">
                {money(calc.totalExpense)}/-
              </div>
              <div className="mt-1 text-[11px] text-blue-700/90 dark:text-blue-400">
                {slug === "abedon"
                  ? "উত্তোলনের মোট ব্যয়"
                  : slug === "shikkha-sofor"
                  ? "শিক্ষা সফর পরিচালনা সংক্রান্ত যাবতীয় ব্যয়"
                  : ["babosthapona-fee", "bhorti-babosthapona-fee", "kendro-fee", "term-paper"].includes(slug)
                  ? "শতকরা হারে মোট বন্টনকৃত অর্থ"
                  : "পরীক্ষা সংশ্লিষ্ট মোট যাবতীয় ব্যয়"}
              </div>
            </div>

            {/* অবশিষ্ট */}
            <div className="rounded-xl border border-purple-200/90 bg-purple-50/70 p-4 shadow-sm dark:border-purple-900/60 dark:bg-purple-950/20">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-purple-800 dark:text-purple-300">
                  অবশিষ্ট / উদ্বৃত্ত
                </span>
                <span className="text-xl">⚖️</span>
              </div>
              <div className="mt-2 text-2xl font-bold tracking-tight text-purple-950 dark:text-purple-100 num">
                {calc.surplus > 0.5 ? `${money(calc.surplus)}/-` : "০/- (উদ্বৃত্ত নেই)"}
              </div>
              <div className="mt-1 text-[11px] text-purple-700/90 dark:text-purple-400">
                {calc.surplus > 0.5
                  ? "সেমিনার তহবিলে জমাযোগ্য জের"
                  : "আয় ও ব্যয়ের পরিমাণ সম্পূর্ণ সমন্বিত"}
              </div>
            </div>
          </div>

          {/* প্রাথমিক তথ্য */}
          <Card title="প্রাথমিক তথ্য">
            <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-6">
              <Field label="ভাউচার নম্বর / আইডি">
                <input
                  className="input font-mono font-medium text-foreground bg-background"
                  value={data.id}
                  onChange={(e) => patch({ id: e.target.value })}
                  placeholder="যেমন: TEST-2026-4821"
                  title="ভাউচার নম্বর বা ইউনিক আইডি (গুগল শীটে এই নম্বরেই সংরক্ষিত থাকবে)"
                />
              </Field>
              <Field
                label={
                  slug === "abedon"
                    ? "তহবিল / বিষয়ের নাম"
                    : slug === "shikkha-sofor"
                    ? "শিরোনাম"
                    : "পরীক্ষার নাম"
                }
              >
                <input
                  className="input"
                  value={data.examName}
                  onChange={(e) => patch({ examName: e.target.value })}
                  placeholder={
                    slug === "abedon"
                      ? "যেমন: সেমিনার তহবিল"
                      : slug === "shikkha-sofor"
                      ? "যেমন: শিক্ষা সফর-২০২৬"
                      : "যেমন: নির্বাচনী পরীক্ষা"
                  }
                />
              </Field>
              {slug !== "abedon" && slug !== "shikkha-sofor" && (
                <>
                  <Field label="সেশন">
                    <input
                      className="input"
                      value={data.session}
                      onChange={(e) => patch({ session: e.target.value })}
                      placeholder="যেমন: ২০২১-২২"
                    />
                  </Field>
                  <Field label="শিক্ষাবর্ষ (Year)">
                    <input
                      className="input"
                      value={data.year}
                      onChange={(e) => patch({ year: e.target.value })}
                      placeholder="যেমন: 2024"
                    />
                  </Field>
                </>
              )}
              {slug === "shikkha-sofor" && (
                <Field label="শিক্ষাবর্ষ (Year)">
                  <input
                    className="input"
                    value={data.year}
                    onChange={(e) => patch({ year: e.target.value })}
                    placeholder="যেমন: 2026"
                  />
                </Field>
              )}
              {config.sections.incomeStatement && slug !== "shikkha-sofor" && (
                <>
                  <Field label="ছাত্র-ছাত্রী সংখ্যা">
                    <input
                      type="number"
                      className="input"
                      value={data.studentCount || ""}
                      onChange={(e) => patch({ studentCount: Number(e.target.value) || 0 })}
                    />
                  </Field>
                  <Field label="জনপ্রতি ফি">
                    <input
                      type="number"
                      className="input"
                      value={data.perStudent || ""}
                      onChange={(e) => patch({ perStudent: Number(e.target.value) || 0 })}
                    />
                  </Field>
                </>
              )}
              <Field label="তারিখ">
                <input
                  type="date"
                  className="input"
                  value={data.date}
                  onChange={(e) => patch({ date: e.target.value })}
                />
              </Field>
            </div>
          </Card>

          {/* আয়ের হিসাব */}
          {config.sections.incomeStatement && (
            <Card
              title={slug === "shikkha-sofor" ? "আয়ের হিসাব (বর্ষভিত্তিক শিক্ষার্থী ফি)" : "আয়ের হিসাব (অন্যান্য ফি)"}
              action={
                <button
                  className="btn-ghost"
                  onClick={() =>
                    patch({
                      earnings: [
                        ...data.earnings,
                        slug === "shikkha-sofor"
                          ? { id: uid(), voucherNo: toBn(data.earnings.length + 1), desc: "", studentCount: 0, rate: 0, amount: 0 }
                          : { id: uid(), voucherNo: "", desc: "", amount: 0 },
                      ],
                    })
                  }
                >
                  + খাত যোগ
                </button>
              }
            >
              <RowList
                rows={data.earnings}
                onRemove={(id) => patch({ earnings: data.earnings.filter((r) => r.id !== id) })}
                onUpdate={(id, p) =>
                  patch({ earnings: data.earnings.map((r) => (r.id === id ? { ...r, ...p } : r)) })
                }
                render={(row: EarnItem, update) =>
                  slug === "shikkha-sofor" ? (
                    <>
                      <input
                        className="input w-16 text-center"
                        placeholder="ক্রম"
                        value={row.voucherNo}
                        onChange={(e) => update({ voucherNo: e.target.value })}
                        title="ক্রম নং"
                      />
                      <input
                        className="input flex-1"
                        placeholder="বর্ষ ও সেশন (যেমন: অনার্স ১ম বর্ষ (২০২৩-২৪))"
                        value={row.desc}
                        onChange={(e) => update({ desc: e.target.value })}
                      />
                      <input
                        type="number"
                        className="input w-28 text-center"
                        placeholder="শিক্ষার্থী"
                        value={row.studentCount || ""}
                        onChange={(e) => {
                          const count = Number(e.target.value) || 0;
                          const rate = row.rate || 0;
                          update({ studentCount: count, amount: count * rate });
                        }}
                        title="শিক্ষার্থী সংখ্যা"
                      />
                      <input
                        type="number"
                        className="input w-24 text-center"
                        placeholder="হার"
                        value={row.rate || ""}
                        onChange={(e) => {
                          const rate = Number(e.target.value) || 0;
                          const count = row.studentCount || 0;
                          update({ rate: rate, amount: count * rate });
                        }}
                        title="জনপ্রতি হার (টাকা)"
                      />
                      <input
                        type="number"
                        className="input w-32 text-right"
                        placeholder="টাকা"
                        value={row.amount || ""}
                        onChange={(e) => update({ amount: Number(e.target.value) || 0 })}
                        title="মোট পরিমান (টাকা)"
                      />
                    </>
                  ) : (
                    <>
                      <input
                        className="input w-28"
                        placeholder="ভাউচার নং"
                        value={row.voucherNo}
                        onChange={(e) => update({ voucherNo: e.target.value })}
                      />
                      <input
                        className="input flex-1"
                        placeholder="বিবরণ"
                        value={row.desc}
                        onChange={(e) => update({ desc: e.target.value })}
                      />
                      <input
                        type="number"
                        className="input w-32"
                        placeholder="টাকা"
                        value={row.amount || ""}
                        onChange={(e) => update({ amount: Number(e.target.value) || 0 })}
                      />
                    </>
                  )
                }
              />
            </Card>
          )}

          {config.sections.expenses ? (
            <Card
              title={
                slug === "abedon"
                  ? "ব্যয়ের বিবরণী (যেসব খাতে টাকা উত্তোলন করা হবে)"
                  : slug === "shikkha-sofor"
                  ? "ব্যয়ের হিসাব (শিক্ষা সফর পরিচালনা ব্যয়)"
                  : "অন্যান্য ব্যয় (খাতা, কলম, আপ্যায়ন)"
              }
              action={
                <div className="flex items-center gap-2">
                  {data.expenses.length > 0 && (
                    <button
                      className="btn-danger text-xs"
                      onClick={() => {
                        if (window.confirm("সব খরচের খাত মুছে ফেলতে চান?")) {
                          patch({ expenses: [] });
                          notifyFeedback.info("খরচের হিসাব রিসেট হয়েছে", "সব খরচের খাত মুছে ফেলা হয়েছে।");
                        }
                      }}
                      title="সব খরচের খাত মুছুন"
                    >
                      সব মুছুন
                    </button>
                  )}
                  <a
                    href="/studio"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="btn-ghost text-xs text-primary font-medium hover:bg-primary/10 border border-primary/20 flex items-center gap-1.5"
                    title="দোকানের ক্যাশ মেমো ও বিল তৈরির স্টুডিও নতুন ট্যাবে খুলুন"
                  >
                    <span>🏪</span>
                    <span>ক্যাশ মেমো স্টুডিও</span>
                  </a>
                  <button
                    className="btn-ghost"
                    onClick={() =>
                      patch({
                        expenses: [
                          ...data.expenses,
                          {
                            id: uid(),
                            voucherNo: toBn(data.expenses.length + 1),
                            productName: "",
                            desc: "",
                            amount: 0,
                            vatRate: 0,
                            taxRate: 0,
                          },
                        ],
                      })
                    }
                  >
                    + খাত যোগ
                  </button>
                </div>
              }
            >
              <datalist id="sheet-products-list">
                {db.products.map((p, idx) => (
                  <option key={idx} value={p.name} />
                ))}
              </datalist>
              <RowList
                rows={data.expenses}
                onRemove={(id) => patch({ expenses: data.expenses.filter((r) => r.id !== id) })}
                onUpdate={(id, p) =>
                  patch({ expenses: data.expenses.map((r) => (r.id === id ? { ...r, ...p } : r)) })
                }
                render={(row, update) => (
                  <>
                    <input
                      className="input w-28"
                      placeholder="ভাউচার নং"
                      value={row.voucherNo}
                      onChange={(e) => update({ voucherNo: e.target.value })}
                    />
                    <input
                      list="sheet-products-list"
                      className="input flex-1"
                      placeholder="পণ্য/খাত"
                      value={row.productName || row.desc || ""}
                      onChange={(e) => {
                        const val = e.target.value;
                        const p = db.products.find((x) => x.name === val);
                        if (p) {
                          update({
                            productName: val,
                            desc: val,
                            vatRate: p.vat,
                            taxRate: p.tax,
                          });
                        } else {
                          update({ productName: val, desc: val });
                        }
                      }}
                    />
                    <input
                      type="number"
                      className="input w-24"
                      placeholder="টাকা"
                      value={row.amount || ""}
                      onChange={(e) => update({ amount: Number(e.target.value) || 0 })}
                    />
                    <input
                      type="number"
                      className="input w-16"
                      placeholder="ভ্যাট %"
                      value={row.vatRate * 100 || ""}
                      onChange={(e) => update({ vatRate: (Number(e.target.value) || 0) / 100 })}
                    />
                    <input
                      type="number"
                      className="input w-16"
                      placeholder="ট্যাক্স %"
                      value={row.taxRate * 100 || ""}
                      onChange={(e) => update({ taxRate: (Number(e.target.value) || 0) / 100 })}
                    />
                  </>
                )}
              />
            </Card>
          ) : null}

          {config.sections.qs ? (
            <Card
              title="প্রশ্নপত্র প্রণয়ন ও উত্তরপত্র মূল্যায়ন বিল"
              action={
                <button
                  className="btn-ghost"
                  onClick={() =>
                    patch({
                      qs: [
                        ...data.qs,
                        { id: uid(), name: "", designation: "প্রভাষক", questions: 0, scripts: 0 },
                      ],
                    })
                  }
                >
                  + শিক্ষক যোগ
                </button>
              }
            >
              <div className="mb-4 grid gap-4 sm:grid-cols-2">
                <Field label="প্রতি প্রশ্নপত্রের হার">
                  <input
                    type="number"
                    className="input"
                    value={data.questionRate || ""}
                    onChange={(e) => patch({ questionRate: Number(e.target.value) || 0 })}
                  />
                </Field>
                <Field label="প্রতি উত্তরপত্রের হার">
                  <input
                    type="number"
                    className="input"
                    value={data.scriptRate || ""}
                    onChange={(e) => patch({ scriptRate: Number(e.target.value) || 0 })}
                  />
                </Field>
              </div>

              <RowList
                rows={data.qs}
                onRemove={(id) => patch({ qs: data.qs.filter((r) => r.id !== id) })}
                onUpdate={(id, p) =>
                  patch({ qs: data.qs.map((r) => (r.id === id ? { ...r, ...p } : r)) })
                }
                render={(row: QsRow, update) => (
                  <>
                    <input
                      list="sheet-teachers-list"
                      className="input flex-1"
                      placeholder="কর্মকর্তার নাম"
                      value={row.name}
                      onChange={(e) => {
                        const val = e.target.value;
                        const t = db.teachers.find((x) => x.name === val);
                        if (t) {
                          update({ name: val, designation: t.designation });
                        } else {
                          update({ name: val });
                        }
                      }}
                    />
                    <DesignationSelect
                      value={row.designation}
                      onChange={(v) => update({ designation: v })}
                    />
                    <input
                      type="number"
                      className="input w-24"
                      placeholder="প্রশ্ন"
                      value={row.questions || ""}
                      onChange={(e) => {
                        const q = Number(e.target.value) || 0;
                        update({ questions: q });
                      }}
                    />
                    <input
                      type="number"
                      className="input w-24"
                      placeholder="খাতা"
                      value={row.scripts || ""}
                      onChange={(e) => update({ scripts: Number(e.target.value) || 0 })}
                      title="খাতার সংখ্যা (পরিবর্তনযোগ্য)"
                    />
                  </>
                )}
              />
              <LiveDistribution rows={calc.qsRows} total={calc.qsTotal} />
            </Card>
          ) : null}

          {config.sections.adminDuty || config.sections.invigilatorDuty ? (
            <>
              {config.sections.adminDuty ? (
                <Card title={`কলেজ প্রশাসন ও কমিটি এবং অফিস — ৩৫% (${money(calc.pool35)}/-)`}>
                  <RowList
                    rows={data.admin}
                    onRemove={(id) => patch({ admin: data.admin.filter((r) => r.id !== id) })}
                    onUpdate={(id, p) =>
                      patch({ admin: data.admin.map((r) => (r.id === id ? { ...r, ...p } : r)) })
                    }
                    render={(row: AdminRow, update) => (
                      <>
                        <input
                          list="sheet-teachers-list"
                          className="input flex-1"
                          placeholder="কর্মকর্তার নাম"
                          value={row.name}
                          onChange={(e) => {
                            const val = e.target.value;
                            const t = db.teachers.find((x) => x.name === val);
                            if (t) {
                              const rate = rateFor(slug, t.designation, db);
                              update(
                                rate
                                  ? { name: val, designation: t.designation, percent: rate }
                                  : { name: val, designation: t.designation },
                              );
                            } else {
                              update({ name: val });
                            }
                          }}
                        />
                        <input
                          className="input w-44"
                          placeholder="পদবী"
                          value={row.designation}
                          onChange={(e) => {
                            const d = e.target.value;
                            const r = rateFor(slug, d, db);
                            update(r ? { designation: d, percent: r } : { designation: d });
                          }}
                        />
                        <input
                          type="number"
                          step="0.01"
                          className="input w-24"
                          placeholder="%"
                          value={row.percent || ""}
                          onChange={(e) => update({ percent: Number(e.target.value) || 0 })}
                        />
                      </>
                    )}
                  />
                  <button
                    className="btn-ghost mt-3"
                    onClick={() =>
                      patch({
                        admin: [
                          ...data.admin,
                          { id: uid(), name: "", designation: "সদস্য", percent: 12.25 },
                        ],
                      })
                    }
                  >
                    + সদস্য যোগ
                  </button>
                  <LiveDistribution rows={calc.adminRows} total={calc.pool35} />
                </Card>
              ) : null}

              {config.sections.invigilatorDuty ? (
                <Card
                  title={
                    config.sections.adminDuty
                      ? `কক্ষ প্রত্যবেক্ষক ও পিয়ন — ৬৩% (${money(calc.pool63)}/-)`
                      : `কক্ষ প্রত্যবেক্ষক ও পিয়ন — ১০০% (${money(calc.pool63)}/-)`
                  }
                  action={
                    <button
                      className="btn-ghost"
                      onClick={() =>
                        patch({
                          duty: [
                            ...data.duty,
                            {
                              id: uid(),
                              name: "",
                              designation: "প্রভাষক",
                              role: "teacher",
                              duties: 0,
                            },
                          ],
                        })
                      }
                    >
                      + সারি যোগ
                    </button>
                  }
                >
                  <RowList
                    rows={data.duty}
                    onRemove={(id) => patch({ duty: data.duty.filter((r) => r.id !== id) })}
                    onUpdate={(id, p) =>
                      patch({ duty: data.duty.map((r) => (r.id === id ? { ...r, ...p } : r)) })
                    }
                    render={(row: DutyRow, update) => (
                      <>
                        <input
                          list="sheet-teachers-list"
                          className="input flex-1"
                          placeholder="নাম"
                          value={row.name}
                          onChange={(e) => {
                            const val = e.target.value;
                            const t = db.teachers.find((x) => x.name === val);
                            if (t) {
                              const isStaff =
                                t.designation.includes("অপারেটর") ||
                                t.designation.includes("সহায়ক") ||
                                t.designation.includes("সহায়ক");
                              update({
                                name: val,
                                designation: t.designation,
                                role: isStaff ? "staff" : "teacher",
                              });
                            } else {
                              update({ name: val });
                            }
                          }}
                        />
                        <DesignationSelect
                          value={row.designation}
                          onChange={(v) => update({ designation: v })}
                        />
                        <select
                          className="input w-44"
                          value={row.role}
                          onChange={(e) => update({ role: e.target.value as DutyRow["role"] })}
                        >
                          <option value="teacher">শিক্ষক (পূর্ণ ডিউটি)</option>
                          <option value="staff">অপারেটর / অফিস সহায়ক (অর্ধেক)</option>
                        </select>
                        <input
                          type="number"
                          className="input w-24"
                          placeholder="ডিউটি"
                          value={row.duties || ""}
                          onChange={(e) => update({ duties: Number(e.target.value) || 0 })}
                        />
                      </>
                    )}
                  />
                  <p className="mt-3 text-sm text-muted-foreground">
                    প্রতি ডিউটির হার: <b className="text-foreground">{money(calc.unitRate)}/-</b>
                  </p>
                  <LiveDistribution rows={calc.dutyRows} total={calc.pool63} />
                </Card>
              ) : null}

              {config.sections.adminDuty ? (
                <Card title={`শিক্ষক পরিষদ — ২% (${money(calc.pool2)}/-)`}>
                  <div className="flex flex-wrap gap-3">
                    <input
                      list="sheet-teachers-list"
                      className="input flex-1"
                      placeholder="গ্রহীতার নাম"
                      value={data.councilName}
                      onChange={(e) => {
                        const val = e.target.value;
                        const t = db.teachers.find((x) => x.name === val);
                        if (t) {
                          patch({ councilName: val, councilDesignation: t.designation });
                        } else {
                          patch({ councilName: val });
                        }
                      }}
                    />
                    <input
                      className="input w-52"
                      placeholder="পদবী"
                      value={data.councilDesignation}
                      onChange={(e) => patch({ councilDesignation: e.target.value })}
                    />
                  </div>
                </Card>
              ) : null}
            </>
          ) : null}

          {config.sections.percentRows ? (
            <Card
              title="বন্টন — পদবীভিত্তিক শতকরা হার"
              action={
                <button
                  className="btn-ghost"
                  onClick={() =>
                    patch({
                      percentRows: [
                        ...data.percentRows,
                        {
                          id: uid(),
                          name: "",
                          designation: "সদস্য",
                          percent: rateFor(slug, "সদস্য", db),
                        },
                      ],
                    })
                  }
                >
                  + সারি যোগ
                </button>
              }
            >
              <p className="mb-3 text-xs text-muted-foreground">
                পদবী নির্বাচন করলে নির্ধারিত হার স্বয়ংক্রিয়ভাবে বসবে।
              </p>
              <RowList
                rows={data.percentRows}
                onRemove={(id) =>
                  patch({ percentRows: data.percentRows.filter((r) => r.id !== id) })
                }
                onUpdate={(id, p) =>
                  patch({
                    percentRows: data.percentRows.map((r) => (r.id === id ? { ...r, ...p } : r)),
                  })
                }
                render={(row: PercentRow, update) => (
                  <>
                    <input
                      list="sheet-teachers-list"
                      className="input flex-1"
                      placeholder="কর্মকর্তার নাম"
                      value={row.name}
                      onChange={(e) => {
                        const val = e.target.value;
                        const t = db.teachers.find((x) => x.name === val);
                        if (t) {
                          const rate = rateFor(slug, t.designation, db);
                          update(
                            rate
                              ? { name: val, designation: t.designation, percent: rate }
                              : { name: val, designation: t.designation },
                          );
                        } else {
                          update({ name: val });
                        }
                      }}
                    />
                    <DesignationSelect
                      value={row.designation}
                      onChange={(v) => {
                        const r = rateFor(slug, v, db);
                        update(r ? { designation: v, percent: r } : { designation: v });
                      }}
                    />
                    <input
                      type="number"
                      step="0.01"
                      className="input w-24"
                      placeholder="%"
                      value={row.percent || ""}
                      onChange={(e) => update({ percent: Number(e.target.value) || 0 })}
                    />
                  </>
                )}
              />
              <LiveDistribution rows={calc.percentRows} total={calc.distributable} />
            </Card>
          ) : null}

          {/* সরকারি কোষাগারে ই-চালান সংরক্ষণ ও ট্র্যাকিং (শুধুমাত্র ওয়েব এন্ট্রিতে থাকবে, প্রিন্ট ভাউচারে আসবে না) */}
          <VoucherChallanSection
            challans={data.challans}
            onChange={(challans) => patch({ challans })}
            vatTotal={calc.vatTotal}
            vatBreakdown={calc.vatBreakdown}
            tax5to9Total={calc.tax5to9Total}
            tax5to9Breakdown={calc.tax5to9Breakdown}
            tax10to20Total={calc.tax10to20Total}
            tax10to20Breakdown={calc.tax10to20Breakdown}
            voucherId={data.id}
            examName={fullExam}
            slug={slug}
            date={data.date}
          />

          <p className="pb-6 text-center text-xs text-muted-foreground">
            ভাউচার আইডি: <b className="font-mono">{data.id}</b> — এই আইডি দিয়ে পরে আবার খোলা যাবে।
          </p>
        </div>
      ) : null}

      {/* প্রিন্ট ভিউ */}
      <div
        className={
          tab === "print"
            ? "bg-muted py-8 print:bg-transparent print:py-0 block"
            : "hidden print:block print:bg-transparent print:py-0"
        }
      >
        <VoucherPrintDocument data={data} slug={slug} isVerification={false} />
      </div>
      {false ? (
        <div
          className={
            tab === "print"
              ? "bg-muted py-8 print:bg-transparent print:py-0 block"
              : "hidden print:block print:bg-transparent print:py-0"
          }
        >
        {/* Income & Expense (combined in 1 page) */}
        {!["babosthapona-fee", "bhorti-babosthapona-fee", "kendro-fee", "term-paper"].includes(
          config.slug,
        ) && (
          <PrintPage
            examName={fullExam}
            title="আয়-ব্যয়ের হিসাব বিবরণী :"
            voucherId={data.id}
            date={data.date}
            bothSignatures
            slug={slug}
            vatCode={data.challans?.vat?.fullCode}
            tax5Code={data.challans?.tax5?.fullCode}
            tax10Code={data.challans?.tax10?.fullCode}
          >
            <EarnTable rows={earnRows} />

            {config.sections.expenses ? (
              <>
                <CostTable
                  rows={[
                    ...(config.sections.adminDuty && calc.pool35 > 0
                      ? [
                          {
                            id: "admin-expense",
                            voucherNo: "",
                            productName: "কলেজ প্রশাসন ও কমিটি এবং অফিস",
                            desc: "কলেজ প্রশাসন ও কমিটি এবং অফিস",
                            amount: calc.pool35,
                            vatRate: 0,
                            taxRate: sum(calc.adminRows.map((r) => r.tax)) / calc.pool35,
                          },
                        ]
                      : []),
                    ...(config.sections.qs && calc.qsTotal > 0
                      ? [
                          {
                            id: "qs-expense",
                            voucherNo: "",
                            productName: "প্রশ্নপত্র প্রণয়ন ও উত্তরপত্র মূল্যায়ন বিল",
                            desc: "প্রশ্নপত্র প্রণয়ন ও উত্তরপত্র মূল্যায়ন",
                            amount: calc.qsTotal,
                            vatRate: 0,
                            taxRate: sum(calc.qsRows.map((r) => r.tax)) / calc.qsTotal,
                          },
                        ]
                      : []),
                    ...(config.sections.invigilatorDuty && calc.pool63 > 0
                      ? [
                          {
                            id: "duty-expense",
                            voucherNo: "",
                            productName: "কক্ষ প্রত্যবেক্ষক ও পিয়ন",
                            desc: "কক্ষ প্রত্যবেক্ষক ও পিয়ন",
                            amount: calc.pool63,
                            vatRate: 0,
                            taxRate: sum(calc.dutyRows.map((r) => r.tax)) / calc.pool63,
                          },
                        ]
                      : []),
                    ...(config.sections.adminDuty && calc.pool2 > 0
                      ? [
                          {
                            id: "council-expense",
                            voucherNo: "",
                            productName: data.councilName
                              ? `${data.councilName} (শিক্ষক পরিষদ)`
                              : "শিক্ষক পরিষদ",
                            desc: "শিক্ষক পরিষদ",
                            amount: calc.pool2,
                            vatRate: 0,
                            taxRate: calc.councilRow.tax / calc.pool2,
                          },
                        ]
                      : []),
                    ...data.expenses,
                  ]}
                />
                <div className="mt-8 flex justify-center text-sm font-semibold">
                  <table className="w-64">
                    <tbody>
                      <tr>
                        <td className="py-1">মোট আয়</td>
                        <td className="text-center">=</td>
                        <td className="text-right">{money(calc.income)}/-</td>
                      </tr>
                      <tr>
                        <td className="py-1 border-b border-foreground">মোট ব্যয়</td>
                        <td className="text-center border-b border-foreground">=</td>
                        <td className="text-right border-b border-foreground">
                          {money(
                            calc.expenseTotal +
                              (config.sections.qs ? calc.qsTotal : 0) +
                              (config.sections.adminDuty ? calc.pool35 : 0) +
                              (config.sections.invigilatorDuty ? calc.pool63 : 0) +
                              (config.sections.adminDuty ? calc.pool2 : 0),
                          )}
                          /-
                        </td>
                      </tr>
                      <tr>
                        <td className="py-1 text-center font-bold">উদ্বৃত্ত</td>
                        <td className="text-center font-bold">=</td>
                        <td className="text-right font-bold">
                          {(() => {
                            const finalExpense =
                              calc.expenseTotal +
                              (config.sections.qs ? calc.qsTotal : 0) +
                              (config.sections.adminDuty ? calc.pool35 : 0) +
                              (config.sections.invigilatorDuty ? calc.pool63 : 0) +
                              (config.sections.adminDuty ? calc.pool2 : 0);
                            const surplus = calc.income - finalExpense;
                            return surplus > 0.5 ? `${money(surplus)}/-` : "নাই";
                          })()}
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </>
            ) : null}
          </PrintPage>
        )}

        {config.sections.adminDuty && !["bebaharik", "mowkhik"].includes(config.slug) ? (
          <PrintPage
            hideDeptHeadSignature={config.slug === "nirbachoni" || config.slug === "incourse"}
            examName={fullExam}
            title="কলেজ প্রশাসন ও কমিটি এবং অফিস"
            voucherId={data.id}
            date={data.date}
            slug={slug}
            vatCode={data.challans?.vat?.fullCode}
            tax5Code={data.challans?.tax5?.fullCode}
            tax10Code={data.challans?.tax10?.fullCode}
          >
            <PayTable rows={calc.adminRows} />
          </PrintPage>
        ) : null}

        {config.sections.qs && !["bebaharik", "mowkhik"].includes(config.slug) ? (
          <PrintPage
            hideDeptHeadSignature={config.slug === "nirbachoni" || config.slug === "incourse"}
            examName={fullExam}
            title="প্রশ্নপত্র প্রণয়ন এবং উত্তরপত্র মূল্যায়ণ"
            subtitle={`প্রশ্নপত্র ${money(data.questionRate)}/- , উত্তরপত্র ${money(data.scriptRate)}/-`}
            voucherId={data.id}
            date={data.date}
            slug={slug}
            vatCode={data.challans?.vat?.fullCode}
            tax5Code={data.challans?.tax5?.fullCode}
            tax10Code={data.challans?.tax10?.fullCode}
          >
            <PayTable rows={calc.qsRows} withQs />
          </PrintPage>
        ) : null}

        {config.sections.invigilatorDuty && !["bebaharik", "mowkhik"].includes(config.slug) ? (
          <PrintPage
            hideDeptHeadSignature={config.slug === "nirbachoni" || config.slug === "incourse"}
            examName={fullExam}
            title="কক্ষ প্রত্যবেক্ষক ও পিয়ন"
            voucherId={data.id}
            date={data.date}
            slug={slug}
            vatCode={data.challans?.vat?.fullCode}
            tax5Code={data.challans?.tax5?.fullCode}
            tax10Code={data.challans?.tax10?.fullCode}
          >
            <PayTable rows={calc.dutyRows} />
          </PrintPage>
        ) : null}

        {config.sections.percentRows && !["bebaharik", "mowkhik"].includes(config.slug) ? (
          <PrintPage
            hideDeptHeadSignature={config.slug === "nirbachoni" || config.slug === "incourse"}
            examName={
              ["babosthapona-fee", "term-paper", "kendro-fee"].includes(config.slug)
                ? fullExam.replace(/ব্যবস্থাপনা ফী|টার্ম পেপার|কেন্দ্র ফী/g, "পরীক্ষা")
                : config.slug === "bhorti-babosthapona-fee"
                  ? fullExam.replace(/ভর্তি ব্যবস্থাপনা ফী/g, "ভর্তি")
                  : fullExam
            }
            title={
              ["babosthapona-fee", "bhorti-babosthapona-fee", "kendro-fee", "term-paper"].includes(
                config.slug,
              )
                ? `${config.name} আয় ব্যয়ের হিসাব বিবরণী`
                : `${config.name} — বন্টন`
            }
            subtitle={
              ["babosthapona-fee", "bhorti-babosthapona-fee", "kendro-fee", "term-paper"].includes(
                config.slug,
              )
                ? `আয় : ${
                    ["babosthapona-fee", "term-paper", "kendro-fee"].includes(config.slug)
                      ? fullExam.replace(/ব্যবস্থাপনা ফী|টার্ম পেপার|কেন্দ্র ফী/g, "পরীক্ষা")
                      : config.slug === "bhorti-babosthapona-fee"
                        ? fullExam.replace(/ভর্তি ব্যবস্থাপনা ফী/g, "ভর্তি")
                        : fullExam
                  } এর ভূগোল বিষয়ের ${toBn(data.studentCount)} জন পরীক্ষার্থীর ${toBn(data.perStudent)} হারে ${config.name.replace("ফী", "ফি")} বাবদ আয় (${toBn(data.studentCount)}×${toBn(data.perStudent)}) = ${toBn(calc.distributable)}/-`
                : undefined
            }
            voucherId={data.id}
            date={data.date}
            bothSignatures={true}
            slug={slug}
            vatCode={data.challans?.vat?.fullCode}
            tax5Code={data.challans?.tax5?.fullCode}
            tax10Code={data.challans?.tax10?.fullCode}
          >
            <PayTable rows={calc.percentRows} isBonton />

            {["babosthapona-fee", "bhorti-babosthapona-fee", "kendro-fee", "term-paper"].includes(
              config.slug,
            ) && (
              <div className="mt-8 flex justify-center text-sm font-semibold">
                <table className="w-64 border-collapse">
                  <tbody>
                    <tr>
                      <td className="py-1 text-left">মোট আয়</td>
                      <td className="text-center w-8">=</td>
                      <td className="text-right num">{money(calc.income)}/-</td>
                    </tr>
                    <tr>
                      <td className="py-1 text-left border-b border-foreground">মোট ব্যয় / বন্টন</td>
                      <td className="text-center border-b border-foreground w-8">=</td>
                      <td className="text-right border-b border-foreground num">
                        {money(calc.distributable + calc.expenseTotal)}/-
                      </td>
                    </tr>
                    <tr>
                      <td className="py-1 text-left font-bold">উদ্বৃত্ত / অবশিষ্ট</td>
                      <td className="text-center font-bold w-8">=</td>
                      <td className="text-right font-bold num">
                        {calc.income - (calc.distributable + calc.expenseTotal) > 0.5
                          ? `${money(calc.income - (calc.distributable + calc.expenseTotal))}/-`
                          : "নাই"}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            )}
          </PrintPage>
        ) : null}
      </div>
      ) : null}
    </main>
  );
}

/* ---------------------------------------------------------------------------
 * ১৪. ছোট UI কম্পোনেন্ট
 * ------------------------------------------------------------------------ */

function LiveDistribution({ rows, total }: { rows: SettledRow[]; total: number }) {
  if (rows.length === 0) return null;
  return (
    <div className="mt-4 overflow-x-auto rounded border border-border">
      <table className="w-full text-sm">
        <thead className="bg-secondary text-xs text-muted-foreground">
          <tr>
            <th className="px-3 py-2 text-center">নাম ও পদবী</th>
            <th className="px-3 py-2 text-center">পরিমান</th>
            <th className="px-3 py-2 text-center">কর</th>
            <th className="px-3 py-2 text-center">স্ট্যাম্প</th>
            <th className="px-3 py-2 text-center">নীট</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} className="border-t border-border">
              <td className="px-3 py-1.5">
                {r.name ? (
                  <>
                    <span className="font-semibold">{r.name}</span>
                    <br />
                    <span className="text-xs text-muted-foreground">{r.designation}</span>
                  </>
                ) : (
                  r.designation
                )}
              </td>
              <td className="px-3 py-1.5 text-right">{money(r.amount)}</td>
              <td className="px-3 py-1.5 text-right">{money(r.tax)}</td>
              <td className="px-3 py-1.5 text-right">{money(r.stamp)}</td>
              <td className="px-3 py-1.5 text-right font-semibold">{money(r.net)}</td>
            </tr>
          ))}
        </tbody>
        <tfoot className="bg-secondary">
          <tr>
            <td className="px-3 py-2 text-right font-semibold">
              বরাদ্দ {money(total)}/- — সর্বমোট
            </td>
            <td className="px-3 py-2 text-right font-semibold">
              {money(sum(rows.map((r) => r.amount)))}
            </td>
            <td className="px-3 py-2 text-right">{money(sum(rows.map((r) => r.tax)))}</td>
            <td className="px-3 py-2 text-right">{money(sum(rows.map((r) => r.stamp)))}</td>
            <td className="px-3 py-2 text-right font-semibold">
              {money(sum(rows.map((r) => r.net)))}
            </td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

function DesignationSelect({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <>
      <datalist id="designations-datalist">
        {DESIGNATIONS.map((d) => (
          <option key={d} value={d} />
        ))}
      </datalist>
      <input
        list="designations-datalist"
        className="input w-48"
        placeholder="পদবী"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </>
  );
}

function TabBtn({
  active,
  onClick,
  title,
  children,
}: {
  active: boolean;
  onClick: () => void;
  title?: string;
  children: ReactNode;
}) {
  return (
    <button className={active ? "btn-primary" : "btn-ghost"} onClick={onClick} title={title}>
      {children}
    </button>
  );
}

function Card({
  title,
  action,
  children,
}: {
  title: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="rounded-lg border border-border bg-card p-5">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-semibold text-card-foreground">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs text-muted-foreground">{label}</span>
      {children}
    </label>
  );
}

function RowList<T extends { id: string }>({
  rows,
  render,
  onUpdate,
  onRemove,
}: {
  rows: T[];
  render: (row: T, update: (p: Partial<T>) => void) => ReactNode;
  onUpdate: (id: string, p: Partial<T>) => void;
  onRemove: (id: string) => void;
}) {
  if (rows.length === 0) return <p className="text-sm text-muted-foreground">কোনো সারি নেই।</p>;
  return (
    <div className="space-y-2">
      {rows.map((row) => (
        <div key={row.id} className="flex flex-wrap items-center gap-2">
          {render(row, (p) => onUpdate(row.id, p))}
          <button className="btn-danger" onClick={() => onRemove(row.id)}>
            মুছুন
          </button>
        </div>
      ))}
    </div>
  );
}
