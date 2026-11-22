import { describe, expect, it } from "vitest";
import { makePdf } from "../support/pdf";
import { PDF_PASSWORD_NEEDED, PDF_PASSWORD_WRONG, PdfPasswordError, pdfToText } from "@/lib/importers/pdf";
import { parseStatementText } from "@/lib/importers/statement-parser";

const LINES = ["FATURA DO CARTAO", "15/10  MERCADO EXTRA  123,45", "16/10  LOJA XYZ PARC 02/05  89,90", "TOTAL DA FATURA  213,35"];

describe("leitura de PDF de fatura (real, via pdf.js)", () => {
  it("extrai o texto com quebras de linha e o parser encontra os itens", async () => {
    const text = await pdfToText(makePdf(LINES));
    const items = parseStatementText(text, "2026-11-19");
    expect(items.map((i) => [i.description, i.amountCents, i.installmentNumber])).toEqual([["MERCADO EXTRA", 12345, null], ["LOJA XYZ", 8990, 2]]);
  });
  it("PDF protegido: sem senha -> 'PDF protegido por senha'", async () => {
    const enc = makePdf(LINES, { userPassword: "52998224725" });
    await expect(pdfToText(enc)).rejects.toThrow(PDF_PASSWORD_NEEDED);
    await expect(pdfToText(enc)).rejects.toBeInstanceOf(PdfPasswordError);
  });
  it("PDF protegido: senha errada -> 'Senha do PDF incorreta'; senha certa abre", async () => {
    const enc = makePdf(LINES, { userPassword: "52998224725" });
    await expect(pdfToText(enc, "000")).rejects.toThrow(PDF_PASSWORD_WRONG);
    const text = await pdfToText(enc, "52998224725");
    expect(text).toContain("MERCADO EXTRA");
  });
  it("a mensagem de erro nunca contém a senha", async () => {
    const enc = makePdf(LINES, { userPassword: "segredo-123" });
    const err = await pdfToText(enc, "tentativa-errada-456").catch((e: Error) => e);
    expect(String((err as Error).message)).not.toContain("tentativa-errada-456");
  });
});
