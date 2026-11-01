import assert from "node:assert/strict";
import * as crypto from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";
import { z } from "zod";
import { hashPassword, validPasswordHash, verifyPassword } from "../src/lib/password.server.ts";
import * as verification from "../src/lib/voucher-verification.ts";

const PASSWORD = "regression-test-password-only";
const PASSWORD_HASH = await hashPassword(PASSWORD);
const SESSION_SECRET = "test-session-secret-at-least-32-random-characters";
const SCRIPT_SECRET = "test-script-secret-at-least-32-random-characters";
const SHEET_ID = "configured_spreadsheet_identifier";
const SCRIPT_URL = "https://script.google.com/macros/s/test-script-id/exec";

function loadModule(path, imports, globals = {}) {
  const source = readFileSync(new URL(path, import.meta.url), "utf8");
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const module = { exports: {} };
  vm.runInNewContext(compiled, {
    exports: module.exports,
    module,
    require: (name) => {
      assert.ok(Object.hasOwn(imports, name), `unexpected module dependency: ${name}`);
      return imports[name];
    },
    URL,
    AbortSignal,
    ...globals,
  });
  return module.exports;
}

function authService(options = {}) {
  const headers = new Map();
  const status = [];
  const cookies = [];
  const sessions = [];
  const passwordStore = options.passwordStore || { hash: null, reads: 0, saves: [] };
  const session = {
    data: options.data || {},
    clears: 0,
    updates: [],
    async clear() {
      this.clears++;
      this.data = {};
    },
    async update(value) {
      this.updates.push(value);
      this.data = { ...value };
    },
  };
  const env = {
    APP_SESSION_SECRET: SESSION_SECRET,
    APP_PASSWORD_HASH: PASSWORD_HASH,
    NODE_ENV: "production",
    ...options.env,
  };
  const server = {
    getRequest: () =>
      new Request(options.url || "https://example.com/login", { headers: options.headers }),
    setResponseHeader: (name, value) => headers.set(name, value),
    setResponseStatus: (value) => status.push(value),
    deleteCookie: (name, settings) => cookies.push({ name, settings }),
    useSession: async (settings) => {
      sessions.push(settings);
      if (options.forged) throw new Error("cookie cannot be decrypted");
      return session;
    },
  };
  const auth = loadModule(
    "../src/lib/auth.server.ts",
    {
      "node:crypto": crypto,
      "@tanstack/react-start/server": server,
      "./password.server": { hashPassword, validPasswordHash, verifyPassword },
      "./credentials.server": {
        getCurrentPasswordHash: async (bootstrapHash) => {
          passwordStore.reads++;
          if (passwordStore.readError) throw new Error("private upstream error");
          return passwordStore.hash || bootstrapHash;
        },
        saveChangedPasswordHash: async (bootstrapHash, expectedHash, nextHash) => {
          if (passwordStore.writeError || (passwordStore.hash || bootstrapHash) !== expectedHash)
            throw new Error("private CAS error");
          passwordStore.saves.push({ bootstrapHash, expectedHash, nextHash });
          passwordStore.hash = nextHash;
        },
      },
    },
    { process: { env } },
  );
  return { ...auth, session, sessions, headers, status, cookies, env, passwordStore };
}

function sheetService(options = {}) {
  const requests = [];
  const env = {
    GOOGLE_APPS_SCRIPT_SECRET: SCRIPT_SECRET,
    GOOGLE_SHEET_ID: SHEET_ID,
    GOOGLE_SCRIPT_URL: SCRIPT_URL,
    ...options.env,
  };
  const sheets = loadModule(
    "../src/lib/sheets.server.ts",
    {
      "./config": { DEFAULT_SCRIPT_URL: SCRIPT_URL, DEFAULT_SHEET_ID: SHEET_ID },
    },
    {
      process: { env },
      fetch: async (url, request) => {
        requests.push({ url, ...request, json: JSON.parse(request.body) });
        if (options.fetchError) throw new Error("network unavailable");
        return {
          ok: options.ok !== false,
          text: async () =>
            options.raw ??
            JSON.stringify(
              Object.hasOwn(options, "response")
                ? options.response
                : { success: true, vouchers: [] },
            ),
        };
      },
    },
  );
  return { ...sheets, requests };
}

