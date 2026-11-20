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
  // Recomendado: webhook global cadastrado UMA vez na API da Pluggy com o header x-webhook-secret
  // (ver docs/ENTREGA.md). Segredo na query string aparece em logs de acesso, então só é usado
  // aqui se PLUGGY_WEBHOOK_SECRET_IN_URL=true for definido explicitamente.
  const secret = env.secret("PLUGGY_WEBHOOK_SECRET");
  const inUrl = process.env.PLUGGY_WEBHOOK_SECRET_IN_URL === "true";
  const webhookUrl = inUrl && secret && env.appUrl.startsWith("https://") ? `${env.appUrl}/api/pluggy/webhook?secret=${encodeURIComponent(secret)}` : undefined;
  const accessToken = await getPluggyProvider(mode).createConnectToken(user.id, webhookUrl);
  return Response.json({ accessToken, includeSandbox: mode === "sandbox" });
}
