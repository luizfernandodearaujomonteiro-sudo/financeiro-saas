import { withUser } from "../db";
import { currentMonthStart } from "../domain/dates";
import { computeNetWorth, type NetWorth } from "../domain/networth";
import { listPositions } from "./invest";
import type { MemberCtx } from "./types";

/**
 * Patrimônio em duas visões:
 *  - família: somente itens compartilhados (contas, cartões, investimentos);
 *  - meu: itens de que sou dono (pessoais e compartilhados).
 * Grava fotografia mensal (fin_financeiro_networth_snapshots) para a tendência.
 */
export async function computeAndSnapshot(ctx: MemberCtx, month = currentMonthStart()) {
  const positions = await listPositions(ctx);
  return withUser(ctx.userId, async (db) => {
    const accounts = await db.query<{ owner_id: string; visibility: string; balance_cents: number }>("select owner_id, visibility, balance_cents from public.fin_financeiro_bank_accounts where household_id = $1", [ctx.householdId]);
    const invoices = await db.query<{ owner_id: string; visibility: string; total_cents: number }>(
      `select c.owner_id, c.visibility, i.total_cents from public.fin_financeiro_invoices i join public.fin_financeiro_cards c on c.id = i.card_id
        where i.household_id = $1 and i.status <> 'paga' and i.total_cents > 0`,
      [ctx.householdId],
    );
    const links = await db.query<{ user_id: string; visibility: string }>("select user_id, visibility from public.fin_financeiro_invest_links where household_id = $1", [ctx.householdId]);
    const sharedInvestors = new Set(links.filter((l) => l.visibility === "compartilhado").map((l) => l.user_id));
    const investValue = (pred: (ownerId: string) => boolean) =>
      positions.filter((p) => pred(p.ownerId)).reduce((a, p) => a + (p.marketValueCents ?? p.costCents), 0);

    const family = computeNetWorth({
      accountBalancesCents: accounts.filter((a) => a.visibility === "compartilhado").map((a) => a.balance_cents),
      investmentsCents: investValue((o) => sharedInvestors.has(o)),
      unpaidInvoicesCents: invoices.filter((i) => i.visibility === "compartilhado").map((i) => i.total_cents),
    });
    const mine = computeNetWorth({
      accountBalancesCents: accounts.filter((a) => a.owner_id === ctx.userId).map((a) => a.balance_cents),
      investmentsCents: investValue((o) => o === ctx.userId),
      unpaidInvoicesCents: invoices.filter((i) => i.owner_id === ctx.userId).map((i) => i.total_cents),
    });
    const upsert = async (userId: string | null, nw: NetWorth) => {
      const existing = await db.one<{ id: string }>(
        "select id from public.fin_financeiro_networth_snapshots where household_id = $1 and user_id is not distinct from $2 and month = $3",
        [ctx.householdId, userId, month],
      );
      if (existing) {
        await db.query("update public.fin_financeiro_networth_snapshots set accounts_cents=$2, investments_cents=$3, debts_cents=$4, net_cents=$5, updated_at=now() where id=$1",
          [existing.id, nw.accountsCents, nw.investmentsCents, nw.debtsCents, nw.netCents]);
      } else {
        await db.query("insert into public.fin_financeiro_networth_snapshots (household_id, user_id, month, accounts_cents, investments_cents, debts_cents, net_cents) values ($1,$2,$3,$4,$5,$6,$7)",
          [ctx.householdId, userId, month, nw.accountsCents, nw.investmentsCents, nw.debtsCents, nw.netCents]);
      }
    };
    await upsert(null, family);
    await upsert(ctx.userId, mine);
    const history = await db.query<{ user_id: string | null; month: string; net_cents: number; accounts_cents: number; investments_cents: number; debts_cents: number }>(
      "select user_id, month, net_cents, accounts_cents, investments_cents, debts_cents from public.fin_financeiro_networth_snapshots where household_id = $1 order by month desc limit 48",
      [ctx.householdId],
    );
    return {
      family,
      mine,
      familyHistory: history.filter((h) => h.user_id === null).reverse().slice(-12),
      myHistory: history.filter((h) => h.user_id === ctx.userId).reverse().slice(-12),
    };
  });
}
