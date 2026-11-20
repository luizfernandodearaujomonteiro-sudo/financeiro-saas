"use server";
import { redirect } from "next/navigation";
import { z } from "zod";
import { getSessionUser, signIn } from "@/lib/auth/session";
import { acceptInvite } from "@/lib/services/household";
import { errorMessage, type ActionState } from "@/lib/actions";

/**
 * Aceite de convite: a pessoa ENTRA com uma conta existente (o auth.users é
 * compartilhado) e então o convite cria a ligação com a família no servidor.
 */
export async function acceptInviteAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  const token = String(fd.get("token") ?? "");
  const name = z.string().trim().min(1, "Informe seu nome").max(60).safeParse(fd.get("name"));
  if (!name.success) return { ok: false, error: name.error.issues[0]!.message };
  try {
    let user = await getSessionUser();
    if (!user) {
      const r = await signIn(String(fd.get("email") ?? ""), String(fd.get("password") ?? ""));
      if (!r.ok) return { ok: false, error: r.error === "bloqueado" ? "Muitas tentativas. Aguarde 15 minutos." : "E-mail ou senha incorretos." };
      user = { id: r.userId, email: r.email };
    }
    await acceptInvite(user.id, token, name.data);
  } catch (e) {
    return { ok: false, error: errorMessage(e) };
  }
  redirect("/painel");
}
