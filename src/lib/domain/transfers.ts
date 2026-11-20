/**
 * Classifica transações do Open Finance que NÃO são receita/despesa real e não
 * devem entrar nos relatórios (evita contagem dupla):
 *  - pagamento de fatura de cartão (débito na conta e o crédito correspondente no cartão);
 *  - transferência entre contas da mesma pessoa (inclui aplicação/resgate).
 * Estornos no cartão NÃO são excluídos: viram redução de despesa (ver reports.ts).
 */
import { normalizeText } from "./text";

export type ExcludeReason = "pagamento_fatura" | "transferencia";

export interface TransferInput {
  accountType: string; // BANK | CREDIT
  type: string; // DEBIT | CREDIT
  description: string;
  category?: string | null;
}

const CARD_PAYMENT_CATEGORIES = ["credit card payment", "pagamento de cartao", "pagamento de fatura", "pagamento cartao de credito"];
const SAME_PERSON_CATEGORIES = ["same person transfer", "transfer same person", "transferencia mesma titularidade", "mesma titularidade", "transfer between own accounts"];

const CARD_PAYMENT_DESC = [
  /\b(pagamento|pagto|pgto|pag|pg)\b.{0,20}\b(fatura|cartao|cartoes|card)\b/,
  /\bfatura\b.{0,12}\b(paga|pagamento|pgto)\b/,
  /\bdeb(ito)?\s+aut(omatico)?\b.{0,12}\bfatura\b/,
];
const CARD_SIDE_PAYMENT_DESC = [/^(pagamento|pagto|pgto|pag)\s*(recebido|efetuado|obrigado)?\b/, /\bpagamento\s+(recebido|efetuado)\b/, /\bpayment\b/];
const SAME_PERSON_DESC = [
  /\btransf(erencia)?\b.{0,30}\b(mesma titularidade|mesmo titular|entre contas|propria|proprio)\b/,
  /\b(ted|doc|pix)\b.{0,20}\b(mesma titularidade|mesmo titular)\b/,
  /\b(aplicacao|aplic|resgate)\b.{0,20}\b(cdb|rdb|poupanca|lci|lca|fundo|automatica|aut)?\b/,
];

const any = (res: RegExp[], s: string) => res.some((r) => r.test(s));

export function classifyTransfer(t: TransferInput): ExcludeReason | null {
  const desc = normalizeText(t.description);
  const cat = normalizeText(t.category ?? "");
  const isCardPaymentCat = CARD_PAYMENT_CATEGORIES.some((c) => cat.includes(c));
  const isSamePersonCat = SAME_PERSON_CATEGORIES.some((c) => cat.includes(c));
  const account = (t.accountType ?? "").toUpperCase();
  const type = (t.type ?? "").toUpperCase();

  if (account === "CREDIT") {
    // dinheiro entrando no cartão: pagamento da fatura (excluir) ou estorno (manter)
    if (type === "CREDIT" && (isCardPaymentCat || any(CARD_PAYMENT_DESC, desc) || any(CARD_SIDE_PAYMENT_DESC, desc))) return "pagamento_fatura";
    return null;
  }
  // conta corrente/poupança
  if (type === "DEBIT" && (isCardPaymentCat || any(CARD_PAYMENT_DESC, desc))) return "pagamento_fatura";
  if (isSamePersonCat || any(SAME_PERSON_DESC, desc)) return "transferencia";
  return null;
}

/** Estorno/crédito no cartão: receita lançada no cartão que reduz despesa. */
export function isCardRefund(e: { kind: string; payment_method?: string | null; card_id?: string | null }): boolean {
  return e.kind === "receita" && (e.payment_method === "cartao_credito" || Boolean(e.card_id));
}
