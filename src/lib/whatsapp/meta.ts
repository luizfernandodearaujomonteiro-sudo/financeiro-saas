/**
 * Adaptador Meta WhatsApp Cloud API.
 * Webhook: verificação GET (hub.verify_token) e assinatura X-Hub-Signature-256 (HMAC-SHA256 do corpo bruto com o App Secret).
 * Envio: POST https://graph.facebook.com/{versão}/{phone_number_id}/messages (Bearer token).
 * Observação: fora da janela de 24h a Meta exige mensagens de template aprovadas.
 */
import { createHmac, timingSafeEqual } from "node:crypto";
import { toProviderNumber } from "../domain/phone";
import type { FetchLike, WhatsAppProvider } from "./provider";

export const META_DEFAULT_API_VERSION = "v21.0";

export interface MetaConfig {
  phoneNumberId: string;
  accessToken: string;
  apiVersion?: string;
  fetchImpl?: FetchLike;
  timeoutMs?: number;
}

export function verifyMetaSignature(rawBody: string, header: string | null, appSecret: string | null | undefined): boolean {
  if (!appSecret || !header?.startsWith("sha256=")) return false;
  const hex = header.slice(7).trim();
  if (!/^[0-9a-fA-F]{64}$/.test(hex)) return false;
  const expected = createHmac("sha256", appSecret).update(rawBody, "utf8").digest();
  const given = Buffer.from(hex, "hex");
  return given.length === expected.length && timingSafeEqual(given, expected);
}

/** Resume o erro da Graph API (código/mensagem) sem ecoar headers ou token. */
export function describeMetaError(status: number, json: unknown): string {
  const e = (json as { error?: { code?: unknown; error_subcode?: unknown; message?: unknown; error_data?: { details?: unknown } } } | null)?.error;
  if (!e) return `Meta HTTP ${status}`;
  const parts = [`Meta HTTP ${status}`];
  if (e.code !== undefined) parts.push(`código ${String(e.code)}${e.error_subcode !== undefined ? `/${String(e.error_subcode)}` : ""}`);
  const msg = [e.message, e.error_data?.details].filter((x): x is string => typeof x === "string" && x.length > 0).join(" — ");
  if (msg) parts.push(msg.replace(/\s+/g, " ").slice(0, 300));
  return parts.join(": ");
}

export function createMetaProvider(cfg: MetaConfig): WhatsAppProvider {
  if (!/^\d{5,32}$/.test(cfg.phoneNumberId)) throw new Error("META_WHATSAPP_PHONE_NUMBER_ID inválido");
  const f: FetchLike = cfg.fetchImpl ?? ((u, i) => fetch(u, i));
  const version = /^v\d+\.\d+$/.test(cfg.apiVersion ?? "") ? cfg.apiVersion! : META_DEFAULT_API_VERSION;
  const url = `https://graph.facebook.com/${version}/${cfg.phoneNumberId}/messages`;
  return {
    name: "meta",
    async sendText(to, text) {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), cfg.timeoutMs ?? 15_000);
      try {
        const res = await f(url, {
          method: "POST",
          headers: { Authorization: `Bearer ${cfg.accessToken}`, "Content-Type": "application/json" },
          body: JSON.stringify({ messaging_product: "whatsapp", recipient_type: "individual", to: toProviderNumber(to), type: "text", text: { body: text, preview_url: false } }),
          signal: ctrl.signal,
          cache: "no-store",
        });
        const j = (await res.json().catch(() => null)) as { messages?: { id?: string }[] } | null;
        if (!res.ok) return { ok: false, error: describeMetaError(res.status, j) };
        return { ok: true, providerMessageId: j?.messages?.[0]?.id };
      } catch (e) {
        const aborted = e instanceof Error && e.name === "AbortError";
        return { ok: false, error: aborted ? "Meta: tempo esgotado" : `Meta: falha de rede${e instanceof Error ? ` (${e.message.slice(0, 120)})` : ""}` };
      } finally {
        clearTimeout(timer);
      }
    },
  };
}
