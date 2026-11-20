/**
 * Importação Open Finance (Pluggy) de UM item, executada com o contexto do
 * PRÓPRIO membro dono da conexão (withUser => RLS). Importa contas, cartões,
 * transações (com auto-categorização pelo histórico) e faturas com códigos
 * de pagamento quando o banco os expõe. Dados entram como "pessoal" por padrão;
 * se a conta/cartão foi compartilhada, novas transações herdam "compartilhado".
 */
import "server-only";
import { withService, withUser, type Db } from "../db";
import { suggestCategory } from "../domain/categorize";
import { addDays, monthStartOf, todayISO } from "../domain/dates";
import { installmentSlot, slotForDueDate } from "../domain/invoices";
import { classifyTransfer } from "../domain/transfers";
import { decimalToCents } from "../domain/money";
import { ensureInvoice } from "../services/cards";
import { extractPaymentCodes } from "./codes";
import type { PluggyAccount, PluggyProvider } from "./types";

const BRANDS = new Set(["visa", "mastercard", "elo", "amex", "hipercard"]);

function dayOf(iso: string | null | undefined, fallback: number): number {
  const m = /^\d{4}-\d{2}-(\d{2})/.exec(iso ?? "");
  return m ? Number(m[1]) : fallback;
}

function last4(number: string | null | undefined): string {
  const d = (number ?? "").replace(/\D/g, "");
  return d.length >= 4 ? d.slice(-4) : "0000";
}

function methodFrom(pm: string | null | undefined): string {
  switch ((pm ?? "").toUpperCase()) {
    case "PIX": return "pix";
    case "BOLETO": return "boleto";
    case "TED": case "DOC": case "TRANSFERENCIA": return "transferencia";
    default: return "debito_automatico";
  }
}

export interface SyncResult {
  accounts: number;
  cards: number;
  transactions: number;
  /** transações importadas como pagamento de fatura / transferência (fora dos relatórios) */
  excluded: number;
  bills: number;
  billsWithCode: number;
}

export async function findItemOwner(itemId: string) {
  return withService((db) =>
    db.one<{ user_id: string; household_id: string; mode: string }>("select user_id, household_id, mode from public.fam_pluggy_items where item_id = $1", [itemId]),
  );
}

