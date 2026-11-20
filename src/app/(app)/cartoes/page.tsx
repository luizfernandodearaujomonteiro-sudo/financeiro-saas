import { CreditCard, Plus, ShoppingBag, Trash2 } from "lucide-react";
import Link from "next/link";
import { requireCtx } from "@/lib/auth/member";
import { formatDateBR } from "@/lib/domain/dates";
import { basisPoints } from "@/lib/domain/money";
import { listCategories } from "@/lib/services/categories";
import { currentInvoices, listCards } from "@/lib/services/cards";
import { ActionForm, Disclosure, SubmitButton } from "@/components/ui/client";
import { FadeIn, ProgressBar, Stagger, StaggerItem } from "@/components/ui/motion";
import { Card, CardTitle, EmptyState, Field, Input, Money, PageHeader, Select } from "@/components/ui/primitives";
import { createCardAction, createPurchaseAction, deleteCardAction } from "./actions";
import { CardVisual } from "./CardVisual";
import { PurchaseFields } from "./InstallmentPreview";

export const dynamic = "force-dynamic";
export const metadata = { title: "Cartões" };

export default async function CartoesPage() {
  const { member } = await requireCtx();
  const ctx = { userId: member.userId, householdId: member.householdId };
  const [cards, current, categories] = await Promise.all([listCards(ctx), currentInvoices(ctx), listCategories(ctx)]);
  const byCard = new Map(current.map((c) => [c.card.id, c]));
  const activeCards = cards.filter((c) => c.active);

  return (
    <div className="space-y-6">
      <PageHeader title="Cartões" subtitle="Faturas calculadas pelo dia de fechamento; parcelas vão para as faturas futuras." icon={CreditCard} />

      {cards.length === 0 ? (
        <Card>
          <EmptyState icon={CreditCard} title="Nenhum cartão cadastrado">Cadastre um cartão abaixo ou conecte seu banco pelo Open Finance.</EmptyState>
        </Card>
      ) : (
        <Stagger className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
          {cards.map((card) => {
            const cur = byCard.get(card.id);
            const total = cur?.invoice?.total_cents ?? 0;
            const usage = card.limit_cents > 0 ? basisPoints(total, card.limit_cents) ?? 0 : 0;
            const mine = card.owner_id === member.userId;
            return (
              <StaggerItem key={card.id}>
                <Card lift className="space-y-4 p-4">
                  <Link href={`/cartoes/${card.id}`} className="block rounded-2xl" aria-label={`Ver faturas do cartão ${card.nickname}`}>
                    <CardVisual nickname={card.nickname} brand={card.brand} last4={card.last4} ownerName={card.owner_name} visibility={card.visibility} />
                  </Link>
                  <div className="space-y-2 text-sm">
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="text-ink-3">Fatura atual</span>
                      <Money cents={total} className="text-lg font-semibold" />
                    </div>
                    {card.limit_cents > 0 && (
                      <>
                        <ProgressBar bp={usage} label={`Uso do limite do cartão ${card.nickname}`} tone={usage > 8000 ? "warn" : "brand"} />
                        <p className="flex justify-between text-xs text-ink-3">
                          <span>{Math.round(usage / 100)}% do limite</span>
                          <span>Limite <Money cents={card.limit_cents} /></span>
                        </p>
                      </>
                    )}
                    <p className="flex flex-wrap justify-between gap-2 text-xs text-ink-3">
                      <span>Fecha dia {card.closing_day} · vence dia {card.due_day}</span>
                      {cur && <span>Próx. vencimento {formatDateBR(cur.slot.dueDate)}</span>}
                    </p>
                    {card.pluggy_account_id && <p className="text-[11px] text-brand">Importado via Open Finance</p>}
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <Link href={`/cartoes/${card.id}`} className="text-sm font-medium text-brand hover:underline">Ver faturas →</Link>
                    {mine && (
                      <ActionForm action={deleteCardAction}>
                        <input type="hidden" name="id" value={card.id} />
                        <SubmitButton variant="ghost" pendingText="Removendo…" className="h-8 px-2 text-xs">
                          <Trash2 aria-hidden className="h-3.5 w-3.5" /> Remover
                        </SubmitButton>
                      </ActionForm>
                    )}
                  </div>
                </Card>
              </StaggerItem>
            );
          })}
        </Stagger>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <FadeIn>
          <Card gradient>
            <CardTitle icon={ShoppingBag}>Nova compra no cartão</CardTitle>
            {activeCards.length === 0 ? (
              <p className="text-sm text-ink-3">Cadastre um cartão primeiro.</p>
            ) : (
              <ActionForm action={createPurchaseAction} resetOnSuccess className="space-y-4">
                <PurchaseFields
                  cards={activeCards.map((c) => ({ id: c.id, nickname: c.nickname, closing_day: c.closing_day, due_day: c.due_day }))}
                  categories={categories.filter((c) => c.kind === "despesa" && c.active).map((c) => ({ id: c.id, name: c.name }))}
                />
                <SubmitButton>Registrar compra</SubmitButton>
              </ActionForm>
            )}
          </Card>
        </FadeIn>

        <FadeIn delay={0.05}>
          <Card>
            <Disclosure defaultOpen={cards.length === 0} summary={<span className="flex items-center gap-2 text-sm font-semibold tracking-wide text-ink-2 uppercase"><Plus aria-hidden className="h-4 w-4 text-brand" /> Novo cartão</span>}>
              <ActionForm action={createCardAction} resetOnSuccess className="space-y-4">
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label="Apelido"><Input name="nickname" required maxLength={60} placeholder="Ex.: Nubank" /></Field>
                  <Field label="Bandeira">
                    <Select name="brand" defaultValue="mastercard">
                      <option value="visa">Visa</option>
                      <option value="mastercard">Mastercard</option>
                      <option value="elo">Elo</option>
                      <option value="amex">American Express</option>
                      <option value="hipercard">Hipercard</option>
                      <option value="outra">Outra</option>
                    </Select>
                  </Field>
                  <Field label="4 últimos dígitos"><Input name="last4" required inputMode="numeric" pattern="\d{4}" maxLength={4} placeholder="1234" /></Field>
                  <Field label="Limite (R$)"><Input name="limitCents" inputMode="decimal" placeholder="0,00" /></Field>
                  <Field label="Dia de fechamento" hint="Compras a partir deste dia vão para a fatura seguinte.">
                    <Input name="closingDay" type="number" min={1} max={31} required defaultValue={25} />
                  </Field>
                  <Field label="Dia de vencimento"><Input name="dueDay" type="number" min={1} max={31} required defaultValue={5} /></Field>
                  <Field label="Visibilidade" className="sm:col-span-2">
                    <Select name="visibility" defaultValue="compartilhado">
                      <option value="compartilhado">🏠 Compartilhado (a família vê o cartão e as faturas)</option>
                      <option value="pessoal">🔒 Pessoal (só eu)</option>
                    </Select>
                  </Field>
                </div>
                <SubmitButton>Cadastrar cartão</SubmitButton>
              </ActionForm>
            </Disclosure>
          </Card>
        </FadeIn>
      </div>
    </div>
  );
}
