/**
 * Boleto: linha digitável <-> código de barras, com verificação de dígitos.
 *
 * Bancário (cobrança): código de barras 44 dígitos; linha digitável 47 dígitos
 *   = 3 campos com DV módulo 10 + DV geral (módulo 11) + fator de vencimento + valor.
 * Arrecadação/convênio (contas de consumo, tributos; código começa com 8):
 *   código de barras 44 dígitos; linha digitável 48 dígitos = 4 blocos de 11 + DV.
 *   O 3º dígito define o módulo dos DVs: 6/7 = módulo 10; 8/9 = módulo 11.
 */
import { addDays, diffDays, type ISODate } from "./dates";

export type BoletoKind = "bancario" | "arrecadacao";

export interface BoletoInfo {
  kind: BoletoKind;
  barcode: string; // 44 dígitos
  line: string; // 47 ou 48 dígitos (somente números)
  amountCents: number | null;
  dueDate: ISODate | null;
}

export type BoletoResult = ({ ok: true } & BoletoInfo) | { ok: false; error: string };

export function onlyDigits(s: string): string {
  return (s ?? "").replace(/\D/g, "");
}

export function mod10(digits: string): number {
  let sum = 0;
  let weight = 2;
  for (let i = digits.length - 1; i >= 0; i--) {
    let p = Number(digits[i]) * weight;
    if (p > 9) p = Math.floor(p / 10) + (p % 10);
    sum += p;
    weight = weight === 2 ? 1 : 2;
  }
  return (10 - (sum % 10)) % 10;
}

function mod11Sum(digits: string): number {
  let sum = 0;
  let weight = 2;
  for (let i = digits.length - 1; i >= 0; i--) {
    sum += Number(digits[i]) * weight;
    weight = weight === 9 ? 2 : weight + 1;
  }
  return sum;
}

/** DV geral do código de barras bancário (resultado 0, 10 ou 11 vira 1). */
export function mod11Bancario(digits: string): number {
  const dv = 11 - (mod11Sum(digits) % 11);
  return dv === 0 || dv === 10 || dv === 11 ? 1 : dv;
}

/** Módulo 11 de arrecadação (resto 0 ou 1 => 0; resto 10 => 1). */
export function mod11Arrecadacao(digits: string): number {
  const r = mod11Sum(digits) % 11;
  return r === 0 || r === 1 ? 0 : 11 - r;
}

// --------------------------- Bancário ---------------------------

const FACTOR_BASE_1997 = "1997-10-07";
const FACTOR_BASE_2025 = "2025-02-22"; // fator 1000 após o reinício de 22/02/2025

/** Converte fator de vencimento em data escolhendo o ciclo mais próximo da referência. */
export function factorToDate(factor: number, reference: ISODate): ISODate | null {
  if (!Number.isInteger(factor) || factor < 1000) return null; // 0000 = sem vencimento
  const a = addDays(FACTOR_BASE_1997, factor);
  const b = addDays(FACTOR_BASE_2025, factor - 1000);
  return Math.abs(diffDays(reference, a)) <= Math.abs(diffDays(reference, b)) ? a : b;
}

export function dateToFactor(date: ISODate): number {
  const d = diffDays(FACTOR_BASE_2025, date);
  if (d >= 0) return 1000 + (d % 9000);
  return diffDays(FACTOR_BASE_1997, date);
}

/** Monta código de barras bancário válido (usado em seeds/testes). */
export function buildBancarioBarcode(bank: string, factor: number, amountCents: number, freeField25: string): string {
  const head = bank.padStart(3, "0") + "9";
  const tail = String(factor).padStart(4, "0") + String(amountCents).padStart(10, "0") + freeField25.padStart(25, "0");
  if (head.length !== 4 || tail.length !== 39) throw new Error("partes inválidas");
  const dv = mod11Bancario(head + tail);
  return head + dv + tail;
}

export function bancarioBarcodeToLine(barcode: string): string {
  const b = barcode;
  const c1 = b.slice(0, 4) + b.slice(19, 24);
  const c2 = b.slice(24, 34);
  const c3 = b.slice(34, 44);
  return c1 + mod10(c1) + c2 + mod10(c2) + c3 + mod10(c3) + b[4] + b.slice(5, 19);
}

export function bancarioLineToBarcode(line: string): string {
  const L = line;
  return L.slice(0, 4) + L[32] + L.slice(33, 47) + L.slice(4, 9) + L.slice(10, 20) + L.slice(21, 31);
}

function validateBancarioBarcode(barcode: string): string | null {
  const dv = Number(barcode[4]);
  const calc = mod11Bancario(barcode.slice(0, 4) + barcode.slice(5));
  return dv === calc ? null : "dígito verificador geral do código de barras inválido";
}

function validateBancarioLine(line: string): string | null {
  const fields: [number, number][] = [[0, 9], [10, 20], [21, 31]];
  for (const [i, [start, dvPos]] of fields.entries()) {
    if (mod10(line.slice(start, dvPos)) !== Number(line[dvPos])) return `dígito verificador do campo ${i + 1} inválido`;
  }
  return validateBancarioBarcode(bancarioLineToBarcode(line));
}

