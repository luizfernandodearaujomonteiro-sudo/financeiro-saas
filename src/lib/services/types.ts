export interface MemberCtx {
  userId: string;
  householdId: string;
}

export type View = "tudo" | "familia" | "minha";

export function viewFilter(view: View, alias = "e", paramIndex = 0): { sql: string; params: unknown[] } {
  // RLS já restringe o que o usuário pode ver; o filtro só escolhe a "visão".
  if (view === "familia") return { sql: ` and ${alias}.visibility = 'compartilhado'`, params: [] };
  if (view === "minha") return { sql: ` and ${alias}.owner_id = auth.uid()`, params: [] };
  void paramIndex;
  return { sql: "", params: [] };
}

export function parseView(v: string | undefined | null): View {
  return v === "familia" || v === "minha" ? v : "tudo";
}
