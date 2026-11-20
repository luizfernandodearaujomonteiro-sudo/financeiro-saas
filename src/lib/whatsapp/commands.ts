/**
 * Interpretação dos comandos de texto do assistente do WhatsApp.
 * Exemplos: "gastei 50 mercado", "gastei 32,90 uber compartilhado",
 * "recebi 3000 salario", "saldo", "fatura nubank", "contas", "desfazer", "ajuda".
 */
import { parseBRL } from "../domain/money";
import { normalizeText } from "../domain/text";

export type Command =
  | { type: "lancamento"; kind: "despesa" | "receita"; amountCents: number; description: string; categoryHint: string; shared: boolean }
  | { type: "saldo" }
  | { type: "fatura"; cardHint: string }
  | { type: "contas" }
  | { type: "desfazer" }
  | { type: "ajuda" }
  | { type: "desconhecido"; reason?: string };

const EXPENSE_VERBS = ["gastei", "gasto", "paguei", "comprei", "despesa", "gastamos", "pagamos"];
const INCOME_VERBS = ["recebi", "receita", "ganhei", "entrou", "recebemos"];
const SHARED_WORDS = new Set(["compartilhado", "compartilhada", "casa", "nosso", "nossa", "familia", "#casa"]);
const FILLER = new Set(["reais", "real", "r", "rs", "no", "na", "em", "de", "do", "da", "com", "pro", "pra", "para", "o", "a"]);

export function parseCommand(input: string): Command {
  const raw = (input ?? "").trim().slice(0, 500);
  const norm = normalizeText(raw);
  if (!norm) return { type: "desconhecido", reason: "vazio" };
  const words = norm.split(" ");
  const first = words[0]!;

  if (["ajuda", "menu", "help", "comandos", "oi", "ola"].includes(first) || raw === "?") return { type: "ajuda" };
  if (["saldo", "resumo", "balanco"].includes(first)) return { type: "saldo" };
  if (["contas", "vencimentos", "boletos"].includes(first)) return { type: "contas" };
  if (first === "desfazer" || norm === "cancelar ultimo" || norm === "apagar ultimo") return { type: "desfazer" };
  if (first === "fatura" || first === "faturas") return { type: "fatura", cardHint: words.slice(1).join(" ") };

  const isExpense = EXPENSE_VERBS.includes(first);
  const isIncome = INCOME_VERBS.includes(first);
  if (!isExpense && !isIncome) return { type: "desconhecido" };

  // valor: primeiro token numérico no texto ORIGINAL (preserva vírgula/ponto)
  const rawTokens = raw.split(/\s+/).slice(1);
  let amountCents: number | null = null;
  const rest: string[] = [];
  for (const tok of rawTokens) {
    const cleaned = tok.replace(/^r\$/i, "");
    if (amountCents === null && /^r?\$?\d/i.test(tok)) {
      const v = parseBRL(cleaned);
      if (v !== null && v > 0) {
        amountCents = v;
        continue;
      }
    }
    rest.push(tok);
  }
  if (amountCents === null) return { type: "desconhecido", reason: "valor" };

  let shared = false;
  const descWords: string[] = [];
  for (const w of rest) {
    const n = normalizeText(w);
    if (SHARED_WORDS.has(n) || SHARED_WORDS.has(w.toLowerCase())) {
      shared = true;
      continue;
    }
    if (FILLER.has(n) && descWords.length === 0) continue;
    if (n) descWords.push(w.replace(/[^\p{L}\p{N} .\-/&]/gu, ""));
  }
  const description = descWords.join(" ").trim() || (isExpense ? "Gasto via WhatsApp" : "Receita via WhatsApp");
  return {
    type: "lancamento",
    kind: isExpense ? "despesa" : "receita",
    amountCents,
    description: description.slice(0, 140),
    categoryHint: normalizeText(descWords[0] ?? ""),
    shared,
  };
}

export const HELP_TEXT = [
  "🤖 *Assistente Financeiro da Família*",
  "",
  "• *gastei 50 mercado* — registra um gasto (pessoal)",
  "• *gastei 120 luz compartilhado* — gasto da casa (visível para os dois)",
  "• *recebi 3000 salario* — registra uma receita",
  "• *saldo* — resumo do mês",
  "• *fatura nubank* — fatura atual do cartão",
  "• *contas* — próximas contas a pagar",
  "• *desfazer* — apaga seu último gasto feito por aqui (até alguns minutos depois)",
  "• *ajuda* — mostra esta mensagem",
].join("\n");
