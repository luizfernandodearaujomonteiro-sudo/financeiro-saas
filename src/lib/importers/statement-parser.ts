/**
 * Extrai itens de uma fatura de cartão (texto do PDF). Heurística para o
 * formato mais comum dos bancos brasileiros:
 *   "12/10  MERCADO EXTRA SAO PAULO      123,45"
 *   "05/09  LOJA XYZ PARC 02/05          89,90"
 *   "12 OUT UBER *TRIP                    23,90"
 *   "15/10  ESTORNO COMPRA              -50,00"
 * Ignora totais, pagamentos e saldos. Ano inferido pela data de referência.
 */
import { normalizeText } from "../domain/text";
import { parseBRL } from "../domain/money";
import { toISODate, daysInMonth, type ISODate } from "../domain/dates";

export interface StatementItem {
  occurredOn: ISODate;
  description: string;
  amountCents: number;
  kind: "despesa" | "receita";
  installmentNumber: number | null;
  installmentTotal: number | null;
}

const MONTHS: Record<string, number> = { jan: 1, fev: 2, mar: 3, abr: 4, mai: 5, jun: 6, jul: 7, ago: 8, set: 9, out: 10, nov: 11, dez: 12 };
const SKIP = ["total", "pagamento efetuado", "pagamento recebido", "saldo anterior", "saldo atual", "limite", "encargos", "valor minimo", "pagamento minimo", "credito de pagamento"];
const LINE_RE = /^\s*(\d{1,2})\s*[/.\- ]\s*(\d{1,2}|[A-Za-zÀ-ÿ]{3})\s+(.+?)\s+(-\s*)?(?:R\$\s*)?(\d{1,3}(?:\.\d{3})*,\d{2})\s*(-)?\s*$/;
const INSTALLMENT_RE = /\s*(?:parc(?:ela)?\.?\s*)?(\d{1,2})\s*(?:\/|de)\s*(\d{1,2})\s*$/i;

export function parseStatementText(text: string, reference: ISODate): StatementItem[] {
  const [ry, rm] = reference.split("-").map(Number) as [number, number];
  const out: StatementItem[] = [];
  for (const rawLine of text.split(/\r?\n/)) {
    const m = LINE_RE.exec(rawLine);
    if (!m) continue;
    const day = Number(m[1]);
    const month = /^\d+$/.test(m[2]!) ? Number(m[2]) : MONTHS[normalizeText(m[2]!).slice(0, 3)];
    if (!month || month < 1 || month > 12) continue;
    let description = m[3]!.replace(/\s{2,}/g, " ").trim();
    const norm = normalizeText(description);
    if (SKIP.some((s) => norm.startsWith(s) || norm.includes(` ${s}`))) continue;
    const amount = parseBRL(m[5]!);
    if (!amount) continue;
    const negative = Boolean(m[4]) || Boolean(m[6]);
    let installmentNumber: number | null = null, installmentTotal: number | null = null;
    const inst = INSTALLMENT_RE.exec(description);
    if (inst) {
      const n = Number(inst[1]), t = Number(inst[2]);
      if (n >= 1 && t >= 2 && n <= t && t <= 48) {
        installmentNumber = n;
        installmentTotal = t;
        description = description.slice(0, inst.index).trim();
      }
    }
    const year = month > rm ? ry - 1 : ry;
    if (day < 1 || day > daysInMonth(year, month)) continue;
    out.push({
      occurredOn: toISODate(year, month, day),
      description: description.slice(0, 140) || "Compra",
      amountCents: amount,
      kind: negative ? "receita" : "despesa",
      installmentNumber,
      installmentTotal,
    });
  }
  return out;
}