function serverFunctions(sheets, auth) {
  const methods = [];
  const createServerFn = (options) => {
    methods.push(options.method);
    let validator;
    const builder = {
      validator(value) {
        validator = value;
        return builder;
      },
      handler(fn) {
        return async (args = {}) =>
          fn({ data: validator ? validator.parse(args.data) : args.data });
      },
    };
    return builder;
  };
  const functions = loadModule("../src/lib/sheets.functions.ts", {
    "@tanstack/react-start": { createServerFn },
    zod: { z },
    "./auth.server": auth,
    "./sheets.server": sheets,
    "./voucher-verification": verification,
  });
  return { ...functions, methods };
}

test("passwords use salted memory-hard hashes and fail closed for bad passwords or hashes", async () => {
  const second = await hashPassword(PASSWORD);
  assert.notEqual(PASSWORD_HASH, second);
  assert.equal(validPasswordHash(PASSWORD_HASH), true);
  assert.equal(PASSWORD_HASH.includes(PASSWORD), false);
  assert.equal(await verifyPassword(PASSWORD, PASSWORD_HASH), true);
  assert.equal(await verifyPassword("incorrect-password", PASSWORD_HASH), false);
  for (const encoded of [
    "",
    "plaintext-password",
    "scrypt-v1:bad:bad",
    PASSWORD_HASH + "x",
    PASSWORD_HASH + "\n",
  ]) {
    assert.equal(validPasswordHash(encoded), false);
    assert.equal(await verifyPassword(PASSWORD, encoded), false);
  }
  assert.equal(await verifyPassword("", PASSWORD_HASH), false);
  assert.equal(await verifyPassword("x".repeat(1025), PASSWORD_HASH), false);
  await assert.rejects(hashPassword("short"));
  await assert.rejects(hashPassword("x".repeat(1025)));
});

test("missing, forged, and client-created sessions cannot authenticate", async () => {
  for (const options of [
    {},
    { forged: true },
    { data: { authenticated: true } },
    { data: { authenticated: "true", passwordVersion: "attacker-value" } },
    { headers: { cookie: 'kgc-session={"authenticated":true}', "x-h3-session": "attacker-value" } },
  ]) {
    const service = authService(options);
    assert.equal((await service.sessionStatus()).authenticated, false);
    await assert.rejects(service.requireSession());
    assert.equal(service.status.at(-1), 401);
    assert.equal(service.headers.get("Cache-Control"), "no-store");
    assert.equal(service.headers.get("Vary"), "Cookie");
  }
});

test("sessions require secure cookies and reject client-supplied session headers", async () => {
  const service = authService();
  await service.sessionStatus();
  const settings = service.sessions[0];
  assert.equal(settings.password, SESSION_SECRET);
  assert.equal(settings.sessionHeader, false);
  assert.equal(settings.maxAge, 8 * 60 * 60);
  assert.equal(settings.cookie.httpOnly, true);
  assert.equal(settings.cookie.secure, true);
  assert.equal(settings.cookie.sameSite, "lax");
  assert.equal(settings.cookie.path, "/");
  const local = authService({ env: { NODE_ENV: "development" }, url: "http://localhost:8080" });
  await local.sessionStatus();
  assert.equal(local.sessions[0].cookie.secure, false);
});

