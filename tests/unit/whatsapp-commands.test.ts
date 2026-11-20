import { describe, expect, it } from "vitest";
import { parseCommand } from "@/lib/whatsapp/commands";
import { buildDueAlertMessages } from "@/lib/whatsapp/messages";
import { bancarioBarcodeToLine, buildBancarioBarcode } from "@/lib/domain/boleto";
import { buildPixCopiaECola } from "@/lib/domain/pix";

describe("comandos do WhatsApp", () => {
  it("gastos e receitas", () => {
    expect(parseCommand("gastei 50 mercado")).toMatchObject({ type: "lancamento", kind: "despesa", amountCents: 5000, description: "mercado", categoryHint: "mercado", shared: false });
    expect(parseCommand("Gastei R$ 32,90 no Uber compartilhado")).toMatchObject({ kind: "despesa", amountCents: 3290, description: "Uber", shared: true });
    expect(parseCommand("recebi 3000 salario")).toMatchObject({ kind: "receita", amountCents: 300000, categoryHint: "salario" });
    expect(parseCommand("paguei 1.250,00 aluguel casa")).toMatchObject({ amountCents: 125000, description: "aluguel", shared: true });
    expect(parseCommand("gastei mercado").type).toBe("desconhecido");
  });
  it("consultas e utilitários", () => {
    expect(parseCommand("saldo").type).toBe("saldo");
    expect(parseCommand("Fatura Nubank")).toEqual({ type: "fatura", cardHint: "nubank" });
    expect(parseCommand("ajuda").type).toBe("ajuda");
    expect(parseCommand("desfazer").type).toBe("desfazer");
    expect(parseCommand("contas").type).toBe("contas");
    expect(parseCommand("bom dia").type).toBe("desconhecido");
  });
});

describe("alertas de vencimento: código em mensagem separada", () => {
  const line = bancarioBarcodeToLine(buildBancarioBarcode("237", 2000, 18990, "1".repeat(25)));
  it("boleto: alerta + mensagem SOMENTE com a linha digitável", () => {
    const msgs = buildDueAlertMessages({ description: "Internet", amountCents: 18990, dueDate: "2026-11-22", boletoLine: `${line.slice(0, 5)}.${line.slice(5)} ` }, 3);
    expect(msgs).toHaveLength(2);
    expect(msgs[0]).toContain("vence em 3 dias");
    expect(msgs[0]).toContain("R$ 189,90");
    expect(msgs[1]).toBe(line);
    expect(msgs[1]).toMatch(/^\d{47}$/);
  });
  it("Pix copia e cola em mensagem própria, sem espaços", () => {
    const pix = buildPixCopiaECola({ key: "+5511987654321", name: "CONDOMINIO", city: "SAO PAULO", amountCents: 50000 });
    const msgs = buildDueAlertMessages({ description: "Condomínio", amountCents: 50000, dueDate: "2026-11-19", pixCode: `  ${pix}\n` }, 0);
    expect(msgs).toEqual([expect.stringContaining("vence HOJE"), pix]);
  });
  it("boleto e Pix: três mensagens", () => {
    const pix = buildPixCopiaECola({ key: "a@b.com", name: "X", city: "Y" });
    expect(buildDueAlertMessages({ description: "X", amountCents: 1, dueDate: "2026-11-20", boletoLine: line, pixCode: pix }, 1)).toHaveLength(3);
  });
  it("sem código: uma mensagem avisando que está indisponível", () => {
    const msgs = buildDueAlertMessages({ description: "Fatura Itaú", amountCents: 100, dueDate: "2026-11-20", source: "pluggy" }, 1);
    expect(msgs).toHaveLength(1);
    expect(msgs[0]).toContain("Código de pagamento indisponível");
    expect(msgs[0]).toContain("Open Finance");
  });
});
