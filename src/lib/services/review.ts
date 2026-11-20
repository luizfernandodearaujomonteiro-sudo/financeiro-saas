import { z } from "zod";
import { withUser } from "../db";
import { suggestCategory } from "../domain/categorize";
import { monthStartOf, todayISO } from "../domain/dates";
import { installmentSlot } from "../domain/invoices";
import { normalizeText } from "../domain/text";
import { parseStatementText, type StatementItem } from "../importers/statement-parser";
import { sha256Hex } from "../security/crypto";
import { isoDate, moneyInput, optionalUuid, visibility } from "../validation";
import { ensureInvoice } from "./cards";
import type { MemberCtx } from "./types";

export interface ReviewRow {
  id: string;
  source: string;
  status: string;
  card_id: string | null;
  card_nickname: string | null;
  kind: "receita" | "despesa";
  description: string;
  amount_cents: number;
  occurred_on: string;
  installment_number: number | null;
  installment_total: number | null;
  suggested_category: string | null;
  category_name: string | null;
  document_id: string | null;
  file_name: string | null;
  created_at: string;
}

export function listReview(ctx: MemberCtx, status: "pendente" | "todas" = "pendente"): Promise<ReviewRow[]> {
  return withUser(ctx.userId, (db) =>
    db.query<ReviewRow>(
      `select r.id, r.source, r.status, r.card_id, c.nickname as card_nickname, r.kind, r.description, r.amount_cents, r.occurred_on,
              r.installment_number, r.installment_total, r.suggested_category, cat.name as category_name, r.document_id, d.file_name, r.created_at
         from public.fin_financeiro_review_queue r
         left join public.fin_financeiro_cards c on c.id = r.card_id
         left join public.fin_financeiro_categories cat on cat.id = r.suggested_category
         left join public.fin_financeiro_invoice_documents d on d.id = r.document_id
        where r.household_id = $1 ${status === "pendente" ? "and r.status = 'pendente'" : ""}
        order by r.status = 'pendente' desc, r.occurred_on desc limit 300`,
      [ctx.householdId],
    ),
  );
}

export function reviewDedupeHash(ownerId: string, cardId: string | null, item: StatementItem, occurrence: number): string {
  return sha256Hex([ownerId, cardId ?? "-", item.occurredOn, normalizeText(item.description), item.amountCents, item.kind,
    item.installmentNumber ?? 0, item.installmentTotal ?? 0, occurrence].join("|"));
}

/** Coloca os itens de uma fatura na fila de revisão do dono (idempotente). */
export async function ingestStatement(
  ctx: MemberCtx,
  input: { text?: string; items?: StatementItem[]; source: "gmail" | "upload" | "pluggy"; documentId?: string | null; cardId?: string | null; reference?: string },
) {
  const items = input.items ?? parseStatementText(input.text ?? "", input.reference ?? todayISO());
  return withUser(ctx.userId, async (db) => {
    const cats = await db.query<{ id: string; name: string; kind: "receita" | "despesa" }>("select id, name, kind from public.fin_financeiro_categories where household_id = $1 and active", [ctx.householdId]);
    const history = (await db.query<{ description: string; category_id: string | null; kind: "receita" | "despesa" }>(
      "select description, category_id, kind from public.fin_financeiro_entries where household_id = $1 and category_id is not null order by created_at desc limit 500",
      [ctx.householdId],
    )).map((h) => ({ description: h.description, categoryId: h.category_id, kind: h.kind }));
    const seen = new Map<string, number>();
    let inserted = 0;
    for (const item of items) {
      const baseKey = `${item.occurredOn}|${normalizeText(item.description)}|${item.amountCents}|${item.installmentNumber}`;
      const occ = seen.get(baseKey) ?? 0;
      seen.set(baseKey, occ + 1);
      const r = await db.one<{ id: string }>(
        `insert into public.fin_financeiro_review_queue (household_id, owner_id, source, document_id, card_id, kind, description, amount_cents,
            occurred_on, installment_number, installment_total, suggested_category, dedupe_hash)
         values ($1, auth.uid(), $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
         on conflict (household_id, dedupe_hash) do nothing returning id`,
        [ctx.householdId, input.source, input.documentId ?? null, input.cardId ?? null, item.kind, item.description, item.amountCents,
         item.occurredOn, item.installmentNumber, item.installmentTotal, suggestCategory(item.description, item.kind, history, cats),
         reviewDedupeHash(ctx.userId, input.cardId ?? null, item, occ)],
      );
      if (r) inserted++;
    }
    return { parsed: items.length, inserted, duplicates: items.length - inserted };
  });
}

