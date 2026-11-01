// Local, disposable credentials only. No request in this smoke test reaches Google.
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { toJSONAsync, fromCrossJSON } from "seroval";
import { hashPassword, verifyPassword } from "../src/lib/password.server.ts";

const origin = "http://127.0.0.1:8091";
const password = randomBytes(24).toString("hex");
const newPassword = randomBytes(24).toString("hex");
const passwordHash = await hashPassword(password);
const sessionSecret = randomBytes(32).toString("hex");
const scriptSecret = randomBytes(32).toString("hex");
const scratchRoot = resolve(tmpdir());
const tempDirectory = await mkdtemp(join(scratchRoot, "voucher-password-runtime-"));
const statePath = join(tempDirectory, "password-store.json");
await writeFile(
  statePath,
  JSON.stringify({ passwordHash: null, bootstrapVersion: null, calls: [], unavailable: false }),
  { mode: 0o600 },
);
let output = "";
let cookie = "";
let child;
const functions = new Map();
function startServer() {
  child = spawn(
    process.execPath,
    [
      "--import",
      new URL("./runtime-password-store-fixture.mjs", import.meta.url).href,
      "node_modules/vite/bin/vite.js",
      "dev",
      "--host",
      "127.0.0.1",
      "--port",
      "8091",
      "--strictPort",
    ],
    {
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
      env: {
        ...process.env,
        NODE_ENV: "development",
        APP_PASSWORD_HASH: passwordHash,
        APP_SESSION_SECRET: sessionSecret,
        GOOGLE_APPS_SCRIPT_SECRET: scriptSecret,
        GOOGLE_SHEET_ID: "runtime_test_spreadsheet_id_only",
        GOOGLE_SCRIPT_URL: "https://script.google.com/macros/s/runtime_password_store_fixture/exec",
        VITE_SHEET_ID: "runtime_test_spreadsheet_id_only",
        VITE_SCRIPT_URL: "https://script.google.com/macros/s/runtime_password_store_fixture/exec",
        RUNTIME_PASSWORD_STATE_PATH: statePath,
      },
    },
  );
  child.stdout.on("data", (data) => {
    output = (output + data).slice(-12000);
  });
  child.stderr.on("data", (data) => {
    output = (output + data).slice(-12000);
  });
}
async function stopServer() {
  if (!child || child.exitCode !== null || child.signalCode !== null) return;
  const stopped = new Promise((resolve) => child.once("exit", resolve));
  child.kill();
  await stopped;
}
async function prepareServer() {
  startServer();
  let ready = false;
  let startupResponse = "";
  for (let attempt = 0; attempt < 100; attempt++) {
    if (child.exitCode !== null) throw new Error("Disposable test server exited before readiness.");
    try {
      const response = await fetch(origin + "/login");
      ready = response.ok;
      if (!ready)
        startupResponse = `Readiness HTTP ${response.status}: ${(await response.text()).slice(0, 1500)}`;
    } catch (error) {
      startupResponse = `Readiness connection: ${error.message} (${error.cause?.code || "no code"})`;
      /* server starts asynchronously */
    }
    if (ready) break;
    await delay(250);
  }
  assert.ok(ready, `Disposable test server starts. ${startupResponse}`);
  functions.clear();
  for (const module of ["auth", "sheets"]) {
    const clientCode = await (await fetch(`${origin}/src/lib/${module}.functions.ts`)).text();
    for (const secret of [password, newPassword, passwordHash, sessionSecret, scriptSecret])
      assert.ok(
        !clientCode.includes(secret),
        "Generated client module excludes runtime credentials",
      );
    for (const match of clientCode.matchAll(/createClientRpc\("([^"]+)"\)/g)) {
      const metadata = JSON.parse(Buffer.from(match[1], "base64url").toString());
      functions.set(metadata.export.split("_createServerFn_")[0], match[1]);
    }
  }
}
async function rpc(
  name,
  data,
  { method = "POST", withCookie = true, foreignOrigin = false, cookieOverride } = {},
) {
  assert.ok(functions.has(name), `RPC ${name} is present`);
  const sentCookie = cookieOverride ?? cookie;
  const response = await fetch(`${origin}/_serverFn/${functions.get(name)}`, {
    method,
    headers: {
      Origin: foreignOrigin ? "https://attacker.invalid" : origin,
      ...(method === "POST" && data !== undefined ? { "Content-Type": "application/json" } : {}),
      Accept: "application/json",
      "x-tsr-serverFn": "true",
      ...(withCookie && sentCookie ? { Cookie: sentCookie } : {}),
    },
    ...(method === "POST" && data !== undefined
      ? { body: JSON.stringify(await toJSONAsync({ data })) }
      : {}),
  });
  const cookies = response.headers.getSetCookie();
  const sessionCookie = cookies.filter((entry) => entry.startsWith("kgc-session="));
  if (sessionCookie.length) cookie = sessionCookie.at(-1).split(";")[0];
  const text = await response.text();
  let decoded;
  try {
    decoded = response.headers.has("x-tss-serialized")
      ? fromCrossJSON(JSON.parse(text), {})
      : JSON.parse(text);
  } catch {
    decoded = null;
  }
  return { response, decoded, text, sessionCookie, value: decoded?.result ?? decoded };
}
async function readState() {
  return JSON.parse(await readFile(statePath, "utf8"));
}
async function updateState(fields) {
  await writeFile(statePath, JSON.stringify({ ...(await readState()), ...fields }));
}

