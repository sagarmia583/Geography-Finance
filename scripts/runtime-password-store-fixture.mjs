// Test-only Node preload. Never import this from application or production code.
// The disposable smoke-test child receives synthetic credentials and a temp file.
import { readFileSync, writeFileSync } from "node:fs";

const endpoint = "https://script.google.com/macros/s/runtime_password_store_fixture/exec";
const statePath = process.env["RUNTIME_PASSWORD_STATE_PATH"];
if (!statePath || process.env["GOOGLE_SCRIPT_URL"] !== endpoint)
  throw new Error("The runtime password fixture requires its disposable test environment.");

function reply(value) {
  return new Response(JSON.stringify(value), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

const originalFetch = globalThis.fetch;
globalThis.fetch = async (input, options) => {
  const url = new URL(typeof input === "string" || input instanceof URL ? input : input.url);
  if (url.href !== endpoint) {
    if (url.hostname !== "127.0.0.1" && url.hostname !== "localhost")
      throw new Error("The disposable runtime fixture blocks external network requests.");
    return originalFetch(input, options);
  }
  const request = JSON.parse(options?.body || "{}");
  if (
    options?.method !== "POST" ||
    request.secret !== process.env["GOOGLE_APPS_SCRIPT_SECRET"] ||
    request.id !== process.env["GOOGLE_SHEET_ID"]
  )
    return reply({ success: false, error: "Unauthorized" });

  const state = JSON.parse(readFileSync(statePath, "utf8"));
  state.calls.push(request.action);
  writeFileSync(statePath, JSON.stringify(state));
  if (state.unavailable) return reply({ success: false, error: "Unsupported action" });
  if (request.action === "getVouchers") return reply({ success: true, vouchers: [] });
  if (request.action === "readSheet") return reply({ success: true, values: [] });
  if (request.action === "verifyVoucher") return reply({ success: true, voucher: null });
  if (!/^[a-f0-9]{64}$/.test(request.bootstrapVersion || ""))
    return reply({ success: false, error: "Invalid bootstrap version" });
  if (state.bootstrapVersion === null) state.bootstrapVersion = request.bootstrapVersion;
  if (state.bootstrapVersion !== request.bootstrapVersion)
    return reply({ success: false, error: "Password setup changed" });

  if (request.action === "getPasswordState") {
    writeFileSync(statePath, JSON.stringify(state));
    return reply({ success: true, passwordHash: state.passwordHash });
  }
  if (request.action === "changePasswordHash") {
    const current = state.passwordHash ?? process.env["APP_PASSWORD_HASH"];
    if (
      request.expectedHash !== current ||
      !/^scrypt-v1:[a-f0-9]{32}:[a-f0-9]{64}$/.test(request.nextHash || "")
    )
      return reply({ success: false, error: "Password update conflict" });
    state.passwordHash = request.nextHash;
    writeFileSync(statePath, JSON.stringify(state));
    return reply({ success: true });
  }
  return reply({ success: false, error: "Unsupported action" });
};