test("successful login rotates the session and password changes revoke earlier sessions", async () => {
  const service = authService({ data: { authenticated: false, old: "must-be-cleared" } });
  assert.equal((await service.authenticate("incorrect-password")).success, false);
  assert.equal(service.session.clears, 0);
  assert.equal((await service.authenticate(PASSWORD)).success, true);
  assert.equal(service.session.clears, 1);
  assert.equal(service.session.data.authenticated, true);
  assert.equal(service.session.data.old, undefined);
  assert.equal(service.session.data.password, undefined);
  assert.equal(service.session.data.passwordHash, undefined);
  assert.equal((await service.sessionStatus()).authenticated, true);
  await service.requireSession();
  service.env.APP_PASSWORD_HASH = await hashPassword("a-different-secure-test-password");
  assert.equal((await service.sessionStatus()).authenticated, false);
  await assert.rejects(service.requireSession());
  await service.clearAuthentication();
  assert.equal(service.session.data.authenticated, undefined);
  assert.equal(service.cookies.at(-1).name, "kgc-session");
});

test("missing server auth configuration fails closed", async () => {
  for (const env of [
    { APP_SESSION_SECRET: "short" },
    { APP_PASSWORD_HASH: "plaintext" },
    { APP_PASSWORD_HASH: "" },
  ]) {
    const service = authService({ env });
    assert.equal((await service.sessionStatus()).authenticated, false);
    await assert.rejects(service.requireSession());
    await assert.rejects(service.authenticate(PASSWORD));
    assert.equal(service.sessions.length, 0);
  }
});

test("login throttling blocks repeated guesses before another hash or session is issued", async () => {
  const service = authService();
  for (let attempt = 0; attempt < 8; attempt++)
    assert.equal((await service.authenticate("")).success, false);
  assert.equal((await service.authenticate(PASSWORD)).success, false);
  assert.equal(service.status.at(-1), 429);
  assert.equal(service.sessions.length, 0);
});

const NEW_PASSWORD = "new-web-login-password-only";
const passwordChange = (overrides = {}) => ({
  currentPassword: PASSWORD,
  newPassword: NEW_PASSWORD,
  confirmPassword: NEW_PASSWORD,
  ...overrides,
});

test("web password changes require a signed current session before any password-store access", async () => {
  for (const options of [{}, { data: { authenticated: true } }]) {
    const service = authService(options);
    assert.equal((await service.changeLoginPassword(passwordChange())).success, false);
    assert.equal(service.status.at(-1), 401);
    assert.equal(service.passwordStore.reads, 0);
    assert.equal(service.passwordStore.saves.length, 0);
  }
});

test("web change reauthenticates current password and validates confirmation, length and difference", async () => {
  const service = authService();
  await service.authenticate(PASSWORD);
  for (const invalid of [
    { currentPassword: "wrong-current-password" },
    { confirmPassword: "different-confirmation" },
    { newPassword: "short", confirmPassword: "short" },
    { newPassword: "x".repeat(1025), confirmPassword: "x".repeat(1025) },
    { newPassword: PASSWORD, confirmPassword: PASSWORD },
  ]) {
    assert.equal((await service.changeLoginPassword(passwordChange(invalid))).success, false);
    assert.equal(service.passwordStore.saves.length, 0);
    assert.equal((await service.sessionStatus()).authenticated, true);
  }
});

test("web password change persists hash, revokes all old sessions and leaves env/Google credentials alone", async () => {
  const service = authService();
  await service.authenticate(PASSWORD);
  const oldSession = { ...service.session.data };
  const originalEnv = { ...service.env };
  const result = await service.changeLoginPassword(passwordChange());
  assert.equal(JSON.stringify(result), JSON.stringify({ success: true }));
  assert.equal(service.passwordStore.saves.length, 1);
  assert.equal(await verifyPassword(NEW_PASSWORD, service.passwordStore.hash), true);
  assert.equal(service.session.data.authenticated, undefined);
  assert.deepEqual(service.env, originalEnv);
  assert.equal(service.cookies.at(-1).name, "kgc-session");
  const otherDevice = authService({ data: oldSession, passwordStore: service.passwordStore });
  assert.equal((await otherDevice.sessionStatus()).authenticated, false);
  await assert.rejects(otherDevice.requireSession());
  const restarted = authService({ passwordStore: service.passwordStore });
  assert.equal((await restarted.authenticate(PASSWORD)).success, false);
  assert.equal((await restarted.authenticate(NEW_PASSWORD)).success, true);
  assert.equal((await restarted.sessionStatus()).authenticated, true);
});

