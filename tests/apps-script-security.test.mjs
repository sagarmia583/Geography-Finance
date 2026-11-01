import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";

const source = readFileSync(new URL("../GoogleAppsScript_Code.js", import.meta.url), "utf8");
const SECRET = "test-only-random-secret-32-characters-long";
const SHEET_ID = "configured_spreadsheet_identifier";
const BOOTSTRAP_VERSION = "a".repeat(64);
const PASSWORD_PROPERTY = `APP_LOGIN_PASSWORD_${BOOTSTRAP_VERSION}`;
const INITIAL_PASSWORD_HASH = `scrypt-v1:${"1".repeat(32)}:${"2".repeat(64)}`;
const NEXT_PASSWORD_HASH = `scrypt-v1:${"3".repeat(32)}:${"4".repeat(64)}`;
const ANOTHER_PASSWORD_HASH = `scrypt-v1:${"5".repeat(32)}:${"6".repeat(64)}`;

function api(initial = {}, properties = {}, options = {}) {
  const calls = {
    opens: [],
    locks: 0,
    releases: 0,
    writes: 0,
    logs: [],
    propertyReads: [],
    propertyWrites: [],
  };
  const sheets = new Map();
  function makeSheet(rows) {
    return {
      rows: structuredClone(rows),
      getDataRange() {
        return { getValues: () => structuredClone(this.rows) };
      },
      getLastColumn() {
        return Math.max(0, ...this.rows.map((row) => row.length));
      },
      appendRow(row) {
        calls.writes++;
        this.rows.push(structuredClone(row));
      },
      deleteRow(row) {
        calls.writes++;
        this.rows.splice(row - 1, 1);
      },
      getRange(row, column) {
        return {
          setValue: (value) => {
            calls.writes++;
            this.rows[row - 1] ||= [];
            this.rows[row - 1][column - 1] = value;
          },
          setValues: (values) => {
            calls.writes++;
            for (let r = 0; r < values.length; r++) {
              this.rows[row - 1 + r] ||= [];
              this.rows[row - 1 + r].splice(column - 1, values[r].length, ...values[r]);
            }
          },
        };
      },
    };
  }
  for (const [name, rows] of Object.entries(initial)) sheets.set(name, makeSheet(rows));
  const configured = { APP_SECRET: SECRET, SPREADSHEET_ID: SHEET_ID, ...properties };
  const context = vm.createContext({
    Logger: {
      log: (...values) => calls.logs.push(values.map(String).join(" ")),
    },
    PropertiesService: {
      getScriptProperties: () => ({
        getProperty: (key) => {
          calls.propertyReads.push(key);
          return configured[key] ?? null;
        },
        setProperty: (key, value) => {
          if (options.propertyWriteError) throw new Error(options.propertyWriteError);
          calls.propertyWrites.push([key, value]);
          configured[key] = value;
        },
      }),
    },
    SpreadsheetApp: {
      openById: (id) => {
        calls.opens.push(id);
        if (options.openError) throw new Error(options.openError);
        return {
          getSheetByName: (name) => sheets.get(name) || null,
          insertSheet: (name) => {
            const sheet = makeSheet([]);
            sheets.set(name, sheet);
            return sheet;
          },
        };
      },
    },
    LockService: {
      getScriptLock: () => {
        calls.locks++;
        return {
          tryLock: () => {
            options.onLock?.(configured);
            return options.lockAvailable !== false;
          },
          releaseLock: () => calls.releases++,
        };
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
  });
  vm.runInContext(source, context);
  return {
    calls,
    sheets,
    properties: configured,
    reload: () => vm.runInContext(source, context),
    post: (data) =>
      JSON.parse(
        context.doPost({ postData: { contents: JSON.stringify({ secret: SECRET, ...data }) } })
          .text,
      ),
    raw: (contents) => JSON.parse(context.doPost({ postData: { contents } }).text),
    get: (parameters) => JSON.parse(context.doGet({ parameter: parameters }).text),
    check: () => context.testConnection(),
  };
}

function passwordChange(overrides = {}) {
  return {
    action: "changePasswordHash",
    bootstrapVersion: BOOTSTRAP_VERSION,
    expectedHash: INITIAL_PASSWORD_HASH,
    nextHash: NEXT_PASSWORD_HASH,
    ...overrides,
  };
}

function voucher(id = "ABC-123") {
  return {
    action: "saveVoucher",
    voucherId: id,
    configName: "পরীক্ষা",
    examName: "Exam",
    date: "2026-10-18",
    income: 1000,
    expenses: 200,
    distributable: 800,
    fullState: JSON.stringify({ id, studentCount: 10 }),
    expenseVouchers: "১, ২",
    vatAmount: 10,
    tax5Amount: 5,
    tax10Amount: 10,
  };
}

function record(id) {
  return [
    id,
    "Exam",
    "Annual exam",
    "2026-10-18",
    1000,
    200,
    800,
    JSON.stringify({ id }),
    "১",
    "vat",
    "tax5",
    "tax10",
  ];
}

test("GET never opens a spreadsheet or discloses settings, even with a secret", () => {
  const service = api({ Settings: [["password", "DO-NOT-EXPOSE"]] });
  for (const parameters of [
    {},
    { id: SHEET_ID, range: "Settings!B1:B1" },
    { secret: SECRET, id: SHEET_ID, action: "getSettings" },
  ]) {
    assert.equal(service.get(parameters).success, false);
  }
  assert.equal(service.calls.opens.length, 0);
  assert.equal(service.calls.locks, 0);
});

test("bad or absent secrets are rejected before spreadsheet and lock access", () => {
  const service = api();
  for (const secret of [undefined, "", "wrong", 123, SECRET + "x", SECRET.slice(0, -1)]) {
    assert.deepEqual(service.post({ action: "deleteVoucher", voucherId: "ABC-123", secret }), {
      success: false,
      error: "Unauthorized",
    });
  }
  assert.deepEqual(service.calls.opens, []);
  assert.equal(service.calls.locks, 0);
});

test("configuration must use a strong property secret and fixed spreadsheet ID", () => {
  for (const properties of [
    { APP_SECRET: null },
    { APP_SECRET: "short" },
    { SPREADSHEET_ID: null },
    { SPREADSHEET_ID: "bad sheet" },
  ]) {
    const service = api({}, properties);
    assert.equal(service.post({ action: "getVouchers" }).success, false);
    assert.equal(service.calls.opens.length, 0);
  }
  const service = api();
  assert.equal(
    service.post({ action: "getVouchers", id: "other_spreadsheet_identifier" }).success,
    false,
  );
  assert.equal(service.post({ action: "getVouchers", id: 123 }).success, false);
  assert.equal(service.calls.opens.length, 0);
  assert.equal(service.post({ action: "getVouchers", id: SHEET_ID }).success, true);
  assert.deepEqual(service.calls.opens, [SHEET_ID]);
});

test("editor connection check identifies missing or invalid secret before spreadsheet access", () => {
  for (const secret of [null, "", "short", "x".repeat(257)]) {
    const service = api({}, { APP_SECRET: secret });
    const result = service.check();
    assert.equal(result.success, false);
    assert.equal(result.code, "APP_SECRET_INVALID");
    assert.equal(typeof result.message, "string");
    assert.ok(result.message.length > 0);
    assert.deepEqual(service.calls.opens, []);
    assert.equal(service.calls.writes, 0);
    assert.equal(service.calls.locks, 0);
    const diagnostic = JSON.stringify({ result, logs: service.calls.logs });
    assert.ok(!diagnostic.includes(SECRET));
    assert.ok(!diagnostic.includes(SHEET_ID));
  }
});

test("editor connection check identifies invalid spreadsheet IDs without opening Sheets", () => {
  for (const spreadsheetId of [null, "", "bad sheet", "short", "x".repeat(101)]) {
    const service = api({}, { SPREADSHEET_ID: spreadsheetId });
    const result = service.check();
    assert.equal(result.success, false);
    assert.equal(result.code, "SPREADSHEET_ID_INVALID");
    assert.equal(typeof result.message, "string");
    assert.ok(result.message.length > 0);
    assert.deepEqual(service.calls.opens, []);
    assert.equal(service.calls.writes, 0);
    assert.equal(service.calls.locks, 0);
    const diagnostic = JSON.stringify({ result, logs: service.calls.logs });
    assert.ok(!diagnostic.includes(SECRET));
    assert.ok(!diagnostic.includes(SHEET_ID));
  }
});

test("editor connection check reports spreadsheet access failure without exposing raw errors", () => {
  const privateError = `SECRET=${SECRET} SPREADSHEET=${SHEET_ID} PRIVATE_STACK`;
  const service = api({}, {}, { openError: privateError });
  const result = service.check();
  assert.equal(result.success, false);
  assert.equal(result.code, "SPREADSHEET_ACCESS_FAILED");
  assert.equal(typeof result.message, "string");
  assert.ok(result.message.length > 0);
  assert.deepEqual(service.calls.opens, [SHEET_ID]);
  assert.equal(service.calls.writes, 0);
  assert.equal(service.calls.locks, 0);
  const diagnostic = JSON.stringify({ result, logs: service.calls.logs });
  assert.ok(!diagnostic.includes(SECRET));
  assert.ok(!diagnostic.includes(SHEET_ID));
  assert.ok(!diagnostic.includes("PRIVATE_STACK"));
});

test("editor connection check succeeds read-only without returning secrets or spreadsheet data", () => {
  const privateCell = "PRIVATE_SHEET_CONTENT";
  const service = api({ Settings: [["password", privateCell]] });
  const result = service.check();
  assert.equal(result.success, true);
  assert.equal(result.code, "CONNECTION_OK");
  assert.equal(typeof result.message, "string");
  assert.ok(result.message.length > 0);
  assert.deepEqual(service.calls.opens, [SHEET_ID]);
  assert.equal(service.calls.writes, 0);
  assert.equal(service.calls.locks, 0);
  const diagnostic = JSON.stringify({ result, logs: service.calls.logs });
  assert.ok(!diagnostic.includes(SECRET));
  assert.ok(!diagnostic.includes(SHEET_ID));
  assert.ok(!diagnostic.includes(privateCell));
});

test("malformed JSON and unsupported actions cannot touch the spreadsheet", () => {
  const service = api();
  for (const raw of ["", "{", "null", "[]", '"string"', "x".repeat(2500001)])
    assert.equal(service.raw(raw).success, false);
  assert.equal(service.post({ action: "getSettings" }).success, false);
  assert.equal(service.post({ action: "toString" }).success, false);
  assert.equal(service.calls.opens.length, 0);
});

test("password state reads never initialize properties, acquire locks, or access Sheets", () => {
  const service = api();
  const originalProperties = structuredClone(service.properties);
  assert.deepEqual(
    service.post({ action: "getPasswordState", bootstrapVersion: BOOTSTRAP_VERSION }),
    { success: true, passwordHash: null },
  );
  assert.deepEqual(service.properties, originalProperties);
  assert.deepEqual(service.calls.propertyWrites, []);
  assert.deepEqual(service.calls.opens, []);
  assert.equal(service.calls.locks, 0);
  service.properties[PASSWORD_PROPERTY] = NEXT_PASSWORD_HASH;
  assert.deepEqual(
    service.post({ action: "getPasswordState", bootstrapVersion: BOOTSTRAP_VERSION }),
    { success: true, passwordHash: NEXT_PASSWORD_HASH },
  );
  assert.deepEqual(service.calls.logs, []);
});

test("password actions require the trusted API secret and configured Sheet before hash access", () => {
  for (const action of ["getPasswordState", "changePasswordHash"]) {
    const service = api({}, { [PASSWORD_PROPERTY]: NEXT_PASSWORD_HASH });
    for (const secret of [undefined, "", "wrong", 123, SECRET + "x"])
      assert.deepEqual(service.post({ ...passwordChange(), action, secret }), {
        success: false,
        error: "Unauthorized",
      });
    assert.deepEqual(
      service.post({ ...passwordChange(), action, id: "another_spreadsheet_identifier" }),
      { success: false, error: "Spreadsheet is not allowed" },
    );
    assert.deepEqual(service.get({ ...passwordChange(), action, secret: SECRET }), {
      success: false,
      error: "GET reads are disabled",
    });
    assert.ok(!service.calls.propertyReads.includes(PASSWORD_PROPERTY));
    assert.deepEqual(service.calls.propertyWrites, []);
    assert.deepEqual(service.calls.opens, []);
    assert.equal(service.calls.locks, 0);
  }
});

test("password action payloads validate full scopes and scrypt encodings before lock access", () => {
  const service = api();
  for (const bootstrapVersion of [
    undefined,
    null,
    123,
    "",
    "a".repeat(63),
    "a".repeat(65),
    "A".repeat(64),
    "../APP_SECRET",
    BOOTSTRAP_VERSION + "\n",
  ]) {
    for (const action of ["getPasswordState", "changePasswordHash"])
      assert.deepEqual(service.post(passwordChange({ action, bootstrapVersion })), {
        success: false,
        error: "Invalid password request",
      });
  }
  for (const hash of [
    undefined,
    null,
    123,
    "plaintext-password",
    INITIAL_PASSWORD_HASH + "x",
    INITIAL_PASSWORD_HASH.slice(0, -1),
    INITIAL_PASSWORD_HASH.toUpperCase(),
    INITIAL_PASSWORD_HASH + "\n",
  ]) {
    for (const field of ["expectedHash", "nextHash"])
      assert.deepEqual(service.post(passwordChange({ [field]: hash })), {
        success: false,
        error: "Invalid password request",
      });
  }
  assert.deepEqual(service.post(passwordChange({ nextHash: INITIAL_PASSWORD_HASH })), {
    success: false,
    error: "Invalid password request",
  });
  assert.deepEqual(service.calls.propertyWrites, []);
  assert.deepEqual(service.calls.opens, []);
  assert.equal(service.calls.locks, 0);
});

test("first web password change writes only its scoped hash and never returns credentials", () => {
  const service = api({}, { unrelated: "preserve", APP_PASSWORD_HASH: "legacy-unused" });
  const result = service.post(passwordChange());
  assert.deepEqual(result, { success: true });
  assert.deepEqual(service.calls.propertyWrites, [[PASSWORD_PROPERTY, NEXT_PASSWORD_HASH]]);
  assert.equal(service.properties[PASSWORD_PROPERTY], NEXT_PASSWORD_HASH);
  assert.equal(service.properties.unrelated, "preserve");
  assert.equal(service.properties.APP_PASSWORD_HASH, "legacy-unused");
  assert.deepEqual(service.calls.opens, []);
  assert.equal(service.calls.writes, 0);
  assert.equal(service.calls.locks, 1);
  assert.equal(service.calls.releases, 1);
  assert.deepEqual(service.calls.logs, []);
});

test("password CAS rejects stale changes and updates only the current expected hash", () => {
  const service = api({}, { [PASSWORD_PROPERTY]: INITIAL_PASSWORD_HASH });
  assert.deepEqual(service.post(passwordChange()), { success: true });
  assert.deepEqual(service.post(passwordChange({ nextHash: ANOTHER_PASSWORD_HASH })), {
    success: false,
    error: "Password changed",
  });
  assert.equal(service.properties[PASSWORD_PROPERTY], NEXT_PASSWORD_HASH);
  assert.equal(service.calls.propertyWrites.length, 1);
  assert.deepEqual(
    service.post(
      passwordChange({ expectedHash: NEXT_PASSWORD_HASH, nextHash: ANOTHER_PASSWORD_HASH }),
    ),
    { success: true },
  );
  assert.equal(service.properties[PASSWORD_PROPERTY], ANOTHER_PASSWORD_HASH);
  assert.equal(service.calls.propertyWrites.length, 2);
  assert.equal(service.calls.releases, 3);
  assert.deepEqual(service.calls.opens, []);
});

test("password CAS reads the current value after acquiring the lock", () => {
  const service = api(
    {},
    { [PASSWORD_PROPERTY]: INITIAL_PASSWORD_HASH },
    { onLock: (properties) => (properties[PASSWORD_PROPERTY] = ANOTHER_PASSWORD_HASH) },
  );
  assert.deepEqual(service.post(passwordChange()), { success: false, error: "Password changed" });
  assert.equal(service.properties[PASSWORD_PROPERTY], ANOTHER_PASSWORD_HASH);
  assert.deepEqual(service.calls.propertyWrites, []);
  assert.equal(service.calls.locks, 1);
  assert.equal(service.calls.releases, 1);
  assert.deepEqual(service.calls.opens, []);
});

test("malformed stored password state fails closed and cannot be replaced by a trusted write", () => {
  for (const invalid of ["", "plaintext", "x".repeat(200), 123, NEXT_PASSWORD_HASH + "\n"]) {
    const service = api({}, { [PASSWORD_PROPERTY]: invalid });
    for (const action of ["getPasswordState", "changePasswordHash"])
      assert.deepEqual(service.post(passwordChange({ action })), {
        success: false,
        error: "Password state is invalid",
      });
    assert.equal(service.properties[PASSWORD_PROPERTY], invalid);
    assert.deepEqual(service.calls.propertyWrites, []);
    assert.equal(service.calls.locks, 1);
    assert.equal(service.calls.releases, 1);
    assert.deepEqual(service.calls.opens, []);
  }
});

test("password write failures and busy locks leave the old hash intact without leaking errors", () => {
  const busy = api({}, { [PASSWORD_PROPERTY]: INITIAL_PASSWORD_HASH }, { lockAvailable: false });
  assert.deepEqual(busy.post(passwordChange()), {
    success: false,
    error: "API is busy; retry shortly",
  });
  assert.equal(busy.properties[PASSWORD_PROPERTY], INITIAL_PASSWORD_HASH);
  assert.deepEqual(busy.calls.propertyWrites, []);
  assert.ok(!busy.calls.propertyReads.includes(PASSWORD_PROPERTY));
  assert.equal(busy.calls.releases, 0);
  assert.deepEqual(busy.calls.opens, []);
  const failed = api(
    {},
    { [PASSWORD_PROPERTY]: INITIAL_PASSWORD_HASH },
    { propertyWriteError: `PRIVATE ${SECRET} ${INITIAL_PASSWORD_HASH}` },
  );
  assert.deepEqual(failed.post(passwordChange()), {
    success: false,
    error: "API operation failed",
  });
  assert.equal(failed.properties[PASSWORD_PROPERTY], INITIAL_PASSWORD_HASH);
  assert.equal(failed.calls.releases, 1);
  assert.deepEqual(failed.calls.opens, []);
  assert.deepEqual(failed.calls.logs, []);
});

test("reloading GS preserves web passwords while a new environment seed selects an empty scope", () => {
  const service = api();
  assert.deepEqual(service.post(passwordChange()), { success: true });
  service.reload();
  assert.deepEqual(
    service.post({ action: "getPasswordState", bootstrapVersion: BOOTSTRAP_VERSION }),
    { success: true, passwordHash: NEXT_PASSWORD_HASH },
  );
  const resetVersion = "b".repeat(64);
  assert.deepEqual(service.post({ action: "getPasswordState", bootstrapVersion: resetVersion }), {
    success: true,
    passwordHash: null,
  });
  assert.deepEqual(
    service.post(
      passwordChange({
        bootstrapVersion: resetVersion,
        expectedHash: ANOTHER_PASSWORD_HASH,
        nextHash: INITIAL_PASSWORD_HASH,
      }),
    ),
    { success: true },
  );
  assert.equal(service.properties[PASSWORD_PROPERTY], NEXT_PASSWORD_HASH);
  assert.equal(service.properties[`APP_LOGIN_PASSWORD_${resetVersion}`], INITIAL_PASSWORD_HASH);
  assert.deepEqual(service.calls.opens, []);
});

test("private readSheet permits only bounded matching allowlisted ranges", () => {
  const service = api({
    Teachers: [
      ["Name", "Designation"],
      ["Teacher", "Lecturer"],
    ],
  });
  for (const [sheetName, range] of [
    ["Server_Vouchers", "A:Z"],
    ["Credentials", "A1:B10"],
    ["Settings", "Teachers!A1:B10"],
    ["Settings", "A1:ZZ10"],
    ["Settings", "A1:B9999"],
    ["Settings", "B2:A1"],
    ["Teachers", "A1:B10!A1"],
    ["Teachers", "A0:B1"],
    ["Teachers", null],
  ])
    assert.equal(service.post({ action: "readSheet", sheetName, range }).success, false);
  assert.equal(service.calls.opens.length, 0);
  const result = service.post({
    action: "readSheet",
    sheetName: "Teachers",
    range: "Teachers!A:E",
  });
  assert.equal(result.success, true);
  assert.deepEqual(result.values, [
    ["Name", "Designation", "", "", ""],
    ["Teacher", "Lecturer", "", "", ""],
  ]);
  assert.equal(service.calls.locks, 0);
});

test("Settings key-value reads redact every credential and unlabeled legacy fallback", () => {
  const service = api({
    Settings: [
      ["", "legacy-password"],
      ["password", "raw-password"],
      ["API Secret", "raw-secret"],
      ["token", "raw-token"],
      ["Auth", "raw-auth"],
      ["পাসওয়ার্ড", "bangla-password"],
      ["unknown", "private-value"],
      ["department", "Geography"],
      ["college", "College"],
      ["phone", "123"],
      ["email", "dept@example.com"],
      ["web", "example.com"],
      ["department_auth", "secret-value"],
      ["department", "value", "private key"],
    ],
  });
  const result = service.post({
    action: "readSheet",
    sheetName: "Settings",
    range: "Settings!A1:C50",
  });
  assert.equal(result.success, true);
  assert.deepEqual(
    result.values.slice(0, 7),
    Array.from({ length: 7 }, () => ["", "", ""]),
  );
  assert.deepEqual(result.values[7], ["department", "Geography", ""]);
  assert.deepEqual(result.values[8], ["college", "College", ""]);
  assert.deepEqual(result.values[12], ["", "", ""]);
  assert.deepEqual(result.values[13], ["", "", ""]);
  assert.deepEqual(
    service.post({ action: "readSheet", sheetName: "Settings", range: "B1:B7" }).values,
    Array.from({ length: 7 }, () => [""]),
  );
});

test("Settings header columns return only organization fields, with no fallback cells", () => {
  const service = api({
    Settings: [
      ["department", "college", "password", "authToken", "unknown", "Email"],
      ["Geography", "College", "raw-password", "raw-auth", "legacy-password", "dept@example.com"],
      ["unused", "should-not-return", "another-password"],
    ],
  });
  const result = service.post({ action: "readSheet", sheetName: "Settings", range: "A:F" });
  assert.deepEqual(result.values, [
    ["department", "college", "", "", "", "Email"],
    ["Geography", "College", "", "", "", "dept@example.com"],
    ["", "", "", "", "", ""],
  ]);
});

test("verification uses exact trimmed case-insensitive IDs, never suffixes or substrings", () => {
  const service = api({ Server_Vouchers: [["Voucher ID"], record("ABC-123"), record("XYZ-1234")] });
  for (const id of ["123", "ABC", "1234", "ABC-123-suffix", "does-not-exist"]) {
    assert.deepEqual(service.post({ action: "verifyVoucher", voucherId: id }), {
      success: true,
      voucher: null,
    });
  }
  const found = service.post({ action: "verifyVoucher", voucherId: "  abc-123  " });
  assert.equal(found.success, true);
  assert.equal(found.voucher.id, "ABC-123");
  assert.equal(found.voucher.fullState, JSON.stringify({ id: "ABC-123" }));
  assert.equal(service.calls.locks, 0);
});

test("getVouchers preserves existing fields and missing sheets return empty records", () => {
  assert.deepEqual(api().post({ action: "getVouchers" }), { success: true, vouchers: [] });
  assert.deepEqual(api().post({ action: "verifyVoucher", voucherId: "ABC-123" }), {
    success: true,
    voucher: null,
  });
  const service = api({ Server_Vouchers: [["Voucher ID"], record("ABC-123"), record("DEF-456")] });
  const result = service.post({ action: "getVouchers" });
  assert.equal(result.success, true);
  assert.equal(result.vouchers[0].id, "DEF-456");
  assert.deepEqual(Object.keys(result.vouchers[0]), [
    "id",
    "type",
    "examTitle",
    "date",
    "income",
    "expenses",
    "distributable",
    "fullState",
    "expenseVouchers",
    "vatChallan",
    "tax5Challan",
    "tax10Challan",
  ]);
});

test("legitimate save/upsert and delete synchronize voucher and challan rows with write locks", () => {
  const service = api();
  assert.equal(service.post(voucher()).success, true);
  assert.equal(service.calls.locks, 1);
  assert.equal(service.calls.releases, 1);
  assert.equal(service.sheets.get("Server_Vouchers").rows.length, 2);
  assert.equal(service.sheets.get("Challans").rows[1][13], 25);
  assert.equal(service.post({ ...voucher("abc-123"), income: 2000 }).success, true);
  assert.equal(service.sheets.get("Server_Vouchers").rows.length, 2);
  assert.equal(service.sheets.get("Server_Vouchers").rows[1][4], 2000);
  assert.equal(service.post({ action: "deleteVoucher", voucherId: "123" }).success, false);
  assert.equal(service.sheets.get("Server_Vouchers").rows.length, 2);
  assert.equal(service.sheets.get("Challans").rows.length, 2);
  assert.equal(service.post({ action: "deleteVoucher", voucherId: " ABC-123 " }).success, true);
  assert.equal(service.sheets.get("Server_Vouchers").rows.length, 1);
  assert.equal(service.sheets.get("Challans").rows.length, 1);
  assert.equal(service.calls.releases, service.calls.locks);
});

test("deleting an ID removes all historical case variants without touching suffix matches", () => {
  const service = api({
    Server_Vouchers: [
      ["Voucher ID"],
      record("ABC-123"),
      record("XYZ-123"),
      record("abc-123"),
      record("ABC-1234"),
      record(" ABC-123 "),
    ],
    Challans: [["Voucher ID"], ["ABC-123"], ["abc-123"], ["XYZ-123"], ["ABC-1234"]],
  });
  assert.equal(service.post({ action: "deleteVoucher", voucherId: " AbC-123 " }).success, true);
  assert.deepEqual(
    service.sheets.get("Server_Vouchers").rows.map((row) => row[0]),
    ["Voucher ID", "XYZ-123", "ABC-1234"],
  );
  assert.deepEqual(
    service.sheets.get("Challans").rows.map((row) => row[0]),
    ["Voucher ID", "XYZ-123", "ABC-1234"],
  );
  assert.deepEqual(service.post({ action: "verifyVoucher", voucherId: "ABC-123" }), {
    success: true,
    voucher: null,
  });
  assert.equal(
    service.post({ action: "verifyVoucher", voucherId: "ABC-1234" }).voucher.id,
    "ABC-1234",
  );
  assert.equal(service.calls.locks, 1);
  assert.equal(service.calls.releases, 1);
});

test("invalid IDs, money, and mismatched state are rejected before spreadsheet writes", () => {
  const service = api();
  for (const voucherId of [undefined, "", "  ", 123, "x".repeat(129), "ABC\n123"])
    assert.equal(service.post({ action: "deleteVoucher", voucherId }).success, false);
  for (const data of [
    { ...voucher(), fullState: "not-json" },
    { ...voucher(), fullState: "[]" },
    { ...voucher(), fullState: JSON.stringify({ id: "other" }) },
    { ...voucher(), income: -1 },
    { ...voucher(), expenses: "100" },
    { ...voucher(), distributable: -50 },
    { ...voucher(), tax5Amount: 1e30 },
    { ...voucher(), configName: {} },
  ])
    assert.equal(service.post(data).success, false);
  assert.deepEqual(service.calls.opens, []);
  assert.equal(service.calls.locks, 0);
});

test("errors do not leak configuration or stacks and acquired locks always release", () => {
  const service = api({}, {}, { openError: `SECRET=${SECRET} SPREADSHEET=${SHEET_ID}` });
  assert.deepEqual(service.post(voucher()), { success: false, error: "API operation failed" });
  assert.equal(service.calls.releases, 1);
  const busy = api({}, {}, { lockAvailable: false });
  assert.equal(busy.post(voucher()).success, false);
  assert.equal(busy.calls.opens.length, 0);
  assert.equal(busy.calls.releases, 0);
});
