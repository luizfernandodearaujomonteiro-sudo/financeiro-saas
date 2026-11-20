import { z } from "zod";
import { withAnon, withUser } from "../db";
import { DEFAULT_UNDO_MINUTES } from "../domain/undo";
import { normalizePhone } from "../domain/phone";
import type { MemberCtx } from "./types";

export interface MemberRow {
  user_id: string;
  role: "owner" | "member";
  display_name: string;
  phone_e164: string | null;
}

export function listMembers(ctx: MemberCtx): Promise<MemberRow[]> {
  return withUser(ctx.userId, (db) =>
    db.query<MemberRow>(
      `select m.user_id, m.role, p.display_name, w.phone_e164
         from public.fin_financeiro_household_members m join public.fin_financeiro_profiles p on p.id = m.user_id
         left join public.fin_financeiro_whatsapp_numbers w on w.user_id = m.user_id
        where m.household_id = $1 order by m.role desc, p.display_name`,
      [ctx.householdId],
    ),
  );
}

export async function updateDisplayName(ctx: MemberCtx, name: string) {
  const v = z.string().trim().min(1).max(60).parse(name);
  await withUser(ctx.userId, (db) => db.query("update public.fin_financeiro_profiles set display_name = $1 where id = auth.uid()", [v]));
}

export async function createInvite(ctx: MemberCtx): Promise<string> {
  return withUser(ctx.userId, async (db) => (await db.one<{ t: string }>("select public.fin_financeiro_create_invite() as t"))!.t);
}

export async function inviteInfo(token: string): Promise<string | null> {
  return withAnon(async (db) => (await db.one<{ name: string | null }>("select fin_financeiro_private.fin_financeiro_invite_info($1) as name", [token]))?.name ?? null);
}

export async function acceptInvite(userId: string, token: string, displayName: string) {
  return withUser(userId, async (db) => (await db.one<{ h: string }>("select public.fin_financeiro_accept_invite($1, $2) as h", [token, displayName]))!.h);
}

export async function setMemberPhone(ctx: MemberCtx, userId: string, phoneRaw: string) {
  const phone = phoneRaw.trim() ? normalizePhone(phoneRaw) : "";
  if (phone === null) throw new Error("Telefone inválido. Use DDD + número, ex.: (11) 98765-4321");
  await withUser(ctx.userId, (db) => db.query("select public.fin_financeiro_set_member_phone($1, $2)", [userId, phone]));
  return phone;
}

export interface HouseholdSettings {
  whatsapp_undo_minutes: number;
  bill_alert_days: number;
}

export async function getSettings(ctx: MemberCtx): Promise<HouseholdSettings> {
  const r = await withUser(ctx.userId, (db) => db.one<HouseholdSettings>("select whatsapp_undo_minutes, bill_alert_days from public.fin_financeiro_household_settings where household_id = $1", [ctx.householdId]));
  return r ?? { whatsapp_undo_minutes: DEFAULT_UNDO_MINUTES, bill_alert_days: 3 };
}

export async function saveSettings(ctx: MemberCtx, raw: unknown) {
  const v = z.object({ undoMinutes: z.coerce.number().int().min(1).max(120), alertDays: z.coerce.number().int().min(0).max(15) }).parse(raw);
  await withUser(ctx.userId, (db) =>
    db.query(
      `insert into public.fin_financeiro_household_settings (household_id, whatsapp_undo_minutes, bill_alert_days) values ($1, $2, $3)
       on conflict (household_id) do update set whatsapp_undo_minutes = excluded.whatsapp_undo_minutes, bill_alert_days = excluded.bill_alert_days, updated_at = now()`,
      [ctx.householdId, v.undoMinutes, v.alertDays],
    ),
  );
}
