import assert from "node:assert/strict";
import test from "node:test";
import { moveExpenseRow } from "../src/lib/expense-order.ts";

function expenses() {
  return [
    { id: "salary", voucherNo: "১", desc: "সহকারীর বেতন", amount: 7000, vatRate: 0, taxRate: 0 },
    { id: "paper", voucherNo: "২", desc: "পত্রিকা", amount: 500, vatRate: 0, taxRate: 0 },
    {
      id: "stationery",
      voucherNo: "৩",
      desc: "স্টেশনারী",
      productName: "স্টেশনারী",
      amount: 1500,
      vatRate: 0.1,
      taxRate: 0.05,
    },
    { id: "copies", voucherNo: "৪", desc: "কাগজ", amount: 1100, vatRate: 0.1, taxRate: 0.05 },
  ];
}

const ids = (rows) => rows.map((row) => row.id);

test("moving a later expense upward moves its whole row and renumbers the resulting order", () => {
  const reordered = moveExpenseRow(expenses(), "copies", 1);
  assert.deepEqual(ids(reordered), ["salary", "copies", "paper", "stationery"]);
  assert.deepEqual(
    reordered.map((row) => row.voucherNo),
    ["১", "২", "৩", "৪"],
  );
  assert.deepEqual(reordered[1], {
    id: "copies",
    voucherNo: "২",
    desc: "কাগজ",
    amount: 1100,
    vatRate: 0.1,
    taxRate: 0.05,
  });
});

test("moving the first expense to the bottom keeps the intervening rows in order", () => {
  const reordered = moveExpenseRow(expenses(), "salary", 3);
  assert.deepEqual(ids(reordered), ["paper", "stationery", "copies", "salary"]);
  assert.deepEqual(
    reordered.map((row) => row.voucherNo),
    ["১", "২", "৩", "৪"],
  );
});

test("integer drop positions beyond the list clamp to its first or last row", () => {
  assert.deepEqual(ids(moveExpenseRow(expenses(), "copies", -20)), [
    "copies",
    "salary",
    "paper",
    "stationery",
  ]);
  assert.deepEqual(ids(moveExpenseRow(expenses(), "paper", 99)), [
    "salary",
    "stationery",
    "copies",
    "paper",
  ]);
});

test("invalid IDs, invalid positions and drops at the same position leave the original array intact", () => {
  const original = expenses();
  assert.equal(moveExpenseRow(original, "missing", 0), original);
  assert.equal(moveExpenseRow(original, "paper", 1), original);
  for (const target of [NaN, Infinity, -Infinity, 1.5, "2", undefined]) {
    assert.equal(moveExpenseRow(original, "salary", target), original);
  }
  const empty = [];
  assert.equal(moveExpenseRow(empty, "missing", 0), empty);
  const single = [original[0]];
  assert.equal(moveExpenseRow(single, "salary", 100), single);
});

test("a reorder is immutable and preserves every expense field and aggregate financial amount", () => {
  const original = expenses();
  const snapshot = structuredClone(original);
  original.forEach(Object.freeze);
  Object.freeze(original);
  const reordered = moveExpenseRow(original, "stationery", 0);
  assert.deepEqual(original, snapshot);
  assert.notEqual(reordered, original);
  for (const row of reordered) {
    const before = original.find((item) => item.id === row.id);
    assert.notEqual(row, before);
    const { voucherNo: _beforeNumber, ...beforeFields } = before;
    const { voucherNo: _afterNumber, ...afterFields } = row;
    assert.deepEqual(afterFields, beforeFields);
  }
  const totals = (rows) =>
    rows.reduce(
      (sum, row) => ({
        amount: sum.amount + row.amount,
        vat: sum.vat + row.amount * row.vatRate,
        tax: sum.tax + row.amount * row.taxRate,
      }),
      { amount: 0, vat: 0, tax: 0 },
    );
  assert.deepEqual(totals(reordered), totals(original));
});

test("saved and reloaded JSON retains the user's new row order and Bengali serial numbers", () => {
  const fullState = { expenses: moveExpenseRow(expenses(), "stationery", 0) };
  const reloaded = JSON.parse(JSON.stringify(fullState));
  assert.deepEqual(reloaded.expenses, fullState.expenses);
  assert.deepEqual(ids(reloaded.expenses), ["stationery", "salary", "paper", "copies"]);
});

test("serial numbers above nine use Bengali digits throughout", () => {
  const rows = Array.from({ length: 12 }, (_, index) => ({
    id: `expense-${index}`,
    voucherNo: String(index + 1),
  }));
  const reordered = moveExpenseRow(rows, "expense-0", 11);
  assert.deepEqual(
    reordered.slice(9).map((row) => row.voucherNo),
    ["১০", "১১", "১২"],
  );
});
