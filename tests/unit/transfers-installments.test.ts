import { describe, expect, it } from "vitest";
import { classifyTransfer, isCardRefund } from "@/lib/domain/transfers";
import { summarize } from "@/lib/domain/reports";
import { compareMembers } from "@/lib/domain/comparison";
import { assignInvoice, installmentSlot, slotForDueDate } from "@/lib/domain/invoices";

describe("classificador de pagamento de fatura / transferência", () => {
  const bank = (description: string, type = "DEBIT", category: string | null = null) => classifyTransfer({ accountType: "BANK", type, description, category });
  const card = (description: string, type = "CREDIT", category: string | null = null) => classifyTransfer({ accountType: "CREDIT", type, description, category });

  it("conta corrente: pagamento de fatura de cartão não é despesa", () => {
    expect(bank("PAG FATURA CARTAO SIMULADO VISA")).toBe("pagamento_fatura");
    expect(bank("PAGTO CARTAO CREDITO NUBANK")).toBe("pagamento_fatura");
    expect(bank("PGTO FATURA ITAU")).toBe("pagamento_fatura");
    expect(bank("Pagamento de fatura")).toBe("pagamento_fatura");
    expect(bank("DEB AUTOMATICO FATURA CARTAO")).toBe("pagamento_fatura");
    expect(bank("QUALQUER COISA", "DEBIT", "Credit card payment")).toBe("pagamento_fatura");
  });
  it("conta corrente: transferência entre contas próprias (e aplicação/resgate) não é despesa nem receita", () => {
    expect(bank("TRANSF MESMA TITULARIDADE POUPANCA")).toBe("transferencia");
    expect(bank("TED MESMA TITULARIDADE")).toBe("transferencia");
    expect(bank("TRANSFERENCIA ENTRE CONTAS")).toBe("transferencia");
    expect(bank("APLICACAO CDB")).toBe("transferencia");
    expect(bank("RESGATE POUPANCA", "CREDIT")).toBe("transferencia");
    expect(bank("PIX RECEBIDO JOAO", "CREDIT", "Same person transfer")).toBe("transferencia");
  });
  it("conta corrente: gastos e receitas comuns continuam valendo", () => {
    expect(bank("PAG BOLETO ENEL ENERGIA")).toBeNull();
    expect(bank("SUPERMERCADO EXTRA")).toBeNull();
    expect(bank("COMPRA CARTAO DEBITO PADARIA")).toBeNull();
    expect(bank("PIX RECEBIDO SALARIO EMPRESA LTDA", "CREDIT")).toBeNull();
    expect(bank("PAGAMENTO RECEBIDO CLIENTE", "CREDIT")).toBeNull(); // na conta, "pagamento recebido" é receita
  });
  it("cartão: crédito de pagamento da fatura é excluído; estorno não", () => {
    expect(card("PAGAMENTO RECEBIDO")).toBe("pagamento_fatura");
    expect(card("Pagamento efetuado - obrigado")).toBe("pagamento_fatura");
    expect(card("PAGAMENTO FATURA")).toBe("pagamento_fatura");
    expect(card("CREDITO", "CREDIT", "Credit card payment")).toBe("pagamento_fatura");
    expect(card("ESTORNO UBER *TRIP")).toBeNull();
    expect(card("PAGAMENTO RECEBIDO", "DEBIT")).toBeNull(); // débito no cartão é compra
    expect(card("NETFLIX.COM", "DEBIT")).toBeNull();
  });
  it("aplicação/resgate só é transferência com o produto ou categoria de investimento", () => {
    expect(bank("RESGATE PREMIO", "CREDIT")).toBeNull();
    expect(bank("APLICACAO MULTA")).toBeNull();
    expect(bank("RESGATE DE PONTOS LIVELO", "CREDIT")).toBeNull();
    expect(bank("APLICACAO CDB")).toBe("transferencia");
    expect(bank("RESGATE POUPANCA", "CREDIT")).toBe("transferencia");
    expect(bank("APLIC AUT CDB DI")).toBe("transferencia");
    expect(bank("RESGATE TESOURO DIRETO", "CREDIT")).toBe("transferencia");
    expect(bank("APLICACAO AUTOMATICA")).toBe("transferencia");
    expect(bank("RESGATE LCI 2027", "CREDIT")).toBe("transferencia");
    // sem produto, mas a categoria da Pluggy é de investimento
    expect(bank("RESGATE", "CREDIT", "Investments")).toBe("transferencia");
    expect(bank("APLICACAO", "DEBIT", "Fixed income")).toBe("transferencia");
    // categoria de investimento sem a palavra aplicação/resgate não basta
    expect(bank("RENDIMENTO POUPANCA", "CREDIT", "Savings")).toBeNull();
  });
  it("prefixo de adquirente (PAG*, PG *, MP*) nunca é pagamento de fatura", () => {
    expect(card("PAG*JoseDaSilva")).toBeNull(); // estorno no cartão de compra via subadquirente
    expect(card("PAG*CARTAO DE TODOS")).toBeNull();
    expect(card("PG *LOJA FATURA FACIL")).toBeNull();
    expect(bank("PAG*JoseDaSilva")).toBeNull();
    expect(bank("PAG*CARTAO DE TODOS")).toBeNull(); // compra no débito, não pagamento de cartão
    expect(bank("PAG*FATURA LOJA", "DEBIT", "Credit card payment")).toBeNull();
    expect(card("MP*VENDEDOR")).toBeNull();
    // sem prefixo de adquirente continua funcionando
    expect(card("PAGAMENTO RECEBIDO")).toBe("pagamento_fatura");
    expect(bank("PAG FATURA CARTAO")).toBe("pagamento_fatura");
  });
  it("no cartão, 'pagamento' sozinho no início só conta como pagamento da fatura quando é o texto inteiro", () => {
    expect(card("PAGAMENTO")).toBe("pagamento_fatura");
    expect(card("PAG JOSE DA SILVA")).toBeNull();
    expect(card("PAGTO LOJA XYZ")).toBeNull();
  });
  it("estorno no cartão é detectado pela forma de pagamento ou pelo cartão", () => {
    expect(isCardRefund({ kind: "receita", payment_method: "cartao_credito" })).toBe(true);
    expect(isCardRefund({ kind: "receita", payment_method: "pix", card_id: "c1" })).toBe(true);
    expect(isCardRefund({ kind: "receita", payment_method: "pix" })).toBe(false);
    expect(isCardRefund({ kind: "despesa", payment_method: "cartao_credito" })).toBe(false);
  });
});