export async function syncItem(itemId: string, provider: PluggyProvider, now = new Date()): Promise<SyncResult> {
  const owner = await findItemOwner(itemId);
  if (!owner) throw new Error("item desconhecido");
  const item = await provider.getItem(itemId);
  // Em produção/sandbox o item precisa ter sido criado para ESTE membro (clientUserId).
  if (provider.mode !== "mock" && item.clientUserId !== owner.user_id) {
    await withUser(owner.user_id, (db) => db.query("update public.fam_pluggy_items set status = 'erro', last_error = 'clientUserId não confere' where item_id = $1", [itemId]));
    throw new Error("item não pertence ao membro");
  }
  const accounts = await provider.listAccounts(itemId);
  const today = todayISO(now);
  const ctx = { userId: owner.user_id, householdId: owner.household_id };
  const result: SyncResult = { accounts: 0, cards: 0, transactions: 0, excluded: 0, bills: 0, billsWithCode: 0 };

  // Busca dados externos antes de abrir a transação do banco.
  const data = [] as { acc: PluggyAccount; txs: Awaited<ReturnType<PluggyProvider["listTransactions"]>>; bills: Awaited<ReturnType<PluggyProvider["listBills"]>> }[];
  for (const acc of accounts) {
    data.push({ acc, txs: await provider.listTransactions(acc.id, addDays(today, -90)), bills: acc.type === "CREDIT" ? await provider.listBills(acc.id) : [] });
  }

  await withUser(owner.user_id, async (db) => {
    const cats = await db.query<{ id: string; name: string; kind: "receita" | "despesa" }>("select id, name, kind from public.fam_categories where household_id = $1 and active", [ctx.householdId]);
    const history = (await db.query<{ description: string; category_id: string; kind: "receita" | "despesa" }>(
      "select description, category_id, kind from public.fam_entries where household_id = $1 and category_id is not null order by created_at desc limit 1000",
      [ctx.householdId],
    )).map((h) => ({ description: h.description, categoryId: h.category_id, kind: h.kind }));

    for (const { acc, txs, bills } of data) {
      if (acc.type === "CREDIT") {
        const card = await upsertCard(db, ctx.householdId, acc);
        const cycle = { closingDay: card.closing_day, dueDay: card.due_day };
        result.cards++;
        const billDue = new Map(bills.map((b) => [b.id, String(b.dueDate).slice(0, 10)]));
        for (const t of txs) {
          const amount = Math.abs(decimalToCents(t.amount));
          if (!amount) continue;
          const kind = t.type === "CREDIT" ? "receita" : "despesa"; // crédito no cartão = pagamento da fatura ou estorno
          const date = t.date.slice(0, 10);
          const reason = classifyTransfer({ accountType: "CREDIT", type: t.type, description: t.description, category: t.category });
          const n = t.creditCardMetadata?.installmentNumber ?? null, tot = t.creditCardMetadata?.totalInstallments ?? null;
          const validInst = Boolean(n && tot && tot >= 1 && tot <= 48 && n >= 1 && n <= tot);
          let invoiceId: string | null = null;
          let budgetMonth = monthStartOf(date);
          if (!reason) {
            // parcela: usa a fatura informada pelo banco (billId) ou desloca (n-1) meses a partir da compra original
            const due = t.creditCardMetadata?.billId ? billDue.get(t.creditCardMetadata.billId) : undefined;
            const slot = due ? slotForDueDate(cycle, due) : installmentSlot(cycle, date, validInst ? n : 1);
            invoiceId = await ensureInvoice(db, ctx.householdId, card.id, slot);
            budgetMonth = slot.referenceMonth;
          }
          // pagamento da fatura: fica no cartão, fora de fatura e dos relatórios (não abate o total da fatura)
          const r = await db.one(
            `insert into public.fam_entries (household_id, owner_id, visibility, kind, description, amount_cents, occurred_on, budget_month, category_id,
                payment_method, cost_type, card_id, invoice_id, installment_number, installment_total, source, external_id, exclude_from_reports, exclude_reason)
             values ($1, auth.uid(), $2, $3, $4, $5, $6, $7, $8, 'cartao_credito', 'variavel', $9, $10, $11, $12, 'pluggy', $13, $14, $15)
             on conflict (household_id, source, external_id) where external_id is not null do nothing returning id`,
            [ctx.householdId, card.visibility, kind, t.description.slice(0, 140), amount, date, budgetMonth,
             reason ? null : suggestCategory(t.description, kind, history, cats), card.id, invoiceId,
             validInst ? n : null, validInst ? tot : null, t.id, Boolean(reason), reason],
          );
          if (r) result.transactions++;
          if (r && reason) result.excluded++;
        }
        for (const b of bills) {
          const due = String(b.dueDate).slice(0, 10);
          const codes = extractPaymentCodes(b as Record<string, unknown>, due);
          const amount = Math.abs(decimalToCents(b.totalAmount));
          if (!amount) continue;
          await db.query(
            `insert into public.fam_bills (household_id, owner_id, visibility, description, amount_cents, due_date, card_id, cost_type,
                boleto_barcode, boleto_line, pix_code, source, external_id, status)
             values ($1, auth.uid(), $2, $3, $4, $5, $6, 'variavel', $7, $8, $9, 'pluggy', $10, $11)
             on conflict (household_id, source, external_id) where external_id is not null
             do update set amount_cents = excluded.amount_cents, due_date = excluded.due_date,
                boleto_barcode = coalesce(excluded.boleto_barcode, public.fam_bills.boleto_barcode),
                boleto_line = coalesce(excluded.boleto_line, public.fam_bills.boleto_line),
                pix_code = coalesce(excluded.pix_code, public.fam_bills.pix_code)`,
            [ctx.householdId, card.visibility, `Fatura ${card.nickname}`, amount, due, card.id, codes.boletoBarcode, codes.boletoLine, codes.pixCode,
             b.id, due < today ? "paga" : "pendente"],
          );
          result.bills++;
          if (codes.boletoLine || codes.pixCode) result.billsWithCode++;
        }
      } else {
        const account = await upsertAccount(db, ctx.householdId, acc);
        result.accounts++;
        for (const t of txs) {
          const amount = Math.abs(decimalToCents(t.amount));
          if (!amount) continue;
          const kind = t.type === "CREDIT" || t.amount > 0 ? "receita" : "despesa";
          const date = t.date.slice(0, 10);
          // pagamento de fatura de cartão / transferência entre contas próprias: não é receita nem despesa
          const reason = classifyTransfer({ accountType: "BANK", type: kind === "receita" ? "CREDIT" : "DEBIT", description: t.description, category: t.category });
          const r = await db.one(
            `insert into public.fam_entries (household_id, owner_id, visibility, kind, description, amount_cents, occurred_on, budget_month, category_id,
                payment_method, cost_type, bank_account_id, source, external_id, exclude_from_reports, exclude_reason)
             values ($1, auth.uid(), $2, $3, $4, $5, $6, $7, $8, $9, 'variavel', $10, 'pluggy', $11, $12, $13)
             on conflict (household_id, source, external_id) where external_id is not null do nothing returning id`,
            [ctx.householdId, account.visibility, kind, t.description.slice(0, 140), amount, date, monthStartOf(date),
             reason ? null : suggestCategory(t.description, kind, history, cats), methodFrom(t.paymentData?.paymentMethod), account.id, t.id,
             Boolean(reason), reason],
          );
          if (r) result.transactions++;
          if (r && reason) result.excluded++;
        }
      }
    }
    await db.query("update public.fam_pluggy_items set status = $2, last_sync_at = now(), last_error = null, connector_name = $3 where item_id = $1", [
      itemId, item.status ?? "UPDATED", item.connector?.name ?? null,
    ]);
  });
  return result;
}