const approveInput = z.object({
  description: z.string().trim().min(1).max(140),
  amountCents: moneyInput,
  occurredOn: isoDate,
  categoryId: optionalUuid,
  cardId: optionalUuid,
  visibility: visibility.default("pessoal"),
});

/** Aprova (com edições opcionais) e cria o lançamento correspondente. */
export async function approveReview(ctx: MemberCtx, id: string, raw?: unknown) {
  return withUser(ctx.userId, async (db) => {
    const item = await db.one<ReviewRow & { owner_id: string }>("select * from public.fin_financeiro_review_queue where id = $1 and status = 'pendente'", [id]);
    if (!item) throw new Error("Item não encontrado ou já revisado");
    const v = approveInput.parse(raw ?? {
      description: item.description, amountCents: item.amount_cents, occurredOn: item.occurred_on,
      categoryId: item.suggested_category ?? undefined, cardId: item.card_id ?? undefined, visibility: "pessoal",
    });
    let entryId: string;
    if (v.cardId) {
      const card = await db.one<{ closing_day: number; due_day: number }>("select closing_day, due_day from public.fin_financeiro_cards where id = $1", [v.cardId]);
      if (!card) throw new Error("Cartão não encontrado");
      const slot = installmentSlot({ closingDay: card.closing_day, dueDay: card.due_day }, v.occurredOn, item.installment_number);
      const invoiceId = await ensureInvoice(db, ctx.householdId, v.cardId, slot);
      const e = await db.one<{ id: string }>(
        `insert into public.fin_financeiro_entries (household_id, owner_id, visibility, kind, description, amount_cents, occurred_on, budget_month, category_id,
            payment_method, cost_type, card_id, invoice_id, installment_number, installment_total, source, external_id)
         values ($1, auth.uid(), $2, $3, $4, $5, $6, $7, $8, 'cartao_credito', 'variavel', $9, $10, $11, $12, $13, $14) returning id`,
        [ctx.householdId, v.visibility, item.kind, v.description, v.amountCents, v.occurredOn, slot.referenceMonth, v.categoryId ?? null,
         v.cardId, invoiceId, item.installment_number, item.installment_total, item.source === "upload" ? "gmail" : item.source, `review:${id}`],
      );
      entryId = e!.id;
    } else {
      const e = await db.one<{ id: string }>(
        `insert into public.fin_financeiro_entries (household_id, owner_id, visibility, kind, description, amount_cents, occurred_on, budget_month, category_id,
            payment_method, cost_type, installment_number, installment_total, source, external_id)
         values ($1, auth.uid(), $2, $3, $4, $5, $6, $7, $8, 'transferencia', 'variavel', $9, $10, $11, $12) returning id`,
        [ctx.householdId, v.visibility, item.kind, v.description, v.amountCents, v.occurredOn, monthStartOf(v.occurredOn), v.categoryId ?? null,
         item.installment_number, item.installment_total, item.source === "upload" ? "gmail" : item.source, `review:${id}`],
      );
      entryId = e!.id;
    }
    await db.query(
      "update public.fin_financeiro_review_queue set status = 'aprovado', reviewed_at = now(), entry_id = $2, description = $3, amount_cents = $4, occurred_on = $5, suggested_category = $6, card_id = $7 where id = $1",
      [id, entryId, v.description, v.amountCents, v.occurredOn, v.categoryId ?? null, v.cardId ?? null],
    );
    return entryId;
  });
}

export async function rejectReview(ctx: MemberCtx, id: string) {
  await withUser(ctx.userId, (db) => db.query("update public.fin_financeiro_review_queue set status = 'rejeitado', reviewed_at = now() where id = $1 and status = 'pendente'", [id]));
}