describe("relatórios: estornos e itens excluídos", () => {
  const base = [
    { kind: "receita" as const, amount_cents: 500000, cost_type: "variavel" as const, payment_method: "pix" },
    { kind: "despesa" as const, amount_cents: 10000, cost_type: "variavel" as const, payment_method: "cartao_credito", card_id: "c" },
    { kind: "despesa" as const, amount_cents: 200000, cost_type: "fixa" as const, payment_method: "boleto" },
  ];
  it("estorno no cartão reduz despesa (não infla receitas)", () => {
    const s = summarize([...base, { kind: "receita", amount_cents: 3200, cost_type: "variavel", payment_method: "cartao_credito", card_id: "c" }]);
    expect(s.receitas).toBe(500000);
    expect(s.variaveis).toBe(6800);
    expect(s.despesas).toBe(206800);
    expect(s.resultado).toBe(293200);
  });
  it("pagamento de fatura e transferência própria ficam fora", () => {
    const s = summarize([
      ...base,
      { kind: "despesa", amount_cents: 98000, cost_type: "variavel", payment_method: "boleto", exclude_from_reports: true },
      { kind: "receita", amount_cents: 98000, cost_type: "variavel", payment_method: "cartao_credito", card_id: "c", exclude_from_reports: true },
      { kind: "despesa", amount_cents: 50000, cost_type: "variavel", payment_method: "transferencia", exclude_from_reports: true },
    ]);
    expect(s).toMatchObject({ receitas: 500000, despesas: 210000, resultado: 290000 });
  });
  it("comparação entre membros: estorno compartilhado abate; excluídos não contam", () => {
    const r = compareMembers(
      [
        { owner_id: "a", kind: "despesa", amount_cents: 10000, visibility: "compartilhado" },
        { owner_id: "a", kind: "receita", amount_cents: 2500, visibility: "compartilhado", payment_method: "cartao_credito" },
        { owner_id: "b", kind: "despesa", amount_cents: 7500, visibility: "compartilhado" },
        { owner_id: "b", kind: "despesa", amount_cents: 99999, visibility: "compartilhado", exclude_from_reports: true },
      ],
      [{ id: "a", name: "A" }, { id: "b", name: "B" }],
    );
    expect(r.members.map((m) => m.totalCents)).toEqual([7500, 7500]);
    expect(r.totalCents).toBe(15000);
  });
});

describe("parcelas com data da compra original", () => {
  const card = { closingDay: 25, dueDay: 5 };
  it("installmentSlot desloca (n-1) faturas a partir da 1ª", () => {
    expect(installmentSlot(card, "2026-09-10", 1)).toEqual(assignInvoice(card, "2026-09-10"));
    expect(installmentSlot(card, "2026-09-10", 3).referenceMonth).toBe("2026-12-01"); // 1ª: out/26 -> 3ª: dez/26
    expect(installmentSlot(card, "2026-09-10", null).referenceMonth).toBe("2026-10-01");
  });
  it("slotForDueDate usa a fatura do vencimento informado pelo banco", () => {
    expect(slotForDueDate(card, "2026-12-05")).toEqual({ referenceMonth: "2026-12-01", closingDate: "2026-11-25", dueDate: "2026-12-05" });
    // vencimento real diferente do dia cadastrado (ex.: fim de semana) é respeitado
    expect(slotForDueDate(card, "2026-12-07").dueDate).toBe("2026-12-07");
    const sameMonth = { closingDay: 3, dueDay: 10 };
    expect(slotForDueDate(sameMonth, "2026-11-10")).toEqual({ referenceMonth: "2026-11-01", closingDate: "2026-11-03", dueDate: "2026-11-10" });
  });
});

describe("mudança de ciclo do cartão", () => {
  it("slotForReferenceMonth recalcula fechamento/vencimento para o novo ciclo", async () => {
    const { slotForReferenceMonth } = await import("@/lib/domain/invoices");
    expect(slotForReferenceMonth({ closingDay: 25, dueDay: 5 }, "2026-12-01")).toEqual({ referenceMonth: "2026-12-01", closingDate: "2026-11-25", dueDate: "2026-12-05" });
    expect(slotForReferenceMonth({ closingDay: 1, dueDay: 8 }, "2026-12-01")).toEqual({ referenceMonth: "2026-12-01", closingDate: "2026-12-01", dueDate: "2026-12-08" });
    expect(slotForReferenceMonth({ closingDay: 31, dueDay: 10 }, "2027-03-01").closingDate).toBe("2027-02-28");
  });
});
