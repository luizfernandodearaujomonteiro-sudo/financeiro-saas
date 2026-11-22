import { describe, expect, it } from "vitest";
import { suggestCategory, matchCategoryByName } from "@/lib/domain/categorize";
import { summarize } from "@/lib/domain/reports";
import { compareMembers } from "@/lib/domain/comparison";
import { goalProgress } from "@/lib/domain/goals";
import { isDarkHour, resolveTheme } from "@/lib/domain/theme";
import { pickUndoTarget, withinUndoWindow } from "@/lib/domain/undo";
import { averagePriceCents, computePosition, marketValueCents } from "@/lib/domain/invest";
import { computeNetWorth } from "@/lib/domain/networth";
import { jidToPhone, normalizePhone } from "@/lib/domain/phone";

const cats = [
  { id: "mercado", name: "Mercado", kind: "despesa" as const },
  { id: "transp", name: "Transporte", kind: "despesa" as const },
  { id: "rest", name: "Restaurantes", kind: "despesa" as const },
  { id: "sal", name: "Salário", kind: "receita" as const },
];

describe("auto-categorização", () => {
  it("usa histórico (texto igual), semelhança e regras", () => {
    const history = [
      { description: "PADARIA DO ZE", categoryId: "rest", kind: "despesa" as const },
      { description: "Padaria do Zé", categoryId: "rest", kind: "despesa" as const },
      { description: "POSTO SHELL AV PAULISTA", categoryId: "transp", kind: "despesa" as const },
    ];
    expect(suggestCategory("padaria do ze", "despesa", history, cats)).toBe("rest"); // histórico vence regra "padaria"->Mercado
    expect(suggestCategory("POSTO SHELL RUA AUGUSTA", "despesa", history, cats)).toBe("transp");
    expect(suggestCategory("SUPERMERCADO EXTRA 123", "despesa", [], cats)).toBe("mercado");
    expect(suggestCategory("UBER *TRIP", "despesa", [], cats)).toBe("transp");
    expect(suggestCategory("PIX RECEBIDO SALARIO", "receita", [], cats)).toBe("sal");
    expect(suggestCategory("XYZ LTDA", "despesa", [], cats)).toBeNull();
    expect(matchCategoryByName("mercado", "despesa", cats)).toBe("mercado");
    expect(matchCategoryByName("salario", "receita", cats)).toBe("sal");
  });
});

describe("relatórios (DRE e ponto de equilíbrio em centavos)", () => {
  it("calcula resultado, margem e ponto de equilíbrio", () => {
    const s = summarize([
      { kind: "receita", amount_cents: 1000000, cost_type: "variavel" },
      { kind: "despesa", amount_cents: 400000, cost_type: "fixa" },
      { kind: "despesa", amount_cents: 200000, cost_type: "variavel" },
    ]);
    expect(s.resultado).toBe(400000);
    expect(s.margemContribuicao).toBe(800000);
    expect(s.margemContribuicaoBp).toBe(8000);
    expect(s.pontoEquilibrio).toBe(500000); // 4000 / 0.8
    expect(s.coberturaBp).toBe(20000);
    expect(s.taxaPoupancaBp).toBe(4000);
  });
  it("sem margem positiva não existe ponto de equilíbrio", () => {
    const s = summarize([{ kind: "despesa", amount_cents: 100, cost_type: "fixa" }]);
    expect(s.pontoEquilibrio).toBeNull();
  });
});

describe("comparação entre membros respeita visibilidade", () => {
  const members = [{ id: "luiz", name: "Luiz" }, { id: "esposa", name: "Esposa" }];
  it("ignora lançamentos pessoais (de qualquer membro) e receitas", () => {
    const r = compareMembers(
      [
        { owner_id: "luiz", kind: "despesa", amount_cents: 3000, visibility: "compartilhado" },
        { owner_id: "esposa", kind: "despesa", amount_cents: 1000, visibility: "compartilhado" },
        { owner_id: "esposa", kind: "despesa", amount_cents: 999999, visibility: "pessoal" },
        { owner_id: "luiz", kind: "despesa", amount_cents: 777777, visibility: "pessoal" },
        { owner_id: "luiz", kind: "receita", amount_cents: 500000, visibility: "compartilhado" },
        { owner_id: "intruso", kind: "despesa", amount_cents: 5, visibility: "compartilhado" },
      ],
      members,
    );
    expect(r.totalCents).toBe(4000);
    expect(r.members.map((m) => [m.memberId, m.totalCents, m.shareBp])).toEqual([["luiz", 3000, 7500], ["esposa", 1000, 2500]]);
  });
  it("modo percentuais oculta valores absolutos", () => {
    const r = compareMembers([{ owner_id: "luiz", kind: "despesa", amount_cents: 100, visibility: "compartilhado" }], members, "percentuais");
    expect(r.totalCents).toBeNull();
    expect(r.members.every((m) => m.totalCents === null)).toBe(true);
    expect(r.members[0]!.shareBp).toBe(10000);
  });
});

