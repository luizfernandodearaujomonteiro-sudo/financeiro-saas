/**
 * Limite de tentativas de login (bloqueio temporário). As tentativas ficam em
 * fin_financeiro_login_attempts, acessível apenas via RPCs SECURITY DEFINER executadas
 * com o papel anon. As chaves são HMAC (e-mail / IP) com segredo do servidor.
 */
import "server-only";
import { withAnon } from "../db";
import { env } from "../env";
import { hmacHex } from "../security/crypto";

export const LOGIN_POLICY = {
  windowSeconds: 15 * 60,
  maxFailuresPerEmail: 5,
  maxFailuresPerIp: 20,
};

function key(kind: "email" | "ip", value: string): string {
  const secret = env.secret("LOGIN_RATE_LIMIT_SECRET");
  if (!secret) throw new Error("LOGIN_RATE_LIMIT_SECRET não configurado (mínimo 24 caracteres)");
  return hmacHex(secret, `${kind}:${value.trim().toLowerCase()}`);
}

export function isLockedOut(failures: { email: number; ip: number }): boolean {
  return failures.email >= LOGIN_POLICY.maxFailuresPerEmail || failures.ip >= LOGIN_POLICY.maxFailuresPerIp;
}

export async function loginFailures(email: string, ip: string) {
  return withAnon(async (db) => {
    const r = await db.one<{ e: number; i: number }>(
      "select fin_financeiro_private.fin_financeiro_login_failures($1, $3) as e, fin_financeiro_private.fin_financeiro_login_failures($2, $3) as i",
      [key("email", email), key("ip", ip), LOGIN_POLICY.windowSeconds],
    );
    return { email: r?.e ?? 0, ip: r?.i ?? 0 };
  });
}

export async function recordLoginAttempt(email: string, ip: string, success: boolean) {
  await withAnon(async (db) => {
    await db.query("select fin_financeiro_private.fin_financeiro_record_login_attempt($1, $2)", [key("email", email), success]);
    await db.query("select fin_financeiro_private.fin_financeiro_record_login_attempt($1, $2)", [key("ip", ip), success]);
  });
}
