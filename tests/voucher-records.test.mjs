import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";
import { purgeVoucherCaches } from "../src/lib/voucher-cache.ts";
import { parseSavedVouchersResponse, VoucherListRequests } from "../src/lib/voucher-list.ts";
import { voucherIdsMatch } from "../src/lib/voucher-verification.ts";

class MemoryStorage {
  values = new Map();
  get length() {
    return this.values.size;
  }
  key(index) {
    return [...this.values.keys()][index] ?? null;
  }
  getItem(key) {
    return this.values.get(key) ?? null;
  }
  setItem(key, value) {
    this.values.set(key, String(value));
  }
  removeItem(key) {
    this.values.delete(key);
  }
}

const indexSource = readFileSync(new URL("../src/routes/index.tsx", import.meta.url), "utf8");
const indexAst = ts.createSourceFile(
  "index.tsx",
  indexSource,
  ts.ScriptTarget.Latest,
  true,
  ts.ScriptKind.TSX,
);
const savedList = indexAst.statements.find(
  (statement) =>
    ts.isFunctionDeclaration(statement) && statement.name?.text === "SavedVouchersList",
);
const variableText = (name) => {
  const statement = savedList.body.statements.find(
    (node) =>
      ts.isVariableStatement(node) &&
      node.declarationList.declarations.some((decl) => decl.name.getText(indexAst) === name),
  );
  assert.ok(statement, `the actual list component must still define ${name}`);
  return statement.getText(indexAst);
};
const callbackCode = ts.transpileModule(
  `${variableText("fetchVouchers")}
   ${variableText("handleDeleteVoucher")}
   globalThis.callbacks = { fetchVouchers, handleDeleteVoucher };`,
  { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } },
).outputText;

function listHarness({ response = { success: true, vouchers: [] }, config = true } = {}) {
  const initial = parseSavedVouchersResponse(
    JSON.stringify({ success: true, vouchers: [{ id: "ABC-123", income: 100 }] }),
  );
  const events = [];
  const state = { vouchers: initial, loading: false, loadError: null, deletingId: null };
  const gate = new VoucherListRequests();
  const sandbox = {
    useCallback: (callback) => callback,
    listRequests: { current: gate },
    setLoading: (value) => {
      state.loading = value;
    },
    setLoadError: (value) => {
      state.loadError = value;
    },
    setDeletingId: (value) => {
      state.deletingId = value;
    },
    setVouchers: (value) => {
      state.vouchers = typeof value === "function" ? value(state.vouchers) : value;
    },
    getSheetId: () => (config ? "sheet" : ""),
    getScriptUrl: () => (config ? "https://example.invalid/script" : ""),
    getVouchersFromServer: async () => {
      if (response instanceof Error) throw response;
      return { text: typeof response === "string" ? response : JSON.stringify(response) };
    },
    deleteVoucherFromServer: async () => ({ text: JSON.stringify({ success: true }) }),
    purgeCachedVoucher: (id) => events.push(["purge", id]),
    voucherIdsMatch,
    parseSavedVouchersResponse,
    toBnDigits: String,
    window: { confirm: () => true },
    notifyFeedback: Object.fromEntries(
      ["loading", "success", "error", "delete", "dismiss"].map((name) => [
        name,
        (...args) => events.push([name, ...args]),
      ]),
    ),
  };
  vm.runInNewContext(callbackCode, sandbox);
  return { ...sandbox.callbacks, sandbox, events, state, initial, gate };
}

