/**
 * Regras de fatura de cartão de crédito.
 *
 * - Fechamento no mês M = dia `closingDay` (limitado ao fim do mês).
 * - Compra ANTES do dia de fechamento entra na fatura que fecha em M.
 *   Compra NO dia do fechamento ou depois entra na fatura seguinte
 *   (o dia do fechamento é o "melhor dia de compra").
 * - Vencimento: se dueDay > closingDay vence no mesmo mês do fechamento;
 *   senão, no mês seguinte. Limitado ao fim do mês.
 * - Mês de referência da fatura = mês do VENCIMENTO.
 * - Parcela i (0-based) vai para a fatura i meses após a da primeira parcela.
 */
import { addMonthsYM, clampedDate, diffDays, parseISODate, toISODate, type ISODate, type MonthStart } from "./dates";
import { splitInstallments, type Cents } from "./money";

export interface CardCycle {
  closingDay: number;
  dueDay: number;
}

export interface InvoiceSlot {
  referenceMonth: MonthStart;
  closingDate: ISODate;
  dueDate: ISODate;
}

function validateCycle(card: CardCycle) {
  for (const [k, v] of Object.entries(card)) {
    if (!Number.isInteger(v) || v < 1 || v > 31) throw new Error(`${k} inválido`);
  }
}

/** Fatura que fecha no mês (y, m). */
export function invoiceForClosingMonth(card: CardCycle, y: number, m: number): InvoiceSlot {
  validateCycle(card);
  const closingDate = clampedDate(y, m, card.closingDay);
  const due = card.dueDay > card.closingDay ? { y, m } : addMonthsYM(y, m, 1);
  const dueDate = clampedDate(due.y, due.m, card.dueDay);
  return { referenceMonth: toISODate(due.y, due.m, 1), closingDate, dueDate };
}

/** Fatura em que uma compra feita em `purchaseDate` deve entrar. */
export function assignInvoice(card: CardCycle, purchaseDate: ISODate): InvoiceSlot {
  const { y, m } = parseISODate(purchaseDate);
  const sameMonth = invoiceForClosingMonth(card, y, m);
  if (purchaseDate < sameMonth.closingDate) return sameMonth;
  const next = addMonthsYM(y, m, 1);
  return invoiceForClosingMonth(card, next.y, next.m);
}

export interface PlannedInstallment {
  number: number; // 1-based
  total: number;
  amountCents: Cents;
  invoice: InvoiceSlot;
}

/** Gera as parcelas de uma compra, cada uma na fatura correta. */
export function planInstallments(card: CardCycle, purchaseDate: ISODate, totalCents: Cents, installments: number): PlannedInstallment[] {
  const amounts = splitInstallments(totalCents, installments);
  const first = assignInvoice(card, purchaseDate);
  const { y, m } = parseISODate(first.closingDate);
  return amounts.map((amountCents, i) => {
    const c = addMonthsYM(y, m, i);
    return { number: i + 1, total: installments, amountCents, invoice: invoiceForClosingMonth(card, c.y, c.m) };
  });
}

export type InvoiceDisplayStatus = "aberta" | "fechada" | "vencida" | "paga";

export function invoiceDisplayStatus(inv: { status: string; closingDate: ISODate; dueDate: ISODate }, today: ISODate): InvoiceDisplayStatus {
  if (inv.status === "paga") return "paga";
  if (today > inv.dueDate) return "vencida";
  if (today >= inv.closingDate || inv.status === "fechada") return "fechada";
  return "aberta";
}

export function daysUntil(today: ISODate, date: ISODate): number {
  return diffDays(today, date);
}
