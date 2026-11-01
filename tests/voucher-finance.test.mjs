import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";
import {
  calculateVoucherFinancials,
  calculateVoucherTotals,
  nonNegativeNumber,
  questionScriptAmount,
  resolveEarningAmount,
} from "../src/lib/voucher-finance.ts";

const voucherSource = readFileSync(
  new URL("../src/routes/voucher.$slug.tsx", import.meta.url),
  "utf8",
);
const parsedVoucher = ts.createSourceFile(
  "voucher.tsx",
  voucherSource,
  ts.ScriptTarget.Latest,
  true,
  ts.ScriptKind.TSX,
);
const functionText = (name) => {
  const declaration = parsedVoucher.statements.find(
    (statement) => ts.isFunctionDeclaration(statement) && statement.name?.text === name,
  );
  assert.ok(declaration, `the route must still define ${name}`);
  return declaration.getText(parsedVoucher);
};

// Exercise the route's actual calculation function, without importing its UI,
// router or server modules into Node's test process.
const compiled = ts.transpileModule(
  `const TAX_RATE = 0.1;
   const STAMP_THRESHOLD = 400;
   const STAMP_AMOUNT = 10;
   ${functionText("settle")}
   const settleAll = (rows) => rows.map(settle);
   ${functionText("computeVoucher")}`,
  {
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.CommonJS,
    },
  },
).outputText;
const sandbox = {
  exports: {},
  calculateVoucherTotals,
  nonNegativeNumber,
  questionScriptAmount,
  normalizeSlug: (slug) => slug,
  sum: (items) => items.reduce((total, item) => total + item, 0),
};
vm.runInNewContext(compiled, sandbox);
const { computeVoucher } = sandbox.exports;

function voucher(patch = {}) {
  return {
    id: "TEST-123",
    studentCount: 1,
    perStudent: 100,
    earnings: [],
    expenses: [{ amount: 150, taxRate: 0.1, vatRate: 0 }],
    questionRate: 0,
    scriptRate: 0,
    qs: [],
    admin: [{ id: "admin", name: "Teacher", designation: "Teacher", percent: 100 }],
    duty: [{ id: "duty", name: "Teacher", designation: "Teacher", role: "teacher", duties: 1 }],
    percentRows: [{ id: "teacher", name: "Teacher", designation: "Teacher", percent: 100 }],
    councilName: "Council",
    councilDesignation: "Council",
    ...patch,
  };
}

test("count × rate is the canonical fallback for blank, zero or invalid income", () => {
  for (const amount of [undefined, null, "", 0, "0", NaN, -1]) {
    assert.equal(resolveEarningAmount({ amount, studentCount: 20, rate: 50 }), 1000);
  }
  assert.equal(resolveEarningAmount({ amount: 725, studentCount: 20, rate: 50 }), 725);
  assert.equal(resolveEarningAmount({ amount: "725", studentCount: 20, rate: 50 }), 725);
  assert.equal(resolveEarningAmount({ studentCount: -20, rate: -50 }), 0);
  assert.equal(resolveEarningAmount({ amount: Infinity }), 0);
});

test("income below expenses keeps the actual expense and distributes zero in every scheme", () => {
  for (const slug of [
    "nirbachoni",
    "incourse",
    "babosthapona-fee",
    "bhorti-babosthapona-fee",
    "kendro-fee",
    "term-paper",
    "bebaharik",
    "mowkhik",
  ]) {
    const data = voucher();
    const calc = computeVoucher(data, slug);
    assert.equal(calc.income, 100, slug);
    assert.equal(calc.expenseTotal, 150, slug);
    assert.equal(calc.totalExpense, 150, slug);
    assert.equal(calc.distributable, 0, slug);
    assert.equal(calc.pool35 + calc.pool63 + calc.pool2, 0, slug);
    for (const row of [...calc.adminRows, ...calc.dutyRows, ...calc.percentRows, calc.councilRow]) {
      assert.equal(row.amount, 0, slug);
      assert.equal(row.tax, 0, slug);
      assert.equal(row.net, 0, slug);
    }
    assert.deepEqual(calculateVoucherFinancials(data, slug), {
      income: 100,
      expense: 150,
      balance: 0,
    });
  }
});

