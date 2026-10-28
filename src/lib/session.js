// Edge-safe (used by middleware): no DB or Node-only imports here.
import { SignJWT, jwtVerify } from "jose";

export const SESSION_COOKIE = "rq_session";
export const SESSION_HOURS = 12;

function key() {
  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.length < 32) throw new Error("SESSION_SECRET is missing — run `npm run db:setup`.");
  return new TextEncoder().encode(secret);
}

export function signSession(user) {
  // sv = session_version; bumping it in the DB signs that user out everywhere.
  return new SignJWT({ role: user.role, sv: user.session_version })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(String(user.id))
    .setIssuedAt()
    .setExpirationTime(`${SESSION_HOURS}h`)
    .sign(key());
}

export async function verifySession(token) {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, key());
    return payload;
  } catch {
    return null;
  }
}
