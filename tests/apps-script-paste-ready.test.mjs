import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";
import { makePasteReadySource } from "../scripts/build-apps-script-paste-ready.mjs";

const source = await readFile(new URL("../GoogleAppsScript_Code.js", import.meta.url), "utf8");
const secret = "b".repeat(64);
const sheetId = "synthetic_spreadsheet_for_test_only";

function service(initial = {}) {
  const values = { ...initial };
  let writes = 0,
    opens = 0;
  const context = vm.createContext({
    PropertiesService: {
      getScriptProperties: () => ({
        getProperty: (key) => values[key] ?? null,
        setProperties: (properties, removeOthers) => {
          assert.equal(removeOthers, false);
          Object.assign(values, properties);
          writes++;
        },
      }),
    },
    SpreadsheetApp: {
      openById: (id) => {
        assert.equal(id, sheetId);
        opens++;
        return { getSheetByName: () => null };
      },
    },
    ContentService: {
      MimeType: { JSON: "application/json" },
      createTextOutput: (text) => ({
        text,
        setMimeType() {
          return this;
        },
      }),
    },
    Logger: {
      log: (text) => {
        assert.ok(!text.includes(secret));
        assert.ok(!text.includes(sheetId));
      },
    },
  });
  vm.runInContext(makePasteReadySource(source, { secret, sheetId }), context);
  return {
    values,
    check: () => context.testConnection(),
    get: () => JSON.parse(context.doGet().text),
    post: (payload) =>
      JSON.parse(context.doPost({ postData: { contents: JSON.stringify(payload) } }).text),
    counts: () => ({ writes, opens }),
  };
}

test("paste-ready code provisions missing or invalid properties on the first real request", () => {
  for (const initial of [
    {},
    { APP_SECRET: "broken", SPREADSHEET_ID: "bad", OTHER_SETTING: "keep" },
  ]) {
    const api = service(initial);
    assert.deepEqual(api.post({ action: "getVouchers", secret, id: sheetId }), {
      success: true,
      vouchers: [],
    });
    assert.equal(api.values.APP_SECRET, secret);
    assert.equal(api.values.SPREADSHEET_ID, sheetId);
    assert.deepEqual(api.counts(), { writes: 1, opens: 1 });
    api.post({ action: "getVouchers", secret, id: sheetId });
    assert.deepEqual(api.counts(), { writes: 1, opens: 2 });
    if (initial.OTHER_SETTING) assert.equal(api.values.OTHER_SETTING, initial.OTHER_SETTING);
  }
});

test("generated initialization never exposes settings or bypasses API authentication", () => {
  const api = service();
  assert.equal(api.get().success, false);
  assert.deepEqual(api.counts(), { writes: 0, opens: 0 });
  const denied = api.post({ action: "getVouchers", secret: "wrong" });
  assert.equal(denied.success, false);
  assert.ok(!JSON.stringify(denied).includes(secret));
  assert.deepEqual(api.counts(), { writes: 1, opens: 0 });
  assert.equal(api.check().code, "CONNECTION_OK");
  assert.equal(api.counts().writes, 1);
});

test("a deliberate later property rotation is preserved instead of restoring the embedded credential", () => {
  const api = service();
  api.check();
  const rotated = "c".repeat(64);
  api.values.APP_SECRET = rotated;
  assert.equal(api.post({ action: "getVouchers", secret }).success, false);
  assert.equal(api.post({ action: "getVouchers", secret: rotated }).success, true);
  assert.equal(api.values.APP_SECRET, rotated);
  assert.equal(api.counts().writes, 1);
});

test("invalid configuration and unexpected source fail before producing a deployable file", () => {
  assert.throws(() => makePasteReadySource(source, { secret: "", sheetId }));
  assert.throws(() => makePasteReadySource(source, { secret, sheetId: "full url or invalid" }));
  assert.throws(() => makePasteReadySource("function doPost(e) {}", { secret, sheetId }));
  const code = makePasteReadySource(source, { secret, sheetId });
  assert.equal((code.match(/PropertiesService\.getScriptProperties\(\)/g) || []).length, 1);
  assert.match(code, /function doPost\(e\)/);
  assert.match(code, /function testConnection\(\)/);
});
