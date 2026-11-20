"use server";
import { redirect } from "next/navigation";
import { z } from "zod";
import { signIn, signOut } from "@/lib/auth/session";
import type { ActionState } from "@/lib/actions";
import { syncThemeCookie } from "@/lib/theme-sync";
import { safeNextPath } from "@/lib/security/redirect";

const loginSchema = z.object({ email: z.string().trim().email("E-mail inválido").max(200), password: z.string().min(1, "Informe a senha").max(200) });

export async function loginAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const p = loginSchema.safeParse({ email: fd.get("email"), password: fd.get("password") });
  if (!p.success) return { ok: false, error: p.error.issues[0]?.message ?? "Dados inválidos" };
  let r;
  try {
    r = await signIn(p.data.email, p.data.password);
  } catch (e) {
    console.error("login: erro de configuração", e instanceof Error ? e.message : e);
    return { ok: false, error: "Login indisponível: verifique a configuração do servidor." };
  }
  if (!r.ok) {
    return { ok: false, error: r.error === "bloqueado" ? "Muitas tentativas. Aguarde 15 minutos e tente novamente." : "E-mail ou senha incorretos." };
  }
  // o tema é por perfil: quem entra no mesmo navegador não herda o tema de quem saiu
  await syncThemeCookie(r.userId);
  // somente caminhos internos (evita open redirect, inclusive "/\\evil.com" e variantes codificadas)
  redirect(safeNextPath(fd.get("next")));
}

export async function logoutAction() {
  await signOut();
  redirect("/login");
}
