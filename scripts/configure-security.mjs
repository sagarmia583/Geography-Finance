import { randomBytes } from "node:crypto";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { emitKeypressEvents } from "node:readline";
import { parseEnv } from "node:util";
import { hashPassword, validPasswordHash } from "../src/lib/password.server.ts";
import { DEFAULT_SCRIPT_URL, DEFAULT_SHEET_ID } from "../src/lib/config.ts";

async function readEnvironment(file) {
  try {
    return parseEnv(await readFile(file, "utf8"));
  } catch (error) {
    if (error.code === "ENOENT") return {};
    throw error;
  }
}

async function writeEnvironment(config) {
  await writeFile(
    ".env.local",
    Object.entries(config)
      .map(([key, value]) => `${key}=${JSON.stringify(value)}`)
      .join("\n") + "\n",
    { mode: 0o600 },
  );
}

function passwordPrompt(prompt) {
  if (!process.stdin.isTTY)
    throw new Error("একটি interactive terminal থেকে চালান; command-line-এ পাসওয়ার্ড দেবেন না।");
  process.stdout.write(prompt);
  emitKeypressEvents(process.stdin);
  process.stdin.setRawMode(true);
  process.stdin.resume();
  return new Promise((resolve, reject) => {
    let value = "";
    const cleanup = () => {
      process.stdin.off("keypress", onKey);
      process.stdin.setRawMode(false);
      process.stdin.pause();
      process.stdout.write("\n");
    };
    const onKey = (text, key = {}) => {
      if (key.ctrl && key.name === "c") {
        cleanup();
        reject(new Error("বাতিল করা হয়েছে।"));
      } else if (key.name === "return" || key.name === "enter") {
        cleanup();
        resolve(value);
      } else if (key.name === "backspace") value = Array.from(value).slice(0, -1).join("");
      else if (text && !key.ctrl && !key.meta && key.name !== "escape") value += text;
    };
    process.stdin.on("keypress", onKey);
  });
}

try {
  const base = await readEnvironment(".env");
  const local = await readEnvironment(".env.local");
  const passwordOnly = process.argv.includes("--password-only");
  const rotate = process.argv.includes("--rotate");
  if (passwordOnly && rotate) throw new Error("শুধু পাসওয়ার্ড বদলাতে --rotate দেবেন না।");
  if (passwordOnly && !validPasswordHash(local["APP_PASSWORD_HASH"] || ""))
    throw new Error("স্থানীয় লগইন আগে কনফিগার করুন: node scripts/configure-security.mjs");
  if (local["APP_PASSWORD_HASH"] && !rotate && !passwordOnly)
    throw new Error(
      "লগইন আগেই কনফিগার করা আছে। ইচ্ছাকৃতভাবে credentials বদলাতে --rotate ব্যবহার করুন।",
    );
  // Optional stdin mode supports a password manager or CI without argv/history exposure.
  let supplied = [];
  if (process.argv.includes("--password-stdin")) {
    let input = "";
    for await (const chunk of process.stdin) {
      input += chunk;
      if (input.length > 4096) throw new Error("পাসওয়ার্ডের input বেশি বড়।");
    }
    supplied = input.split(/\r?\n/);
    if (!supplied[0] || !supplied[1])
      throw new Error("stdin-এ পাসওয়ার্ড ও confirmation আলাদা দুই লাইনে দিন।");
  }
  const password =
    supplied[0] ?? (await passwordPrompt("নতুন লগইন পাসওয়ার্ড (কমপক্ষে ৬ অক্ষর; দেখা যাবে না): "));
  const confirm = supplied[1] ?? (await passwordPrompt("আবার লিখুন: "));
  if (password !== confirm) throw new Error("দুটি পাসওয়ার্ড মেলেনি; কোনো ফাইল বদলানো হয়নি।");
  const passwordHash = await hashPassword(password);
  if (passwordOnly) {
    await writeEnvironment({ ...local, APP_PASSWORD_HASH: passwordHash });
    console.log("লগইন পাসওয়ার্ড বদলেছে। স্থানীয় server বন্ধ করে আবার চালান।");
    console.log("Apps Script আবার deploy করতে হবে না। আগের login session আর গ্রহণ করা হবে না।");
    console.log(
      "Live website হলে hosting-এর APP_PASSWORD_HASH হালনাগাদ করে website restart/deploy করুন।",
    );
  } else {
    const sheetId =
      local["GOOGLE_SHEET_ID"] ||
      base["GOOGLE_SHEET_ID"] ||
      base["VITE_SHEET_ID"] ||
      DEFAULT_SHEET_ID;
    const scriptUrl =
      local["GOOGLE_SCRIPT_URL"] ||
      base["GOOGLE_SCRIPT_URL"] ||
      base["VITE_SCRIPT_URL"] ||
      DEFAULT_SCRIPT_URL;
    const appSecret = randomBytes(32).toString("hex");
    const config = {
      ...local,
      GOOGLE_SHEET_ID: sheetId,
      GOOGLE_SCRIPT_URL: scriptUrl,
      GOOGLE_APPS_SCRIPT_SECRET: appSecret,
      APP_SESSION_SECRET: randomBytes(32).toString("hex"),
      APP_PASSWORD_HASH: passwordHash,
    };
    delete config["VITE_APP_SECRET"];
    await mkdir(".security", { recursive: true });
    await writeFile(
      ".security/apps-script-properties.json",
      JSON.stringify({ APP_SECRET: appSecret, SPREADSHEET_ID: sheetId }, null, 2) + "\n",
      { mode: 0o600 },
    );
    await writeEnvironment(config);
    console.log("সেভ হয়েছে: .env.local এবং .security/apps-script-properties.json");
    console.log(
      "পাসওয়ার্ড সংরক্ষণ করা হয়নি। server secrets ও Apps Script deployment-এর ধাপ SECURITY-SETUP.md-এ আছে।",
    );
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : "কনফিগারেশন করা যায়নি।");
  process.exitCode = 1;
}
