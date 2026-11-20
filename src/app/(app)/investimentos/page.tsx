import { ArrowDownRight, ArrowUpRight, Link2, PieChart, TrendingUp, Unlink } from "lucide-react";
import { requireCtx } from "@/lib/auth/member";
import { formatBRL } from "@/lib/domain/money";
import { investLinkStatus, listPositions, type PositionView } from "@/lib/services/invest";
import { CategoryBars } from "@/components/charts/charts";
import { ActionForm, SubmitButton } from "@/components/ui/client";
import { AnimatedMoney, FadeIn, Stagger, StaggerItem } from "@/components/ui/motion";
import { Badge, Card, CardTitle, EmptyState, Field, Money, PageHeader, Select, VisibilityBadge } from "@/components/ui/primitives";
import { linkInvestAction, setInvestVisibilityAction, unlinkInvestAction } from "./actions";

export const metadata = { title: "Investimentos" };
export const dynamic = "force-dynamic";

const TYPE_LABEL: Record<string, string> = {
  br_stock: "Ações BR", br_fii: "FIIs", br_bdr: "BDRs", br_etf: "ETFs BR", us_stock: "Ações EUA", us_etf: "ETFs EUA", crypto: "Cripto", fixed_income: "Renda fixa",
};

function Pnl({ cents }: { cents: number | null }) {
  if (cents === null) return <span className="text-ink-3">—</span>;
  const up = cents >= 0;
  return (
    <Badge tone={up ? "good" : "bad"}>
      {up ? <ArrowUpRight aria-hidden className="h-3 w-3" /> : <ArrowDownRight aria-hidden className="h-3 w-3" />}
      <span className="num">{up ? "+" : ""}{formatBRL(cents)}</span>
    </Badge>
  );
}

function qty(n: number) {
  return n.toLocaleString("pt-BR", { maximumFractionDigits: 8 });
}

