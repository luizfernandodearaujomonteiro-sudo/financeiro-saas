/** OAuth do Google (Gmail somente leitura), por perfil. */
import "server-only";
import { env } from "../env";
import { hmacHex, randomToken, safeEqual } from "../security/crypto";

export const GMAIL_SCOPE = "https://www.googleapis.com/auth/gmail.readonly";

export function redirectUri() {
  return `${env.appUrl}/api/integrations/gmail/callback`;
}

function stateSecret(): string {
  const s = env.secret("OAUTH_STATE_SECRET");
  if (!s) throw new Error("OAUTH_STATE_SECRET não configurado");
  return s;
}

/** state = base64url({uid, nonce, exp}).hmac — vinculado ao usuário e a um cookie de nonce. */
export function createState(userId: string): { state: string; nonce: string } {
  const nonce = randomToken(16);
  const body = Buffer.from(JSON.stringify({ uid: userId, nonce, exp: Date.now() + 10 * 60_000 })).toString("base64url");
  return { state: `${body}.${hmacHex(stateSecret(), body)}`, nonce };
}

export function verifyState(state: string | null, expectedUserId: string, nonceCookie: string | undefined): boolean {
  if (!state || !nonceCookie) return false;
  const [body, sig] = state.split(".");
  if (!body || !sig || !safeEqual(sig, hmacHex(stateSecret(), body))) return false;
  try {
    const s = JSON.parse(Buffer.from(body, "base64url").toString()) as { uid: string; nonce: string; exp: number };
    return s.uid === expectedUserId && safeEqual(s.nonce, nonceCookie) && s.exp > Date.now();
  } catch {
    return false;
  }
}

export function authUrl(state: string): string {
  const p = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID ?? "",
    redirect_uri: redirectUri(),
    response_type: "code",
    scope: `${GMAIL_SCOPE} email`,
    access_type: "offline",
    prompt: "consent",
    include_granted_scopes: "true",
    state,
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${p}`;
}

export async function exchangeCode(code: string) {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ code, client_id: process.env.GOOGLE_CLIENT_ID ?? "", client_secret: process.env.GOOGLE_CLIENT_SECRET ?? "", redirect_uri: redirectUri(), grant_type: "authorization_code" }),
  });
  if (!res.ok) throw new Error(`Google token HTTP ${res.status}`);
  return (await res.json()) as { access_token: string; refresh_token?: string; scope: string; id_token?: string };
}

export async function refreshAccessToken(refreshToken: string): Promise<string> {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ refresh_token: refreshToken, client_id: process.env.GOOGLE_CLIENT_ID ?? "", client_secret: process.env.GOOGLE_CLIENT_SECRET ?? "", grant_type: "refresh_token" }),
  });
  if (!res.ok) throw new Error(`Google refresh HTTP ${res.status}`);
  return ((await res.json()) as { access_token: string }).access_token;
}

export async function fetchEmail(accessToken: string): Promise<string | null> {
  const res = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/profile", { headers: { Authorization: `Bearer ${accessToken}` } });
  if (!res.ok) return null;
  return ((await res.json()) as { emailAddress?: string }).emailAddress ?? null;
}
