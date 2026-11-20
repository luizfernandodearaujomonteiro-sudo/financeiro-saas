/**
 * Posição de investimentos calculada a partir das transações (somente leitura
 * das tabelas invest_*). Corrige o bug do invest-tracker (BUG-07): vendas
 * reduzem a quantidade e baixam o custo PROPORCIONALMENTE ao preço médio,
 * sem alterar o preço médio.
 * Quantidades com 8 casas (escala 1e8) e valores em centavos, tudo em BigInt.
 */
export const QTY_SCALE = 100_000_000n;

export function decimalToScaled(value: string | number | null | undefined, scale: number): bigint {
  if (value === null || value === undefined || value === "") return 0n;
  const s = typeof value === "number" ? value.toFixed(scale + 2) : String(value).trim();
  const m = /^(-?)(\d+)(?:\.(\d+))?(?:e([+-]?\d+))?$/i.exec(s);
  if (!m) throw new Error(`decimal inválido: ${s}`);
  if (m[4]) return decimalToScaled(Number(s).toFixed(scale + 2), scale);
  const frac = (m[3] ?? "").padEnd(scale + 1, "0");
  let v = BigInt(m[2]!) * 10n ** BigInt(scale) + BigInt(frac.slice(0, scale) || "0");
  if (Number(frac[scale]) >= 5) v += 1n;
  return m[1] === "-" ? -v : v;
}

export interface InvestTx {
  type: string; // buy | sell | dividend | split | transfer_in | transfer_out
  quantity: string | number;
  total_value: string | number;
  fees?: string | number | null;
}

export interface Position {
  quantityE8: bigint;
  costCents: bigint;
  realizedCents: bigint;
  dividendsCents: bigint;
}

export function computePosition(txs: readonly InvestTx[]): Position {
  let qty = 0n, cost = 0n, realized = 0n, dividends = 0n;
  for (const t of txs) {
    const q = decimalToScaled(t.quantity, 8);
    const v = decimalToScaled(t.total_value, 2);
    const fee = decimalToScaled(t.fees ?? 0, 2);
    switch (t.type) {
      case "buy":
      case "transfer_in":
        qty += q;
        cost += v + (t.type === "buy" ? fee : 0n);
        break;
      case "sell":
      case "transfer_out": {
        if (qty <= 0n) break;
        const sold = q > qty ? qty : q;
        const removed = (cost * sold * 2n + qty) / (qty * 2n); // custo proporcional, arredondado
        if (t.type === "sell") realized += v - fee - removed;
        cost -= removed;
        qty -= sold;
        if (qty === 0n) cost = 0n;
        break;
      }
      case "dividend":
        dividends += v;
        break;
      case "split":
        qty += q; // desdobramento: entra quantidade sem custo
        break;
    }
  }
  return { quantityE8: qty, costCents: cost, realizedCents: realized, dividendsCents: dividends };
}

/** Preço médio em centavos por unidade (arredondado). */
export function averagePriceCents(p: Position): bigint {
  if (p.quantityE8 === 0n) return 0n;
  return (p.costCents * QTY_SCALE * 2n + p.quantityE8) / (p.quantityE8 * 2n);
}

/** Valor de mercado = quantidade × preço (preço em string decimal por unidade). */
export function marketValueCents(quantityE8: bigint, price: string | number | null | undefined): bigint {
  const priceE8 = decimalToScaled(price, 8); // preço com 8 casas
  // qty(1e8) * price(1e8) / 1e14 => centavos
  const num = quantityE8 * priceE8;
  const den = 10n ** 14n; // 1e8 (qtd) * 1e8 (preço) / 100 (centavos)
  return (num * 2n + den) / (den * 2n);
}

export function toSafeNumber(b: bigint): number {
  if (b > BigInt(Number.MAX_SAFE_INTEGER) || b < -BigInt(Number.MAX_SAFE_INTEGER)) throw new Error("valor fora do limite seguro");
  return Number(b);
}