export default async function InvestimentosPage() {
  const { member } = await requireCtx();
  const ctx = { userId: member.userId, householdId: member.householdId };
  const [link, positions] = await Promise.all([investLinkStatus(ctx), listPositions(ctx)]);
  const groups = new Map<string, { name: string; items: PositionView[] }>();
  for (const p of positions) {
    if (!groups.has(p.ownerId)) groups.set(p.ownerId, { name: p.ownerName, items: [] });
    groups.get(p.ownerId)!.items.push(p);
  }
  const value = (p: PositionView) => p.marketValueCents ?? p.costCents;
  const totalValue = positions.reduce((a, p) => a + value(p), 0);
  const totalCost = positions.reduce((a, p) => a + p.costCents, 0);
  const totalDiv = positions.reduce((a, p) => a + p.dividendsCents, 0);
  const alloc = new Map<string, number>();
  for (const p of positions) alloc.set(TYPE_LABEL[p.assetType] ?? p.assetType, (alloc.get(TYPE_LABEL[p.assetType] ?? p.assetType) ?? 0) + value(p));

  return (
    <div className="space-y-6">
      <PageHeader icon={TrendingUp} title="Investimentos" subtitle="Leitura (somente leitura) da carteira do invest-tracker, com o mesmo login." />

      <FadeIn>
        <Card gradient>
          <CardTitle icon={Link2}>Vínculo com o invest-tracker</CardTitle>
          {!link ? (
            <div className="grid gap-4 md:grid-cols-2">
              <p className="text-sm text-ink-2">
                Este painel lê as tabelas existentes do invest-tracker (<code className="code-box text-xs">invest_*</code>) sem alterá-las. Como o login é compartilhado entre os apps, você vincula a <b>sua própria</b> carteira e escolhe se a família pode vê-la.
              </p>
              <ActionForm action={linkInvestAction} className="flex flex-wrap items-end gap-3">
                <Field label="Quem pode ver" className="min-w-52 flex-1">
                  <Select name="visibility" defaultValue="pessoal">
                    <option value="pessoal">🔒 Só eu</option>
                    <option value="compartilhado">🏠 Família</option>
                  </Select>
                </Field>
                <SubmitButton>Vincular minha carteira</SubmitButton>
              </ActionForm>
            </div>
          ) : (
            <div className="flex flex-wrap items-end justify-between gap-4">
              <p className="flex items-center gap-2 text-sm text-ink-2">Sua carteira está vinculada: <VisibilityBadge v={link.visibility} /></p>
              <div className="flex flex-wrap items-end gap-2">
                <ActionForm action={setInvestVisibilityAction} className="flex items-end gap-2">
                  <input type="hidden" name="visibility" value={link.visibility === "pessoal" ? "compartilhado" : "pessoal"} />
                  <SubmitButton variant="secondary">{link.visibility === "pessoal" ? "Compartilhar com a família" : "Deixar só para mim"}</SubmitButton>
                </ActionForm>
                <ActionForm action={unlinkInvestAction}>
                  <SubmitButton variant="ghost" className="text-ink-3 hover:text-bad"><Unlink aria-hidden className="h-4 w-4" /> Desvincular</SubmitButton>
                </ActionForm>
              </div>
            </div>
          )}
        </Card>
      </FadeIn>

      {positions.length === 0 ? (
        <Card><EmptyState icon={TrendingUp} title="Nenhuma posição visível">Vincule sua carteira ou peça para o outro membro compartilhar a dele.</EmptyState></Card>
      ) : (
        <>
          <Stagger className="grid gap-4 sm:grid-cols-3">
            <StaggerItem><Card lift><p className="text-xs text-ink-3">Valor de mercado</p><AnimatedMoney cents={totalValue} className="mt-1 block text-2xl font-bold" /></Card></StaggerItem>
            <StaggerItem><Card lift><p className="text-xs text-ink-3">Custo (preço médio corrigido)</p><AnimatedMoney cents={totalCost} className="mt-1 block text-2xl font-bold" /><div className="mt-1"><Pnl cents={totalValue - totalCost} /></div></Card></StaggerItem>
            <StaggerItem><Card lift><p className="text-xs text-ink-3">Proventos</p><AnimatedMoney cents={totalDiv} className="mt-1 block text-2xl font-bold" /></Card></StaggerItem>
          </Stagger>

          <div className="grid gap-4 xl:grid-cols-3">
            <div className="space-y-4 xl:col-span-2">
              {[...groups.entries()].map(([ownerId, g]) => (
                <FadeIn key={ownerId}>
                  <Card>
                    <CardTitle icon={TrendingUp}>Carteira de {g.name}{ownerId === member.userId ? " (você)" : ""}</CardTitle>
                    <div className="overflow-x-auto">
                      <table className="w-full min-w-[820px] text-sm">
                        <caption className="sr-only">Posições de {g.name}</caption>
                        <thead>
                          <tr className="border-b border-line text-left text-xs text-ink-3">
                            {["Ticker", "Nome", "Tipo", "Corretora", "Qtd.", "Preço médio", "Custo", "Mercado", "P/L", "Proventos"].map((h, i) => (
                              <th key={h} scope="col" className={`py-2 font-medium ${i >= 4 ? "text-right" : ""}`}>{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {g.items.map((p) => (
                            <tr key={p.holdingId} className="border-b border-line transition last:border-0 hover:bg-surface-2">
                              <th scope="row" className="py-2.5 text-left font-semibold">{p.ticker}</th>
                              <td className="max-w-40 truncate text-ink-2">{p.assetName}</td>
                              <td className="text-ink-3">{TYPE_LABEL[p.assetType] ?? p.assetType}</td>
                              <td className="text-ink-3">{p.brokerName ?? "—"}</td>
                              <td className="num text-right">{qty(p.quantity)}</td>
                              <td className="text-right"><Money cents={p.avgPriceCents} /></td>
                              <td className="text-right"><Money cents={p.costCents} /></td>
                              <td className="text-right">{p.marketValueCents === null ? <span className="text-ink-3">sem cotação</span> : <Money cents={p.marketValueCents} />}</td>
                              <td className="text-right"><Pnl cents={p.pnlCents} /></td>
                              <td className="text-right"><Money cents={p.dividendsCents} /></td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </Card>
                </FadeIn>
              ))}
            </div>
            <FadeIn delay={0.05}>
              <Card className="h-full">
                <CardTitle icon={PieChart}>Alocação por tipo</CardTitle>
                <CategoryBars data={[...alloc.entries()].map(([name, cents]) => ({ name, cents })).sort((a, b) => b.cents - a.cents)} />
              </Card>
            </FadeIn>
          </div>
        </>
      )}

      <Card>
        <CardTitle>Observações</CardTitle>
        <ul className="list-disc space-y-1 pl-5 text-sm text-ink-2">
          <li>Somente leitura: nada é gravado nas tabelas do invest-tracker.</li>
          <li>O preço médio é recalculado a partir das transações (vendas não alteram o preço médio — corrige o BUG-07 do invest-tracker).</li>
          <li>Cotações vêm de <code className="code-box text-xs">invest_price_cache</code>, atualizado pelo invest-tracker.</li>
          <li>TODO: provedores de cotação (brapi, Finnhub, CoinGecko) e importação CSV/XP continuam no invest-tracker.</li>
        </ul>
      </Card>
    </div>
  );
}
