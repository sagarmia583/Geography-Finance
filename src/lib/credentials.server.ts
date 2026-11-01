import { createHash } from "node:crypto";
import { validPasswordHash } from "./password.server";
import { callSheetScript } from "./sheets.server";

function bootstrapVersion(hash: string) {
  if (!validPasswordHash(hash)) throw new Error("লগইন কনফিগারেশন সঠিক নয়।");
  return createHash("sha256").update(hash).digest("hex");
}

// Script Properties are shared across devices and Workers. Never cache the active
// hash across requests: every old session must stop working after a web change.
// A server-owner env hash reset selects a new scope, preserving CLI recovery.
export async function getCurrentPasswordHash(bootstrapHash: string): Promise<string> {
  const result = await callSheetScript("getPasswordState", {
    bootstrapVersion: bootstrapVersion(bootstrapHash),
  });
  if (result["passwordHash"] === null) return bootstrapHash;
  const hash = result["passwordHash"];
  if (typeof hash !== "string" || !validPasswordHash(hash)) {
    throw new Error("সার্ভারের পাসওয়ার্ড তথ্য সঠিক নয়।");
  }
  return hash;
}

export async function saveChangedPasswordHash(
  bootstrapHash: string,
  expectedHash: string,
  nextHash: string,
): Promise<void> {
  if (!validPasswordHash(expectedHash) || !validPasswordHash(nextHash) || expectedHash === nextHash)
    throw new Error("নতুন পাসওয়ার্ড তথ্য সঠিক নয়।");
  await callSheetScript("changePasswordHash", {
    bootstrapVersion: bootstrapVersion(bootstrapHash),
    expectedHash,
    nextHash,
  });
}
