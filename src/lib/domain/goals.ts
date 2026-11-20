/** Progresso de metas mensais (ex.: guardar R$ X por mês para investimentos). */
import { addMonths, type MonthStart } from "./dates";
import { basisPoints, type Cents } from "./money";

export interface GoalDef {
  monthlyTargetCents: Cents;
  totalTargetCents: Cents | null;
  startMonth: MonthStart;
  endMonth: MonthStart | null;
}

export interface Contribution {
  month: MonthStart;
  amountCents: Cents;
}

export interface GoalMonth {
  month: MonthStart;
  targetCents: Cents;
  contributedCents: Cents;
  pctBp: number; // pode passar de 10000
  met: boolean;
}

export interface GoalProgress {
  months: GoalMonth[];
  totalContributedCents: Cents;
  expectedToDateCents: Cents;
  currentMonth: GoalMonth | null;
  /** Para a barra animada (0..10000). */
  currentBarBp: number;
  totalPctBp: number | null;
  onTrack: boolean;
  streak: number;
  remainingToTotalCents: Cents | null;
  /** Mês estimado para atingir o total mantendo a meta mensal. */
  projectedCompletion: MonthStart | null;
}

export function monthsBetween(start: MonthStart, end: MonthStart): MonthStart[] {
  const out: MonthStart[] = [];
  for (let m = start; m <= end && out.length < 600; m = addMonths(m, 1)) out.push(m);
  return out;
}

export function goalProgress(goal: GoalDef, contributions: readonly Contribution[], currentMonth: MonthStart): GoalProgress {
  const last = goal.endMonth && goal.endMonth < currentMonth ? goal.endMonth : currentMonth;
  const months = goal.startMonth <= last ? monthsBetween(goal.startMonth, last) : [];
  const byMonth = new Map<string, Cents>();
  let total = 0;
  for (const c of contributions) {
    total += c.amountCents;
    byMonth.set(c.month, (byMonth.get(c.month) ?? 0) + c.amountCents);
  }
  const rows: GoalMonth[] = months.map((month) => {
    const contributed = byMonth.get(month) ?? 0;
    const pct = basisPoints(contributed, goal.monthlyTargetCents) ?? 0;
    return { month, targetCents: goal.monthlyTargetCents, contributedCents: contributed, pctBp: pct, met: contributed >= goal.monthlyTargetCents };
  });
  const expected = goal.monthlyTargetCents * rows.length;
  const current = rows.find((r) => r.month === currentMonth) ?? null;
  let streak = 0;
  for (let i = rows.length - 1; i >= 0; i--) {
    const r = rows[i]!;
    if (r.met) streak++;
    else if (r.month === currentMonth) continue; // mês corrente ainda em andamento
    else break;
  }
  const remaining = goal.totalTargetCents === null ? null : Math.max(goal.totalTargetCents - total, 0);
  let projected: MonthStart | null = null;
  if (remaining !== null) {
    projected = remaining === 0 ? currentMonth : addMonths(currentMonth, Math.ceil(remaining / goal.monthlyTargetCents));
  }
  return {
    months: rows,
    totalContributedCents: total,
    expectedToDateCents: expected,
    currentMonth: current,
    currentBarBp: Math.max(0, Math.min(10000, current?.pctBp ?? 0)),
    totalPctBp: goal.totalTargetCents === null ? null : basisPoints(total, goal.totalTargetCents),
    onTrack: total >= expected - (current ? goal.monthlyTargetCents - Math.min(current.contributedCents, goal.monthlyTargetCents) : 0),
    streak,
    remainingToTotalCents: remaining,
    projectedCompletion: projected,
  };
}
