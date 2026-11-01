import { createHash } from "node:crypto";
import {
  deleteCookie,
  getRequest,
  setResponseHeader,
  setResponseStatus,
  useSession as createCookieSession,
} from "@tanstack/react-start/server";
import { hashPassword, validPasswordHash, verifyPassword } from "./password.server";
import { getCurrentPasswordHash, saveChangedPasswordHash } from "./credentials.server";

const COOKIE_NAME = "kgc-session";
const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const loginAttempts = new Map<string, { count: number; until: number }>();

export function privateResponse() {
  setResponseHeader("Cache-Control", "no-store");
  setResponseHeader("Vary", "Cookie");
}

function authConfig() {
  // Read inside each request; Cloudflare bindings are unavailable at module load.
  const password = process.env["APP_SESSION_SECRET"]?.trim() || "";
  const passwordHash = process.env["APP_PASSWORD_HASH"]?.trim() || "";
  if (password.length < 32 || !validPasswordHash(passwordHash)) {
    throw new Error("সার্ভারের লগইন কনফিগারেশন সম্পূর্ণ করা হয়নি।");
  }
  return { password, passwordHash };
}

async function appSession() {
  const config = authConfig();
  const session = await createCookieSession<{ authenticated: boolean; passwordVersion: string }>({
    name: COOKIE_NAME,
    password: config.password,
    maxAge: 8 * 60 * 60,
    sessionHeader: false,
    cookie: {
      httpOnly: true,
      secure:
        process.env["NODE_ENV"] === "production" || new URL(getRequest().url).protocol === "https:",
      sameSite: "lax",
      path: "/",
    },
  });
  return { session, config };
}

function passwordVersion(hash: string) {
  return createHash("sha256").update(hash).digest("hex");
}

async function authenticatedSession() {
  const { session, config } = await appSession();
  if (session.data.authenticated !== true || typeof session.data.passwordVersion !== "string")
    return null;
  const passwordHash = await getCurrentPasswordHash(config.passwordHash);
  if (session.data.passwordVersion !== passwordVersion(passwordHash)) return null;
  return { session, config, passwordHash };
}

export async function sessionStatus(): Promise<{ authenticated: boolean }> {
  privateResponse();
  try {
    return { authenticated: (await authenticatedSession()) !== null };
  } catch {
    return { authenticated: false };
  }
}

export async function requireSession(): Promise<void> {
  if (!(await sessionStatus()).authenticated) {
    setResponseStatus(401);
    throw new Error("আবার লগইন করুন। অনুমতি ছাড়া এই তথ্য পড়া বা পরিবর্তন করা যাবে না।");
  }
}

function beginPasswordAttempt(kind: "login" | "change") {
  const request = getRequest();
  const address = `${kind}:${request.headers.get("cf-connecting-ip") || "local"}`;
  const now = Date.now();
  for (const [key, value] of loginAttempts) if (value.until <= now) loginAttempts.delete(key);
  const attempts = loginAttempts.get(address) || { count: 0, until: now + LOGIN_WINDOW_MS };
  if (attempts.count >= 8) {
    setResponseStatus(429);
    return null;
  }
  // Count before the expensive hash so concurrent requests cannot evade the limit.
  attempts.count++;
  if (loginAttempts.size >= 2000 && !loginAttempts.has(address)) {
    setResponseStatus(429);
    return null;
  }
  loginAttempts.set(address, attempts);
  return address;
}

export async function authenticate(
  password: string,
): Promise<{ success: boolean; error?: string }> {
  privateResponse();
  const config = authConfig();
  const attempt = beginPasswordAttempt("login");
  if (!attempt)
    return { success: false, error: "অনেকবার চেষ্টা হয়েছে। ১৫ মিনিট পরে আবার চেষ্টা করুন।" };
  const passwordHash = await getCurrentPasswordHash(config.passwordHash);
  if (!(await verifyPassword(password, passwordHash))) {
    return { success: false, error: "পাসওয়ার্ড ভুল হয়েছে।" };
  }
  loginAttempts.delete(attempt);
  const { session } = await appSession();
  await session.clear();
  await session.update({
    authenticated: true,
    passwordVersion: passwordVersion(passwordHash),
  });
  return { success: true };
}

export async function changeLoginPassword(input: {
  currentPassword: string;
  newPassword: string;
  confirmPassword: string;
}): Promise<{ success: boolean; error?: string }> {
  privateResponse();
  const authenticated = await authenticatedSession();
  if (!authenticated) {
    setResponseStatus(401);
    return { success: false, error: "সেশনের মেয়াদ শেষ হয়েছে। আবার লগইন করুন।" };
  }
  if (input.newPassword.length < 12 || input.newPassword.length > 1024)
    return { success: false, error: "নতুন পাসওয়ার্ড ১২ থেকে ১০২৪ অক্ষরের হতে হবে।" };
  if (input.newPassword !== input.confirmPassword)
    return { success: false, error: "নতুন পাসওয়ার্ড দুটি মেলেনি।" };
  if (input.currentPassword === input.newPassword)
    return { success: false, error: "বর্তমান পাসওয়ার্ডের চেয়ে আলাদা নতুন পাসওয়ার্ড দিন।" };
  const attempt = beginPasswordAttempt("change");
  if (!attempt)
    return { success: false, error: "অনেকবার চেষ্টা হয়েছে। ১৫ মিনিট পরে আবার চেষ্টা করুন।" };
  if (!(await verifyPassword(input.currentPassword, authenticated.passwordHash)))
    return { success: false, error: "বর্তমান পাসওয়ার্ড সঠিক নয়।" };
  const nextHash = await hashPassword(input.newPassword);
  // Apps Script compares under a lock so a concurrent change cannot be replaced
  // using a password that was valid only before the other request committed.
  try {
    await saveChangedPasswordHash(
      authenticated.config.passwordHash,
      authenticated.passwordHash,
      nextHash,
    );
  } catch {
    return {
      success: false,
      error:
        "পাসওয়ার্ড সংরক্ষণ নিশ্চিত করা যায়নি। আবার লগইন করে পরীক্ষা করুন; প্রথমে নতুন পাসওয়ার্ড চেষ্টা করুন।",
    };
  }
  loginAttempts.delete(attempt);
  // Revocation is already durable. Cookie cleanup is best effort so a committed
  // change never gets reported as a failed write just because logout failed.
  try {
    await clearAuthentication();
  } catch {
    deleteCookie(COOKIE_NAME, { path: "/" });
  }
  return { success: true };
}

export async function clearAuthentication(): Promise<void> {
  privateResponse();
  try {
    const { session } = await appSession();
    await session.clear();
  } finally {
    deleteCookie(COOKIE_NAME, { path: "/" });
  }
}
