"use server";
import { z } from "zod";
import { requireCtx } from "@/lib/auth/member";
import { run, type ActionState } from "@/lib/actions";
import { linkInvestProfile, setInvestVisibility, unlinkInvest } from "@/lib/services/invest";

const vis = z.enum(["pessoal", "compartilhado"]);

async function ctx() {
  const { member } = await requireCtx();
  return { userId: member.userId, householdId: member.householdId };
}

export async function linkInvestAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  const c = await ctx();
  return run(async () => {
    const ok = await linkInvestProfile(c, vis.parse(fd.get("visibility")));
    if (!ok) throw new Error("Nenhum perfil do invest-tracker para este login.");
    return "Investimentos vinculados!";
  }, ["/investimentos", "/patrimonio"]);
}

export async function setInvestVisibilityAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  const c = await ctx();
  return run(async () => {
    await setInvestVisibility(c, vis.parse(fd.get("visibility")));
    return "Visibilidade atualizada.";
  }, ["/investimentos", "/patrimonio"]);
}

export async function unlinkInvestAction(): Promise<ActionState> {
  const c = await ctx();
  return run(async () => {
    await unlinkInvest(c);
    return "Vínculo removido.";
  }, ["/investimentos", "/patrimonio"]);
}
