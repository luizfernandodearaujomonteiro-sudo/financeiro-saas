/**
 * Relatórios portados do sistema antigo (DRE simplificada e ponto de equilíbrio),
 * agora em centavos inteiros e para finanças da família.
 *
 *  (+) Receitas
 *  (-) Despesas variáveis
 *  (=) Margem de contribuição
 *  (-) Despesas fixas
 *  (=) Resultado do mês
 *  Ponto de equilíbrio = Fixas / (MC / Receitas)  => receita mínima para cobrir tudo
 */
import { basisPoints, mulDivRound, type Cents } from "./money";
import { isCardRefund } from "./transfers";

export interface ReportEntry {
  kind: "receita" | "despesa";
  amount_cents: Cents;
  cost_type: "fixa" | "variavel";
  category_id?: string | null;
  owner_id?: string;
  budget_month?: string;
  visibility?: "pessoal" | "compartilhado";
  payment_method?: string | null;
  card_id?: string | null;
  /** Pagamento de fatura / transferência entre contas próprias: fora dos relatórios. */
  exclude_from_reports?: boolean | null;
}

/** Entra nos relatórios? (pagamentos de fatura e transferências próprias não entram). */
export function countsInReports(e: Pick<ReportEntry, "exclude_from_reports">): boolean {
  return !e.exclude_from_reports;
}

/**
 * Valor com sinal como DESPESA: despesa = +valor; estorno no cartão = -valor
 * (reduz a despesa em vez de inflar receitas); receita comum = 0.
 */
export function expenseValue(e: Pick<ReportEntry, "kind" | "amount_cents" | "payment_method" | "card_id">): Cents {
  if (e.kind === "despesa") return e.amount_cents;
  return isCardRefund(e) ? -e.amount_cents : 0;
}

export interface MonthlySummary {
  receitas: Cents;
  despesas: Cents;
  fixas: Cents;
  variaveis: Cents;
  resultado: Cents;
  margemContribuicao: Cents;
  margemContribuicaoBp: number | null;
  /** Receita necessária para empatar; null quando a margem é <= 0 (impossível empatar). */
  pontoEquilibrio: Cents | null;
  /** Receita / ponto de equilíbrio, em pontos-base. */
  coberturaBp: number | null;
  taxaPoupancaBp: number | null;
}

export function summarize(entries: readonly ReportEntry[]): MonthlySummary {
  let receitas = 0, fixas = 0, variaveis = 0;
  for (const e of entries) {
    if (!Number.isSafeInteger(e.amount_cents)) throw new Error("valor não inteiro");
    if (!countsInReports(e)) continue; // pagamento de fatura / transferência própria
    if (e.kind === "receita" && !isCardRefund(e)) {
      receitas += e.amount_cents;
      continue;
    }
    // despesa, ou estorno no cartão (valor negativo: reduz a despesa)
    const v = expenseValue(e);
    if (e.cost_type === "fixa") fixas += v;
    else variaveis += v;
  }
  const despesas = fixas + variaveis;
  const mc = receitas - variaveis;
  const pe = mc > 0 ? mulDivRound(fixas, receitas, mc) : fixas === 0 ? 0 : null;
  return {
    receitas,
    despesas,
    fixas,
    variaveis,
    resultado: receitas - despesas,
    margemContribuicao: mc,
    margemContribuicaoBp: basisPoints(mc, receitas),
    pontoEquilibrio: pe,
    coberturaBp: pe ? basisPoints(receitas, pe) : null,
    taxaPoupancaBp: basisPoints(receitas - despesas, receitas),
  };
}

export function groupSum<T>(items: readonly T[], key: (t: T) => string | null | undefined, value: (t: T) => Cents): Map<string, Cents> {
  const out = new Map<string, Cents>();
  for (const it of items) {
    const k = key(it) ?? "__none__";
    out.set(k, (out.get(k) ?? 0) + value(it));
  }
  return out;
}

export function monthlySeries(entries: readonly ReportEntry[], months: readonly string[]) {
  return months.map((month) => {
    const s = summarize(entries.filter((e) => e.budget_month === month));
    return { month, receitas: s.receitas, despesas: s.despesas, resultado: s.resultado };
  });
}
