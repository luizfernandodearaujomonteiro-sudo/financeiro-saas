/**
 * Comparação de gastos entre membros. Considera SOMENTE lançamentos
 * compartilhados: lançamentos pessoais nunca entram (nem os do próprio
 * visualizador), para que nada pessoal do outro membro vaze nos números.
 * Modo "percentuais" oculta os valores absolutos.
 */
import { basisPoints, type Cents } from "./money";

export interface ComparableEntry {
  owner_id: string;
  kind: "receita" | "despesa";
  amount_cents: Cents;
  visibility: "pessoal" | "compartilhado";
  category_id?: string | null;
}

export interface MemberRef {
  id: string;
  name: string;
}

export interface MemberComparison {
  memberId: string;
  name: string;
  totalCents: Cents | null;
  shareBp: number | null;
  count: number;
}

export function compareMembers(
  entries: readonly ComparableEntry[],
  members: readonly MemberRef[],
  mode: "valores" | "percentuais" = "valores",
): { members: MemberComparison[]; totalCents: Cents | null } {
  const shared = entries.filter((e) => e.visibility === "compartilhado" && e.kind === "despesa");
  const totals = new Map<string, { sum: Cents; count: number }>();
  for (const m of members) totals.set(m.id, { sum: 0, count: 0 });
  for (const e of shared) {
    const t = totals.get(e.owner_id);
    if (!t) continue; // ignora donos fora da família
    t.sum += e.amount_cents;
    t.count += 1;
  }
  const total = [...totals.values()].reduce((a, t) => a + t.sum, 0);
  return {
    totalCents: mode === "valores" ? total : null,
    members: members.map((m) => {
      const t = totals.get(m.id)!;
      return {
        memberId: m.id,
        name: m.name,
        totalCents: mode === "valores" ? t.sum : null,
        shareBp: basisPoints(t.sum, total),
        count: t.count,
      };
    }),
  };
}
