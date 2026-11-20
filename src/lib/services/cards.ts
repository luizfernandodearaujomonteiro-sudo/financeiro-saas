import { withUser, type Db } from "../db";
import { monthStartOf, todayISO } from "../domain/dates";
import { assignInvoice, planInstallments, slotForReferenceMonth, type CardCycle, type InvoiceSlot } from "../domain/invoices";
import { cardInput, purchaseInput } from "../validation";
import type { MemberCtx } from "./types";

export interface CardRow {
  id: string;
  owner_id: string;
  owner_name: string;
  nickname: string;
  brand: string;
  last4: string;
  closing_day: number;
  due_day: number;
  limit_cents: number;
  visibility: "pessoal" | "compartilhado";
  active: boolean;
  pluggy_account_id: string | null;
}

export interface InvoiceRow {
  id: string;
  card_id: string;
  reference_month: string;
  closing_date: string;
  due_date: string;
  total_cents: number;
  status: "aberta" | "fechada" | "paga";
  paid_at: string | null;
}

export function listCards(ctx: MemberCtx): Promise<CardRow[]> {
  return withUser(ctx.userId, (db) =>
    db.query<CardRow>(
      `select c.*, p.display_name as owner_name from public.fin_financeiro_cards c join public.fin_financeiro_profiles p on p.id = c.owner_id
        where c.household_id = $1 order by c.active desc, c.nickname`,
      [ctx.householdId],
    ),
  );
}

export async function createCard(ctx: MemberCtx, raw: unknown) {
  const v = cardInput.parse(raw);
  return withUser(ctx.userId, (db) =>
    db.one<{ id: string }>(
      `insert into public.fin_financeiro_cards (household_id, owner_id, nickname, brand, last4, closing_day, due_day, limit_cents, visibility)
       values ($1, auth.uid(), $2, $3, $4, $5, $6, $7, $8) returning id`,
      [ctx.householdId, v.nickname, v.brand, v.last4, v.closingDay, v.dueDay, v.limitCents, v.visibility],
    ),
  );
}

/**
 * Atualiza o cartão. Se o ciclo (fechamento/vencimento) mudar, recalcula as datas das
 * faturas ABERTAS do mês corrente em diante para o novo ciclo; faturas passadas,
 * fechadas ou pagas ficam como estão. Os lançamentos continuam na mesma fatura
 * (mesmo mês de referência) — só as datas de fechamento/vencimento mudam.
 */
export async function updateCard(ctx: MemberCtx, id: string, raw: unknown, today = todayISO()) {
  const v = cardInput.parse(raw);
  return withUser(ctx.userId, async (db) => {
    const old = await db.one<{ closing_day: number; due_day: number }>("select closing_day, due_day from public.fin_financeiro_cards where id = $1 and owner_id = auth.uid()", [id]);
    if (!old) throw new Error("Cartão não encontrado ou de outra pessoa");
    await db.query(
      `update public.fin_financeiro_cards set nickname=$2, brand=$3, last4=$4, closing_day=$5, due_day=$6, limit_cents=$7, visibility=$8
        where id=$1 and owner_id = auth.uid()`,
      [id, v.nickname, v.brand, v.last4, v.closingDay, v.dueDay, v.limitCents, v.visibility],
    );
    let recalculated = 0;
    if (old.closing_day !== v.closingDay || old.due_day !== v.dueDay) {
      const current = monthStartOf(today);
      const open = await db.query<{ id: string; reference_month: string }>(
        "select id, reference_month from public.fin_financeiro_invoices where card_id = $1 and status = 'aberta' and reference_month >= $2 order by reference_month",
        [id, current],
      );
      for (const inv of open) {
        const slot = slotForReferenceMonth({ closingDay: v.closingDay, dueDay: v.dueDay }, inv.reference_month);
        const r = await db.one<{ ok: boolean }>("select public.fin_financeiro_set_invoice_dates($1, $2, $3, $4) as ok", [inv.id, slot.closingDate, slot.dueDate, current]);
        if (r?.ok) recalculated++;
      }
    }
    return { recalculated };
  });
}

/**
 * "Excluir" cartão = desativar. Apagar a linha removeria faturas e parcelas em cascata;
 * desativando, o histórico é preservado e o cartão some das listas de uso.
 */
export async function deleteCard(ctx: MemberCtx, id: string) {
  await withUser(ctx.userId, (db) => db.query("update public.fin_financeiro_cards set active = false where id = $1 and owner_id = auth.uid()", [id]));
}

