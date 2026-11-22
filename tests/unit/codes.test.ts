import { describe, expect, it } from "vitest";
import {
  arrecadacaoBarcodeToLine, bancarioBarcodeToLine, buildArrecadacaoBarcode, buildBancarioBarcode,
  dateToFactor, factorToDate, formatBoletoLine, mod10, parseBoleto,
} from "@/lib/domain/boleto";
import { buildPixCopiaECola, crc16ccitt, isValidCNPJ, isValidCPF, parsePixCopiaECola, validatePixKey } from "@/lib/domain/pix";

describe("boleto", () => {
  it("módulo 10 (exemplo FEBRABAN)", () => {
    expect(mod10("001905009")).toBe(5);
  });
  it("bancário: código de barras <-> linha digitável de 47 dígitos", () => {
    const barcode = buildBancarioBarcode("341", dateToFactor("2026-12-10"), 15990, "1091234567890123456789012");
    expect(barcode).toHaveLength(44);
    const line = bancarioBarcodeToLine(barcode);
    expect(line).toHaveLength(47);
    const r = parseBoleto(line, "2026-11-19");
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.kind).toBe("bancario");
      expect(r.barcode).toBe(barcode);
      expect(r.amountCents).toBe(15990);
      expect(r.dueDate).toBe("2026-12-10");
    }
    const fromBarcode = parseBoleto(barcode, "2026-11-19");
    expect(fromBarcode.ok && fromBarcode.line).toBe(line);
    expect(parseBoleto(formatBoletoLine(line), "2026-11-19").ok).toBe(true);
  });
  it("bancário: detecta dígito errado em cada campo e no DV geral", () => {
    const line = bancarioBarcodeToLine(buildBancarioBarcode("001", 1500, 100, "0".repeat(25)));
    for (const pos of [0, 12, 25, 40]) {
      const broken = line.slice(0, pos) + ((Number(line[pos]) + 1) % 10) + line.slice(pos + 1);
      expect(parseBoleto(broken).ok).toBe(false);
    }
  });
  it("fator de vencimento antes e depois do reinício de 2025", () => {
    expect(factorToDate(1000, "2025-03-01")).toBe("2025-02-22");
    expect(factorToDate(9999, "2025-02-01")).toBe("2025-02-21");
    expect(factorToDate(0, "2026-01-01")).toBeNull();
  });
  it("arrecadação: 48 dígitos, módulo 10 e módulo 11", () => {
    for (const valueId of ["6", "8"] as const) {
      const barcode = buildArrecadacaoBarcode("2", valueId, 25075, "0001" + "2".repeat(25));
      const line = arrecadacaoBarcodeToLine(barcode);
      expect(line).toHaveLength(48);
      const r = parseBoleto(line);
      expect(r.ok).toBe(true);
      if (r.ok) {
        expect(r.kind).toBe("arrecadacao");
        expect(r.barcode).toBe(barcode);
        expect(r.amountCents).toBe(25075);
      }
      const broken = line.slice(0, 5) + ((Number(line[5]) + 3) % 10) + line.slice(6);
      expect(parseBoleto(broken).ok).toBe(false);
    }
  });
  it("rejeita tamanhos inválidos", () => {
    expect(parseBoleto("123").ok).toBe(false);
    expect(parseBoleto("1".repeat(48)).ok).toBe(false);
  });
});

describe("Pix", () => {
  it("CRC16-CCITT (vetor de teste '123456789' = 29B1)", () => {
    expect(crc16ccitt("123456789")).toBe("29B1");
  });
  it("copia e cola gerado é válido e carrega chave/valor", () => {
    const code = buildPixCopiaECola({ key: "luiz@example.com", name: "LUIZ", city: "SAO PAULO", amountCents: 12345, txid: "ALUGUEL11" });
    const r = parsePixCopiaECola(code);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.key).toBe("luiz@example.com");
      expect(r.amountCents).toBe(12345);
      expect(r.txid).toBe("ALUGUEL11");
    }
  });
  it("detecta código corrompido ou truncado", () => {
    const code = buildPixCopiaECola({ key: "123e4567-e89b-12d3-a456-426614174000", name: "X", city: "Y" });
    expect(parsePixCopiaECola(code.replace("X", "Z")).ok).toBe(false);
    expect(parsePixCopiaECola(code.slice(0, -1)).ok).toBe(false);
    expect(parsePixCopiaECola("hello world, not a pix code").ok).toBe(false);
  });
  it("chaves Pix: CPF, CNPJ, e-mail, telefone +55, EVP", () => {
    expect(isValidCPF("529.982.247-25")).toBe(true);
    expect(isValidCPF("111.111.111-11")).toBe(false);
    expect(isValidCNPJ("11.222.333/0001-81")).toBe(true);
    expect(validatePixKey("529.982.247-25")).toEqual({ ok: true, type: "cpf", key: "52998224725" });
    expect(validatePixKey("11.222.333/0001-81")).toEqual({ ok: true, type: "cnpj", key: "11222333000181" });
    expect(validatePixKey("Fulano@Example.com")).toEqual({ ok: true, type: "email", key: "fulano@example.com" });
    expect(validatePixKey("+55 11 98765-4321")).toEqual({ ok: true, type: "telefone", key: "+5511987654321" });
    expect(validatePixKey("123E4567-E89B-12D3-A456-426614174000").ok).toBe(true);
    expect(validatePixKey("12345678900").ok).toBe(false); // CPF inválido e sem +55
    expect(validatePixKey("11987654321", "telefone").ok).toBe(false); // telefone exige +55
    expect(validatePixKey("529.982.247-25", "email").ok).toBe(false);
  });
});
