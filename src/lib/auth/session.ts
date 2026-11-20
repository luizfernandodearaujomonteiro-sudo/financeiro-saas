/**
 * Sessão do usuário (somente servidor).
 *  - Produção: Supabase Auth (cookies httpOnly via @supabase/ssr; getUser() valida o JWT no Auth).
 *  - Local: LOCAL_DEV_AUTH=true -> cookie httpOnly assinado com LOCAL_SESSION_SECRET.
 * Tokens NUNCA ficam em localStorage.
 */
import "server-only";
import { cookies, headers } from "next/headers";
import { env } from "../env";
import { authenticate, localVerifier, type LoginResult, type PasswordVerifier } from "./core";
import { signSession, verifySession } from "./token";
import { supabaseServer } from "./supabase";

export const LOCAL_COOKIE = "fin_financeiro_session";
const LOCAL_TTL_SECONDS = 60 * 60 * 12;

export interface SessionUser {
  id: string;
  email: string;
}

function localSecret(): string {
  const s = env.secret("LOCAL_SESSION_SECRET");
  if (!s) throw new Error("LOCAL_SESSION_SECRET não configurado (mínimo 24 caracteres)");
  return s;
}

export async function getSessionUser(): Promise<SessionUser | null> {
  if (env.localDevAuth) {
    const store = await cookies();
    const s = verifySession(store.get(LOCAL_COOKIE)?.value, localSecret());
    return s ? { id: s.uid, email: "" } : null;
  }
  if (!env.supabaseUrl()) return null;
  const supabase = await supabaseServer();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) return null;
  return { id: data.user.id, email: data.user.email ?? "" };
}

export async function clientIp(): Promise<string> {
  const h = await headers();
  return (h.get("x-forwarded-for")?.split(",")[0] ?? h.get("x-real-ip") ?? "local").trim();
}

const supabaseVerifier: PasswordVerifier = async (email, password) => {
  const supabase = await supabaseServer();
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error || !data.user) return null;
  return { userId: data.user.id, email: data.user.email ?? email };
};

export async function signIn(email: string, password: string): Promise<LoginResult> {
  const ip = await clientIp();
  const result = await authenticate(email, password, ip, env.localDevAuth ? localVerifier : supabaseVerifier);
  if (result.ok && env.localDevAuth) {
    const store = await cookies();
    store.set(LOCAL_COOKIE, signSession({ uid: result.userId, exp: Math.floor(Date.now() / 1000) + LOCAL_TTL_SECONDS }, localSecret()), {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: LOCAL_TTL_SECONDS,
    });
  }
  return result;
}

export async function signOut() {
  if (env.localDevAuth) {
    (await cookies()).delete(LOCAL_COOKIE);
    return;
  }
  const supabase = await supabaseServer();
  await supabase.auth.signOut();
}
