import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, readFile, readdir, rm, writeFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { parseEnv } from "node:util";
import test from "node:test";
import { hashPassword, verifyPassword } from "../src/lib/password.server.ts";

const script = fileURLToPath(new URL("../scripts/configure-security.mjs", import.meta.url));
const oldPassword = "old-synthetic-password";
const newPassword = "new-synthetic-password";
const previousHash = await hashPassword(oldPassword);
const originalConfig = {
  APP_PASSWORD_HASH: previousHash,
  APP_SESSION_SECRET: "a".repeat(64),
  GOOGLE_APPS_SCRIPT_SECRET: "b".repeat(64),
  GOOGLE_SHEET_ID: "synthetic-sheet-id-1234567890",
  GOOGLE_SCRIPT_URL: "https://example.invalid/exec",
  OTHER_SETTING: "keep $ and # and spaces",
};

async function fixture(t, config = originalConfig) {
  const directory = await mkdtemp(join(tmpdir(), "voucher-password-test-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const original =
    Object.entries(config)
      .map(([key, value]) => `${key}=${JSON.stringify(value)}`)
      .join("\n") + "\n";
  await writeFile(join(directory, ".env.local"), original);
  return { directory, original };
}

function run(directory, input, extra = []) {
  return new Promise((resolve, reject) => {
    const child = spawn(
      process.execPath,
      [script, "--password-only", "--password-stdin", ...extra],
      { cwd: directory, stdio: ["pipe", "pipe", "pipe"] },
    );
    let output = "";
    child.stdout.on("data", (data) => (output += data));
    child.stderr.on("data", (data) => (output += data));
    child.on("error", reject);
    child.on("close", (code) => resolve({ code, output }));
    child.stdin.end(input);
  });
}

test("password change preserves Google/session configuration and private GS artifacts", async (t) => {
  const { directory } = await fixture(t);
  await mkdir(join(directory, ".security"));
  const properties = JSON.stringify({ APP_SECRET: originalConfig.GOOGLE_APPS_SCRIPT_SECRET });
  const gsCode = "synthetic GS artifact must remain identical";
  await writeFile(join(directory, ".security/apps-script-properties.json"), properties);
  await writeFile(join(directory, ".security/GoogleAppsScript_PasteReady.gs"), gsCode);
  const result = await run(directory, `${newPassword}\n${newPassword}\n`);
  assert.equal(result.code, 0, result.output);
  const updated = parseEnv(await readFile(join(directory, ".env.local"), "utf8"));
  assert.notEqual(updated.APP_PASSWORD_HASH, previousHash);
  assert.equal(await verifyPassword(newPassword, updated.APP_PASSWORD_HASH), true);
  assert.equal(await verifyPassword(oldPassword, updated.APP_PASSWORD_HASH), false);
  assert.deepEqual({ ...updated, APP_PASSWORD_HASH: previousHash }, originalConfig);
  assert.equal(
    await readFile(join(directory, ".security/apps-script-properties.json"), "utf8"),
    properties,
  );
  assert.equal(
    await readFile(join(directory, ".security/GoogleAppsScript_PasteReady.gs"), "utf8"),
    gsCode,
  );
  for (const sensitive of [
    oldPassword,
    newPassword,
    ...Object.values(originalConfig),
    updated.APP_PASSWORD_HASH,
  ])
    assert.equal(
      result.output.includes(sensitive),
      false,
      "CLI output must not expose credentials",
    );
});

for (const [kind, password] of [
  ["numeric", "654321"],
  ["mixed", "a1B2c3"],
]) {
  test(`password reset accepts exactly six ${kind} characters without rotating other credentials`, async (t) => {
    const { directory } = await fixture(t);
    const result = await run(directory, `${password}\n${password}\n`);
    assert.equal(result.code, 0, result.output);
    const updated = parseEnv(await readFile(join(directory, ".env.local"), "utf8"));
    assert.equal(await verifyPassword(password, updated.APP_PASSWORD_HASH), true);
    assert.equal(await verifyPassword(oldPassword, updated.APP_PASSWORD_HASH), false);
    assert.deepEqual({ ...updated, APP_PASSWORD_HASH: previousHash }, originalConfig);
    assert.deepEqual(await readdir(directory), [".env.local"]);
    assert.equal(result.output.includes(password), false);
    assert.equal(result.output.includes(updated.APP_PASSWORD_HASH), false);
  });
}

for (const [name, input, config, flags] of [
  ["mismatched passwords", `${newPassword}\ndifferent-password\n`, originalConfig, []],
  ["short password", "short\nshort\n", originalConfig, []],
  ["five-digit password", "65432\n65432\n", originalConfig, []],
  ["missing existing setup", `${newPassword}\n${newPassword}\n`, { OTHER_SETTING: "keep" }, []],
  [
    "invalid existing setup",
    `${newPassword}\n${newPassword}\n`,
    { APP_PASSWORD_HASH: "invalid" },
    [],
  ],
  ["conflicting full rotation", `${newPassword}\n${newPassword}\n`, originalConfig, ["--rotate"]],
]) {
  test(`password change rejects ${name} without changing files`, async (t) => {
    const { directory, original } = await fixture(t, config);
    const result = await run(directory, input, flags);
    assert.notEqual(result.code, 0);
    assert.equal(await readFile(join(directory, ".env.local"), "utf8"), original);
    assert.deepEqual(await readdir(directory), [".env.local"]);
    assert.equal(result.output.includes(newPassword), false);
    assert.equal(result.output.includes(previousHash), false);
  });
}