test("password store outage cannot restore old env login or authenticated sessions; logout still works", async () => {
  const service = authService();
  await service.authenticate(PASSWORD);
  service.passwordStore.readError = true;
  assert.equal((await service.sessionStatus()).authenticated, false);
  await assert.rejects(service.requireSession());
  await assert.rejects(service.authenticate(PASSWORD));
  await assert.rejects(service.changeLoginPassword(passwordChange()));
  assert.equal(service.passwordStore.saves.length, 0);
  await service.clearAuthentication();
  assert.equal(service.session.data.authenticated, undefined);
});

test("unconfirmed or concurrent password writes never report success or clear the current session", async () => {
  const service = authService();
  await service.authenticate(PASSWORD);
  const clears = service.session.clears;
  service.passwordStore.writeError = true;
  const result = await service.changeLoginPassword(passwordChange());
  assert.equal(result.success, false);
  assert.equal(service.passwordStore.saves.length, 0);
  assert.equal(service.session.clears, clears);
  assert.equal(JSON.stringify(result).includes("private CAS error"), false);
});

test("current-password guessing is throttled separately from login", async () => {
  const service = authService();
  await service.authenticate(PASSWORD);
  for (let attempt = 0; attempt < 8; attempt++)
    assert.equal(
      (await service.changeLoginPassword(passwordChange({ currentPassword: "incorrect" }))).success,
      false,
    );
  assert.equal((await service.changeLoginPassword(passwordChange())).success, false);
  assert.equal(service.status.at(-1), 429);
  assert.equal(service.passwordStore.saves.length, 0);
  assert.equal((await service.authenticate(PASSWORD)).success, true);
});

function credentialService(response, error) {
  const calls = [];
  return {
    ...loadModule("../src/lib/credentials.server.ts", {
      "node:crypto": crypto,
      "./password.server": { validPasswordHash },
      "./sheets.server": {
        callSheetScript: async (action, data) => {
          calls.push({ action, data });
          if (error) throw new Error("upstream unavailable");
          return response;
        },
      },
    }),
    calls,
  };
}

test("credential reads use trusted scope, explicit null bootstrap and strict remote hash validation", async () => {
  const service = credentialService({ success: true, passwordHash: null });
  assert.equal(await service.getCurrentPasswordHash(PASSWORD_HASH), PASSWORD_HASH);
  assert.equal(service.calls[0].action, "getPasswordState");
  assert.deepEqual(Object.keys(service.calls[0].data), ["bootstrapVersion"]);
  assert.equal(
    service.calls[0].data.bootstrapVersion,
    crypto.createHash("sha256").update(PASSWORD_HASH).digest("hex"),
  );
  const changedHash = await hashPassword(NEW_PASSWORD);
  const active = credentialService({ success: true, passwordHash: changedHash });
  assert.equal(await active.getCurrentPasswordHash(PASSWORD_HASH), changedHash);
  for (const passwordHash of [undefined, "plaintext", "", {}, 123, PASSWORD_HASH + "\n"])
    await assert.rejects(
      credentialService({ success: true, passwordHash }).getCurrentPasswordHash(PASSWORD_HASH),
    );
  await assert.rejects(credentialService(null, true).getCurrentPasswordHash(PASSWORD_HASH));
  await assert.rejects(service.getCurrentPasswordHash("invalid-bootstrap"));
});

test("credential writes send only salted hashes and CAS, rejecting invalid or identical hashes", async () => {
  const service = credentialService({ success: true });
  const changedHash = await hashPassword(NEW_PASSWORD);
  await service.saveChangedPasswordHash(PASSWORD_HASH, PASSWORD_HASH, changedHash);
  assert.equal(service.calls[0].action, "changePasswordHash");
  assert.equal(service.calls[0].data.expectedHash, PASSWORD_HASH);
  assert.equal(service.calls[0].data.nextHash, changedHash);
  assert.equal(JSON.stringify(service.calls).includes(NEW_PASSWORD), false);
  await assert.rejects(service.saveChangedPasswordHash(PASSWORD_HASH, PASSWORD_HASH, "plaintext"));
  await assert.rejects(service.saveChangedPasswordHash(PASSWORD_HASH, "bad", changedHash));
  await assert.rejects(
    service.saveChangedPasswordHash(PASSWORD_HASH, PASSWORD_HASH, PASSWORD_HASH),
  );
  assert.equal(service.calls.length, 1);
});

