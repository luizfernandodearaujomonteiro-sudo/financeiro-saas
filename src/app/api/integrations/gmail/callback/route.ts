import { cookies } from "next/headers";
import { getSessionUser } from "@/lib/auth/session";
import { withUser } from "@/lib/db";
import { env } from "@/lib/env";
import { exchangeCode, fetchEmail, verifyState } from "@/lib/gmail/oauth";
import { encryptSecret } from "@/lib/security/crypto";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const user = await getSessionUser();
  const store = await cookies();
  const nonce = store.get("fin_financeiro_oauth_nonce")?.value;
  store.delete("fin_financeiro_oauth_nonce");
  if (!user || !verifyState(url.searchParams.get("state"), user.id, nonce)) return Response.redirect(`${env.appUrl}/configuracoes?gmail=erro-estado`, 303);
  const code = url.searchParams.get("code");
  if (!code) return Response.redirect(`${env.appUrl}/configuracoes?gmail=cancelado`, 303);
  try {
    const tokens = await exchangeCode(code);
    if (!tokens.refresh_token) return Response.redirect(`${env.appUrl}/configuracoes?gmail=sem-refresh`, 303);
    const email = await fetchEmail(tokens.access_token);
    // token cifrado na aplicação e gravado via RPC do próprio usuário (sem service role)
    await withUser(user.id, (db) => db.query("select public.fin_financeiro_store_gmail_token($1, $2, $3)", [encryptSecret(tokens.refresh_token!), email, tokens.scope]));
    return Response.redirect(`${env.appUrl}/configuracoes?gmail=ok`, 303);
  } catch (e) {
    console.error("gmail callback:", e instanceof Error ? e.message : "erro");
    return Response.redirect(`${env.appUrl}/configuracoes?gmail=erro`, 303);
  }
}
