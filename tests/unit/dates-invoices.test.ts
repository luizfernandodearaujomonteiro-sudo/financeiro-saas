import { describe, expect, it } from "vitest";
import { addMonths, todayISO, zonedParts, diffDays } from "@/lib/domain/dates";
import { assignInvoice, invoiceDisplayStatus, invoiceForClosingMonth, planInstallments } from "@/lib/domain/invoices";

describe("datas em America/Sao_Paulo", () => {
  it("todayISO usa o fuso de São Paulo, não UTC", () => {
    // 02:30 UTC de 20/11 ainda é 19/11 23:30 em São Paulo (UTC-3)
    expect(todayISO(new Date("2026-11-20T02:30:00Z"))).toBe("2026-11-19");
    expect(todayISO(new Date("2026-11-20T03:30:00Z"))).toBe("2026-11-20");
    expect(zonedParts(new Date("2026-11-20T02:30:00Z")).hour).toBe(23);
  });
  it("aritmética de meses e dias", () => {
    expect(addMonths("2026-12-01", 1)).toBe("2027-01-01");
    expect(addMonths("2026-01-01", -1)).toBe("2025-12-01");
    expect(diffDays("2026-02-27", "2026-03-01")).toBe(2);
  });
});

describe("atribuição de fatura pelo dia de fechamento", () => {
  const card = { closingDay: 25, dueDay: 5 }; // fecha 25, vence 5 do mês seguinte

  it("compra antes do fechamento entra na fatura do mês", () => {
    expect(assignInvoice(card, "2026-11-24")).toEqual({ referenceMonth: "2026-12-01", closingDate: "2026-11-25", dueDate: "2026-12-05" });
  });
  it("compra no dia do fechamento ou depois vai para a próxima", () => {
    expect(assignInvoice(card, "2026-11-25").referenceMonth).toBe("2027-01-01");
    expect(assignInvoice(card, "2026-11-30").closingDate).toBe("2026-12-25");
  });
  it("virada de ano", () => {
    expect(assignInvoice(card, "2026-12-26")).toEqual({ referenceMonth: "2027-02-01", closingDate: "2027-01-25", dueDate: "2027-02-05" });
  });
  it("vencimento no mesmo mês quando dueDay > closingDay", () => {
    const c = { closingDay: 3, dueDay: 10 };
    expect(assignInvoice(c, "2026-11-02")).toEqual({ referenceMonth: "2026-11-01", closingDate: "2026-11-03", dueDate: "2026-11-10" });
    expect(assignInvoice(c, "2026-11-03").referenceMonth).toBe("2026-12-01");
  });
  it("dia 31 em meses curtos é limitado ao fim do mês", () => {
    const c = { closingDay: 31, dueDay: 10 };
    expect(invoiceForClosingMonth(c, 2027, 2).closingDate).toBe("2027-02-28");
    expect(invoiceForClosingMonth(c, 2028, 2).closingDate).toBe("2028-02-29");
    expect(assignInvoice(c, "2027-02-28").closingDate).toBe("2027-03-31");
    expect(assignInvoice(c, "2027-02-27").closingDate).toBe("2027-02-28");
  });
  it("parcelas vão para faturas futuras consecutivas e somam o total", () => {
    const plan = planInstallments(card, "2026-11-28", 100000, 3);
    expect(plan.map((p) => p.invoice.referenceMonth)).toEqual(["2027-01-01", "2027-02-01", "2027-03-01"]);
    expect(plan.map((p) => p.amountCents)).toEqual([33334, 33333, 33333]);
    expect(plan.map((p) => `${p.number}/${p.total}`)).toEqual(["1/3", "2/3", "3/3"]);
  });
  it("12 parcelas atravessando fevereiro com fechamento dia 30", () => {
    const plan = planInstallments({ closingDay: 30, dueDay: 8 }, "2026-12-15", 120000, 12);
    expect(plan[2]!.invoice.closingDate).toBe("2027-02-28");
    expect(plan[11]!.invoice.referenceMonth).toBe("2027-12-01");
    expect(new Set(plan.map((p) => p.invoice.referenceMonth)).size).toBe(12);
  });
  it("status exibido", () => {
    const inv = { status: "aberta", closingDate: "2026-11-25", dueDate: "2026-12-05" };
    expect(invoiceDisplayStatus(inv, "2026-11-20")).toBe("aberta");
    expect(invoiceDisplayStatus(inv, "2026-11-25")).toBe("fechada");
    expect(invoiceDisplayStatus(inv, "2026-12-06")).toBe("vencida");
    expect(invoiceDisplayStatus({ ...inv, status: "paga" }, "2026-12-06")).toBe("paga");
  });
});
