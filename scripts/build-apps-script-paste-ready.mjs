import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseEnv } from "node:util";

export function makePasteReadySource(source, { secret, sheetId }) {
  if (typeof secret !== "string" || !/^[a-f0-9]{64}$/i.test(secret)) {
    throw new Error(".env.local-এর GOOGLE_APPS_SCRIPT_SECRET সঠিক ৬৪ অক্ষরের secret হতে হবে।");
  }
  if (typeof sheetId !== "string" || !/^[A-Za-z0-9_-]{16,100}$/.test(sheetId)) {
    throw new Error(".env.local-এর GOOGLE_SHEET_ID সঠিক নয়।");
  }
  const propertyCalls = source.match(/PropertiesService\.getScriptProperties\(\)/g) || [];
  if (propertyCalls.length !== 2 || !source.includes("function doPost(e)")) {
    throw new Error("মূল GS কোডের কাঠামো বদলেছে; configuration যোগ করা হয়নি।");
  }
  const version = createHash("sha256").update(JSON.stringify({ secret, sheetId })).digest("hex");
  const preset = JSON.stringify(
    { APP_SECRET: secret, SPREADSHEET_ID: sheetId, APP_SETUP_VERSION: version },
    null,
    2,
  );
  const body = source
    .replace(/^\/\*\*[\s\S]*?\*\/\s*/, "")
    .replaceAll("PropertiesService.getScriptProperties()", "configuredScriptProperties_()");
  return `/**
 * PRIVATE: এই সম্পূর্ণ ফাইল Apps Script-এর Code.gs-এ paste করুন।
 * বর্তমান deployment-এ New version দিয়ে Deploy করুন; একই /exec URL রাখুন।
 * প্রথম POST/testConnection-এ configuration নিজে Script Properties-এ বসবে।
 * এই ফাইলে server secret আছে। চ্যাট, public folder বা Git-এ শেয়ার করবেন না।
 */

function configuredScriptProperties_() {
  var properties = PropertiesService.getScriptProperties();
  var preset = ${preset};
  // Initialize this configuration once. Later explicit property changes remain effective.
  if (properties.getProperty("APP_SETUP_VERSION") !== preset.APP_SETUP_VERSION) {
    properties.setProperties(preset, false);
  }
  return properties;
}

${body}`;
}

async function main() {
  const root = fileURLToPath(new URL("../", import.meta.url));
  const env = parseEnv(await readFile(path.join(root, ".env.local"), "utf8"));
  const source = await readFile(path.join(root, "GoogleAppsScript_Code.js"), "utf8");
  const code = makePasteReadySource(source, {
    secret: env["GOOGLE_APPS_SCRIPT_SECRET"],
    sheetId: env["GOOGLE_SHEET_ID"],
  });
  const folder = path.join(root, ".security");
  await mkdir(folder, { recursive: true });
  await writeFile(path.join(folder, "GoogleAppsScript_PasteReady.gs"), code, { mode: 0o600 });
  console.log("সম্পূর্ণ private GS code তৈরি হয়েছে: .security/GoogleAppsScript_PasteReady.gs");
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(() => {
    console.error(
      "Private GS file তৈরি করা যায়নি। স্থানীয় configuration এবং মূল GS কোড পরীক্ষা করুন।",
    );
    process.exitCode = 1;
  });
}
