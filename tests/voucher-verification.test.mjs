import assert from "node:assert/strict";
import test from "node:test";
import {
  currentVoucherVerification,
  normalizeVoucherId,
  validateVoucherVerification,
  verifiedVoucherSnapshot,
  verificationMessage,
  voucherIdsMatch,
} from "../src/lib/voucher-verification.ts";

const completeSnapshot = (id = "ABC-123") => ({
  id,
  examName: "পরীক্ষা",
  date: "2026-10-18",
  earnings: [],
  expenses: [],
  qs: [],
  admin: [],
  duty: [],
  percentRows: [],
});

test("voucher IDs accept only complete trimmed case-insensitive matches", () => {
  assert.equal(normalizeVoucherId("  abc-123 "), "ABC-123");
  assert.equal(voucherIdsMatch(" ABC-123 ", "abc-123"), true);
  for (const id of ["123", "ABC", "XABC-123", "ABC-1234", "", "  ", null, 123]) {
    assert.equal(voucherIdsMatch(id, "ABC-123"), false);
  }
  assert.equal(voucherIdsMatch("", ""), false);
});

test("an untrusted or mismatched server record never becomes verified", () => {
  for (const response of [null, {}, { success: true }, { status: "verified", voucher: null }]) {
    assert.deepEqual(validateVoucherVerification("ABC-123", response), {
      status: "unavailable",
      voucher: null,
    });
  }
  for (const id of ["123", "ABC-1234", "OTHER-123", ""]) {
    assert.deepEqual(
      validateVoucherVerification("ABC-123", { status: "verified", voucher: { id } }),
      { status: "not_found", voucher: null },
    );
  }
});

test("only an exact remote record is returned and legacy voucherId is supported", () => {
  const voucher = { voucherId: "abc-123", examTitle: "Remote record" };
  assert.deepEqual(validateVoucherVerification(" ABC-123 ", { status: "verified", voucher }), {
    status: "verified",
    voucher,
  });
});

test("remote failure and not-found remain distinct and cannot retain a voucher", () => {
  for (const status of ["not_found", "unavailable"]) {
    assert.deepEqual(
      validateVoucherVerification("ABC-123", { status, voucher: { id: "ABC-123" } }),
      { status, voucher: null },
    );
  }
});

test("changing the URL ID clears a prior verified record immediately", () => {
  const loaded = {
    requestedId: "ABC-123",
    status: "verified",
    voucher: { id: "ABC-123", fullState: completeSnapshot() },
  };
  assert.deepEqual(currentVoucherVerification("NEW-456", loaded), {
    status: "loading",
    voucher: null,
  });
  assert.deepEqual(currentVoucherVerification("", loaded), {
    status: "missing_id",
    voucher: null,
  });
  assert.equal(currentVoucherVerification(" abc-123 ", loaded).status, "verified");
});

test("the same-ID failure replaces the previously verified result", () => {
  for (const status of ["unavailable", "not_found", "loading"]) {
    assert.deepEqual(
      currentVoucherVerification("ABC-123", { requestedId: "ABC-123", status, voucher: null }),
      { status, voucher: null },
    );
  }
});

test("a complete saved remote snapshot is parsed without inventing rows", () => {
  const snapshot = completeSnapshot();
  assert.deepEqual(verifiedVoucherSnapshot({ id: "ABC-123", fullState: snapshot }), snapshot);
  assert.deepEqual(
    verifiedVoucherSnapshot({ id: "ABC-123", fullState: JSON.stringify(snapshot) }),
    snapshot,
  );
  assert.deepEqual(verifiedVoucherSnapshot({ id: "ABC-123", fullState: snapshot }).earnings, []);
});

test("summary-only, incomplete, malformed and other-ID snapshots cannot be official copies", () => {
  const missingArray = completeSnapshot();
  delete missingArray.admin;
  for (const fullState of [
    undefined,
    "{broken",
    [],
    null,
    { id: "ABC-123" },
    missingArray,
    { ...completeSnapshot(), earnings: [null] },
    completeSnapshot("OTHER-123"),
    completeSnapshot("123"),
  ]) {
    assert.equal(verifiedVoucherSnapshot({ id: "ABC-123", fullState }), null);
  }
  assert.equal(verifiedVoucherSnapshot(null), null);
});

test("failure, missing-ID and loading messages clearly differ from remote verification", () => {
  const statuses = ["not_found", "unavailable", "missing_id", "loading", "verified"];
  assert.equal(new Set(statuses.map((status) => verificationMessage(status).title)).size, 5);
  assert.match(verificationMessage("unavailable").detail, /যাচাইকৃত ধরা হচ্ছে না/);
  assert.match(verificationMessage("not_found").detail, /সম্পূর্ণ আইডি/);
  assert.match(verificationMessage("verified").detail, /সরকারি পোর্টালে আলাদাভাবে/);
});
