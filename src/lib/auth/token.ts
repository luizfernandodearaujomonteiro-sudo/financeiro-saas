/** Sessão local assinada (modo LOCAL_DEV_AUTH). Cookie httpOnly com HMAC-SHA256. */
import { hmacHex, safeEqual } from "../security/crypto";

export interface LocalSession {
  uid: string;
  exp: number; // epoch segundos
}

export function signSession(s: LocalSession, secret: string): string {
  const body = Buffer.from(JSON.stringify(s)).toString("base64url");
  return `${body}.${hmacHex(secret, body)}`;
}

export function verifySession(token: string | undefined, secret: string, now = Date.now()): LocalSession | null {
  if (!token) return null;
  const [body, sig] = token.split(".");
  if (!body || !sig || !safeEqual(sig, hmacHex(secret, body))) return null;
  try {
    const s = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as LocalSession;
    if (typeof s.uid !== "string" || typeof s.exp !== "number" || s.exp * 1000 < now) return null;
    return s;
  } catch {
    return null;
  }
}
