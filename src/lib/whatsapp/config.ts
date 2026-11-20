/**
 * Resolve a configuração do WhatsApp de uma família (somente servidor).
 * Segredos vêm do ambiente (ou arquivo) ou do banco CIFRADO; nunca são devolvidos ao navegador.
 * Ordem do token Evolution: EVOLUTION_INSTANCE_TOKEN -> WHATSAPP_API_KEY -> EVOLUTION_INSTANCE_TOKEN_FILE -> banco.
 */
import "server-only";
import fs from "node:fs";
import { withService, withUser, type Db } from "../db";
import { env } from "../env";
import { decryptSecret } from "../security/crypto";
import { createEvolutionProvider } from "./evolution";
import { createMetaProvider } from "./meta";
import { createSimulatorProvider } from "./simulator";
import type { ProviderName, WhatsAppProvider } from "./provider";

export const EVOLUTION_DEFAULTS = { baseUrl: "https://centralw.ftcplay.com", instance: "financeiro" };

export interface WhatsAppPublicConfig {
  provider: ProviderName;
  providerForced: boolean;
  displayNumber: string | null;
  evolutionBaseUrl: string;
  evolutionInstance: string;
  evolutionTokenSource: "env" | "arquivo" | "banco" | null;
  metaPhoneNumberId: string | null;
  metaTokenSource: "env" | "banco" | null;
  metaAppSecretConfigured: boolean;
  metaVerifyTokenConfigured: boolean;
  webhookUrl: string;
  webhookSecretConfigured: boolean;
  allowConnect: boolean;
}

interface Row {
  provider: ProviderName;
  display_number: string | null;
  evolution_base_url: string | null;
  evolution_instance: string | null;
  meta_phone_number_id: string | null;
  evolution_token_enc: string | null;
  meta_access_token_enc: string | null;
}

function tokenFromFile(): string | null {
  const p = process.env.EVOLUTION_INSTANCE_TOKEN_FILE;
  if (!p) return null;
  try {
    const t = fs.readFileSync(p, "utf8").trim();
    return t || null;
  } catch {
    return null; // nunca registra conteúdo ou caminho em log
  }
}

function envEvolutionToken(): { token: string; source: "env" | "arquivo" } | null {
  const t = process.env.EVOLUTION_INSTANCE_TOKEN || process.env.WHATSAPP_API_KEY;
  if (t) return { token: t, source: "env" };
  const f = tokenFromFile();
  return f ? { token: f, source: "arquivo" } : null;
}

async function loadRow(db: Db, householdId: string): Promise<Row | null> {
  return db.one<Row>(
    `select c.provider, c.display_number, c.evolution_base_url, c.evolution_instance, c.meta_phone_number_id,
            s.evolution_token_enc, s.meta_access_token_enc
       from public.fam_households h
       left join public.fam_whatsapp_config c on c.household_id = h.id
       left join public.fam_whatsapp_secrets s on s.household_id = h.id
      where h.id = $1`,
    [householdId],
  );
}

function resolve(row: Row | null) {
  const forced = process.env.WHATSAPP_PROVIDER === "simulator";
  const provider: ProviderName = forced ? "simulator" : (row?.provider ?? env.whatsappProvider);
  const evoEnv = envEvolutionToken();
  const evolutionToken = evoEnv?.token ?? (row?.evolution_token_enc ? safeDecrypt(row.evolution_token_enc) : null);
  const metaToken = process.env.META_WHATSAPP_ACCESS_TOKEN || (row?.meta_access_token_enc ? safeDecrypt(row.meta_access_token_enc) : null);
  const pub: WhatsAppPublicConfig = {
    provider,
    providerForced: forced,
    displayNumber: row?.display_number ?? null,
    evolutionBaseUrl: row?.evolution_base_url || process.env.EVOLUTION_BASE_URL || EVOLUTION_DEFAULTS.baseUrl,
    evolutionInstance: row?.evolution_instance || process.env.EVOLUTION_INSTANCE_NAME || EVOLUTION_DEFAULTS.instance,
    evolutionTokenSource: evoEnv?.source ?? (row?.evolution_token_enc ? "banco" : null),
    metaPhoneNumberId: row?.meta_phone_number_id || process.env.META_WHATSAPP_PHONE_NUMBER_ID || null,
    metaTokenSource: process.env.META_WHATSAPP_ACCESS_TOKEN ? "env" : row?.meta_access_token_enc ? "banco" : null,
    metaAppSecretConfigured: Boolean(process.env.META_WHATSAPP_APP_SECRET),
    metaVerifyTokenConfigured: Boolean(process.env.META_WHATSAPP_VERIFY_TOKEN),
    webhookUrl: process.env.WHATSAPP_WEBHOOK_URL || `${env.appUrl}/api/whatsapp/webhook`,
    webhookSecretConfigured: Boolean(env.secret("WHATSAPP_WEBHOOK_SECRET")),
    allowConnect: env.evolutionAllowConnect,
  };
  return { pub, evolutionToken, metaToken };
}