test("upstream requests use only server URL, spreadsheet, secret, and action", async () => {
  const service = sheetService();
  await service.callSheetScript("getVouchers", {
    id: SHEET_ID,
    sheetId: SHEET_ID,
    action: "deleteVoucher",
    secret: "attacker-secret",
    scriptUrl: "https://attacker.example/collect",
  });
  const request = service.requests[0];
  assert.equal(request.url, SCRIPT_URL);
  assert.equal(request.method, "POST");
  assert.equal(request.cache, "no-store");
  assert.equal(request.json.action, "getVouchers");
  assert.equal(request.json.secret, SCRIPT_SECRET);
  assert.equal(request.json.id, SHEET_ID);
  assert.ok(request.signal);
  await assert.rejects(service.callSheetScript("getVouchers", { id: "attacker-sheet" }));
  await assert.rejects(service.callSheetScript("getVouchers", { sheetId: "attacker-sheet" }));
  assert.equal(service.requests.length, 1);
});

test("unsafe upstream configuration is rejected without making network requests", async () => {
  for (const env of [
    { GOOGLE_APPS_SCRIPT_SECRET: "short" },
    { GOOGLE_SCRIPT_URL: "http://script.google.com/macros/s/id/exec" },
    { GOOGLE_SCRIPT_URL: "https://attacker.example/macros/s/id/exec" },
    { GOOGLE_SCRIPT_URL: "https://script.google.com.attacker.example/macros/s/id/exec" },
    { GOOGLE_SCRIPT_URL: "https://user:password@script.google.com/macros/s/id/exec" },
    { GOOGLE_SCRIPT_URL: "https://script.google.com/macros/s/id/exec?redirect=attacker" },
    { GOOGLE_SCRIPT_URL: "https://script.google.com/macros/s/id/exec#fragment" },
    { GOOGLE_SHEET_ID: "invalid sheet id" },
  ]) {
    const service = sheetService({ env });
    await assert.rejects(service.callSheetScript("getVouchers"));
    assert.equal(service.requests.length, 0);
  }
});

test("HTML, HTTP errors, failed API results, and malformed success envelopes fail closed", async () => {
  for (const options of [
    { ok: false },
    { fetchError: true },
    { raw: "<!doctype html><html>Sign in</html>" },
    { response: { success: false, error: "secret must never escape" } },
    { response: { success: "true", vouchers: [] } },
    { response: [] },
    { response: null },
  ]) {
    const service = sheetService(options);
    await assert.rejects(
      service.callSheetScript("getVouchers"),
      (error) => !error.message.includes("secret must never escape"),
    );
  }
});

test("known Apps Script errors explain the specific safe configuration or deployment fix", async () => {
  for (const [upstreamError, expected] of [
    ["API configuration is incomplete", /Script properties.*APP_SECRET.*SPREADSHEET_ID/],
    ["Unauthorized", /APP_SECRET.*GOOGLE_APPS_SCRIPT_SECRET/],
    ["Spreadsheet is not allowed", /SPREADSHEET_ID.*GOOGLE_SHEET_ID/],
    ["Unsupported action", /New version/],
    ["API operation failed", /testConnection/],
    ["API is busy; retry shortly", /আবার চেষ্টা/],
  ]) {
    const service = sheetService({ response: { success: false, error: upstreamError } });
    await assert.rejects(service.callSheetScript("getVouchers"), (error) => {
      assert.match(error.message, expected);
      assert.ok(!error.message.includes(SCRIPT_SECRET));
      assert.ok(!error.message.includes(SHEET_ID));
      return true;
    });
    assert.equal(service.requests.length, 1);
  }
});

