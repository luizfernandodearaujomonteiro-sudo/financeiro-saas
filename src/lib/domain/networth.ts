import type { Cents } from "./money";

export interface NetWorthInput {
  accountBalancesCents: readonly Cents[];
  investmentsCents: Cents;
  /** Faturas de cartão não pagas (dívidas). */
  unpaidInvoicesCents: readonly Cents[];
}

export interface NetWorth {
  accountsCents: Cents;
  investmentsCents: Cents;
  debtsCents: Cents;
  netCents: Cents;
}

export function computeNetWorth(i: NetWorthInput): NetWorth {
  const accounts = i.accountBalancesCents.reduce((a, b) => a + b, 0);
  const debts = i.unpaidInvoicesCents.reduce((a, b) => a + Math.max(b, 0), 0);
  return { accountsCents: accounts, investmentsCents: i.investmentsCents, debtsCents: debts, netCents: accounts + i.investmentsCents - debts };
}

export function trendBp(previous: Cents | null | undefined, current: Cents): number | null {
  if (previous === null || previous === undefined || previous === 0) return null;
  return Math.round(((current - previous) * 10000) / Math.abs(previous));
}