/** Garante a existência da fatura (idempotente) e devolve o id. */
export async function ensureInvoice(db: Db, householdId: string, cardId: string, slot: InvoiceSlot): Promise<string> {
  const ins = await db.one<{ id: string }>(
    `insert into public.fin_financeiro_invoices (household_id, card_id, reference_month, closing_date, due_date)
     values ($1, $2, $3, $4, $5) on conflict (card_id, reference_month) do nothing returning id`,
    [householdId, cardId, slot.referenceMonth, slot.closingDate, slot.dueDate],
  );
  if (ins) return ins.id;
  const cur = await db.one<{ id: string }>("select id from public.fin_financeiro_invoices where card_id = $1 and reference_month = $2", [cardId, slot.referenceMonth]);
  if (!cur) throw new Error("Fatura não encontrada");
  return cur.id;
}

async function loadCycle(db: Db, cardId: string): Promise<CardCycle & { id: string }> {
  const card = await db.one<{ id: string; closing_day: number; due_day: number }>("select id, closing_day, due_day from public.fin_financeiro_cards where id = $1", [cardId]);
  if (!card) throw new Error("Cartão não encontrado");
  return { id: card.id, closingDay: card.closing_day, dueDay: card.due_day };
}

/**
 * Registra compra no cartão: cria a compra e uma parcela por fatura futura.
 * Executa com RLS do usuário; o trigger valida que o cartão é visível a ele.
 */
export async function createCardPurchase(ctx: MemberCtx, raw: unknown, extra: { source?: string; externalId?: string } = {}) {
  const v = purchaseInput.parse(raw);
  return withUser(ctx.userId, async (db) => {
    const cycle = await loadCycle(db, v.cardId);
    const plan = planInstallments(cycle, v.purchasedOn, v.totalCents, v.installments);
    const purchase = await db.one<{ id: string }>(
      `insert into public.fin_financeiro_card_purchases (household_id, owner_id, card_id, visibility, description, total_cents, installments, purchased_on, category_id)
       values ($1, auth.uid(), $2, $3, $4, $5, $6, $7, $8) returning id`,
      [ctx.householdId, v.cardId, v.visibility, v.description, v.totalCents, v.installments, v.purchasedOn, v.categoryId ?? null],
    );
    const ids: string[] = [];
    for (const p of plan) {
      const invoiceId = await ensureInvoice(db, ctx.householdId, v.cardId, p.invoice);
      const e = await db.one<{ id: string }>(
        `insert into public.fin_financeiro_entries (household_id, owner_id, visibility, kind, description, amount_cents, occurred_on, budget_month,
            category_id, payment_method, cost_type, card_id, invoice_id, purchase_id, installment_number, installment_total, source, external_id)
         values ($1, auth.uid(), $2, 'despesa', $3, $4, $5, $6, $7, 'cartao_credito', $8, $9, $10, $11, $12, $13, $14, $15) returning id`,
        [ctx.householdId, v.visibility, v.description, p.amountCents, v.purchasedOn, p.invoice.referenceMonth, v.categoryId ?? null, v.costType,
         v.cardId, invoiceId, purchase!.id, p.number, p.total, extra.source ?? "manual", extra.externalId && p.number === 1 ? extra.externalId : extra.externalId ? `${extra.externalId}#${p.number}` : null],
      );
      ids.push(e!.id);
    }
    return { purchaseId: purchase!.id, entryIds: ids, plan };
  });
}

export function listInvoices(ctx: MemberCtx, cardId: string): Promise<InvoiceRow[]> {
  return withUser(ctx.userId, (db) =>
    db.query<InvoiceRow>("select id, card_id, reference_month, closing_date, due_date, total_cents, status, paid_at from public.fin_financeiro_invoices where card_id = $1 order by reference_month desc", [cardId]),
  );
}

/** Fatura em aberto "atual" de cada cartão (a que recebe compras hoje). */
export async function currentInvoices(ctx: MemberCtx, today = todayISO()) {
  const cards = await listCards(ctx);
  return withUser(ctx.userId, async (db) => {
    const out: { card: CardRow; invoice: InvoiceRow | null; slot: InvoiceSlot }[] = [];
    for (const card of cards.filter((c) => c.active)) {
      const slot = assignInvoice({ closingDay: card.closing_day, dueDay: card.due_day }, today);
      const inv = await db.one<InvoiceRow>("select * from public.fin_financeiro_invoices where card_id = $1 and reference_month = $2", [card.id, slot.referenceMonth]);
      out.push({ card, invoice: inv, slot });
    }
    return out;
  });
}

export async function setInvoiceStatus(ctx: MemberCtx, invoiceId: string, status: "aberta" | "fechada" | "paga") {
  await withUser(ctx.userId, (db) =>
    db.query("update public.fin_financeiro_invoices set status = $2, paid_at = case when $2 = 'paga' then now() else null end where id = $1", [invoiceId, status]),
  );
}
