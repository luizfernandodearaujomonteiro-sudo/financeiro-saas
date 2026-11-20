import { cookies } from "next/headers";
import { getSessionUser } from "@/lib/auth/session";
import { loadMembership } from "@/lib/auth/member";
import { env } from "@/lib/env";
import { authUrl, createState } from "@/lib/gmail/oauth";
import { connectMockGmail } from "@/lib/gmail/sync";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const user = await getSessionUser();
  if (!user || !(await loadMembership(user.id))) return Response.redirect(`${env.appUrl}/login`, 303);
  if (env.gmailMode === "mock") {
    await connectMockGmail(user.id);
    return Response.redirect(`${env.appUrl}/configuracoes?gmail=mock`, 303);
  }
  if (env.gmailMode !== "live" || !process.env.GOOGLE_CLIENT_ID) return Response.redirect(`${env.appUrl}/configuracoes?gmail=nao-configurado`, 303);
  const { state, nonce } = createState(user.id);
  (await cookies()).set("fam_oauth_nonce", nonce, { httpOnly: true, sameSite: "lax", secure: env.appUrl.startsWith("https://"), path: "/api/integrations/gmail", maxAge: 600 });
  return Response.redirect(authUrl(state), 303);
}
