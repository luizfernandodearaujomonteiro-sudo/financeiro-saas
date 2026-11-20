import { ArrowDownRight, ArrowUpRight, CreditCard, Home, Landmark, LineChart, TrendingUp, User, Wallet } from "lucide-react";
import { requireCtx } from "@/lib/auth/member";
import { monthLabel } from "@/lib/domain/dates";
import { formatBp } from "@/lib/domain/money";
import { trendBp, type NetWorth } from "@/lib/domain/networth";
import { computeAndSnapshot } from "@/lib/services/networth";
import { TrendChart } from "@/components/charts/charts";
import { AnimatedMoney, FadeIn, Stagger, StaggerItem } from "@/components/ui/motion";
import { Badge, Card, CardTitle, Money, PageHeader } from "@/components/ui/primitives";

export const metadata = { title: "Patrimônio" };
export const dynamic = "force-dynamic";

type Hist = { month: string; net_cents: number }[];

function Trend({ bp }: { bp: number | null }) {
  if (bp === null) return <Badge>sem histórico</Badge>;
  const up = bp >= 0;
  return (
    <Badge tone={up ? "good" : "bad"}>
      {up ? <ArrowUpRight aria-hidden className="h-3 w-3" /> : <ArrowDownRight aria-hidden className="h-3 w-3" />}
      {up ? "+" : ""}
      {formatBp(bp)} vs mês anterior
    </Badge>
  );
}

function Section({ title, icon: Icon, nw, history, description }: { title: string; icon: typeof Home; nw: NetWorth; history: Hist; description: string }) {
  const prev = history.length >= 2 ? history[history.length - 2]!.net_cents : null;
  const tiles = [
    { label: "Contas", icon: Wallet, cents: nw.accountsCents, tone: "" },
    { label: "Investimentos", icon: TrendingUp, cents: nw.investmentsCents, tone: "" },
    { label: "Faturas em aberto", icon: CreditCard, cents: -nw.debtsCents, tone: "text-bad" },
  ];
  return (
    <div className="space-y-4">
      <FadeIn>
        <Card gradient>
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="flex items-center gap-2 text-sm font-semibold tracking-wide text-ink-2 uppercase"><Icon aria-hidden className="h-4 w-4 text-brand" /> {title}</p>
              <AnimatedMoney cents={nw.netCents} className={`mt-2 block text-4xl font-black tracking-tight ${nw.netCents < 0 ? "text-bad" : ""}`} />
              <p className="mt-1 max-w-md text-xs text-ink-3">{description}</p>
            </div>
            <Trend bp={trendBp(prev, nw.netCents)} />
          </div>
          <Stagger className="mt-5 grid gap-3 sm:grid-cols-3">
            {tiles.map((t) => (
              <StaggerItem key={t.label}>
                <div className="lift rounded-xl bg-surface-2 p-3 ring-1 ring-line">
                  <p className="flex items-center gap-1.5 text-xs text-ink-3"><t.icon aria-hidden className="h-3.5 w-3.5" /> {t.label}</p>
                  <Money cents={t.cents} className={`mt-1 block text-lg font-semibold ${t.tone}`} />
                </div>
              </StaggerItem>
            ))}
          </Stagger>
        </Card>
      </FadeIn>
      <FadeIn delay={0.05}>
        <Card>
          <CardTitle icon={LineChart}>Evolução — {title}</CardTitle>
          <TrendChart label={`Evolução do patrimônio: ${title}`} data={history.map((h) => ({ label: monthLabel(h.month, true), cents: h.net_cents }))} />
        </Card>
      </FadeIn>
    </div>
  );
}

export default async function PatrimonioPage() {
  const { member } = await requireCtx();
  const ctx = { userId: member.userId, householdId: member.householdId };
  const data = await computeAndSnapshot(ctx);
  return (
    <div className="space-y-8">
      <PageHeader icon={Landmark} title="Patrimônio" subtitle="Contas (Open Finance) + investimentos − faturas de cartão em aberto. Uma fotografia é salva a cada mês." />
      <div className="grid gap-8 xl:grid-cols-2">
        <Section
          title="Família (compartilhado)"
          icon={Home}
          nw={data.family}
          history={data.familyHistory}
          description="Somente o que foi compartilhado: contas e cartões marcados como da casa e investimentos que cada um escolheu compartilhar."
        />
        <Section
          title="Meu patrimônio"
          icon={User}
          nw={data.mine}
          history={data.myHistory}
          description="Tudo que é seu (pessoal e compartilhado). Esta visão é visível apenas para você."
        />
      </div>
      <Card>
        <CardTitle>Como é calculado</CardTitle>
        <ul className="list-disc space-y-1 pl-5 text-sm text-ink-2">
          <li><b>Contas</b>: saldos das contas bancárias (importadas via Open Finance ou cadastradas).</li>
          <li><b>Investimentos</b>: valor de mercado pelas cotações do invest-tracker (ou custo, quando não há cotação).</li>
          <li><b>Dívidas</b>: faturas de cartão ainda não pagas.</li>
          <li>Os valores são inteiros em centavos — sem arredondamentos de ponto flutuante.</li>
        </ul>
      </Card>
    </div>
  );
}
