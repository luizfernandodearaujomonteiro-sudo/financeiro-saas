import { BarChart3, Info, PieChart, Scale, Users } from "lucide-react";
import { requireCtx } from "@/lib/auth/member";
import { currentMonthStart, monthLabel, normalizeMonthParam } from "@/lib/domain/dates";
import { formatBRL, formatBp } from "@/lib/domain/money";
import { getPrefs } from "@/lib/services/prefs";
import { membersComparison, monthReport, seriesReport } from "@/lib/services/reports";
import { parseView } from "@/lib/services/types";
import { CategoryBars, IncomeExpenseChart, ShareBar } from "@/components/charts/charts";
import { AnimatedMoney, FadeIn, ProgressBar } from "@/components/ui/motion";
import { Card, CardTitle, EmptyState, PageHeader } from "@/components/ui/primitives";
import { ModeToggle } from "./ModeToggle";
import { MonthViewSelector } from "./selectors";

export const metadata = { title: "Relatórios" };
export const dynamic = "force-dynamic";

export default async function RelatoriosPage({ searchParams }: { searchParams: Promise<{ mes?: string; visao?: string }> }) {
  const { member } = await requireCtx();
  const ctx = { userId: member.userId, householdId: member.householdId };
  const sp = await searchParams;
  const month = normalizeMonthParam(sp.mes) ?? currentMonthStart();
  const view = parseView(sp.visao);
  const prefs = await getPrefs(member.userId);
  const [report, series, comparison] = await Promise.all([
    monthReport(ctx, month, view),
    seriesReport(ctx, month, 12, view),
    membersComparison(ctx, month, prefs.comparison_mode),
  ]);
  const s = report.summary;
  const hidden = prefs.comparison_mode === "percentuais";
  const rows: { label: string; cents: number; strong?: boolean; sign: "+" | "-" | "=" }[] = [
    { label: "Receitas", cents: s.receitas, sign: "+" },
    { label: "Despesas variáveis", cents: s.variaveis, sign: "-" },
    { label: "Margem de contribuição", cents: s.margemContribuicao, strong: true, sign: "=" },
    { label: "Despesas fixas", cents: s.fixas, sign: "-" },
    { label: "Resultado do mês", cents: s.resultado, strong: true, sign: "=" },
  ];

  return (
    <div className="space-y-6">
      <PageHeader icon={BarChart3} title="Relatórios" subtitle="Resultado do mês, ponto de equilíbrio, categorias e comparativo." actions={<MonthViewSelector base="/relatorios" month={month} view={view} />} />

      <div className="grid gap-4 lg:grid-cols-3">
        <FadeIn className="lg:col-span-2">
          <Card gradient className="h-full">
            <CardTitle icon={Scale}>DRE simplificada — {monthLabel(month)}</CardTitle>
            <table className="w-full text-sm">
              <caption className="sr-only">Demonstração de resultado simplificada</caption>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.label} className={`border-b border-line last:border-0 ${r.strong ? "font-semibold" : ""}`}>
                    <th scope="row" className="py-2.5 text-left font-normal text-ink-2">
                      <span aria-hidden className="mr-2 inline-block w-4 text-center text-ink-3">({r.sign})</span>
                      <span className={r.strong ? "font-semibold text-ink" : ""}>{r.label}</span>
                    </th>
                    <td className={`num py-2.5 text-right ${r.label === "Resultado do mês" ? (r.cents >= 0 ? "text-good" : "text-bad") : ""}`}>
                      {formatBRL(r.cents)}
                      {r.label === "Margem de contribuição" && <span className="ml-2 text-xs font-normal text-ink-3">{formatBp(s.margemContribuicaoBp)}</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        </FadeIn>
        <FadeIn delay={0.05}>
          <Card className="h-full">
            <CardTitle icon={Info}>Ponto de equilíbrio</CardTitle>
            {s.pontoEquilibrio === null ? (
              <p className="text-sm text-ink-2">Não há margem positiva: as despesas variáveis consomem toda a receita, então não existe receita que cubra as fixas.</p>
            ) : (
              <>
                <AnimatedMoney cents={s.pontoEquilibrio} className="block text-3xl font-bold" />
                <p className="mt-1 text-xs text-ink-3">receita mínima para cobrir despesas fixas e variáveis no mês</p>
                <div className="mt-4">
                  <div className="mb-1.5 flex justify-between text-xs text-ink-2">
                    <span>Cobertura</span>
                    <span className="num">{formatBp(s.coberturaBp)}</span>
                  </div>
                  <ProgressBar bp={s.coberturaBp ?? 0} label="Receita em relação ao ponto de equilíbrio" tone={(s.coberturaBp ?? 0) >= 10000 ? "good" : "warn"} />
                  <p className="mt-2 text-xs text-ink-3">
                    {(s.coberturaBp ?? 0) >= 10000 ? `Acima do equilíbrio em ${formatBRL(s.receitas - s.pontoEquilibrio)}.` : `Faltam ${formatBRL(s.pontoEquilibrio - s.receitas)} de receita para empatar.`}
                  </p>
                </div>
              </>
            )}
            <div className="mt-5 rounded-xl bg-surface-2 p-3 ring-1 ring-line">
              <p className="text-xs text-ink-3">Taxa de poupança</p>
              <p className={`num text-xl font-semibold ${(s.taxaPoupancaBp ?? 0) >= 0 ? "text-good" : "text-bad"}`}>{formatBp(s.taxaPoupancaBp)}</p>
            </div>
          </Card>
        </FadeIn>
      </div>

      <div className="grid gap-4 lg:grid-cols-5">
        <FadeIn className="lg:col-span-3">
          <Card className="h-full">
            <CardTitle icon={BarChart3}>Últimos 12 meses</CardTitle>
            <IncomeExpenseChart data={series.map((p) => ({ label: monthLabel(p.month, true), receitas: p.receitas, despesas: p.despesas }))} />
          </Card>
        </FadeIn>
        <FadeIn delay={0.05} className="lg:col-span-2">
          <Card className="h-full">
            <CardTitle icon={PieChart}>Despesas por categoria</CardTitle>
            {report.categories.length ? <CategoryBars data={report.categories} max={10} /> : <EmptyState icon={PieChart} title="Sem despesas neste mês" />}
          </Card>
        </FadeIn>
      </div>

      <FadeIn>
        <Card gradient>
          <CardTitle icon={Users} action={<ModeToggle mode={prefs.comparison_mode} />}>Comparativo entre membros</CardTitle>
          <p className="mb-4 text-xs text-ink-3">
            Considera <b>somente despesas compartilhadas</b> de {monthLabel(month)}. Lançamentos pessoais nunca entram neste comparativo — nem os seus, nem os do outro membro.
          </p>
          <ShareBar members={comparison.members.map((m) => ({ name: m.name, shareBp: m.shareBp, totalCents: m.totalCents }))} />
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            {comparison.members.map((m) => (
              <div key={m.memberId} className="rounded-xl bg-surface-2 p-3 ring-1 ring-line">
                <p className="text-xs text-ink-3">{m.name}</p>
                <p className="num text-lg font-semibold">{hidden ? formatBp(m.shareBp) : formatBRL(m.totalCents ?? 0)}</p>
                <p className="text-xs text-ink-3">{hidden ? "da despesa compartilhada" : `${formatBp(m.shareBp)} · ${m.count} lançamento(s)`}</p>
              </div>
            ))}
          </div>
          {comparison.byCategory.length > 0 && (
            <div className="mt-5 overflow-x-auto">
              <table className="w-full min-w-[420px] text-sm">
                <caption className="sr-only">Despesas compartilhadas por categoria e membro</caption>
                <thead>
                  <tr className="border-b border-line text-left text-xs text-ink-3">
                    <th scope="col" className="py-2 font-medium">Categoria</th>
                    {comparison.members.map((m) => <th key={m.memberId} scope="col" className="py-2 text-right font-medium">{m.name}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {comparison.byCategory.map((c) => {
                    const total = Object.values(c.perMember).reduce((a, b) => a + b, 0);
                    return (
                      <tr key={c.name} className="border-b border-line last:border-0">
                        <th scope="row" className="py-2 text-left font-normal text-ink-2">{c.name}</th>
                        {comparison.members.map((m) => {
                          const v = c.perMember[m.memberId] ?? 0;
                          return (
                            <td key={m.memberId} className="num py-2 text-right">
                              {hidden ? (total ? `${Math.round((v / total) * 100)}%` : "—") : formatBRL(v)}
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </FadeIn>
    </div>
  );
}
