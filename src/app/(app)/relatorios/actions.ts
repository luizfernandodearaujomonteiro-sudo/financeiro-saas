"use server";
import { requireCtx } from "@/lib/auth/member";
import { run, type ActionState } from "@/lib/actions";
import { savePrefs } from "@/lib/services/prefs";

export async function setComparisonModeAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  const { member } = await requireCtx();
  return run(async () => {
    await savePrefs(member.userId, { comparisonMode: fd.get("mode") });
    return "Preferência salva.";
  }, ["/relatorios"]);
}