describe("metas", () => {
  it("progresso mensal, total, sequência e projeção", () => {
    const p = goalProgress(
      { monthlyTargetCents: 100000, totalTargetCents: 1000000, startMonth: "2026-08-01", endMonth: null },
      [
        { month: "2026-08-01", amountCents: 100000 },
        { month: "2026-09-01", amountCents: 120000 },
        { month: "2026-10-01", amountCents: 100000 },
        { month: "2026-11-01", amountCents: 50000 },
        { month: "2026-11-01", amountCents: -10000 },
      ],
      "2026-11-01",
    );
    expect(p.months).toHaveLength(4);
    expect(p.totalContributedCents).toBe(360000);
    expect(p.currentMonth?.contributedCents).toBe(40000);
    expect(p.currentBarBp).toBe(4000);
    expect(p.totalPctBp).toBe(3600);
    expect(p.streak).toBe(3);
    expect(p.remainingToTotalCents).toBe(640000);
    expect(p.projectedCompletion).toBe("2027-06-01");
    expect(p.onTrack).toBe(true);
  });
  it("barra limitada a 100% e meta encerrada", () => {
    const p = goalProgress({ monthlyTargetCents: 100, totalTargetCents: null, startMonth: "2026-01-01", endMonth: "2026-02-01" }, [{ month: "2026-02-01", amountCents: 500 }], "2026-11-01");
    expect(p.months).toHaveLength(2);
    expect(p.currentMonth).toBeNull();
    expect(p.onTrack).toBe(true);
    const q = goalProgress({ monthlyTargetCents: 100, totalTargetCents: null, startMonth: "2026-11-01", endMonth: null }, [{ month: "2026-11-01", amountCents: 500 }], "2026-11-01");
    expect(q.currentBarBp).toBe(10000);
    expect(q.currentMonth?.pctBp).toBe(50000);
  });
});

describe("tema automático por horário", () => {
  it("padrão 18h–6h cruzando a meia-noite", () => {
    expect(isDarkHour(18)).toBe(true);
    expect(isDarkHour(23)).toBe(true);
    expect(isDarkHour(5)).toBe(true);
    expect(isDarkHour(6)).toBe(false);
    expect(isDarkHour(12)).toBe(false);
    expect(isDarkHour(10, 9, 17)).toBe(true);
    expect(isDarkHour(17, 9, 17)).toBe(false);
    expect(isDarkHour(3, 7, 7)).toBe(true);
  });
  it("usa a hora de São Paulo e respeita escolha manual", () => {
    // 21:30 UTC = 18:30 em São Paulo
    expect(resolveTheme("auto", { now: new Date("2026-11-19T21:30:00Z") })).toBe("dark");
    expect(resolveTheme("auto", { now: new Date("2026-11-19T15:00:00Z") })).toBe("light");
    expect(resolveTheme("light", { now: new Date("2026-11-19T23:00:00Z") })).toBe("light");
  });
});

