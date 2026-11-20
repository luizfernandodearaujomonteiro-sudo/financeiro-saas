"use server";
import { requireCtx } from "@/lib/auth/member";
import { formObject, run, type ActionState } from "@/lib/actions";
import { addContribution, createGoal, deleteGoal } from "@/lib/services/goals";

async function ctx() {
  const { member } = await requireCtx();
  return { userId: member.userId, householdId: member.householdId };
}

export async function createGoalAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  const c = await ctx();
  return run(async () => {
    await createGoal(c, formObject(fd));
    return "Meta criada!";
  }, ["/metas"]);
}

export async function addContributionAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  const c = await ctx();
  return run(async () => {
    await addContribution(c, formObject(fd));
    return fd.get("withdrawal") ? "Retirada registrada." : "Aporte registrado!";
  }, ["/metas"]);
}

export async function deleteGoalAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  const c = await ctx();
  return run(async () => {
    await deleteGoal(c, String(fd.get("id") ?? ""));
    return "Meta excluída.";
  }, ["/metas"]);
}