test("question and script commitments also floor the remaining honorarium at zero", () => {
  const data = voucher({
    expenses: [{ amount: 20, taxRate: 0, vatRate: 0 }],
    qs: [{ id: "qs", name: "Teacher", designation: "Teacher", questions: 2, scripts: 10 }],
    questionRate: 40,
    scriptRate: 5,
  });
  const calc = computeVoucher(data, "nirbachoni");
  assert.equal(calc.qsTotal, 180);
  assert.equal(calc.qsRows[0].amount, 180);
  assert.equal(calc.distributable, 0);
  assert.equal(calc.totalExpense, 200);
  assert.deepEqual(calculateVoucherFinancials(data, "nirbachoni"), {
    income: 100,
    expense: 200,
    balance: 0,
  });
});

test("entry calculation and dashboard use the same fallback income and distribution", () => {
  const data = voucher({
    studentCount: 0,
    earnings: [{ amount: 0, studentCount: 20, rate: 50 }],
    expenses: [{ amount: 200, taxRate: 0, vatRate: 0 }],
  });
  const calc = computeVoucher(data, "nirbachoni");
  assert.equal(calc.totalIncome, 1000);
  assert.equal(calc.distributable, 800);
  assert.equal(calc.pool35, 280);
  assert.equal(calc.pool63, 504);
  assert.equal(calc.pool2, 16);
  assert.equal(calc.totalExpense, 1000);
  assert.deepEqual(calculateVoucherFinancials(data, "nirbachoni"), {
    income: calc.totalIncome,
    expense: calc.totalExpense,
    balance: calc.surplus,
  });
  assert.match(voucherSource, /income:\s*calc\.totalIncome,/);
  assert.doesNotMatch(voucherSource, /calc\.studentIncome\s*\+\s*sum\(data\.earnings/);
});

test("tour income ignores the primary student fee and uses detailed earnings", () => {
  const data = voucher({
    studentCount: 100,
    perStudent: 500,
    earnings: [{ amount: 0, studentCount: 20, rate: 50 }],
  });
  const calc = computeVoucher(data, "shikkha-sofor");
  assert.equal(calc.studentIncome, 0);
  assert.equal(calc.totalIncome, 1000);
  assert.equal(calculateVoucherFinancials(data, "shikkha-sofor").income, 1000);
});

test("application and legacy summary records retain their accounting rules", () => {
  assert.deepEqual(calculateVoucherFinancials(voucher(), "abedon"), {
    income: 0,
    expense: 150,
    balance: 0,
  });
  assert.deepEqual(calculateVoucherFinancials(null, undefined, 100, 150), {
    income: 100,
    expense: 150,
    balance: 0,
  });
  assert.deepEqual(calculateVoucherFinancials(null), { income: 0, expense: 0, balance: 0 });
});

test("negative weights and invalid values cannot generate negative honorarium", () => {
  const data = voucher({
    perStudent: 1000,
    expenses: [],
    admin: [{ id: "admin", name: "Teacher", designation: "Teacher", percent: -100 }],
    duty: [{ id: "duty", name: "Teacher", designation: "Teacher", role: "teacher", duties: -1 }],
    percentRows: [{ id: "teacher", name: "Teacher", designation: "Teacher", percent: -100 }],
  });
  const calc = computeVoucher(data, "nirbachoni");
  assert.equal(calc.adminRows[0].amount, 0);
  assert.equal(calc.dutyRows[0].amount, 0);
  assert.equal(calc.percentRows[0].amount, 0);
  assert.equal(questionScriptAmount({ questions: -1, scripts: -10 }, 400, 10), 0);
  assert.equal(nonNegativeNumber(Infinity), 0);
  assert.equal(nonNegativeNumber("invalid"), 0);
});
