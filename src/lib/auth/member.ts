/**
 * Pertencimento à família. auth.users é compartilhado com outros apps:
 * estar logado NÃO basta — é preciso existir uma linha em fam_household_members.
 */
import "server-only";
import { redirect } from "next/navigation";
import { withUser } from "../db";
import { getSessionUser, type SessionUser } from "./session";

export interface Member {
  userId: string;
  householdId: string;
  householdName: string;
  role: "owner" | "member";
  displayName: string;
}

export interface Ctx {
  user: SessionUser;
  member: Member;
}

export async function loadMembership(userId: string): Promise<Member | null> {
  return withUser(userId, (db) =>
    db.one<Member>(
      `select m.user_id as "userId", m.household_id as "householdId", h.name as "householdName",
              m.role, p.display_name as "displayName"
         from public.fam_household_members m
         join public.fam_households h on h.id = m.household_id
         join public.fam_profiles p on p.id = m.user_id
        where m.user_id = auth.uid()`,
    ),
  );
}

/** Para páginas e server actions: exige login + família. */
export async function requireCtx(): Promise<Ctx> {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  const member = await loadMembership(user.id);
  if (!member) redirect("/sem-acesso");
  return { user, member };
}

export async function requireOwner(): Promise<Ctx> {
  const ctx = await requireCtx();
  if (ctx.member.role !== "owner") throw new Error("Apenas o dono da família pode fazer isso");
  return ctx;
}
