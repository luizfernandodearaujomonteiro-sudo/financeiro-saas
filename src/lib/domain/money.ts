/**
 * Dinheiro sempre em CENTAVOS inteiros (number seguro até 2^53).
 * Nenhuma conta monetária usa float: parse e formatação são feitos em texto,
 * e multiplicações/divisões com arredondamento usam BigInt.
 */
export type Cents = number;

const MAX_CENTS = Number.MAX_SAFE_INTEGER;

export function isCents(n: unknown): n is Cents {
  return typeof n === "number" && Number.isSafeInteger(n);
}

export function assertCents(n: number, label = "valor"): Cents {
  if (!Number.isSafeInteger(n)) throw new Error(`${label} precisa ser inteiro em centavos`);
  return n;
}

/**
 * Converte texto em reais para centavos. Aceita "1.234,56", "1234,56", "1234.56",
 * "R$ 50", "50", "32,9", "-10,00". Rejeita mais de 2 casas decimais.
 */
export function parseBRL(input: string): Cents | null {
  if (typeof input !== "string") return null;
  let s = input.trim().replace(/^R\$\s*/i, "").replace(/\s/g, "");
  let negative = false;
  if (s.startsWith("-")) {
    negative = true;
    s = s.slice(1).replace(/^R\$/i, "");
  }
  if (!s) return null;
  let whole: string;
  let frac = "";
  if (s.includes(",")) {
    const parts = s.split(",");
    if (parts.length !== 2) return null;
    whole = parts[0]!.replace(/\./g, "");
    frac = parts[1]!;
    if (!/^\d{1,3}(\.\d{3})*$|^\d+$/.test(parts[0]!) && parts[0] !== "") return null;
  } else if (s.includes(".")) {
    const parts = s.split(".");
    const last = parts[parts.length - 1]!;
    if (parts.length === 2 && last.length <= 2) {
      whole = parts[0]!;
      frac = last;
    } else if (parts.slice(1).every((p) => p.length === 3)) {
      whole = parts.join("");
    } else {
      return null;
    }
  } else {
    whole = s;
  }
  if (whole === "") whole = "0";
  if (!/^\d+$/.test(whole) || !/^\d{0,2}$/.test(frac)) return null;
  const cents = BigInt(whole) * 100n + BigInt((frac + "00").slice(0, 2));
  if (cents > BigInt(MAX_CENTS)) return null;
  const n = Number(cents);
  return negative ? -n : n;
}

/** Converte um decimal vindo de API (number ou string, ex.: 123.4) em centavos, arredondando metade para cima. */
export function decimalToCents(value: number | string): Cents {
  const s = typeof value === "number" ? value.toFixed(6) : String(value).trim();
  const m = /^(-?)(\d+)(?:\.(\d+))?$/.exec(s);
  if (!m) throw new Error(`decimal inválido: ${s}`);
  const neg = m[1] === "-";
  const digits = (m[3] ?? "").padEnd(3, "0");
  let cents = BigInt(m[2]!) * 100n + BigInt(digits.slice(0, 2));
  if (Number(digits[2]) >= 5) cents += 1n;
  const n = Number(cents);
  return neg ? -n : n;
}

function groupThousands(n: bigint): string {
  return n.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".");
}

/** Formata centavos como "R$ 1.234,56" (sem float). */
export function formatBRL(cents: Cents, opts: { sign?: boolean } = {}): string {
  assertCents(cents);
  const neg = cents < 0;
  const abs = BigInt(Math.abs(cents));
  const body = `R$ ${groupThousands(abs / 100n)},${(abs % 100n).toString().padStart(2, "0")}`;
  if (neg) return `-${body}`;
  return opts.sign && cents > 0 ? `+${body}` : body;
}

/** Formata para campo de formulário: "1234,56". */
export function centsToInput(cents: Cents): string {
  const abs = Math.abs(cents);
  return `${cents < 0 ? "-" : ""}${Math.floor(abs / 100)},${String(abs % 100).padStart(2, "0")}`;
}

export function sumCents(values: readonly Cents[]): Cents {
  let total = 0n;
  for (const v of values) total += BigInt(assertCents(v));
  if (total > BigInt(MAX_CENTS) || total < -BigInt(MAX_CENTS)) throw new Error("soma excede limite seguro");
  return Number(total);
}

/** round(a * b / c), metade para longe do zero, em BigInt. */
export function mulDivRound(a: Cents, b: number, c: number): Cents {
  if (c === 0) throw new Error("divisão por zero");
  const A = BigInt(a), B = BigInt(b), C = BigInt(c);
  const num = A * B;
  const neg = (num < 0n) !== (C < 0n);
  const absNum = num < 0n ? -num : num;
  const absC = C < 0n ? -C : C;
  const q = (absNum * 2n + absC) / (absC * 2n);
  return Number(neg ? -q : q);
}

/** Parte/total em pontos-base (10000 = 100%). Retorna null se total = 0. */
export function basisPoints(part: Cents, whole: Cents): number | null {
  if (whole === 0) return null;
  return mulDivRound(part, 10000, whole);
}

export function formatBp(bp: number | null, digits = 1): string {
  if (bp === null) return "—";
  const neg = bp < 0;
  const abs = Math.abs(bp);
  const scaled = digits === 0 ? Math.round(abs / 100) : Math.round(abs / 10);
  const str = digits === 0 ? String(scaled) : `${Math.floor(scaled / 10)},${scaled % 10}`;
  return `${neg ? "-" : ""}${str}%`;
}

/**
 * Divide um total em N parcelas inteiras cuja soma é exatamente o total.
 * Os centavos restantes vão para as primeiras parcelas (prática usual de mercado).
 */
export function splitInstallments(totalCents: Cents, n: number): Cents[] {
  assertCents(totalCents, "total");
  if (!Number.isInteger(n) || n < 1 || n > 48) throw new Error("número de parcelas inválido (1 a 48)");
  if (totalCents <= 0) throw new Error("total precisa ser positivo");
  const base = Math.floor(totalCents / n);
  const rem = totalCents - base * n;
  return Array.from({ length: n }, (_, i) => base + (i < rem ? 1 : 0));
}
