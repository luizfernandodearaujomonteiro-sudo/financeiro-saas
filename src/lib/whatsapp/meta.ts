/**
 * Adaptador Meta WhatsApp Cloud API (alternativo).
 * Webhook: verificação GET (hub.verify_token) e assinatura X-Hub-Signature-256 (HMAC-SHA256 do corpo bruto com o App Secret).
 * Observação: fora da janela de 24h a Meta exige mensagens de template aprovadas.
 */
import { createHmac, timingSafeEqual } from "node:crypto";
import { toProviderNumber } from "../domain/phone";
import type { FetchLike, WhatsAppProvider } from "./provider";

export interface MetaConfig {
  phoneNumberId: string;
  accessToken: string;
  apiVersion?: string;
  fetchImpl?: FetchLike;
}

export function verifyMetaSignature(rawBody: string, header: string | null, appSecret: string | null | undefined): boolean {
  if (!appSecret || !header?.startsWith("sha256=")) return false;
  const expected = createHmac("sha256", appSecret).update(rawBody, "utf8").digest();
  const given = Buffer.from(header.slice(7), "hex");
  return given.length === expected.length && timingSafeEqual(given, expected);
}

export function createMetaProvider(cfg: MetaConfig): WhatsAppProvider {
  const f: FetchLike = cfg.fetchImpl ?? ((u, i) => fetch(u, i));
  const version = cfg.apiVersion ?? "v21.0";
  return {
    name: "meta",
    async sendText(to, text) {
      const res = await f(`https://graph.facebook.com/${version}/${encodeURIComponent(cfg.phoneNumberId)}/messages`, {
        method: "POST",
        headers: { Authorization: `Bearer ${cfg.accessToken}`, "Content-Type": "application/json" },
        body: JSON.stringify({ messaging_product: "whatsapp", to: toProviderNumber(to), type: "text", text: { body: text, preview_url: false } }),
      });
      if (!res.ok) return { ok: false, error: `Meta HTTP ${res.status}` };
      const j = (await res.json().catch(() => null)) as { messages?: { id: string }[] } | null;
      return { ok: true, providerMessageId: j?.messages?.[0]?.id };
    },
  };
}