describe("desfazer pelo WhatsApp", () => {
  const now = new Date("2026-11-19T12:00:00Z");
  const e = (id: string, owner: string, minAgo: number, source = "whatsapp") => ({ id, owner_id: owner, source, created_at: new Date(now.getTime() - minAgo * 60000).toISOString() });
  it("só o último gasto do próprio remetente, dentro da janela", () => {
    expect(pickUndoTarget([e("a", "luiz", 5), e("b", "luiz", 2), e("c", "esposa", 1)], "luiz", now, 10)?.id).toBe("b");
    expect(pickUndoTarget([e("a", "luiz", 11)], "luiz", now, 10)).toBeNull();
    expect(pickUndoTarget([e("a", "luiz", 1, "manual")], "luiz", now, 10)).toBeNull();
    expect(pickUndoTarget([e("c", "esposa", 1)], "luiz", now, 10)).toBeNull();
    // o último já expirou: não volta para um anterior
    expect(pickUndoTarget([e("a", "luiz", 30), e("b", "luiz", 15)], "luiz", now, 10)).toBeNull();
    expect(withinUndoWindow(new Date(now.getTime() + 60000), now, 10)).toBe(false);
  });
});

describe("investimentos (preço médio correto após venda parcial)", () => {
  it("venda não altera o preço médio (corrige BUG-07 do invest-tracker)", () => {
    const p = computePosition([
      { type: "buy", quantity: "100", total_value: "1000.00" },
      { type: "sell", quantity: "50", total_value: "750.00" },
    ]);
    expect(p.quantityE8).toBe(50n * 100000000n);
    expect(averagePriceCents(p)).toBe(1000n);
    expect(p.costCents).toBe(50000n);
    expect(p.realizedCents).toBe(25000n);
    expect(marketValueCents(p.quantityE8, "12.34")).toBe(61700n);
    expect(marketValueCents(12345678n, "250000.5")).toBe(3086426n); // 0.12345678 BTC × 250000,50 = 30864,2567
  });
});

describe("patrimônio e telefones", () => {
  it("patrimônio = contas + investimentos − faturas em aberto", () => {
    expect(computeNetWorth({ accountBalancesCents: [100000, -5000], investmentsCents: 200000, unpaidInvoicesCents: [30000, -100] })).toEqual({
      accountsCents: 95000, investmentsCents: 200000, debtsCents: 30000, netCents: 265000,
    });
  });
  it("normaliza números BR e JIDs do WhatsApp", () => {
    expect(normalizePhone("(11) 98765-4321")).toBe("+5511987654321");
    expect(normalizePhone("551187654321")).toBe("+5511987654321"); // sem o 9º dígito
    expect(normalizePhone("+55 11 3333-4444")).toBe("+551133334444"); // fixo
    expect(jidToPhone("5511987654321@s.whatsapp.net")).toBe("+5511987654321");
    expect(jidToPhone("5511987654321:7@s.whatsapp.net")).toBe("+5511987654321");
    expect(jidToPhone("120363000000000000@g.us")).toBeNull();
  });
});

describe("cookie de tema por perfil", () => {
  it("é gerado a partir das preferências de quem entrou", async () => {
    const { themeCookieFromPrefs, decodeTheme } = await import("@/lib/theme-cookie");
    expect(themeCookieFromPrefs({ theme_mode: "light", auto_dark_start: 18, auto_dark_end: 6 })).toBe("light");
    expect(themeCookieFromPrefs({ theme_mode: "auto", auto_dark_start: 19, auto_dark_end: 7 })).toBe("auto:19:7");
    expect(themeCookieFromPrefs(null)).toBe("dark");
    expect(decodeTheme(themeCookieFromPrefs({ theme_mode: "auto", auto_dark_start: 20, auto_dark_end: 5 }))).toEqual({ mode: "auto", start: 20, end: 5 });
  });
});

describe("onboarding: validação de 'Criar minha família'", () => {
  it("aceita nomes válidos (aparando espaços) e recusa vazios ou longos", async () => {
    const { createHouseholdInput } = await import("@/lib/validation");
    expect(createHouseholdInput.parse({ name: "  Família Silva ", displayName: " Luiz " })).toEqual({ name: "Família Silva", displayName: "Luiz" });
    expect(createHouseholdInput.safeParse({ name: "   ", displayName: "Luiz" }).success).toBe(false);
    expect(createHouseholdInput.safeParse({ name: "x".repeat(81), displayName: "Luiz" }).success).toBe(false);
    expect(createHouseholdInput.safeParse({ name: "Casa", displayName: "y".repeat(61) }).success).toBe(false);
    expect(createHouseholdInput.safeParse({ name: "Casa" }).success).toBe(false);
  });
});
