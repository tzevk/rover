// Password hashing with Node's built-in scrypt: memory-hard, runs on the libuv thread pool
// (never blocks other requests), and ~10x faster than the pure-JS bcrypt it replaces.
// Old bcrypt hashes still verify, and are upgraded to scrypt on the user's next sign-in.
// Shared by the app and scripts/db.mjs, hence .mjs.
import crypto from "node:crypto";
import { promisify } from "node:util";
import bcrypt from "bcryptjs";

const scrypt = promisify(crypto.scrypt);
const N = 16384, R = 8, P = 5, KEYLEN = 64; // an OWASP-recommended scrypt setting

export async function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const key = await scrypt(password, salt, KEYLEN, { N, r: R, p: P });
  return `scrypt$${N}$${R}$${P}$${salt.toString("base64")}$${key.toString("base64")}`;
}

export async function verifyPassword(password, stored) {
  if (typeof stored !== "string") return false;
  if (stored.startsWith("scrypt$")) {
    const [, n, r, p, salt, hash] = stored.split("$");
    const expected = Buffer.from(hash, "base64");
    const key = await scrypt(password, Buffer.from(salt, "base64"), expected.length, { N: +n, r: +r, p: +p });
    return crypto.timingSafeEqual(key, expected);
  }
  if (/^\$2[aby]\$/.test(stored)) return bcrypt.compare(password, stored);
  return false;
}

// True when a hash was made with an older scheme or settings and should be replaced.
export const needsRehash = (stored) => !String(stored).startsWith(`scrypt$${N}$${R}$${P}$`);

// Spends the same time as a real check, so "no such user" can't be told apart by timing.
let dummy;
export async function burnVerifyTime(password) {
  dummy ??= await hashPassword("timing-equaliser");
  await verifyPassword(password, dummy);
}
