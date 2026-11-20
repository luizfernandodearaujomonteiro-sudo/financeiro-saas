import { CalendarClock, Flame, PiggyBank, Plus, Target, Trash2, TrendingUp } from "lucide-react";
import { requireCtx } from "@/lib/auth/member";
import { currentMonthStart, monthLabel } from "@/lib/domain/dates";
import { formatBRL, formatBp } from "@/lib/domain/money";
import { listGoals, type GoalWithProgress } from "@/lib/services/goals";
import { ActionForm, Disclosure, SubmitButton } from "@/components/ui/client";
import { Badge, Card, CardTitle, EmptyState, Field, Input, Money, PageHeader, Select, VisibilityBadge } from "@/components/ui/primitives";
import { AnimatedMoney, FadeIn, ProgressBar, Stagger, StaggerItem } from "@/components/ui/motion";
import { addContributionAction, createGoalAction, deleteGoalAction } from "./actions";

export const metadata = { title: "Metas" };
export const dynamic = "force-dynamic";

const KIND_LABEL: Record<string, string> = { poupanca: "Poupança", investimento: "Investimento", quitar_divida: "Quitar dívida", outro: "Outro" };

function MiniHistory({ goal }: { goal: GoalWithProgress }) {
  const months = goal.progress.months.slice(-12);
  if (!months.length) return null;
  const max = Math.max(goal.monthly_target_cents, ...months.map((m) => m.contributedCents));
  return (
    <div className="mt-4">
      <p className="mb-2 text-[11px] text-ink-3">Histórico mensal (linha = meta)</p>
      <div className="relative flex h-16 items-end gap-1" role="img" aria-label={months.map((m) => `${monthLabel(m.month, true)}: ${formatBRL(m.contributedCents)}`).join("; ")}>
        <div aria-hidden className="absolute inset-x-0 border-t border-dashed border-line-strong" style={{ bottom: `${(goal.monthly_target_cents / max) * 100}%` }} />
        {months.map((m) => (
          <div key={m.month} className="flex flex-1 flex-col items-center gap-1" title={`${monthLabel(m.month)}: ${formatBRL(m.contributedCents)}`}>
            <div
              className={`w-full max-w-6 rounded-t-[4px] ${m.met ? "bg-good" : "bg-s1"}`}
              style={{ height: `${Math.max(2, (Math.max(0, m.contributedCents) / max) * 56)}px` }}
            />
          </div>
        ))}
      </div>
      <div className="mt-1 flex gap-1">
        {months.map((m) => (
          <span key={m.month} className="flex-1 truncate text-center text-[9px] text-ink-3">{monthLabel(m.month, true).split("/")[0]}</span>
        ))}
      </div>
    </div>
  );
}

