/**
 * Auto-categorização: 1) mesmo texto já categorizado no histórico (voto da maioria),
 * 2) maior semelhança de palavras com o histórico, 3) regras de palavras-chave.
 */
import { normalizeText, tokens } from "./text";

export interface CategoryRef {
  id: string;
  name: string;
  kind: "receita" | "despesa";
}

export interface HistoryItem {
  description: string;
  categoryId: string | null;
  kind: "receita" | "despesa";
}

const KEYWORD_RULES: { words: string[]; category: string; kind: "receita" | "despesa" }[] = [
  { words: ["mercado", "supermercado", "atacadao", "assai", "carrefour", "extra", "pao de acucar", "hortifruti", "feira", "acougue", "padaria"], category: "Mercado", kind: "despesa" },
  { words: ["ifood", "restaurante", "lanchonete", "pizza", "burger", "mcdonald", "bar", "cafe", "rappi"], category: "Restaurantes", kind: "despesa" },
  { words: ["uber", "99", "99app", "posto", "combustivel", "gasolina", "estacionamento", "metro", "onibus", "pedagio", "sem parar", "shell", "ipiranga"], category: "Transporte", kind: "despesa" },
  { words: ["farmacia", "drogaria", "droga", "raia", "pague menos", "medico", "hospital", "laboratorio", "unimed", "amil", "dentista", "consulta"], category: "Saúde", kind: "despesa" },
  { words: ["netflix", "spotify", "amazon prime", "prime video", "disney", "hbo", "max", "youtube", "icloud", "google one", "assinatura", "globoplay", "deezer"], category: "Assinaturas", kind: "despesa" },
  { words: ["aluguel", "condominio", "iptu", "financiamento"], category: "Moradia", kind: "despesa" },
  { words: ["luz", "energia", "enel", "cemig", "copel", "light", "agua", "sabesp", "gas", "internet", "vivo", "claro", "tim", "oi", "net"], category: "Contas da casa", kind: "despesa" },
  { words: ["escola", "faculdade", "curso", "livro", "udemy", "alura", "mensalidade"], category: "Educação", kind: "despesa" },
  { words: ["cinema", "show", "ingresso", "viagem", "hotel", "airbnb", "passeio", "jogo", "steam"], category: "Lazer", kind: "despesa" },
  { words: ["roupa", "renner", "riachuelo", "cea", "zara", "shein", "calcado", "tenis"], category: "Vestuário", kind: "despesa" },
  { words: ["pet", "petz", "cobasi", "racao", "veterinario"], category: "Pets", kind: "despesa" },
  { words: ["imposto", "tarifa", "iof", "taxa", "anuidade", "juros", "multa", "darf", "ipva"], category: "Impostos e taxas", kind: "despesa" },
  { words: ["salario", "pagamento salario", "folha", "proventos", "holerite"], category: "Salário", kind: "receita" },
  { words: ["freela", "freelance", "projeto", "consultoria"], category: "Freelance", kind: "receita" },
  { words: ["rendimento", "dividendo", "juros sobre capital", "jcp", "cdb", "tesouro"], category: "Rendimentos", kind: "receita" },
];

function jaccard(a: string[], b: string[]): number {
  if (!a.length || !b.length) return 0;
  const A = new Set(a), B = new Set(b);
  let inter = 0;
  for (const t of A) if (B.has(t)) inter++;
  return inter / (A.size + B.size - inter);
}

export function suggestCategory(
  description: string,
  kind: "receita" | "despesa",
  history: readonly HistoryItem[],
  categories: readonly CategoryRef[],
): string | null {
  const valid = new Set(categories.filter((c) => c.kind === kind).map((c) => c.id));
  const norm = normalizeText(description);
  const relevant = history.filter((h) => h.kind === kind && h.categoryId && valid.has(h.categoryId));

  // 1) mesmo texto normalizado
  const votes = new Map<string, number>();
  for (const h of relevant) if (normalizeText(h.description) === norm) votes.set(h.categoryId!, (votes.get(h.categoryId!) ?? 0) + 1);
  if (votes.size) return [...votes.entries()].sort((a, b) => b[1] - a[1])[0]![0];

  // 2) semelhança por palavras
  const tk = tokens(description);
  let best: { id: string; score: number } | null = null;
  for (const h of relevant) {
    const score = jaccard(tk, tokens(h.description));
    if (score >= 0.5 && (!best || score > best.score)) best = { id: h.categoryId!, score };
  }
  if (best) return best.id;

  // 3) regras de palavras-chave
  const padded = ` ${norm} `;
  for (const rule of KEYWORD_RULES) {
    if (rule.kind !== kind) continue;
    if (rule.words.some((w) => padded.includes(` ${w} `))) {
      const cat = categories.find((c) => c.kind === kind && normalizeText(c.name) === normalizeText(rule.category));
      if (cat) return cat.id;
    }
  }
  return null;
}

/** Encontra categoria pelo nome digitado (ex.: "mercado" no WhatsApp). */
export function matchCategoryByName(hint: string, kind: "receita" | "despesa", categories: readonly CategoryRef[]): string | null {
  const h = normalizeText(hint);
  if (!h) return null;
  const pool = categories.filter((c) => c.kind === kind);
  const exact = pool.find((c) => normalizeText(c.name) === h);
  if (exact) return exact.id;
  const prefix = pool.find((c) => normalizeText(c.name).startsWith(h) || h.startsWith(normalizeText(c.name)));
  return prefix?.id ?? null;
}
