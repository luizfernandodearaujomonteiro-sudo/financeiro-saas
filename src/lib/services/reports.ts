import { withUser } from "../db";
import { addMonths, type MonthStart } from "../domain/dates";
import { compareMembers } from "../domain/comparison";
import { countsInReports, expenseValue, groupSum, monthlySeries, summarize } from "../domain/reports";
import { listEntriesBetween, listEntriesForMonth } from "./entries";
import type { MemberCtx, View } from "./types";

export async function monthReport(ctx: MemberCtx, month: MonthStart, view: View) {
  const entries = await listEntriesForMonth(ctx, month, view);
  const summary = summarize(entries);
  // despesas por categoria: estornos de cartão abatem da categoria; pagamentos de fatura/transferências ficam de fora
  const byCat = groupSum(entries.filter((e) => countsInReports(e) && expenseValue(e) !== 0), (e) => e.category_name ?? "Sem categoria", (e) => expenseValue(e));
  const colors = new Map(entries.map((e) => [e.category_name ?? "Sem categoria", e.category_color ?? "#64748b"]));
  const categories = [...byCat.entries()].filter(([, cents]) => cents > 0).map(([name, cents]) => ({ name, cents, color: colors.get(name) ?? "#64748b" })).sort((a, b) => b.cents - a.cents);
  return { entries, summary, categories };
}

export async function seriesReport(ctx: MemberCtx, lastMonth: MonthStart, count: number, view: View) {
  const first = addMonths(lastMonth, -(count - 1));
  const entries = await listEntriesBetween(ctx, first, lastMonth, view);
  const months = Array.from({ length: count }, (_, i) => addMonths(first, i));
  return monthlySeries(entries, months);
}

export async function membersComparison(ctx: MemberCtx, month: MonthStart, mode: "valores" | "percentuais") {
  const [entries, members] = await Promise.all([
    listEntriesForMonth(ctx, month, "familia"),
    withUser(ctx.userId, (db) =>
      db.query<{ id: string; name: string }>(
        "select m.user_id as id, p.display_name as name from public.fam_household_members m join public.fam_profiles p on p.id = m.user_id where m.household_id = $1 order by m.role desc, p.display_name",
        [ctx.householdId],
      ),
    ),
  ]);
  const result = compareMembers(entries, members, mode);
  // por categoria, por membro (somente compartilhados)
  const cats = new Map<string, Map<string, number>>();
  for (const e of entries) {
    if (e.visibility !== "compartilhado" || !countsInReports(e) || expenseValue(e) === 0) continue;
    const c = e.category_name ?? "Sem categoria";
    if (!cats.has(c)) cats.set(c, new Map());
    cats.get(c)!.set(e.owner_id, (cats.get(c)!.get(e.owner_id) ?? 0) + expenseValue(e));
  }
  return { ...result, byCategory: [...cats.entries()].map(([name, m]) => ({ name, perMember: Object.fromEntries(m) })) };
}