test("unknown and prototype-named Apps Script errors never become browser-visible diagnostics", async () => {
  for (const upstreamError of [
    `PRIVATE_STACK ${SCRIPT_SECRET} ${SHEET_ID}`,
    "API configuration is incomplete PRIVATE_STACK",
    "toString",
    "__proto__",
    { message: SCRIPT_SECRET },
  ]) {
    const service = sheetService({ response: { success: false, error: upstreamError } });
    await assert.rejects(service.callSheetScript("getVouchers"), (error) => {
      assert.match(error.message, /Apps Script অনুরোধ গ্রহণ করেনি/);
      assert.ok(!error.message.includes(SCRIPT_SECRET));
      assert.ok(!error.message.includes(SHEET_ID));
      assert.ok(!error.message.includes("PRIVATE_STACK"));
      return true;
    });
  }
});

test("Settings are filtered again on our server even if upstream returns old credential rows", async () => {
  const service = sheetService({
    response: {
      success: true,
      values: [
        ["password", "raw-password"],
        ["", "legacy-password"],
        ["AuthToken", "raw-token"],
        ["department_auth", "raw-auth"],
        ["unknown", "private"],
        ["department", "Geography", "extra-private-column"],
        ["college", "College"],
      ],
    },
  });
  const rows = await service.fetchSheetValues(SHEET_ID, "Settings!A1:B50", "Settings");
  assert.equal(
    JSON.stringify(rows),
    JSON.stringify([
      ["department", "Geography"],
      ["college", "College"],
    ]),
  );
  assert.equal(service.requests[0].json.action, "readSheet");
  for (const [range, name] of [
    ["Server_Vouchers!A:D", "Server_Vouchers"],
    ["Settings!A1:B50", "Teachers"],
    ["Settings", "Settings"],
  ]) {
    await assert.rejects(service.fetchSheetValues(SHEET_ID, range, name));
  }
  assert.equal(service.requests.length, 1);
});

test("Settings header columns become safe key-value rows while credential columns stay private", async () => {
  const service = sheetService({
    response: {
      success: true,
      values: [
        [
          "Department Name",
          "College_Name",
          "Password",
          "API Secret",
          "AuthToken",
          "Unknown",
          "Email",
          "Website",
        ],
        [
          "Geography",
          "College",
          "raw-password",
          "raw-secret",
          "raw-token",
          "fallback-password",
          "dept@example.com",
          "example.com",
        ],
        ["unused", "must-not-return", "second-password"],
      ],
    },
  });
  const rows = await service.fetchSheetValues(SHEET_ID, "Settings!A:H", "Settings");
  assert.equal(
    JSON.stringify(rows),
    JSON.stringify([
      ["Department Name", "Geography"],
      ["College_Name", "College"],
      ["Email", "dept@example.com"],
      ["Website", "example.com"],
    ]),
  );
  assert.doesNotMatch(
    JSON.stringify(rows),
    /raw-password|raw-secret|raw-token|fallback-password|second-password|must-not-return/,
  );
});

test("Settings organization aliases preserve public values without accepting credential-like keys", async () => {
  const service = sheetService({
    response: {
      success: true,
      values: [
        ["department_name", "Geography"],
        ["institution_name", "College"],
        ["Telephone", "123"],
        ["Contact", "456"],
        ["Mail", "dept@example.com"],
        ["URL", "example.com"],
        ["বিভাগের নাম", "ভূগোল"],
        ["Department password", "secret"],
        ["College_auth", "secret"],
        ["PhoneToken", "secret"],
      ],
    },
  });
  const rows = await service.fetchSheetValues(SHEET_ID, "Settings!A:B", "Settings");
  assert.equal(rows.length, 7);
  assert.equal(rows[0][1], "Geography");
  assert.equal(rows[6][1], "ভূগোল");
  assert.equal(JSON.stringify(rows).includes("secret"), false);
});

