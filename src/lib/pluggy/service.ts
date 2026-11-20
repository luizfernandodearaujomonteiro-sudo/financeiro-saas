/** Fluxo de conexão por membro + webhook. */
import "server-only";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { withService, withUser } from "../db";
import type { MemberCtx } from "../services/types";
import { MOCK_PREFIX } from "./mock";
import { getPluggyProvider } from "./provider";
import { syncItem } from "./sync";
import type { PluggyProvider } from "./types";

export function listMyItems(ctx: MemberCtx) {
  return withUser(ctx.userId, (db) =>
    db.query<{ id: string; item_id: string; connector_name: string | null; mode: string; status: string | null; last_sync_at: string | null; last_error: string | null }>(
      "select id, item_id, connector_name, mode, status, last_sync_at, last_error from public.fin_financeiro_pluggy_items where user_id = auth.uid() order by created_at",
    ),
  );
}

/** Registra um item recém-conectado pelo widget, após conferir que pertence ao membro. */
export async function registerItem(ctx: MemberCtx, itemId: string, provider: PluggyProvider = getPluggyProvider()) {
  const id = z.string().min(3).max(100).regex(/^[A-Za-z0-9-]+$/).parse(itemId);
  if (provider.mode === "mock") {
    if (!id.startsWith(MOCK_PREFIX)) throw new Error("item inválido");
  } else {
    const item = await provider.getItem(id);
    if (item.clientUserId !== ctx.userId) throw new Error("Este item não foi criado pela sua conexão");
  }
  await withUser(ctx.userId, (db) =>
    db.query("insert into public.fin_financeiro_pluggy_items (household_id, user_id, item_id, mode) values ($1, auth.uid(), $2, $3) on conflict (item_id) do nothing", [ctx.householdId, id, provider.mode]),
  );
  return id;
}

/** Modo mock: cria um item simulado para o membro (não chama nenhuma API). */
export async function createMockItem(ctx: MemberCtx) {
  return registerItem(ctx, `${MOCK_PREFIX}${randomUUID()}`, getPluggyProvider("mock"));
}

export async function removeItem(ctx: MemberCtx, itemId: string) {
  await withUser(ctx.userId, (db) => db.query("delete from public.fin_financeiro_pluggy_items where item_id = $1 and user_id = auth.uid()", [itemId]));
}

/** Sincronização manual: apenas itens do próprio membro. */
export async function syncMyItem(ctx: MemberCtx, itemId: string) {
  const mine = await withUser(ctx.userId, (db) => db.one<{ mode: string }>("select mode from public.fin_financeiro_pluggy_items where item_id = $1 and user_id = auth.uid()", [itemId]));
  if (!mine) throw new Error("Conexão não encontrada");
  return syncItem(itemId, getPluggyProvider(mine.mode as "live" | "sandbox" | "mock"));
}

export const webhookSchema = z.object({
  event: z.string().max(60),
  itemId: z.string().max(100).optional(),
  id: z.string().max(100).optional(),
});

/** Processa evento do webhook. O payload nunca é confiável: só usamos o itemId e buscamos os dados na API. */
export async function processWebhook(body: unknown) {
  const p = webhookSchema.safeParse(body);
  if (!p.success) return { ok: false, reason: "payload inválido" };
  const itemId = p.data.itemId ?? p.data.id;
  if (!itemId) return { ok: true, reason: "sem item" };
  const row = await withService((db) => db.one<{ mode: string }>("select mode from public.fin_financeiro_pluggy_items where item_id = $1", [itemId]));
  if (!row) return { ok: true, reason: "item desconhecido" }; // nada a fazer, sem revelar existência
  if (p.data.event === "item/deleted") {
    await withService((db) => db.query("update public.fin_financeiro_pluggy_items set status = 'removido' where item_id = $1", [itemId]));
    return { ok: true, reason: "removido" };
  }
  if (!["item/created", "item/updated", "transactions/created", "transactions/updated", "item/login_succeeded"].includes(p.data.event)) {
    return { ok: true, reason: `evento ignorado: ${p.data.event}` };
  }
  const result = await syncItem(itemId, getPluggyProvider(row.mode as "live" | "sandbox" | "mock"));
  return { ok: true, result };
}

/** Compartilhar/deixar pessoal uma conta ou cartão (e opcionalmente seus lançamentos já importados). */
export async function setAccountVisibility(ctx: MemberCtx, kind: "conta" | "cartao", id: string, visibility: "pessoal" | "compartilhado", applyToEntries: boolean) {
  await withUser(ctx.userId, async (db) => {
    const table = kind === "conta" ? "public.fin_financeiro_bank_accounts" : "public.fin_financeiro_cards";
    await db.query(`update ${table} set visibility = $2 where id = $1 and owner_id = auth.uid()`, [id, visibility]);
    if (applyToEntries) {
      const col = kind === "conta" ? "bank_account_id" : "card_id";
      await db.query(`update public.fin_financeiro_entries set visibility = $2 where ${col} = $1 and owner_id = auth.uid()`, [id, visibility]);
      if (kind === "cartao") await db.query("update public.fin_financeiro_bills set visibility = $2 where card_id = $1 and owner_id = auth.uid()", [id, visibility]);
    }
  });
}

export function listMyAccounts(ctx: MemberCtx) {
  return withUser(ctx.userId, (db) =>
    db.query<{ id: string; name: string; institution: string | null; balance_cents: number; visibility: string; pluggy_account_id: string | null; owner_id: string }>(
      "select id, name, institution, balance_cents, visibility, pluggy_account_id, owner_id from public.fin_financeiro_bank_accounts where household_id = $1 order by name",
      [ctx.householdId],
    ),
  );
}