test("cache deletion removes exact ID case variants from every backend and keeps other vouchers", () => {
  const memory = new Map([
    ["ABC-123", {}],
    ["abc-123", {}],
    ["AbC-123", {}],
    ["OTHER-123", {}],
    ["123", {}],
  ]);
  const session = new MemoryStorage();
  const local = new MemoryStorage();
  for (const storage of [session, local]) {
    for (const id of ["ABC-123", "abc-123", "AbC-123", "OTHER-123", "123"]) {
      storage.setItem(`kgc-temp-voucher:${id}`, "{}");
      storage.setItem(`kgc-geo-voucher:${id}`, "{}");
    }
    storage.setItem("kgc-geo-last:nirbachoni", "abc-123");
    storage.setItem("kgc-geo-last:incourse", JSON.stringify("OTHER-123"));
    storage.setItem(
      "kgc-geo-voucher-index",
      JSON.stringify([{ id: "AbC-123" }, { id: "OTHER-123" }]),
    );
  }
  purgeVoucherCaches(" abc-123 ", memory, [session, local]);
  assert.deepEqual([...memory.keys()], ["OTHER-123", "123"]);
  for (const storage of [session, local]) {
    assert.equal(storage.getItem("kgc-temp-voucher:ABC-123"), null);
    assert.equal(storage.getItem("kgc-temp-voucher:AbC-123"), null);
    assert.equal(storage.getItem("kgc-geo-voucher:abc-123"), null);
    assert.equal(storage.getItem("kgc-geo-last:nirbachoni"), null);
    assert.ok(storage.getItem("kgc-geo-last:incourse"));
    assert.ok(storage.getItem("kgc-temp-voucher:123"));
    assert.ok(storage.getItem("kgc-temp-voucher:OTHER-123"));
    assert.deepEqual(JSON.parse(storage.getItem("kgc-geo-voucher-index")), [{ id: "OTHER-123" }]);
  }
});

test("one blocked storage backend cannot stop clearing the remaining cache", () => {
  const blocked = {
    get length() {
      throw new Error("blocked");
    },
  };
  const local = new MemoryStorage();
  local.setItem("kgc-temp-voucher:abc-123", "{}");
  purgeVoucherCaches("ABC-123", new Map(), [blocked, local]);
  assert.equal(local.length, 0);
});

