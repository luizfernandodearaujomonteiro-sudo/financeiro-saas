import { describe, expect, it } from "vitest";
import { basisPoints, decimalToCents, formatBRL, formatBp, mulDivRound, parseBRL, splitInstallments, sumCents } from "@/lib/domain/money";

describe("money (centavos inteiros)", () => {
  it("parseBRL aceita formatos brasileiros e internacionais", () => {
    expect(parseBRL("1.234,56")).toBe(123456);
    expect(parseBRL("R$ 50")).toBe(5000);
    expect(parseBRL("32,9")).toBe(3290);
    expect(parseBRL("1234.56")).toBe(123456);
    expect(parseBRL("1.234")).toBe(123400);
    expect(parseBRL("0,01")).toBe(1);
    expect(parseBRL("-10,00")).toBe(-1000);
    expect(parseBRL("1.234.567,89")).toBe(123456789);
  });
  it("parseBRL rejeita entradas inválidas", () => {
    for (const bad of ["", "abc", "1,234,56", "10,999", "1.2.3", "12a"]) expect(parseBRL(bad)).toBeNull();
  });
  it("evita erros clássicos de float", () => {
    // 0.1 + 0.2 em float = 0.30000000000000004
    expect(sumCents([parseBRL("0,10")!, parseBRL("0,20")!])).toBe(30);
    expect(decimalToCents(0.1 + 0.2)).toBe(30);
    expect(decimalToCents("19.995")).toBe(2000);
    expect(decimalToCents(1.005)).toBe(101);
  });
  it("formatBRL", () => {
    expect(formatBRL(123456)).toBe("R$ 1.234,56");
    expect(formatBRL(-5)).toBe("-R$ 0,05");
    expect(formatBRL(100000000)).toBe("R$ 1.000.000,00");
    expect(formatBRL(500, { sign: true })).toBe("+R$ 5,00");
  });
  it("splitInstallments soma exatamente o total", () => {
    expect(splitInstallments(10000, 3)).toEqual([3334, 3333, 3333]);
    expect(splitInstallments(100, 3)).toEqual([34, 33, 33]);
    for (const [t, n] of [[99999, 7], [1, 1], [12345678, 12], [5, 5]] as const) {
      const parts = splitInstallments(t, n);
      expect(parts.reduce((a, b) => a + b, 0)).toBe(t);
      expect(Math.max(...parts) - Math.min(...parts)).toBeLessThanOrEqual(1);
    }
    expect(() => splitInstallments(100, 0)).toThrow();
    expect(() => splitInstallments(100, 49)).toThrow();
    expect(() => splitInstallments(0, 2)).toThrow();
  });
  it("mulDivRound e basis points arredondam metade para cima sem float", () => {
    expect(mulDivRound(1, 1, 2)).toBe(1);
    expect(mulDivRound(-1, 1, 2)).toBe(-1);
    expect(mulDivRound(10, 1, 3)).toBe(3);
    expect(basisPoints(1, 3)).toBe(3333);
    expect(basisPoints(2, 3)).toBe(6667);
    expect(basisPoints(5, 0)).toBeNull();
    expect(formatBp(3333)).toBe("33,3%");
  });
});
