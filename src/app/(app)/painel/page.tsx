import Link from "next/link";
import { ArrowDownRight, ArrowUpRight, CalendarClock, CreditCard, Inbox, LayoutDashboard, PiggyBank, Scale, Target, Wallet } from "lucide-react";
import { requireCtx } from "@/lib/auth/member";
import { capitalizeFirst, currentMonthStart, diffDays, formatDateBR, monthLabel, normalizeMonthParam, todayISO } from "@/lib/domain/dates";
import { formatBp } from "@/lib/domain/money";
import { listBills } from "@/lib/services/bills";
import { currentInvoices } from "@/lib/services/cards";
import { listGoals } from "@/lib/services/goals";
import { listReview } from "@/lib/services/review";
import { monthReport, seriesReport } from "@/lib/services/reports";
import { parseView } from "@/lib/services/types";
import { CategoryBars, IncomeExpenseChart } from "@/components/charts/charts";
import { MonthNav, ViewSwitcher } from "@/components/layout/ViewSwitcher";
import { AnimatedMoney, FadeIn, ProgressBar, Stagger, StaggerItem } from "@/components/ui/motion";
import { Badge, Card, CardTitle, EmptyState, Money, PageHeader, VisibilityBadge } from "@/components/ui/primitives";

export const dynamic = "force-dynamic";
export const metadata = { title: "Painel" };

