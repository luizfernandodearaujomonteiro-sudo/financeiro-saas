import { z } from "zod";
import { withUser } from "../db";
import type { MemberCtx } from "./types";

export interface Category {
  id: string;
  name: string;
  kind: "receita" | "despesa";
  color: string;
  active: boolean;
}

export function listCategories(ctx: MemberCtx): Promise<Category[]> {
  return withUser(ctx.userId, (db) =>
    db.query<Category>("select id, name, kind, color, active from public.fin_financeiro_categories where household_id = $1 order by kind desc, name", [ctx.householdId]),
  );
}

const categoryInput = z.object({
  name: z.string().trim().min(1).max(60),
  kind: z.enum(["receita", "despesa"]),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).default("#6366f1"),
});

export async function createCategory(ctx: MemberCtx, raw: unknown) {
  const v = categoryInput.parse(raw);
  return withUser(ctx.userId, (db) =>
    db.one<{ id: string }>("insert into public.fin_financeiro_categories (household_id, name, kind, color) values ($1,$2,$3,$4) returning id", [ctx.householdId, v.name, v.kind, v.color]),
  );
}

export async function toggleCategory(ctx: MemberCtx, id: string, active: boolean) {
  await withUser(ctx.userId, (db) => db.query("update public.fin_financeiro_categories set active = $2 where id = $1", [id, active]));
}

export async function deleteCategory(ctx: MemberCtx, id: string) {
  await withUser(ctx.userId, (db) => db.query("delete from public.fin_financeiro_categories where id = $1", [id]));
}