function GoalCard({ goal, userId, current }: { goal: GoalWithProgress; userId: string; current: string }) {
  const p = goal.progress;
  const thisMonth = p.currentMonth?.contributedCents ?? 0;
  const mine = goal.owner_id === userId;
  return (
    <Card gradient lift className="flex h-full flex-col">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <VisibilityBadge v={goal.visibility} />
            <Badge>{KIND_LABEL[goal.kind] ?? goal.kind}</Badge>
            {p.onTrack ? <Badge tone="good">✓ No ritmo</Badge> : <Badge tone="warn">⚠ Abaixo do ritmo</Badge>}
          </div>
          <h3 className="mt-2 truncate text-lg font-semibold">{goal.name}</h3>
          <p className="text-xs text-ink-3">
            {formatBRL(goal.monthly_target_cents)}/mês · desde {monthLabel(goal.start_month)} · por {goal.owner_name}
          </p>
        </div>
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-brand/15 ring-1 ring-brand/30">
          {goal.kind === "investimento" ? <TrendingUp aria-hidden className="h-5 w-5 text-brand" /> : <PiggyBank aria-hidden className="h-5 w-5 text-brand" />}
        </span>
      </div>

      <div className="mt-5">
        <div className="mb-1.5 flex items-baseline justify-between text-sm">
          <span className="text-ink-2">Este mês</span>
          <span className="num">
            <b>{formatBRL(thisMonth)}</b> <span className="text-ink-3">de {formatBRL(goal.monthly_target_cents)}</span>
          </span>
        </div>
        <ProgressBar bp={p.currentBarBp} label={`Progresso de ${goal.name} neste mês`} tone={p.currentBarBp >= 10000 ? "good" : "brand"} />
      </div>

      {goal.total_target_cents !== null && (
        <div className="mt-4">
          <div className="mb-1.5 flex items-baseline justify-between text-sm">
            <span className="text-ink-2">Total</span>
            <span className="num">
              <b>{formatBRL(p.totalContributedCents)}</b> <span className="text-ink-3">de {formatBRL(goal.total_target_cents)} · {formatBp(p.totalPctBp)}</span>
            </span>
          </div>
          <ProgressBar bp={p.totalPctBp ?? 0} label={`Progresso total de ${goal.name}`} tone="good" />
        </div>
      )}

      <dl className="mt-4 grid grid-cols-3 gap-2 text-center">
        <div className="rounded-xl bg-surface-2 p-2 ring-1 ring-line">
          <dt className="flex items-center justify-center gap-1 text-[10px] text-ink-3"><Flame aria-hidden className="h-3 w-3" /> Sequência</dt>
          <dd className="num text-sm font-semibold">{p.streak} {p.streak === 1 ? "mês" : "meses"}</dd>
        </div>
        <div className="rounded-xl bg-surface-2 p-2 ring-1 ring-line">
          <dt className="text-[10px] text-ink-3">Acumulado</dt>
          <dd className="num text-sm font-semibold">{formatBRL(p.totalContributedCents)}</dd>
        </div>
        <div className="rounded-xl bg-surface-2 p-2 ring-1 ring-line">
          <dt className="flex items-center justify-center gap-1 text-[10px] text-ink-3"><CalendarClock aria-hidden className="h-3 w-3" /> Previsão</dt>
          <dd className="text-sm font-semibold">{p.projectedCompletion ? monthLabel(p.projectedCompletion, true) : "—"}</dd>
        </div>
      </dl>

      <MiniHistory goal={goal} />

      <div className="mt-5 space-y-4 border-t border-line pt-4">
        <Disclosure summary={<span className="flex items-center gap-2 text-sm font-medium"><Plus aria-hidden className="h-4 w-4 text-brand" /> Registrar aporte</span>}>
          <ActionForm action={addContributionAction} resetOnSuccess className="grid gap-3 sm:grid-cols-2">
            <input type="hidden" name="goalId" value={goal.id} />
            <Field label="Valor (R$)"><Input name="amountCents" inputMode="decimal" placeholder="500,00" required /></Field>
            <Field label="Mês"><Input name="month" type="month" defaultValue={current.slice(0, 7)} required /></Field>
            <Field label="Observação" className="sm:col-span-2"><Input name="note" maxLength={200} placeholder="opcional" /></Field>
            <label className="flex items-center gap-2 text-sm text-ink-2 sm:col-span-2">
              <input type="checkbox" name="withdrawal" className="h-4 w-4 accent-[var(--brand)]" /> É uma retirada
            </label>
            <div className="sm:col-span-2"><SubmitButton>Salvar aporte</SubmitButton></div>
          </ActionForm>
        </Disclosure>
        {goal.contributions.length > 0 && (
          <Disclosure summary={<span className="text-sm font-medium">Aportes ({goal.contributions.length})</span>}>
            <ul className="max-h-56 space-y-1.5 overflow-y-auto pr-1">
              {goal.contributions.map((c) => (
                <li key={c.id} className="flex items-center justify-between gap-2 rounded-lg bg-surface-2 px-3 py-2 text-xs">
                  <span className="min-w-0">
                    <span className="block text-ink-2">{monthLabel(c.month)} · {c.owner_name}</span>
                    {c.note && <span className="block truncate text-ink-3">{c.note}</span>}
                  </span>
                  <Money cents={c.amount_cents} sign className={c.amount_cents < 0 ? "text-bad" : "text-good"} />
                </li>
              ))}
            </ul>
          </Disclosure>
        )}
        {mine && (
          <ActionForm action={deleteGoalAction}>
            <input type="hidden" name="id" value={goal.id} />
            <SubmitButton variant="ghost" pendingText="Excluindo…" className="h-8 px-2 text-xs text-ink-3 hover:text-bad">
              <Trash2 aria-hidden className="h-3.5 w-3.5" /> Excluir meta
            </SubmitButton>
          </ActionForm>
        )}
      </div>
    </Card>
  );
}

