/**
 * Webhook da Pluggy. Autenticação por segredo compartilhado (header x-webhook-secret
 * ou ?secret=), comparado em tempo constante; falha fechada se não configurado.
 * O payload só fornece o itemId; os dados são buscados na API e importados como o dono do item.
 */
import { env } from "@/lib/env";
import { processWebhook } from "@/lib/pluggy/service";
import { safeEqual } from "@/lib/security/crypto";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(req: Request) {
  const secret = env.secret("PLUGGY_WEBHOOK_SECRET");
  const given = req.headers.get("x-webhook-secret") ?? new URL(req.url).searchParams.get("secret");
  if (!secret || !safeEqual(given, secret)) return Response.json({ error: "não autorizado" }, { status: 401 });
  const raw = await req.text();
  if (raw.length > 64 * 1024) return Response.json({ error: "payload grande demais" }, { status: 413 });
  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return Response.json({ error: "json inválido" }, { status: 400 });
  }
  try {
    return Response.json(await processWebhook(body));
  } catch (e) {
    console.error("pluggy webhook:", e instanceof Error ? e.message : "erro");
    return Response.json({ ok: false }, { status: 500 });
  }
}
