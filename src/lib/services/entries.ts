import { z } from "zod";
import { withUser, type Db } from "../db";
import { monthStartOf, type MonthStart } from "../domain/dates";
import { entryInput } from "../validation";
import { viewFilter, type MemberCtx, type View } from "./types";

export interface EntryRow {
  id: string;
  owner_id: string;
  owner_name: string;
  visibility: "pessoal" | "compartilhado";
  kind: "receita" | "despesa";
  description: string;
  amount_cents: number;
  occurred_on: string;
  budget_month: string;
  category_id: string | null;
  category_name: string | null;
  category_color: string | null;
  payment_method: string;
  cost_type: "fixa" | "variavel";
  card_id: string | null;
  card_nickname: string | null;
  installment_number: number | null;
  installment_total: number | null;
  source: string;
  notes: string | null;
  created_at: string;
  exclude_from_reports: boolean;
  exclude_reason: "pagamento_fatura" | "transferencia" | "manual" | null;
}

export const ENTRY_SELECT = `
  select e.id, e.owner_id, p.display_name as owner_name, e.visibility, e.kind, e.description, e.amount_cents,
         e.occurred_on, e.budget_month, e.category_id, c.name as category_name, c.color as category_color,
         e.payment_method, e.cost_type, e.card_id, cd.nickname as card_nickname, e.installment_number,
         e.installment_total, e.source, e.notes, e.created_at, e.exclude_from_reports, e.exclude_reason
    from public.fam_entries e
    join public.fam_profiles p on p.id = e.owner_id
    left join public.fam_categories c on c.id = e.category_id
    left join public.fam_cards cd on cd.id = e.card_id`;

export function listEntriesForMonth(ctx: MemberCtx, month: MonthStart, view: View = "tudo"): Promise<EntryRow[]> {
  const f = viewFilter(view);
  return withUser(ctx.userId, (db) =>
    db.query<EntryRow>(`${ENTRY_SELECT} where e.household_id = $1 and e.budget_month = $2${f.sql} order by e.occurred_on desc, e.created_at desc`, [ctx.householdId, month]),
  );
}

export function listEntriesBetween(ctx: MemberCtx, fromMonth: MonthStart, toMonth: MonthStart, view: View = "tudo"): Promise<EntryRow[]> {
  const f = viewFilter(view);
  return withUser(ctx.userId, (db) =>
    db.query<EntryRow>(`${ENTRY_SELECT} where e.household_id = $1 and e.budget_month between $2 and $3${f.sql} order by e.occurred_on desc`, [ctx.householdId, fromMonth, toMonth]),
  );
}

export async function insertEntry(db: Db, ctx: MemberCtx, v: z.infer<typeof entryInput> & { source?: string; externalId?: string | null; bankAccountId?: string | null }) {
  return db.one<{ id: string }>(
    `insert into public.fam_entries (household_id, owner_id, visibility, kind, description, amount_cents, occurred_on, budget_month,
        category_id, payment_method, cost_type, notes, source, external_id, bank_account_id)
     values ($1, auth.uid(), $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
     on conflict (household_id, source, external_id) where external_id is not null do nothing
     returning id`,
    [ctx.householdId, v.visibility, v.kind, v.description, v.amountCents, v.occurredOn, monthStartOf(v.occurredOn), v.categoryId ?? null,
     v.paymentMethod === "cartao_credito" || v.paymentMethod === "cartao_debito" ? "pix" : v.paymentMethod, v.costType, v.notes ?? null,
     v.source ?? "manual", v.externalId ?? null, v.bankAccountId ?? null],
  );
}

export async function createEntry(ctx: MemberCtx, raw: unknown) {
  const v = entryInput.parse(raw);
  return withUser(ctx.userId, (db) => insertEntry(db, ctx, v));
}

export async function updateEntry(ctx: MemberCtx, id: string, raw: unknown) {
  const v = entryInput.parse(raw);
  return withUser(ctx.userId, async (db) => {
    const cur = await db.one<{ card_id: string | null }>("select card_id from public.fam_entries where id = $1 and owner_id = auth.uid()", [id]);
    if (!cur) throw new Error("Lançamento não encontrado ou de outra pessoa");
    // lançamentos de cartão mantêm mês da fatura e forma de pagamento
    if (cur.card_id) {
      await db.query(
        "update public.fam_entries set description=$2, amount_cents=$3, category_id=$4, cost_type=$5, visibility=$6, notes=$7 where id=$1",
        [id, v.description, v.amountCents, v.categoryId ?? null, v.costType, v.visibility, v.notes ?? null],
      );
    } else {
      await db.query(
        `update public.fam_entries set kind=$2, description=$3, amount_cents=$4, occurred_on=$5, budget_month=$6, category_id=$7,
           payment_method=$8, cost_type=$9, visibility=$10, notes=$11 where id=$1`,
        [id, v.kind, v.description, v.amountCents, v.occurredOn, monthStartOf(v.occurredOn), v.categoryId ?? null,
         v.paymentMethod === "cartao_credito" || v.paymentMethod === "cartao_debito" ? "pix" : v.paymentMethod, v.costType, v.visibility, v.notes ?? null],
      );
    }
  });
}

export async function setEntryVisibility(ctx: MemberCtx, id: string, vis: "pessoal" | "compartilhado") {
  await withUser(ctx.userId, (db) => db.query("update public.fam_entries set visibility = $2 where id = $1 and owner_id = auth.uid()", [id, vis]));
}

/** Marca/desmarca "pagamento de fatura / transferência" (fora dos relatórios). Só o dono. */
export async function setEntryExclusion(ctx: MemberCtx, id: string, exclude: boolean) {
  await withUser(ctx.userId, (db) =>
    db.query(
      "update public.fam_entries set exclude_from_reports = $2, exclude_reason = case when $2 then coalesce(exclude_reason, 'manual') else null end where id = $1 and owner_id = auth.uid()",
      [id, exclude],
    ),
  );
}

export async function deleteEntry(ctx: MemberCtx, id: string) {
  return withUser(ctx.userId, async (db) => {
    const row = await db.one<{ purchase_id: string | null }>("select purchase_id from public.fam_entries where id = $1 and owner_id = auth.uid()", [id]);
    if (!row) return false;
    if (row.purchase_id) await db.query("delete from public.fam_card_purchases where id = $1", [row.purchase_id]); // remove todas as parcelas
    else await db.query("delete from public.fam_entries where id = $1", [id]);
    return true;
  });
}
