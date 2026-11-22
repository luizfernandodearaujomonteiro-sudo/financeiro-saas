"use server";
import { redirect } from "next/navigation";
import { requireCtx } from "@/lib/auth/member";
import { run, type ActionState } from "@/lib/actions";
import { clearSearchHistory, saveSearch, searchInput } from "@/lib/services/search";

const KEYS = ["q", "categoryId", "ownerId", "cardId", "kind", "from", "to"] as const;

export async function searchAction(fd: FormData) {
  const { member } = await requireCtx();
  const raw: Record<string, string> = {};
  for (const k of KEYS) {
    const v = fd.get(k);
    if (typeof v === "string" && v.trim()) raw[k] = v.trim();
  }
  const parsed = searchInput.safeParse(raw);
  const params = new URLSearchParams();
  if (parsed.success) {
    for (const k of KEYS) {
      const v = parsed.data[k];
      if (v) params.set(k, v);
    }
    if (parsed.data.q) {
      const { q, ...filters } = parsed.data;
      try {
        await saveSearch({ userId: member.userId, householdId: member.householdId }, q, Object.fromEntries(Object.entries(filters).filter(([, v]) => v)));
      } catch {
        // histórico é opcional: a busca continua mesmo se falhar
      }
    }
  }
  redirect(`/busca${params.size ? `?${params}` : ""}`);
}

export async function clearHistoryAction(): Promise<ActionState> {
  const { member } = await requireCtx();
  return run(async () => {
    await clearSearchHistory({ userId: member.userId, householdId: member.householdId });
    return "Histórico apagado.";
  }, ["/busca"]);
}
