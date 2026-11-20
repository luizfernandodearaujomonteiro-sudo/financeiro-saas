"use server";
import { redirect } from "next/navigation";
import { errorMessage, formObject, type ActionState } from "@/lib/actions";
import { getSessionUser } from "@/lib/auth/session";
import { env } from "@/lib/env";
import { createMyHousehold } from "@/lib/services/household";
import { syncThemeCookie } from "@/lib/theme-sync";

/** "Criar minha família": o usuário logado (sem família) vira dono de uma família nova. */
export async function createMyHouseholdAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (!env.selfOnboardingEnabled) return { ok: false, error: "A criação de novas famílias está desativada. Peça um convite ao dono da família." };
  try {
    await createMyHousehold(user.id, formObject(fd));
    await syncThemeCookie(user.id);
  } catch (e) {
    return { ok: false, error: errorMessage(e) };
  }
  redirect("/painel");
}