async function upsertAccount(db: Db, householdId: string, acc: PluggyAccount) {
  const existing = await db.one<{ id: string; visibility: string }>("select id, visibility from public.fam_bank_accounts where pluggy_account_id = $1", [acc.id]);
  const balance = acc.balance === null || acc.balance === undefined ? 0 : decimalToCents(acc.balance);
  if (existing) {
    await db.query("update public.fam_bank_accounts set balance_cents = $2 where id = $1", [existing.id, balance]);
    return existing;
  }
  return (await db.one<{ id: string; visibility: string }>(
    `insert into public.fam_bank_accounts (household_id, owner_id, name, institution, kind, balance_cents, visibility, pluggy_account_id)
     values ($1, auth.uid(), $2, $3, $4, $5, 'pessoal', $6) returning id, visibility`,
    [householdId, (acc.marketingName || acc.name).slice(0, 80), acc.name.slice(0, 80), acc.subtype === "SAVINGS_ACCOUNT" ? "poupanca" : "corrente", balance, acc.id],
  ))!;
}

async function upsertCard(db: Db, householdId: string, acc: PluggyAccount) {
  const existing = await db.one<{ id: string; visibility: string; closing_day: number; due_day: number; nickname: string }>(
    "select id, visibility, closing_day, due_day, nickname from public.fam_cards where pluggy_account_id = $1",
    [acc.id],
  );
  if (existing) return existing;
  const brand = (acc.creditData?.brand ?? "").toLowerCase();
  return (await db.one<{ id: string; visibility: string; closing_day: number; due_day: number; nickname: string }>(
    `insert into public.fam_cards (household_id, owner_id, nickname, brand, last4, closing_day, due_day, limit_cents, visibility, pluggy_account_id)
     values ($1, auth.uid(), $2, $3, $4, $5, $6, $7, 'pessoal', $8) returning id, visibility, closing_day, due_day, nickname`,
    [householdId, (acc.marketingName || acc.name).slice(0, 60), BRANDS.has(brand) ? brand : "outra", last4(acc.number),
     dayOf(acc.creditData?.balanceCloseDate, 1), dayOf(acc.creditData?.balanceDueDate, 10),
     acc.creditData?.creditLimit ? decimalToCents(acc.creditData.creditLimit) : 0, acc.id],
  ))!;
}