test("sheet data must be a matrix before it can reach the browser", async () => {
  for (const values of ["password", null, {}, ["not-a-row"]]) {
    const service = sheetService({ response: { success: true, values } });
    await assert.rejects(service.fetchSheetValues(SHEET_ID, "Teachers!A:E", "Teachers"));
  }
});

test("every private server function rejects unauthenticated calls before upstream access", async () => {
  let calls = 0;
  const service = serverFunctions(
    {
      callSheetScript: async () => {
        calls++;
        return {};
      },
      fetchSheetValues: async () => {
        calls++;
        return [];
      },
    },
    {
      requireSession: async () => {
        throw new Error("unauthorized");
      },
      privateResponse() {},
    },
  );
  for (const name of ["saveVoucherToServer", "getVouchersFromServer", "deleteVoucherFromServer"]) {
    await assert.rejects(
      service[name]({
        scriptUrl: "https://attacker.example",
        payload: { id: SHEET_ID, voucherId: "ABC-123" },
      }),
    );
  }
  await assert.rejects(
    service.importSheetValues({
      spreadsheetId: SHEET_ID,
      range: "Teachers!A:E",
      sheetName: "Teachers",
    }),
  );
  assert.equal(calls, 0);
  assert.ok(service.methods.every((method) => method === "POST"));
});

test("authenticated wrappers choose fixed actions and discard caller-selected verification records", async () => {
  const calls = [];
  const service = serverFunctions(
    {
      callSheetScript: async (action, payload) => {
        calls.push({ action, payload });
        return { success: true, vouchers: [] };
      },
      fetchSheetValues: async () => [],
    },
    { requireSession: async () => {}, privateResponse() {} },
  );
  const input = {
    scriptUrl: "https://attacker.example",
    payload: { id: SHEET_ID, voucherId: "ABC-123", action: "getVouchers" },
  };
  await service.saveVoucherToServer(input);
  await service.getVouchersFromServer(input);
  await service.deleteVoucherFromServer(input);
  assert.deepEqual(
    calls.map((call) => call.action),
    ["saveVoucher", "getVouchers", "deleteVoucher"],
  );
  assert.equal(JSON.stringify(calls[1].payload), JSON.stringify({ id: SHEET_ID }));
  assert.equal(
    JSON.stringify(calls[2].payload),
    JSON.stringify({ id: SHEET_ID, voucherId: "ABC-123" }),
  );
});

test("public verification fails closed and returns only an exact saved server record", async () => {
  for (const [result, expected] of [
    [{ success: true, voucher: null }, "not_found"],
    [{ success: true, voucher: { id: "ABC-123" } }, "not_found"],
    [{ success: true, voucher: "invalid" }, "unavailable"],
    [{ success: true }, "unavailable"],
    [{ success: true, voucher: { id: "123" } }, "verified"],
  ]) {
    const service = serverFunctions(
      { callSheetScript: async () => result },
      {
        requireSession: async () => {
          throw new Error("private function must not run");
        },
        privateResponse() {},
      },
    );
    assert.equal((await service.verifyVoucherFromServer({ voucherId: "123" })).status, expected);
  }
  const offline = serverFunctions(
    {
      callSheetScript: async () => {
        throw new Error("offline");
      },
    },
    { privateResponse() {} },
  );
  const result = await offline.verifyVoucherFromServer({ voucherId: "ABC-123" });
  assert.equal(result.status, "unavailable");
  assert.equal(result.voucher, null);
});

test("client configuration contains no API secret or password defaults", () => {
  const config = readFileSync(new URL("../src/lib/config.ts", import.meta.url), "utf8");
  assert.doesNotMatch(config, /getAppSecret|DEFAULT_APP_SECRET|VITE_APP_SECRET|APP_PASSWORD_HASH/);
  const login = readFileSync(new URL("../src/routes/login.tsx", import.meta.url), "utf8");
  assert.doesNotMatch(login, /Settings!|importSheetValues|sessionStorage\.setItem/);
});