function safeDecrypt(blob: string): string | null {
  try {
    return decryptSecret(blob);
  } catch {
    return null;
  }
}

/** Configuração pública (sem segredos) — pode ir para a interface. */
export async function getPublicConfig(householdId: string, db?: Db): Promise<WhatsAppPublicConfig> {
  const row = db ? await loadRow(db, householdId) : await withService((d) => loadRow(d, householdId));
  return resolve(row).pub;
}

function buildProvider(row: Row | null): WhatsAppProvider {
  const { pub, evolutionToken, metaToken } = resolve(row);
  if (pub.provider === "simulator") return createSimulatorProvider();
  if (pub.provider === "meta") {
    if (!pub.metaPhoneNumberId || !metaToken) throw new Error("Meta Cloud API não configurada (phone number id / access token)");
    return createMetaProvider({ phoneNumberId: pub.metaPhoneNumberId, accessToken: metaToken, apiVersion: process.env.META_GRAPH_API_VERSION });
  }
  if (!evolutionToken) throw new Error("Token da instância Evolution não configurado");
  return createEvolutionProvider({ baseUrl: pub.evolutionBaseUrl, instance: pub.evolutionInstance, token: evolutionToken, allowConnect: pub.allowConnect });
}

/** Instancia o provedor da família — uso em jobs/webhooks (somente servidor). */
export async function getProvider(householdId: string, db?: Db): Promise<WhatsAppProvider> {
  const row = db ? await loadRow(db, householdId) : await withService((d) => loadRow(d, householdId));
  return buildProvider(row);
}

/**
 * Para requisições do painel: lê a configuração com RLS do usuário. Segredos
 * cifrados só via RPC exclusiva do dono (fam_get_whatsapp_secrets); para membros
 * comuns os segredos ficam nulos.
 */
async function loadRowAsUser(ctx: { userId: string; householdId: string }, isOwner: boolean): Promise<Row> {
  return withUser(ctx.userId, async (db) => {
    const cfg = await db.one<Omit<Row, "evolution_token_enc" | "meta_access_token_enc">>(
      "select provider, display_number, evolution_base_url, evolution_instance, meta_phone_number_id from public.fam_whatsapp_config where household_id = $1",
      [ctx.householdId],
    );
    const sec = isOwner ? await db.one<{ evolution_token_enc: string | null; meta_access_token_enc: string | null }>("select * from public.fam_get_whatsapp_secrets()") : null;
    return {
      provider: cfg?.provider ?? env.whatsappProvider,
      display_number: cfg?.display_number ?? null,
      evolution_base_url: cfg?.evolution_base_url ?? null,
      evolution_instance: cfg?.evolution_instance ?? null,
      meta_phone_number_id: cfg?.meta_phone_number_id ?? null,
      evolution_token_enc: sec?.evolution_token_enc ?? null,
      meta_access_token_enc: sec?.meta_access_token_enc ?? null,
    } as Row;
  });
}

export async function getPublicConfigAsUser(ctx: { userId: string; householdId: string }, isOwner: boolean): Promise<WhatsAppPublicConfig> {
  return resolve(await loadRowAsUser(ctx, isOwner)).pub;
}

/** Provedor para ações do DONO no painel (testar, configurar webhook, estado da conexão). */
export async function getOwnerProvider(ctx: { userId: string; householdId: string }): Promise<WhatsAppProvider> {
  return buildProvider(await loadRowAsUser(ctx, true));
}
