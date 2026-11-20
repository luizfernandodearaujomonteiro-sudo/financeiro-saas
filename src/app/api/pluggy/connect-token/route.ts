/** Gera o connect token do widget Pluggy para o MEMBRO logado (clientUserId = id do perfil). */
import { getSessionUser } from "@/lib/auth/session";
import { loadMembership } from "@/lib/auth/member";
import { env } from "@/lib/env";
import { getPluggyProvider } from "@/lib/pluggy/provider";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST() {
  const user = await getSessionUser();
  if (!user || !(await loadMembership(user.id))) return Response.json({ error: "não autorizado" }, { status: 401 });
  const mode = env.pluggyMode;
  if (mode === "off" || mode === "mock") return Response.json({ error: `modo ${mode}: widget indisponível` }, { status: 400 });
  const secret = env.secret("PLUGGY_WEBHOOK_SECRET");
  const webhookUrl = secret && env.appUrl.startsWith("https://") ? `${env.appUrl}/api/pluggy/webhook?secret=${encodeURIComponent(secret)}` : undefined;
  const accessToken = await getPluggyProvider(mode).createConnectToken(user.id, webhookUrl);
  return Response.json({ accessToken, includeSandbox: mode === "sandbox" });
}
