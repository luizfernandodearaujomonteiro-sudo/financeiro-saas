export type ProviderName = "evolution" | "meta" | "simulator";

export interface SendResult {
  ok: boolean;
  error?: string;
  providerMessageId?: string;
}

export interface WhatsAppProvider {
  name: ProviderName;
  sendText(toE164: string, text: string): Promise<SendResult>;
  sendMedia?(toE164: string, mediaUrl: string, caption?: string): Promise<SendResult>;
  sendAudio?(toE164: string, audioUrl: string): Promise<SendResult>;
  connectionState?(): Promise<{ state: string; raw?: unknown }>;
  connect?(): Promise<{ qrBase64?: string; pairingCode?: string; raw?: unknown }>;
  logout?(): Promise<SendResult>;
  setWebhook?(url: string, bearerSecret: string): Promise<SendResult>;
}

export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;
