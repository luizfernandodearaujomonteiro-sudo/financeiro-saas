/**
 * Adaptador Evolution API v2 (Baileys, self-hosted — "Central Whatsapp").
 * Autenticação: header `apikey` = token DA INSTÂNCIA (nunca chave global). Somente servidor.
 * Endpoints: POST /message/sendText/{i}, /message/sendMedia/{i}, /message/sendWhatsAppAudio/{i},
 *            GET /instance/connectionState/{i}, GET /instance/connect/{i}, DELETE /instance/logout/{i},
 *            POST /webhook/set/{i}.
 */
import { toProviderNumber } from "../domain/phone";
import type { FetchLike, SendResult, WhatsAppProvider } from "./provider";

export interface EvolutionConfig {
  baseUrl: string;
  instance: string;
  token: string;
  allowConnect: boolean;
  fetchImpl?: FetchLike;
  timeoutMs?: number;
}

export function createEvolutionProvider(cfg: EvolutionConfig): WhatsAppProvider {
  const base = cfg.baseUrl.replace(/\/$/, "");
  if (!/^https:\/\//.test(base)) throw new Error("EVOLUTION_BASE_URL precisa ser https");
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(cfg.instance)) throw new Error("nome de instância inválido");
  const f: FetchLike = cfg.fetchImpl ?? ((u, i) => fetch(u, i));
  const inst = encodeURIComponent(cfg.instance);

  async function call(method: string, path: string, body?: unknown): Promise<{ ok: boolean; status: number; json: unknown }> {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), cfg.timeoutMs ?? 15_000);
    try {
      const res = await f(`${base}${path}`, {
        method,
        headers: { apikey: cfg.token, "Content-Type": "application/json" },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: ctrl.signal,
        cache: "no-store",
      });
      const json = await res.json().catch(() => null);
      return { ok: res.ok, status: res.status, json };
    } finally {
      clearTimeout(timer);
    }
  }

  const result = (r: { ok: boolean; status: number; json: unknown }): SendResult =>
    r.ok
      ? { ok: true, providerMessageId: (r.json as { key?: { id?: string } } | null)?.key?.id }
      : { ok: false, error: `Evolution HTTP ${r.status}` }; // nunca inclui token/headers

  return {
    name: "evolution",
    async sendText(to, text) {
      return result(await call("POST", `/message/sendText/${inst}`, { number: toProviderNumber(to), text }));
    },
    async sendMedia(to, mediaUrl, caption) {
      return result(await call("POST", `/message/sendMedia/${inst}`, { number: toProviderNumber(to), mediatype: "document", media: mediaUrl, caption }));
    },
    async sendAudio(to, audioUrl) {
      return result(await call("POST", `/message/sendWhatsAppAudio/${inst}`, { number: toProviderNumber(to), audio: audioUrl }));
    },
    async connectionState() {
      const r = await call("GET", `/instance/connectionState/${inst}`);
      const state = (r.json as { instance?: { state?: string } } | null)?.instance?.state ?? (r.ok ? "desconhecido" : `erro HTTP ${r.status}`);
      return { state };
    },
    async connect() {
      // Só depois do proxy residencial aplicado pela Central (EVOLUTION_ALLOW_CONNECT=true).
      if (!cfg.allowConnect) throw new Error("Conexão/QR bloqueados: defina EVOLUTION_ALLOW_CONNECT=true somente após a Central aplicar o proxy.");
      const r = await call("GET", `/instance/connect/${inst}`);
      const j = (r.json ?? {}) as { base64?: string; code?: string; pairingCode?: string };
      return { qrBase64: j.base64, pairingCode: j.pairingCode };
    },
    async logout() {
      return result(await call("DELETE", `/instance/logout/${inst}`));
    },
    async setWebhook(url, bearerSecret) {
      return result(
        await call("POST", `/webhook/set/${inst}`, {
          webhook: {
            enabled: true,
            url,
            headers: { Authorization: `Bearer ${bearerSecret}`, "Content-Type": "application/json" },
            events: ["MESSAGES_UPSERT", "CONNECTION_UPDATE"],
            base64: false,
            byEvents: false,
          },
        }),
      );
    },
  };
}