test("the actual cache wrapper makes deleted vouchers unavailable to loadDraft", () => {
  const source = readFileSync(new URL("../src/routes/voucher.$slug.tsx", import.meta.url), "utf8");
  const ast = ts.createSourceFile(
    "voucher.tsx",
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );
  const functions = ["storeTempVoucher", "loadDraft", "purgeCachedVoucher"].map((name) => {
    const declaration = ast.statements.find(
      (node) => ts.isFunctionDeclaration(node) && node.name?.text === name,
    );
    assert.ok(declaration);
    return declaration.getText(ast);
  });
  const code = ts.transpileModule(`const inMemoryVouchers = new Map();\n${functions.join("\n")}`, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const sandbox = {
    exports: {},
    sessionStorage: new MemoryStorage(),
    localStorage: new MemoryStorage(),
    purgeVoucherCaches,
  };
  vm.runInNewContext(code, sandbox);
  const { storeTempVoucher, loadDraft, purgeCachedVoucher } = sandbox.exports;
  storeTempVoucher("AbC-123", { id: "AbC-123" });
  storeTempVoucher("OTHER-123", { id: "OTHER-123" });
  assert.equal(loadDraft("ABC-123").id, "AbC-123");
  purgeCachedVoucher("abc-123");
  assert.equal(loadDraft("ABC-123"), null);
  assert.equal(loadDraft("AbC-123"), null);
  assert.equal(loadDraft("OTHER-123").id, "OTHER-123");
});

test("invalid list responses are errors and a confirmed empty array is valid", () => {
  for (const response of [
    "<html>error</html>",
    "bad json",
    "null",
    "{}",
    '{"success":false,"vouchers":[]}',
    '{"success":true}',
    '{"success":true,"vouchers":{}}',
    '{"success":true,"vouchers":[null]}',
  ]) {
    assert.throws(() => parseSavedVouchersResponse(response));
  }
  assert.deepEqual(parseSavedVouchersResponse('{"success":true,"vouchers":[]}'), []);
});

test("actual refresh preserves previous rows and never reports success on errors", async () => {
  for (const response of [
    "<html>error</html>",
    "bad json",
    { success: false, vouchers: [] },
    { success: true },
    new Error("offline"),
  ]) {
    const harness = listHarness({ response });
    await harness.fetchVouchers(true);
    assert.equal(harness.state.vouchers, harness.initial);
    assert.equal(harness.state.loading, false);
    assert.ok(harness.state.loadError);
    assert.equal(harness.events.filter(([event]) => event === "success").length, 0);
    assert.equal(harness.events.filter(([event]) => event === "error").length, 1);
  }
  const missingConfig = listHarness({ config: false });
  await missingConfig.fetchVouchers(true);
  assert.equal(missingConfig.state.vouchers, missingConfig.initial);
  assert.ok(missingConfig.state.loadError);
  assert.equal(
    missingConfig.events.some(([event]) => event === "success"),
    false,
  );
});

test("actual successful empty refresh clears prior rows and reports success once", async () => {
  const harness = listHarness();
  await harness.fetchVouchers(true);
  assert.equal(harness.state.vouchers.length, 0);
  assert.equal(harness.state.loadError, null);
  assert.equal(harness.events.filter(([event]) => event === "success").length, 1);
});

test("successful remote deletion purges caches; failed deletion leaves list and caches intact", async () => {
  const success = listHarness();
  await success.handleDeleteVoucher("abc-123", "Test");
  assert.equal(success.state.vouchers.length, 0);
  assert.equal(success.events.filter(([event]) => event === "purge").length, 1);
  for (const result of [
    { success: false, error: "denied" },
    "invalid json",
    "<html>denied</html>",
  ]) {
    const failed = listHarness();
    failed.sandbox.deleteVoucherFromServer = async () => ({
      text: typeof result === "string" ? result : JSON.stringify(result),
    });
    await failed.handleDeleteVoucher("ABC-123", "Test");
    assert.equal(failed.state.vouchers, failed.initial);
    assert.equal(
      failed.events.some(([event]) => event === "purge"),
      false,
    );
  }
});

test("a pending refresh cannot restore a voucher after confirmed deletion", async () => {
  const harness = listHarness();
  let resolveFetch;
  harness.sandbox.getVouchersFromServer = () =>
    new Promise((resolve) => {
      resolveFetch = resolve;
    });
  const pendingRefresh = harness.fetchVouchers(true);
  await harness.handleDeleteVoucher("ABC-123", "Test");
  resolveFetch({ text: JSON.stringify({ success: true, vouchers: [{ id: "ABC-123" }] }) });
  await pendingRefresh;
  assert.equal(harness.state.vouchers.length, 0);
  assert.equal(
    harness.events.some(([event]) => event === "success"),
    false,
  );
  harness.sandbox.getVouchersFromServer = async () => ({
    text: JSON.stringify({ success: true, vouchers: [{ id: "abc-123" }, { id: "OTHER-123" }] }),
  });
  await harness.fetchVouchers();
  assert.deepEqual(
    harness.state.vouchers.map((entry) => entry.voucherId),
    ["OTHER-123"],
  );
});

test("a late earlier request cannot replace a newer successful refresh", async () => {
  const harness = listHarness();
  let resolveEarlier;
  harness.sandbox.getVouchersFromServer = () =>
    new Promise((resolve) => {
      resolveEarlier = resolve;
    });
  const earlier = harness.fetchVouchers();
  harness.sandbox.getVouchersFromServer = async () => ({
    text: JSON.stringify({ success: true, vouchers: [{ id: "NEW-123" }] }),
  });
  await harness.fetchVouchers();
  resolveEarlier({ text: JSON.stringify({ success: true, vouchers: [{ id: "OLD-123" }] }) });
  await earlier;
  assert.deepEqual(
    harness.state.vouchers.map((entry) => entry.voucherId),
    ["NEW-123"],
  );
});
