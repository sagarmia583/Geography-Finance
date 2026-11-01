export type EarningAmountInput = {
  amount?: unknown;
  studentCount?: unknown;
  rate?: unknown;
};

type QuestionScriptInput = {
  questions?: unknown;
  scripts?: unknown;
};

type VoucherFinancialInput = {
  slug?: unknown;
  studentCount?: unknown;
  perStudent?: unknown;
  earnings?: readonly EarningAmountInput[];
  expenses?: readonly { amount?: unknown }[];
  qs?: readonly QuestionScriptInput[];
  questionRate?: unknown;
  scriptRate?: unknown;
};

export type VoucherFinancials = {
  income: number;
  expense: number;
  balance: number;
};

export function nonNegativeNumber(value: unknown): number {
  const amount = Number(value);
  return Number.isFinite(amount) && amount > 0 ? amount : 0;
}

// A blank or zero amount uses the same count × rate fallback everywhere:
// entry, printed rows, distribution, dashboard and the saved summary.
export function resolveEarningAmount(row: EarningAmountInput): number {
  const explicitAmount = nonNegativeNumber(row.amount);
  return explicitAmount > 0
    ? explicitAmount
    : nonNegativeNumber(row.studentCount) * nonNegativeNumber(row.rate);
}

export function questionScriptAmount(
  row: QuestionScriptInput,
  questionRate: unknown,
  scriptRate: unknown,
): number {
  const questions = nonNegativeNumber(row.questions);
  return (
    questions * nonNegativeNumber(questionRate) +
    questions * nonNegativeNumber(row.scripts) * nonNegativeNumber(scriptRate)
  );
}

export function calculateVoucherTotals(state: VoucherFinancialInput, slug: string) {
  const isApplication = slug === "abedon";
  const studentIncome =
    slug === "shikkha-sofor"
      ? 0
      : nonNegativeNumber(state.studentCount) * nonNegativeNumber(state.perStudent);
  const income =
    studentIncome +
    (Array.isArray(state.earnings)
      ? state.earnings.reduce((total, row) => total + resolveEarningAmount(row), 0)
      : 0);
  const expenseTotal = Array.isArray(state.expenses)
    ? state.expenses.reduce((total, row) => total + nonNegativeNumber(row.amount), 0)
    : 0;
  const qsTotal = Array.isArray(state.qs)
    ? state.qs.reduce(
        (total, row) => total + questionScriptAmount(row, state.questionRate, state.scriptRate),
        0,
      )
    : 0;

  // Existing expenses remain visible even when they exceed income. Only the
  // amount available for further honorarium distribution is floored at zero.
  const distributable = Math.max(0, income - expenseTotal - qsTotal);
  const pool35 = slug === "nirbachoni" ? distributable * 0.35 : 0;
  const pool63 =
    slug === "incourse" ? distributable : slug === "nirbachoni" ? distributable * 0.63 : 0;
  const pool2 = slug === "nirbachoni" ? distributable * 0.02 : 0;

  let totalExpense = expenseTotal;
  if (!isApplication) {
    if (slug === "nirbachoni") {
      totalExpense += qsTotal + pool35 + pool63 + pool2;
    } else if (slug === "incourse") {
      totalExpense += qsTotal + pool63;
    } else if (
      ["babosthapona-fee", "bhorti-babosthapona-fee", "kendro-fee", "term-paper"].includes(slug)
    ) {
      totalExpense += distributable;
    }
  }

  return {
    studentIncome,
    income,
    totalIncome: isApplication ? 0 : income,
    expenseTotal,
    qsTotal,
    distributable,
    pool35,
    pool63,
    pool2,
    totalExpense,
    surplus: isApplication ? 0 : Math.max(0, income - totalExpense),
  };
}

export function calculateVoucherFinancials(
  state: unknown,
  fallbackSlug?: string,
  rawIncome?: number,
  rawExpenses?: number,
): VoucherFinancials {
  if (state && typeof state === "object" && !Array.isArray(state)) {
    const voucher = state as VoucherFinancialInput;
    const slug = typeof voucher.slug === "string" ? voucher.slug : fallbackSlug || "";
    const totals = calculateVoucherTotals(voucher, slug);
    return {
      income: Math.round(totals.totalIncome),
      expense: Math.round(totals.totalExpense),
      balance: Math.round(totals.surplus),
    };
  }

  const income = nonNegativeNumber(rawIncome);
  const expense = nonNegativeNumber(rawExpenses);
  return {
    income: Math.round(income),
    expense: Math.round(expense),
    balance: Math.max(0, Math.round(income - expense)),
  };
}
