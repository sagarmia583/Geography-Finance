import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";

// A memory-hard hash; parameters also fit the deployed Workers memory budget.
const SCRYPT_OPTIONS = { N: 32768, r: 8, p: 3, maxmem: 64 * 1024 * 1024 };
const HASH_PATTERN = /^scrypt-v1:([a-f0-9]{32}):([a-f0-9]{64})$/;

function derive(password: string, salt: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(password, salt, 32, SCRYPT_OPTIONS, (error, key) => {
      if (error) reject(error);
      else resolve(key);
    });
  });
}

export function validPasswordHash(encoded: string): boolean {
  return encoded.length === 107 && HASH_PATTERN.test(encoded);
}

export async function hashPassword(password: string): Promise<string> {
  if (password.length < 6 || password.length > 1024) {
    throw new Error("পাসওয়ার্ড ৬ থেকে ১০২৪ অক্ষরের হতে হবে।");
  }
  const salt = randomBytes(16).toString("hex");
  const key = await derive(password, salt);
  return `scrypt-v1:${salt}:${key.toString("hex")}`;
}

export async function verifyPassword(password: string, encoded: string): Promise<boolean> {
  if (!validPasswordHash(encoded)) return false;
  const match = HASH_PATTERN.exec(encoded);
  if (!match || !password || password.length > 1024) return false;
  const key = await derive(password, match[1]!);
  return timingSafeEqual(key, Buffer.from(match[2]!, "hex"));
}