export default async function MetasPage() {
  const { member } = await requireCtx();
  const ctx = { userId: member.userId, householdId: member.householdId };
  const current = currentMonthStart();
  const goals = await listGoals(ctx, current);
  const active = goals.filter((g) => g.active);
  const monthTotal = active.reduce((a, g) => a + (g.progress.currentMonth?.contributedCents ?? 0), 0);
  const monthTarget = active.reduce((a, g) => a + g.monthly_target_cents, 0);
  const saved = goals.reduce((a, g) => a + g.progress.totalContributedCents, 0);

  return (
    <div className="space-y-6">
      <PageHeader icon={Target} title="Metas" subtitle="Guarde dinheiro todo mês, juntos ou individualmente." />

      <Stagger className="grid gap-4 sm:grid-cols-3">
        <StaggerItem>
          <Card lift>
            <p className="text-xs text-ink-3">Aportado em {monthLabel(current)}</p>
            <AnimatedMoney cents={monthTotal} className="mt-1 block text-2xl font-bold" />
            <p className="mt-1 text-xs text-ink-3">meta somada: {formatBRL(monthTarget)}</p>
          </Card>
        </StaggerItem>
        <StaggerItem>
          <Card lift>
            <p className="text-xs text-ink-3">Total guardado nas metas</p>
            <AnimatedMoney cents={saved} className="mt-1 block text-2xl font-bold" />
            <p className="mt-1 text-xs text-ink-3">{goals.length} meta(s) visíveis para você</p>
          </Card>
        </StaggerItem>
        <StaggerItem>
          <Card lift>
            <p className="text-xs text-ink-3">No ritmo</p>
            <p className="num mt-1 text-2xl font-bold">{active.filter((g) => g.progress.onTrack).length}/{active.length}</p>
            <p className="mt-1 text-xs text-ink-3">metas ativas em dia</p>
          </Card>
        </StaggerItem>
      </Stagger>

      {goals.length === 0 ? (
        <Card>
          <EmptyState icon={Target} title="Nenhuma meta ainda">
            Crie uma meta como “guardar R$ 1.000 por mês para investimentos”. Metas compartilhadas aparecem para a família; pessoais, só para você.
          </EmptyState>
        </Card>
      ) : (
        <Stagger className="grid gap-4 lg:grid-cols-2">
          {goals.map((g) => (
            <StaggerItem key={g.id}>
              <GoalCard goal={g} userId={member.userId} current={current} />
            </StaggerItem>
          ))}
        </Stagger>
      )}

      <FadeIn>
        <Card>
          <CardTitle icon={Plus}>Nova meta</CardTitle>
          <ActionForm action={createGoalAction} resetOnSuccess className="grid gap-3 md:grid-cols-3">
            <Field label="Nome" className="md:col-span-2"><Input name="name" required maxLength={80} placeholder="Reserva de emergência" /></Field>
            <Field label="Tipo">
              <Select name="kind" defaultValue="poupanca">
                <option value="poupanca">Poupança</option>
                <option value="investimento">Investimento</option>
                <option value="quitar_divida">Quitar dívida</option>
                <option value="outro">Outro</option>
              </Select>
            </Field>
            <Field label="Meta mensal (R$)"><Input name="monthlyTargetCents" inputMode="decimal" required placeholder="1.000,00" /></Field>
            <Field label="Meta total (R$)" hint="Opcional"><Input name="totalTargetCents" inputMode="decimal" placeholder="30.000,00" /></Field>
            <Field label="Começa em"><Input name="startMonth" type="month" defaultValue={current.slice(0, 7)} required /></Field>
            <Field label="Visibilidade">
              <Select name="visibility" defaultValue="compartilhado">
                <option value="compartilhado">🏠 Compartilhada com a família</option>
                <option value="pessoal">🔒 Pessoal (só eu)</option>
              </Select>
            </Field>
            <div className="flex items-end md:col-span-2"><SubmitButton>Criar meta</SubmitButton></div>
          </ActionForm>
        </Card>
      </FadeIn>
    </div>
  );
}
