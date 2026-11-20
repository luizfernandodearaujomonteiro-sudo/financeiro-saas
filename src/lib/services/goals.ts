import { z } from "zod";
import { withUser } from "../db";
import { currentMonthStart, normalizeMonthParam } from "../domain/dates";
import { goalProgress, type GoalProgress } from "../domain/goals";
import { moneyInput, optionalText, optionalUuid, visibility } from "../validation";
import type { MemberCtx } from "./types";

export interface GoalRow {
  id: string;
  owner_id: string;
  owner_name: string;
  visibility: "pessoal" | "compartilhado";
  name: string;
  kind: string;
  monthly_target_cents: number;
  total_target_cents: number | null;
  start_month: string;
  end_month: string | null;
  active: boolean;
}

export interface GoalWithProgress extends GoalRow {
  progress: GoalProgress;
  contributions: { id: string; month: string; amount_cents: number; note: string | null; owner_name: string; created_at: string }[];
}

const monthField = z.string().transform((v, ctx) => {
  const m = normalizeMonthParam(v);
  if (!m) {
    ctx.addIssue({ code: "custom", message: "Mês inválido" });
    return z.NEVER;
  }
  return m;
});

export const goalInput = z.object({
  name: z.string().trim().min(1).max(80),
  kind: z.enum(["poupanca", "investimento", "quitar_divida", "outro"]).default("poupanca"),
  monthlyTargetCents: moneyInput,
  totalTargetCents: z.preprocess((v) => (v === "" || v === undefined || v === null ? undefined : v), moneyInput.optional()),
  startMonth: monthField,
  visibility: visibility.default("compartilhado"),
});

export async function listGoals(ctx: MemberCtx, current = currentMonthStart()): Promise<GoalWithProgress[]> {
  return withUser(ctx.userId, async (db) => {
    const goals = await db.query<GoalRow>(
      `select g.*, p.display_name as owner_name from public.fam_goals g join public.fam_profiles p on p.id = g.owner_id
        where g.household_id = $1 order by g.active desc, g.created_at`,
      [ctx.householdId],
    );
    const contribs = goals.length
      ? await db.query<{ id: string; goal_id: string; month: string; amount_cents: number; note: string | null; owner_name: string; created_at: string }>(
          `select c.id, c.goal_id, c.month, c.amount_cents, c.note, p.display_name as owner_name, c.created_at
             from public.fam_goal_contributions c join public.fam_profiles p on p.id = c.owner_id
            where c.goal_id = any($1::uuid[]) order by c.month desc, c.created_at desc`,
          [goals.map((g) => g.id)],
        )
      : [];
    return goals.map((g) => {
      const mine = contribs.filter((c) => c.goal_id === g.id);
      return {
        ...g,
        contributions: mine,
        progress: goalProgress(
          { monthlyTargetCents: g.monthly_target_cents, totalTargetCents: g.total_target_cents, startMonth: g.start_month, endMonth: g.end_month },
          mine.map((c) => ({ month: c.month, amountCents: c.amount_cents })),
          current,
        ),
      };
    });
  });
}

export async function createGoal(ctx: MemberCtx, raw: unknown) {
  const v = goalInput.parse(raw);
  return withUser(ctx.userId, (db) =>
    db.one<{ id: string }>(
      `insert into public.fam_goals (household_id, owner_id, visibility, name, kind, monthly_target_cents, total_target_cents, start_month)
       values ($1, auth.uid(), $2, $3, $4, $5, $6, $7) returning id`,
      [ctx.householdId, v.visibility, v.name, v.kind, v.monthlyTargetCents, v.totalTargetCents ?? null, v.startMonth],
    ),
  );
}

export const contributionInput = z.object({
  goalId: z.string().uuid(),
  amountCents: moneyInput,
  month: monthField,
  withdrawal: z.preprocess((v) => v === "on" || v === true || v === "true", z.boolean()).default(false),
  entryId: optionalUuid,
  note: optionalText(200),
});

export async function addContribution(ctx: MemberCtx, raw: unknown) {
  const v = contributionInput.parse(raw);
  return withUser(ctx.userId, (db) =>
    db.one<{ id: string }>(
      `insert into public.fam_goal_contributions (household_id, goal_id, owner_id, month, amount_cents, entry_id, note)
       values ($1, $2, auth.uid(), $3, $4, $5, $6) returning id`,
      [ctx.householdId, v.goalId, v.month, v.withdrawal ? -v.amountCents : v.amountCents, v.entryId ?? null, v.note ?? null],
    ),
  );
}

export async function deleteGoal(ctx: MemberCtx, id: string) {
  await withUser(ctx.userId, (db) => db.query("delete from public.fam_goals where id = $1 and owner_id = auth.uid()", [id]));
}