export default async function Painel({ searchParams }: { searchParams: Promise<{ visao?: string; mes?: string }> }) {
  const sp = await searchParams;
  const { member } = await requireCtx();
  const ctx = { userId: member.userId, householdId: member.householdId };
  const view = parseView(sp.visao);
  const month = normalizeMonthParam(sp.mes) ?? currentMonthStart();
  const today = todayISO();
  const [report, series, bills, invoices, goals, review] = await Promise.all([
    monthReport(ctx, month, view),
    seriesReport(ctx, month, 6, view),
    listBills(ctx, { status: "pendente" }),
    currentInvoices(ctx, today),
    listGoals(ctx),
    listReview(ctx),
  ]);
  const s = report.summary;
  const upcoming = bills.filter((b) => diffDays(today, b.due_date) <= 10).slice(0, 5);
  const tiles = [
    { label: "Receitas", cents: s.receitas, icon: ArrowUpRight, tone: "text-good" },
    { label: "Despesas", cents: s.despesas, icon: ArrowDownRight, tone: "text-bad" },
    { label: "Despesas fixas", cents: s.fixas, icon: Wallet, tone: "text-ink-2" },
    { label: "Ponto de equilíbrio", cents: s.pontoEquilibrio ?? 0, icon: Scale, tone: "text-brand-2", na: s.pontoEquilibrio === null },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title={`Olá, ${member.displayName}`}
        subtitle={`${capitalizeFirst(monthLabel(month))} · ${member.householdName}`}
        icon={LayoutDashboard}
        actions={<><ViewSwitcher base="/painel" view={view} month={month} /><MonthNav base="/painel" view={view} month={month} /></>}
      />

      <div className="grid gap-4 lg:grid-cols-3">
        <FadeIn className="lg:col-span-1">
          <Card gradient className="h-full overflow-hidden">
            <p className="text-sm text-ink-3">Resultado do mês</p>
            <AnimatedMoney cents={s.resultado} className={`mt-2 block text-4xl font-black tracking-tight ${s.resultado >= 0 ? "text-ink" : "text-bad"}`} />
            <div className="mt-3 flex flex-wrap gap-2">
              <Badge tone={s.resultado >= 0 ? "good" : "bad"}>{s.resultado >= 0 ? "▲ No azul" : "▼ No vermelho"}</Badge>
              <Badge tone="brand">Poupança {formatBp(s.taxaPoupancaBp)}</Badge>
            </div>
            <div className="mt-5">
              <div className="mb-1 flex justify-between text-xs text-ink-3"><span>Cobertura do ponto de equilíbrio</span><span>{formatBp(s.coberturaBp, 0)}</span></div>
              <ProgressBar bp={s.coberturaBp ?? 0} label="Cobertura do ponto de equilíbrio" tone={(s.coberturaBp ?? 0) >= 10000 ? "good" : "warn"} />
            </div>
            <svg aria-hidden viewBox="0 0 200 60" className="pointer-events-none absolute -right-6 -bottom-4 w-48 opacity-30">
              <path d="M0 50 C 40 45, 60 20, 100 28 S 160 5, 200 8" fill="none" stroke="var(--brand-2)" strokeWidth="3" />
            </svg>
          </Card>
        </FadeIn>
        <Stagger className="grid grid-cols-2 gap-4 lg:col-span-2">
          {tiles.map((t) => (
            <StaggerItem key={t.label}>
              <Card lift className="h-full">
                <div className="flex items-center justify-between">
                  <p className="text-xs text-ink-3">{t.label}</p>
                  <t.icon aria-hidden className={`h-4 w-4 ${t.tone}`} />
                </div>
                {t.na ? <p className="mt-2 text-sm text-ink-3">Sem margem positiva</p> : <AnimatedMoney cents={t.cents} className="mt-2 block text-lg font-bold whitespace-nowrap sm:text-2xl" />}
              </Card>
            </StaggerItem>
          ))}
        </Stagger>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardTitle icon={ArrowUpRight}>Receitas x despesas — 6 meses</CardTitle>
          <IncomeExpenseChart data={series.map((p) => ({ label: monthLabel(p.month, true), receitas: p.receitas, despesas: p.despesas }))} />
        </Card>
        <Card>
          <CardTitle icon={PiggyBank}>Despesas por categoria</CardTitle>
          {report.categories.length ? <CategoryBars data={report.categories} max={7} /> : <EmptyState icon={PiggyBank} title="Sem despesas no mês" />}
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card>
          <CardTitle icon={CalendarClock} action={<Link className="text-xs text-brand hover:underline" href="/contas">ver todas</Link>}>Próximas contas</CardTitle>
          {upcoming.length ? (
            <ul className="space-y-2">
              {upcoming.map((b) => {
                const d = diffDays(today, b.due_date);
                return (
                  <li key={b.id} className="flex items-center justify-between gap-3 rounded-xl bg-surface-2 px-3 py-2 ring-1 ring-line">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{b.description}</p>
                      <p className="text-[11px] text-ink-3">{formatDateBR(b.due_date)} · <VisibilityBadge v={b.visibility} /></p>
                    </div>
                    <div className="text-right">
                      <Money cents={b.amount_cents} className="text-sm font-semibold" />
                      <p><Badge tone={d < 0 ? "bad" : d <= 2 ? "warn" : "neutral"}>{d < 0 ? "vencida" : d === 0 ? "hoje" : d === 1 ? "amanhã" : `em ${d} dias`}</Badge></p>
                    </div>
                  </li>
                );
              })}
            </ul>
          ) : (
            <EmptyState icon={CalendarClock} title="Nada vencendo nos próximos dias" />
          )}
        </Card>
        <Card>
          <CardTitle icon={CreditCard} action={<Link className="text-xs text-brand hover:underline" href="/cartoes">cartões</Link>}>Faturas atuais</CardTitle>
          {invoices.length ? (
            <ul className="space-y-3">
              {invoices.map(({ card, invoice, slot }) => (
                <li key={card.id}>
                  <div className="flex items-center justify-between text-sm">
                    <span className="font-medium">{card.nickname} <span className="text-ink-3">•••• {card.last4}</span></span>
                    <Money cents={invoice?.total_cents ?? 0} className="font-semibold" />
                  </div>
                  <p className="mb-1.5 text-[11px] text-ink-3">fecha {formatDateBR(slot.closingDate)} · vence {formatDateBR(slot.dueDate)}</p>
                  {card.limit_cents > 0 && <ProgressBar bp={Math.round(((invoice?.total_cents ?? 0) * 10000) / card.limit_cents)} label={`Uso do limite ${card.nickname}`} />}
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState icon={CreditCard} title="Nenhum cartão" />
          )}
        </Card>
        <Card>
          <CardTitle icon={Target} action={<Link className="text-xs text-brand hover:underline" href="/metas">metas</Link>}>Metas do mês</CardTitle>
          {goals.filter((g) => g.active).slice(0, 3).map((g) => (
            <div key={g.id} className="mb-4 last:mb-0">
              <div className="mb-1 flex justify-between text-sm"><span className="font-medium">{g.name}</span><span className="text-ink-3">{formatBp(g.progress.currentMonth?.pctBp ?? 0, 0)}</span></div>
              <ProgressBar bp={g.progress.currentBarBp} label={`Progresso de ${g.name}`} tone={g.progress.currentBarBp >= 10000 ? "good" : "brand"} />
            </div>
          ))}
          {goals.length === 0 && <EmptyState icon={Target} title="Crie sua primeira meta" />}
          {review.length > 0 && (
            <Link href="/revisao" className="mt-4 flex items-center gap-2 rounded-xl bg-brand/10 px-3 py-2 text-sm text-brand ring-1 ring-brand/30 hover:bg-brand/15">
              <Inbox aria-hidden className="h-4 w-4" /> {review.length} item(ns) de fatura aguardando revisão
            </Link>
          )}
        </Card>
      </div>

      <Card>
        <CardTitle icon={Wallet} action={<Link className="text-xs text-brand hover:underline" href={`/lancamentos?visao=${view}&mes=${month.slice(0, 7)}`}>ver lançamentos</Link>}>Últimos lançamentos</CardTitle>
        <Stagger className="divide-y divide-[var(--border)]">
          {report.entries.slice(0, 6).map((e) => (
            <StaggerItem key={e.id} className="flex items-center justify-between gap-3 py-2.5">
              <div className="flex min-w-0 items-center gap-3">
                <span aria-hidden className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: e.category_color ?? "var(--text-3)" }} />
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{e.description}</p>
                  <p className="text-[11px] text-ink-3">{formatDateBR(e.occurred_on)} · {e.category_name ?? "Sem categoria"} · {e.owner_name}</p>
                </div>
              </div>
              <Money cents={e.kind === "receita" ? e.amount_cents : -e.amount_cents} className={`text-sm font-semibold ${e.kind === "receita" ? "text-good" : ""}`} sign />
            </StaggerItem>
          ))}
        </Stagger>
        {report.entries.length === 0 && <EmptyState icon={Wallet} title="Nenhum lançamento neste mês" />}
      </Card>
    </div>
  );
}