try {
  await prepareServer();
  let result = await rpc("getSessionStatus", undefined, { method: "GET", withCookie: false });
  assert.equal(result.value?.authenticated, false);
  const privateInput = {
    scriptUrl: "https://attacker.invalid/ignored",
    payload: { id: "wrong_sheet_id", voucherId: "TEST-123" },
  };
  for (const name of ["saveRequest", "listRequest", "deleteRequest"]) {
    result = await rpc(name, privateInput, { withCookie: false });
    assert.equal(result.response.status, 401, `${name} rejects unauthenticated requests`);
  }
  const changeData = { currentPassword: password, newPassword, confirmPassword: newPassword };
  result = await rpc("passwordChangeRequest", changeData, { withCookie: false });
  assert.equal(result.response.status, 401, "Password change requires a sealed login session");
  cookie = "kgc-session=forged-client-created-value";
  result = await rpc("getSessionStatus", undefined, { method: "GET" });
  assert.equal(result.value?.authenticated, false);
  result = await rpc("loginRequest", { password }, { foreignOrigin: true });
  assert.equal(result.response.status, 403, "Cross-site login is rejected");
  result = await rpc(
    "loginRequest",
    { password: "incorrect-runtime-password" },
    { withCookie: false },
  );
  assert.equal(result.value?.success, false);
  result = await rpc("loginRequest", { password }, { withCookie: false });
  assert.equal(result.value?.success, true, "Valid password logs in over real RPC");
  assert.ok(
    result.sessionCookie.some((value) => /HttpOnly/i.test(value) && /SameSite=Lax/i.test(value)),
    "Session cookie protects browser access and cross-site requests",
  );
  result = await rpc("getSessionStatus", undefined, { method: "GET" });
  assert.equal(result.value?.authenticated, true, "Sealed cookie authenticates a later request");
  result = await rpc("listRequest", privateInput);
  assert.notEqual(result.response.status, 401, "Authorized request passes session boundary");
  assert.ok(!result.text.includes("vouchers"), "Wrong spreadsheet cannot return records");

  for (const [label, input] of [
    ["Wrong current password", { ...changeData, currentPassword: "incorrect-current-password" }],
    ["Mismatched confirmation", { ...changeData, confirmPassword: "mismatched-confirmation" }],
    ["Short new password", { ...changeData, newPassword: "short", confirmPassword: "short" }],
  ]) {
    result = await rpc("passwordChangeRequest", input);
    assert.notEqual(result.value?.success, true, `${label} is rejected`);
    assert.equal((await readState()).passwordHash, null, `${label} leaves credentials unchanged`);
  }
  result = await rpc("passwordChangeRequest", changeData, { foreignOrigin: true });
  assert.equal(result.response.status, 403, "Cross-site password change is rejected");
  assert.equal((await readState()).passwordHash, null);

  const oldCookie = cookie;
  result = await rpc("passwordChangeRequest", changeData);
  assert.equal(result.value?.success, true, "Current password permits a real RPC password change");
  assert.ok(
    result.sessionCookie.some((value) => /Max-Age=0|Expires=Thu, 01 Jan 1970/i.test(value)),
    "Changing the password clears the browser session cookie",
  );
  const changedHash = (await readState()).passwordHash;
  assert.ok(
    await verifyPassword(newPassword, changedHash),
    "Remote store persists only the new hash",
  );
  assert.ok(
    !(await verifyPassword(password, changedHash)),
    "Old password does not match saved hash",
  );
  result = await rpc("getSessionStatus", undefined, { method: "GET", cookieOverride: oldCookie });
  assert.equal(result.value?.authenticated, false, "Other old cookies are revoked immediately");
  for (const name of ["saveRequest", "listRequest", "deleteRequest"]) {
    result = await rpc(name, privateInput, { cookieOverride: oldCookie });
    assert.equal(result.response.status, 401, `${name} rejects an old password-version cookie`);
  }
  result = await rpc("loginRequest", { password }, { withCookie: false });
  assert.equal(result.value?.success, false, "Old password fails after web change");
  result = await rpc("loginRequest", { password: newPassword }, { withCookie: false });
  assert.equal(result.value?.success, true, "New password logs in immediately without restarting");
  const newCookie = cookie;

  await updateState({ unavailable: true });
  result = await rpc("getSessionStatus", undefined, { method: "GET", cookieOverride: newCookie });
  assert.equal(result.value?.authenticated, false, "Unavailable password store fails closed");
  result = await rpc("loginRequest", { password }, { withCookie: false });
  assert.notEqual(
    result.value?.success,
    true,
    "Store errors never fall back to the bootstrap password",
  );
  result = await rpc("listRequest", privateInput, { cookieOverride: newCookie });
  assert.equal(
    result.response.status,
    401,
    "Private APIs fail closed during password-store errors",
  );
  await updateState({ unavailable: false, passwordHash: "malformed-password-state" });
  result = await rpc("loginRequest", { password }, { withCookie: false });
  assert.notEqual(
    result.value?.success,
    true,
    "Malformed stored hash cannot re-enable bootstrap login",
  );
  await updateState({ passwordHash: changedHash });

  await stopServer();
  await prepareServer();
  result = await rpc("getSessionStatus", undefined, { method: "GET", cookieOverride: newCookie });
  assert.equal(
    result.value?.authenticated,
    true,
    "Persisted password state survives server restart",
  );
  result = await rpc("loginRequest", { password }, { withCookie: false });
  assert.equal(result.value?.success, false, "Restart does not restore the bootstrap password");
  result = await rpc("loginRequest", { password: newPassword }, { withCookie: false });
  assert.equal(result.value?.success, true, "New password remains valid after server restart");

  result = await rpc("logout");
  assert.equal(result.value?.success, true);
  result = await rpc("getSessionStatus", undefined, { method: "GET" });
  assert.equal(result.value?.authenticated, false, "Logout clears the browser session");
  assert.equal(
    (await readState()).calls.filter((action) => action === "changePasswordHash").length,
    1,
    "Only the authorized valid change reaches the remote password writer",
  );
  console.log(
    "Runtime checks passed: sealed login, password-change validation and CSRF, remote hash persistence, immediate cookie/API revocation, fail-closed store errors, restart persistence, logout, and client-secret exclusion. No Google request was made.",
  );
  if (process.argv.includes("--preview")) {
    // Printed only by explicit preview mode: these random values belong exclusively
    // to this disposable child and have no relation to the user's credentials.
    console.log(`Disposable browser preview: ${origin}/login`);
    console.log(`Disposable preview password: ${newPassword}`);
    console.log("Press Ctrl+C to stop and remove the disposable password store.");
    await new Promise((resolve) => process.once("SIGINT", resolve));
  }
} catch (error) {
  // Diagnostic output is stripped of every temporary credential before printing.
  for (const secret of [password, newPassword, passwordHash, sessionSecret, scriptSecret])
    output = output.replaceAll(secret, "[redacted]");
  console.error(output.slice(-3500));
  throw error;
} finally {
  await stopServer();
  assert.equal(dirname(resolve(tempDirectory)), scratchRoot, "Cleanup stays in the test temp root");
  await rm(tempDirectory, { recursive: true, force: true });
}