// --------------------------- Arrecadação ---------------------------

function arrecadacaoModule(barcode: string): (d: string) => number {
  const id = barcode[2];
  if (id === "6" || id === "7") return mod10;
  if (id === "8" || id === "9") return mod11Arrecadacao;
  throw new Error("identificador de valor inválido");
}

export function buildArrecadacaoBarcode(segment: string, valueId: "6" | "7" | "8" | "9", amountCents: number, rest29: string): string {
  const head = "8" + segment + valueId;
  const tail = String(amountCents).padStart(11, "0") + rest29.padStart(29, "0");
  const mod = valueId === "6" || valueId === "7" ? mod10 : mod11Arrecadacao;
  return head + mod(head + tail) + tail;
}

export function arrecadacaoBarcodeToLine(barcode: string): string {
  const mod = arrecadacaoModule(barcode);
  let out = "";
  for (let i = 0; i < 4; i++) {
    const block = barcode.slice(i * 11, i * 11 + 11);
    out += block + mod(block);
  }
  return out;
}

export function arrecadacaoLineToBarcode(line: string): string {
  let out = "";
  for (let i = 0; i < 4; i++) out += line.slice(i * 12, i * 12 + 11);
  return out;
}

function validateArrecadacaoBarcode(barcode: string): string | null {
  if (barcode[0] !== "8") return "código de arrecadação deve começar com 8";
  let mod: (d: string) => number;
  try {
    mod = arrecadacaoModule(barcode);
  } catch {
    return "identificador de valor inválido (3º dígito)";
  }
  const calc = mod(barcode.slice(0, 3) + barcode.slice(4));
  return calc === Number(barcode[3]) ? null : "dígito verificador geral inválido";
}

function validateArrecadacaoLine(line: string): string | null {
  const barcode = arrecadacaoLineToBarcode(line);
  let mod: (d: string) => number;
  try {
    mod = arrecadacaoModule(barcode);
  } catch {
    return "identificador de valor inválido (3º dígito)";
  }
  for (let i = 0; i < 4; i++) {
    const block = line.slice(i * 12, i * 12 + 11);
    if (mod(block) !== Number(line[i * 12 + 11])) return `dígito verificador do bloco ${i + 1} inválido`;
  }
  return validateArrecadacaoBarcode(barcode);
}

// --------------------------- API pública ---------------------------

function infoFromBarcode(kind: BoletoKind, barcode: string, line: string, reference: ISODate): BoletoInfo {
  if (kind === "bancario") {
    const amount = Number(barcode.slice(9, 19));
    return { kind, barcode, line, amountCents: amount > 0 ? amount : null, dueDate: factorToDate(Number(barcode.slice(5, 9)), reference) };
  }
  const valueId = barcode[2];
  const amount = valueId === "6" || valueId === "8" ? Number(barcode.slice(4, 15)) : 0;
  return { kind, barcode, line, amountCents: amount > 0 ? amount : null, dueDate: null };
}

/**
 * Valida o que o usuário digitou/colou: linha digitável (47/48) ou código de
 * barras (44). Ignora espaços, pontos e traços.
 */
export function parseBoleto(raw: string, reference: ISODate = "2026-01-01"): BoletoResult {
  const d = onlyDigits(raw);
  if (d.length === 47) {
    const err = validateBancarioLine(d);
    return err ? { ok: false, error: err } : { ok: true, ...infoFromBarcode("bancario", bancarioLineToBarcode(d), d, reference) };
  }
  if (d.length === 48) {
    if (d[0] !== "8") return { ok: false, error: "linha de 48 dígitos deve começar com 8 (arrecadação)" };
    const err = validateArrecadacaoLine(d);
    return err ? { ok: false, error: err } : { ok: true, ...infoFromBarcode("arrecadacao", arrecadacaoLineToBarcode(d), d, reference) };
  }
  if (d.length === 44) {
    if (d[0] === "8") {
      const err = validateArrecadacaoBarcode(d);
      return err ? { ok: false, error: err } : { ok: true, ...infoFromBarcode("arrecadacao", d, arrecadacaoBarcodeToLine(d), reference) };
    }
    const err = validateBancarioBarcode(d);
    return err ? { ok: false, error: err } : { ok: true, ...infoFromBarcode("bancario", d, bancarioBarcodeToLine(d), reference) };
  }
  return { ok: false, error: "informe 44 (código de barras), 47 ou 48 dígitos (linha digitável)" };
}

/** Formata a linha digitável para exibição (com pontos e espaços). */
export function formatBoletoLine(line: string): string {
  if (line.length === 47) {
    return `${line.slice(0, 5)}.${line.slice(5, 10)} ${line.slice(10, 15)}.${line.slice(15, 21)} ${line.slice(21, 26)}.${line.slice(26, 32)} ${line[32]} ${line.slice(33)}`;
  }
  if (line.length === 48) {
    return [0, 1, 2, 3].map((i) => `${line.slice(i * 12, i * 12 + 11)}-${line[i * 12 + 11]}`).join(" ");
  }
  return line;
}
