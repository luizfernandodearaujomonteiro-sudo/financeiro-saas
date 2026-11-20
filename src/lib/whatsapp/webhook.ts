/**
 * Lógica do webhook do WhatsApp (separada da rota para ser testável).
 *  - Evolution (padrão) e simulador: Authorization: Bearer <WHATSAPP_WEBHOOK_SECRET> (tempo constante; falha fechada se não configurado).
 *  - Meta Cloud API: X-Hub-Signature-256 (HMAC do corpo bruto com META_WHATSAPP_APP_SECRET).
 * Futuro: allowlist de IP da Central (opcional).
 */
import "server-only";
import { env } from "../env";
import { checkBearer } from "../security/crypto";
import { handleInbound } from "./handler";
import { parseEvolutionPayload, parseMetaPayload } from "./inbound";
import { verifyMetaSignature } from "./meta";

const MAX_BODY = 256 * 1024;

export async function handleWebhookRequest(req: Request): Promise<Response> {
  const raw = await req.text();
  if (raw.length > MAX_BODY) return Response.json({ error: "payload grande demais" }, { status: 413 });
  const metaSig = req.headers.get("x-hub-signature-256");

  if (metaSig) {
    if (!verifyMetaSignature(raw, metaSig, process.env.META_WHATSAPP_APP_SECRET)) return Response.json({ error: "assinatura inválida" }, { status: 401 });
    let body: unknown;
    try {
      body = JSON.parse(raw);
    } catch {
      return Response.json({ error: "json inválido" }, { status: 400 });
    }
    const results = [];
    for (const m of parseMetaPayload(body)) results.push((await handleInbound(m)).status);
    return Response.json({ ok: true, results });
  }

  if (!checkBearer(req.headers.get("authorization"), env.secret("WHATSAPP_WEBHOOK_SECRET"))) {
    return Response.json({ error: "não autorizado" }, { status: 401 });
  }
  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return Response.json({ error: "json inválido" }, { status: 400 });
  }
  const parsed = parseEvolutionPayload(body);
  if (parsed.kind === "ignored") return Response.json({ ok: true, ignored: parsed.reason });
  const r = await handleInbound(parsed.message);
  return Response.json({ ok: true, status: r.status });
}

/** Verificação do webhook da Meta (GET hub.challenge). */
export function handleMetaVerify(url: URL): Response {
  const token = process.env.META_WHATSAPP_VERIFY_TOKEN;
  if (token && url.searchParams.get("hub.mode") === "subscribe" && url.searchParams.get("hub.verify_token") === token) {
    return new Response(url.searchParams.get("hub.challenge") ?? "", { status: 200 });
  }
  return new Response("forbidden", { status: 403 });
}
