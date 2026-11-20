/** Provedor simulado: não chama nenhuma API. As mensagens ficam em fin_financeiro_whatsapp_messages. */
import type { WhatsAppProvider } from "./provider";

export function createSimulatorProvider(): WhatsAppProvider {
  return {
    name: "simulator",
    async sendText() {
      return { ok: true, providerMessageId: `sim-${Date.now()}-${Math.random().toString(36).slice(2, 8)}` };
    },
    async connectionState() {
      return { state: "simulador" };
    },
  };
}
