import { z } from "zod";
import { withUser } from "../db";
import { parseBRL } from "../domain/money";
import { ENTRY_SELECT, type EntryRow } from "./entries";
import type { MemberCtx } from "./types";

export const searchInput = z.object({
  q: z.string().trim().max(120).default(""),
  categoryId: z.string().uuid().optional().or(z.literal("").transform(() => undefined)),
  ownerId: z.string().uuid().optional().or(z.literal("").transform(() => undefined)),
  cardId: z.string().uuid().optional().or(z.literal("").transform(() => undefined)),
  kind: z.enum(["receita", "despesa"]).optional().or(z.literal("").transform(() => undefined)),
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().or(z.literal("").transform(() => undefined)),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().or(z.literal("").transform(() => undefined)),
});
export type SearchInput = z.infer<typeof searchInput>;

/** Busca em lançamentos visíveis ao usuário (a RLS garante a visibilidade). */
export async function searchEntries(ctx: MemberCtx, raw: unknown): Promise<EntryRow[]> {
  const f = searchInput.parse(raw);
  const where: string[] = ["e.household_id = $1"];
  const params: unknown[] = [ctx.householdId];
  const add = (sql: string, v: unknown) => {
    params.push(v);
    where.push(sql.replace("?", `$${params.length}`));
  };
  if (f.q) {
    const terms: string[] = [];
    params.push(`%${f.q.replace(/[%_\\]/g, (c) => `\\${c}`)}%`);
    const p = `$${params.length}`;
    terms.push(`e.description ilike ${p}`, `c.name ilike ${p}`, `cd.nickname ilike ${p}`, `p.display_name ilike ${p}`, `e.notes ilike ${p}`);
    const cents = parseBRL(f.q);
    if (cents && /\d/.test(f.q)) {
      params.push(cents);
      terms.push(`e.amount_cents = $${params.length}`);
    }
    const d = /^(\d{1,2})\/(\d{1,2})(?:\/(\d{4}))?$/.exec(f.q);
    if (d) {
      params.push(Number(d[1]), Number(d[2]));
      const a = params.length - 1, b = params.length;
      terms.push(`(extract(day from e.occurred_on) = $${a} and extract(month from e.occurred_on) = $${b}${d[3] ? ` and extract(year from e.occurred_on) = ${Number(d[3])}` : ""})`);
    }
    where.push(`(${terms.join(" or ")})`);
  }
  if (f.categoryId) add("e.category_id = ?", f.categoryId);
  if (f.ownerId) add("e.owner_id = ?", f.ownerId);
  if (f.cardId) add("e.card_id = ?", f.cardId);
  if (f.kind) add("e.kind = ?", f.kind);
  if (f.from) add("e.occurred_on >= ?", f.from);
  if (f.to) add("e.occurred_on <= ?", f.to);
  return withUser(ctx.userId, (db) => db.query<EntryRow>(`${ENTRY_SELECT} where ${where.join(" and ")} order by e.occurred_on desc, e.created_at desc limit 100`, params));
}

export async function saveSearch(ctx: MemberCtx, query: string, filters: Record<string, unknown>) {
  const q = query.trim().slice(0, 120);
  if (!q) return;
  await withUser(ctx.userId, async (db) => {
    await db.query("delete from public.fin_financeiro_search_history where user_id = auth.uid() and lower(query) = lower($1)", [q]);
    await db.query("insert into public.fin_financeiro_search_history (user_id, household_id, query, filters) values (auth.uid(), $1, $2, $3)", [ctx.householdId, q, JSON.stringify(filters)]);
    await db.query(
      "delete from public.fin_financeiro_search_history where user_id = auth.uid() and id not in (select id from public.fin_financeiro_search_history where user_id = auth.uid() order by created_at desc limit 15)",
    );
  });
}

export function recentSearches(ctx: MemberCtx) {
  return withUser(ctx.userId, (db) =>
    db.query<{ id: string; query: string; created_at: string }>("select id, query, created_at from public.fin_financeiro_search_history where user_id = auth.uid() order by created_at desc limit 10"),
  );
}

export async function clearSearchHistory(ctx: MemberCtx) {
  await withUser(ctx.userId, (db) => db.query("delete from public.fin_financeiro_search_history where user_id = auth.uid()"));
}
