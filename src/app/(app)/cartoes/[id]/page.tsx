import { ArrowLeft, CheckCircle2, CreditCard, RotateCcw } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireCtx } from "@/lib/auth/member";
import { withUser } from "@/lib/db";
import { formatDateBR, monthLabel, todayISO , capitalizeFirst} from "@/lib/domain/dates";
import { invoiceDisplayStatus, type InvoiceDisplayStatus } from "@/lib/domain/invoices";
import { listCards, listInvoices } from "@/lib/services/cards";
import { ActionForm, Disclosure, SubmitButton } from "@/components/ui/client";
import { AnimatedMoney, FadeIn, Stagger, StaggerItem } from "@/components/ui/motion";
import { Badge, Card, CardTitle, EmptyState, Money, PageHeader, VisibilityBadge } from "@/components/ui/primitives";
import { setInvoiceStatusAction } from "../actions";
import { CardVisual } from "../CardVisual";

export const dynamic = "force-dynamic";
export const metadata = { title: "Faturas do cartão" };

const STATUS: Record<InvoiceDisplayStatus, { label: string; tone: "neutral" | "brand" | "good" | "warn" | "bad" }> = {
  aberta: { label: "Aberta", tone: "brand" },
  fechada: { label: "Fechada", tone: "warn" },
  vencida: { label: "Vencida", tone: "bad" },
  paga: { label: "Paga", tone: "good" },
};

interface InvoiceEntry {
  id: string;
  description: string;
  amount_cents: number;
  kind: "receita" | "despesa";
  occurred_on: string;
  installment_number: number | null;
  installment_total: number | null;
  owner_name: string;
  visibility: "pessoal" | "compartilhado";
}

export default async function CardInvoicesPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const { member } = await requireCtx();
  const ctx = { userId: member.userId, householdId: member.householdId };
  const card = (await listCards(ctx)).find((c) => c.id === id);
  if (!card) notFound();
  const invoices = await listInvoices(ctx, id);
  const entries = invoices.length
    ? await withUser(ctx.userId, (db) =>
        db.query<InvoiceEntry & { invoice_id: string }>(
          `select e.id, e.invoice_id, e.description, e.amount_cents, e.kind, e.occurred_on, e.installment_number, e.installment_total,
                  p.display_name as owner_name, e.visibility
             from public.fam_entries e join public.fam_profiles p on p.id = e.owner_id
            where e.invoice_id = any($1::uuid[]) order by e.occurred_on, e.created_at`,
          [invoices.map((i) => i.id)],
        ),
      )
    : [];
  const today = todayISO();
  const openTotal = invoices.filter((i) => i.status !== "paga").reduce((a, i) => a + i.total_cents, 0);

  return (
    <div className="space-y-6">
      <Link href="/cartoes" className="inline-flex items-center gap-1.5 text-sm text-ink-3 hover:text-ink">
        <ArrowLeft aria-hidden className="h-4 w-4" /> Cartões
      </Link>
      <PageHeader title={card.nickname} subtitle={`Fecha dia ${card.closing_day} · vence dia ${card.due_day} · ${card.owner_name}`} icon={CreditCard} />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,340px)_1fr]">
        <FadeIn className="space-y-4">
          <CardVisual nickname={card.nickname} brand={card.brand} last4={card.last4} ownerName={card.owner_name} visibility={card.visibility} />
          <Card>
            <p className="text-xs text-ink-3">Em aberto (faturas não pagas)</p>
            <AnimatedMoney cents={openTotal} className="text-2xl font-bold" />
            {card.limit_cents > 0 && (
              <p className="mt-2 text-xs text-ink-3">Limite: <Money cents={card.limit_cents} /></p>
            )}
          </Card>
        </FadeIn>

        <Card>
          <CardTitle>Faturas</CardTitle>
          {invoices.length === 0 ? (
            <EmptyState icon={CreditCard} title="Nenhuma fatura ainda">As faturas aparecem quando você registra compras neste cartão.</EmptyState>
          ) : (
            <Stagger className="space-y-3">
              {invoices.map((inv) => {
                const st = invoiceDisplayStatus({ status: inv.status, closingDate: inv.closing_date, dueDate: inv.due_date }, today);
                const items = entries.filter((e) => e.invoice_id === inv.id);
                return (
                  <StaggerItem key={inv.id}>
                    <div className="rounded-2xl bg-surface-2 p-4 ring-1 ring-line">
                      <Disclosure
                        summary={
                          <span className="flex flex-1 flex-wrap items-center justify-between gap-3">
                            <span>
                              <span className="block font-semibold">{capitalizeFirst(monthLabel(inv.reference_month))}</span>
                              <span className="block text-xs text-ink-3">Fecha {formatDateBR(inv.closing_date)} · vence {formatDateBR(inv.due_date)}</span>
                            </span>
                            <span className="flex items-center gap-3">
                              <Badge tone={STATUS[st].tone}>{STATUS[st].label}</Badge>
                              <Money cents={inv.total_cents} className="font-semibold" />
                            </span>
                          </span>
                        }
                      >
                        {items.length === 0 ? (
                          <p className="text-sm text-ink-3">Nenhum lançamento visível para você nesta fatura.</p>
                        ) : (
                          <ul className="divide-y divide-line text-sm">
                            {items.map((e) => (
                              <li key={e.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                                <span className="min-w-0">
                                  <span className="block truncate">
                                    {e.description}
                                    {e.installment_total && e.installment_total > 1 && <span className="text-ink-3"> · {e.installment_number}/{e.installment_total}</span>}
                                  </span>
                                  <span className="flex items-center gap-2 text-xs text-ink-3">
                                    {formatDateBR(e.occurred_on)} · {e.owner_name} <VisibilityBadge v={e.visibility} />
                                  </span>
                                </span>
                                <Money cents={e.kind === "despesa" ? e.amount_cents : -e.amount_cents} className={e.kind === "receita" ? "text-good" : ""} />
                              </li>
                            ))}
                          </ul>
                        )}
                        <p className="mt-2 text-[11px] text-ink-3">O total inclui todos os lançamentos do cartão, inclusive os pessoais de outros membros que não aparecem na lista.</p>
                        <ActionForm action={setInvoiceStatusAction} className="mt-3">
                          <input type="hidden" name="invoiceId" value={inv.id} />
                          <input type="hidden" name="cardId" value={card.id} />
                          <input type="hidden" name="status" value={inv.status === "paga" ? "aberta" : "paga"} />
                          {inv.status === "paga" ? (
                            <SubmitButton variant="secondary" className="h-8 text-xs"><RotateCcw aria-hidden className="h-3.5 w-3.5" /> Reabrir fatura</SubmitButton>
                          ) : (
                            <SubmitButton variant="secondary" className="h-8 text-xs"><CheckCircle2 aria-hidden className="h-3.5 w-3.5" /> Marcar como paga</SubmitButton>
                          )}
                        </ActionForm>
                      </Disclosure>
                    </div>
                  </StaggerItem>
                );
              })}
            </Stagger>
          )}
        </Card>
      </div>
    </div>
  );
}
