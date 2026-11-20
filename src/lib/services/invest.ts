/** Investimentos: leitura das tabelas invest_* via RPCs SECURITY DEFINER (somente leitura). */
import { withUser } from "../db";
import { averagePriceCents, computePosition, decimalToScaled, marketValueCents, toSafeNumber, type InvestTx } from "../domain/invest";
import type { MemberCtx } from "./types";

export interface PositionView {
  ownerId: string;
  ownerName: string;
  holdingId: string;
  ticker: string;
  assetName: string;
  assetType: string;
  currency: string;
  brokerName: string | null;
  quantity: number; // apenas exibição
  avgPriceCents: number;
  costCents: number;
  marketValueCents: number | null;
  pnlCents: number | null;
  dividendsCents: number;
  priceFetchedAt: string | null;
}

export async function linkInvestProfile(ctx: MemberCtx, visibility: "pessoal" | "compartilhado") {
  return withUser(ctx.userId, async (db) => (await db.one<{ ok: boolean }>("select public.fam_link_invest_profile($1) as ok", [visibility]))?.ok ?? false);
}

export async function investLinkStatus(ctx: MemberCtx) {
  return withUser(ctx.userId, (db) => db.one<{ visibility: string }>("select visibility from public.fam_invest_links where user_id = auth.uid()"));
}

export async function setInvestVisibility(ctx: MemberCtx, visibility: "pessoal" | "compartilhado") {
  await withUser(ctx.userId, (db) => db.query("update public.fam_invest_links set visibility = $1 where user_id = auth.uid()", [visibility]));
}

export async function unlinkInvest(ctx: MemberCtx) {
  await withUser(ctx.userId, (db) => db.query("delete from public.fam_invest_links where user_id = auth.uid()"));
}

interface RawPos {
  owner_id: string; owner_name: string; holding_id: string; ticker: string; asset_name: string; asset_type: string; currency: string;
  broker_name: string | null; total_quantity: string; average_price: string; total_invested: string; current_price: string | null; price_fetched_at: string | null;
}

export async function listPositions(ctx: MemberCtx): Promise<PositionView[]> {
  return withUser(ctx.userId, async (db) => {
    let rows: RawPos[] = [];
    let txs: (InvestTx & { holding_id: string })[] = [];
    try {
      rows = await db.query<RawPos>("select * from public.fam_invest_positions()");
      txs = await db.query<InvestTx & { holding_id: string }>("select * from public.fam_invest_transactions()");
    } catch {
      return []; // tabelas invest_* indisponíveis neste banco
    }
    return rows.map((r) => {
      const mine = txs.filter((t) => t.holding_id === r.holding_id);
      // Se houver transações, recalcula a posição corretamente (corrige preço médio após vendas).
      const pos = mine.length
        ? computePosition(mine)
        : { quantityE8: decimalToScaled(r.total_quantity, 8), costCents: decimalToScaled(r.total_invested, 2), realizedCents: 0n, dividendsCents: 0n };
      const mv = r.current_price ? marketValueCents(pos.quantityE8, r.current_price) : null;
      return {
        ownerId: r.owner_id, ownerName: r.owner_name, holdingId: r.holding_id, ticker: r.ticker, assetName: r.asset_name, assetType: r.asset_type,
        currency: r.currency, brokerName: r.broker_name, quantity: Number(pos.quantityE8) / 1e8,
        avgPriceCents: toSafeNumber(averagePriceCents(pos)), costCents: toSafeNumber(pos.costCents),
        marketValueCents: mv === null ? null : toSafeNumber(mv), pnlCents: mv === null ? null : toSafeNumber(mv - pos.costCents),
        dividendsCents: toSafeNumber(pos.dividendsCents), priceFetchedAt: r.price_fetched_at,
      };
    });
  });
}
