/**
 * Autenticação sem dependência de next/headers (testável):
 * valida credenciais aplicando o limite de tentativas.
 */
import "server-only";
import { withService } from "../db";
import { env } from "../env";
import { verifyPassword } from "../security/password";
import { isLockedOut, loginFailures, recordLoginAttempt } from "./ratelimit";

export type LoginResult =
  | { ok: true; userId: string; email: string; accessToken?: string; refreshToken?: string }
  | { ok: false; error: "credenciais" | "bloqueado" | "configuracao" };

export interface PasswordVerifier {
  (email: string, password: string): Promise<{ userId: string; email: string } | null>;
}

/** Verificador local: confere scrypt em auth.users do banco LOCAL (somente LOCAL_DEV_AUTH). */
export const localVerifier: PasswordVerifier = async (email, password) => {
  if (!env.localDevAuth) throw new Error("verificador local só funciona com LOCAL_DEV_AUTH=true");
  const user = await withService((db) =>
    db.one<{ id: string; email: string; encrypted_password: string }>(
      "select id, email, encrypted_password from auth.users where lower(email) = lower($1)",
      [email],
    ),
  );
  const ok = await verifyPassword(password, user?.encrypted_password);
  return ok && user ? { userId: user.id, email: user.email } : null;
};

export async function authenticate(email: string, password: string, ip: string, verifier: PasswordVerifier): Promise<LoginResult> {
  const normalized = email.trim().toLowerCase();
  if (!normalized || !password) return { ok: false, error: "credenciais" };
  const failures = await loginFailures(normalized, ip);
  if (isLockedOut(failures)) return { ok: false, error: "bloqueado" };
  const user = await verifier(normalized, password);
  await recordLoginAttempt(normalized, ip, Boolean(user));
  if (!user) return { ok: false, error: "credenciais" };
  return { ok: true, ...user };
}
