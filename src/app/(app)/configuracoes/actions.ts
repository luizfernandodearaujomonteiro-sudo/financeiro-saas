"use server";
import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { z } from "zod";
import { requireCtx } from "@/lib/auth/member";
import { formObject, run, type ActionState } from "@/lib/actions";
import { withUser } from "@/lib/db";
import { env } from "@/lib/env";
import { runGmailSync } from "@/lib/gmail/sync";
import { encryptSecret } from "@/lib/security/crypto";
import { createInvite, saveSettings, setMemberPhone, updateDisplayName } from "@/lib/services/household";
import { savePrefs } from "@/lib/services/prefs";
import { encodeTheme, THEME_COOKIE } from "@/lib/theme-cookie";
import { getOwnerProvider, getPublicConfigAsUser } from "@/lib/whatsapp/config";
import { sendMessages } from "@/lib/whatsapp/send";
import { optionalText } from "@/lib/validation";

async function load() {
  const { member } = await requireCtx();
  return { member, ctx: { userId: member.userId, householdId: member.householdId } };
}

function ownerOnly(role: string) {
  if (role !== "owner") throw new Error("Apenas o dono da família pode fazer isso.");
}

const PATH = "/configuracoes";

// ----------------------------- Perfil e aparência -----------------------------
export async function updateNameAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  const { ctx } = await load();
  return run(async () => {
    await updateDisplayName(ctx, String(fd.get("name") ?? ""));
    revalidatePath("/", "layout");
    return "Nome atualizado.";
  }, [PATH]);
}

export async function saveThemeAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  const { member } = await load();
  return run(async () => {
    const p = await savePrefs(member.userId, { themeMode: fd.get("themeMode"), autoDarkStart: fd.get("autoDarkStart"), autoDarkEnd: fd.get("autoDarkEnd") });
    (await cookies()).set(THEME_COOKIE, encodeTheme(p.theme_mode, p.auto_dark_start, p.auto_dark_end), { httpOnly: false, sameSite: "lax", path: "/", maxAge: 60 * 60 * 24 * 365 });
    revalidatePath("/", "layout");
    return "Tema salvo.";
  }, [PATH]);
}

/** Preferências pessoais de mensagens do assistente (lembrete diário / resumo semanal). */
export async function saveMessagePrefsAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  const { member } = await load();
  const last = (k: string) => fd.getAll(k).at(-1); // hidden "false" + checkbox "true"
  return run(async () => {
    await savePrefs(member.userId, { dailyReminder: last("dailyReminder"), weeklySummary: last("weeklySummary") });
    return "Preferências de mensagens salvas.";
  }, [PATH]);
}

// ----------------------------- Família e alertas -----------------------------
export async function createInviteAction(): Promise<ActionState> {
  const { ctx, member } = await load();
  return run(async () => {
    ownerOnly(member.role);
    const token = await createInvite(ctx);
    return { message: "Link gerado! Válido por 7 dias.", data: { url: `${env.appUrl}/convite/${token}` } };
  }, [PATH]);
}

export async function saveSettingsAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  const { ctx, member } = await load();
  return run(async () => {
    ownerOnly(member.role);
    await saveSettings(ctx, formObject(fd));
    return "Preferências de alertas salvas.";
  }, [PATH]);
}

export async function setPhoneAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  const { ctx } = await load();
  return run(async () => {
    const userId = z.string().uuid().parse(fd.get("userId"));
    const phone = await setMemberPhone(ctx, userId, String(fd.get("phone") ?? ""));
    return phone ? `Telefone ${phone} vinculado.` : "Telefone removido.";
  }, [PATH]);
}

// ----------------------------- WhatsApp -----------------------------
const waSchema = z.object({
  provider: z.enum(["evolution", "meta", "simulator"]),
  displayNumber: optionalText(30),
  evolutionBaseUrl: z
    .string()
    .trim()
    .url("URL inválida")
    .refine((u) => u.startsWith("https://"), "A URL da Evolution precisa ser https://"),
  evolutionInstance: z.string().trim().regex(/^[A-Za-z0-9_-]{1,64}$/, "Nome de instância inválido (letras, números, _ e -)"),
  evolutionToken: optionalText(500),
  metaPhoneNumberId: z.preprocess((v) => (v === "" ? undefined : v), z.string().trim().regex(/^\d{5,30}$/, "Phone number ID deve ter só dígitos").optional()),
  metaAccessToken: optionalText(1000),
});

export async function saveWhatsappConfigAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  const { ctx, member } = await load();
  return run(async () => {
    ownerOnly(member.role);
    const v = waSchema.parse(formObject(fd));
    const evoEnc = v.evolutionToken ? encryptSecret(v.evolutionToken) : null;
    const metaEnc = v.metaAccessToken ? encryptSecret(v.metaAccessToken) : null;
    await withUser(ctx.userId, async (db) => {
      await db.query(
        `insert into public.fam_whatsapp_config (household_id, provider, display_number, evolution_base_url, evolution_instance, meta_phone_number_id, updated_by)
         values ($1, $2, $3, $4, $5, $6, auth.uid())
         on conflict (household_id) do update set provider = excluded.provider, display_number = excluded.display_number,
           evolution_base_url = excluded.evolution_base_url, evolution_instance = excluded.evolution_instance,
           meta_phone_number_id = excluded.meta_phone_number_id, updated_by = auth.uid(), updated_at = now()`,
        [ctx.householdId, v.provider, v.displayNumber ?? null, v.evolutionBaseUrl.replace(/\/$/, ""), v.evolutionInstance, v.metaPhoneNumberId ?? null],
      );
      if (evoEnc || metaEnc) await db.query("select public.fam_set_whatsapp_secrets($1, $2)", [evoEnc, metaEnc]);
    });
    return evoEnc || metaEnc ? "Configuração salva (token armazenado cifrado)." : "Configuração salva.";
  }, [PATH]);
}

async function myPhone(userId: string) {
  return withUser(userId, (db) => db.one<{ phone_e164: string }>("select phone_e164 from public.fam_whatsapp_numbers where user_id = auth.uid()"));
}

export async function testWhatsappAction(): Promise<ActionState> {
  const { ctx, member } = await load();
  return run(async () => {
    ownerOnly(member.role);
    const phone = await myPhone(ctx.userId);
    if (!phone) throw new Error("Cadastre seu telefone abaixo antes de testar.");
    const provider = await getOwnerProvider(ctx);
    const [r] = await sendMessages({ householdId: ctx.householdId, userId: ctx.userId, phone: phone.phone_e164 }, ["✅ Teste do assistente financeiro: tudo certo!"], provider);
    if (!r?.ok) throw new Error(`Falha no envio: ${r?.error ?? "erro"}`);
    return provider.name === "simulator" ? "Mensagem de teste registrada no simulador." : "Mensagem de teste enviada!";
  });
}

export async function checkConnectionAction(): Promise<ActionState> {
  const { ctx, member } = await load();
  return run(async () => {
    ownerOnly(member.role);
    const provider = await getOwnerProvider(ctx);
    if (!provider.connectionState) return `O provedor ${provider.name} não informa estado de conexão.`;
    const s = await provider.connectionState();
    return `Estado da conexão: ${s.state}`;
  });
}

export async function setWebhookAction(): Promise<ActionState> {
  const { ctx, member } = await load();
  return run(async () => {
    ownerOnly(member.role);
    const pub = await getPublicConfigAsUser(ctx, true);
    const secret = env.secret("WHATSAPP_WEBHOOK_SECRET");
    if (pub.provider !== "evolution") throw new Error("Disponível apenas para a Evolution API.");
    if (!pub.evolutionTokenSource) throw new Error("Configure o token da instância primeiro.");
    if (!secret) throw new Error("Defina WHATSAPP_WEBHOOK_SECRET (mínimo 24 caracteres) no servidor.");
    const provider = await getOwnerProvider(ctx);
    const r = await provider.setWebhook!(pub.webhookUrl, secret);
    if (!r.ok) throw new Error(`A Evolution recusou: ${r.error ?? "erro"}`);
    return "Webhook configurado na instância!";
  });
}

export async function connectQrAction(): Promise<ActionState> {
  const { ctx, member } = await load();
  return run(async () => {
    ownerOnly(member.role);
    const pub = await getPublicConfigAsUser(ctx, true);
    if (!pub.allowConnect) throw new Error("QR bloqueado: aguarde a Central aplicar o proxy e defina EVOLUTION_ALLOW_CONNECT=true.");
    const provider = await getOwnerProvider(ctx);
    if (!provider.connect) throw new Error("Este provedor não usa QR code.");
    const r = await provider.connect();
    return { message: r.qrBase64 ? "Escaneie o QR code no WhatsApp do número dedicado." : "Sem QR retornado (a instância pode já estar conectada).", data: { qr: r.qrBase64 ?? null, pairing: r.pairingCode ?? null } };
  });
}

// ----------------------------- Gmail -----------------------------
export async function disconnectGmailAction(): Promise<ActionState> {
  const { ctx } = await load();
  return run(async () => {
    await withUser(ctx.userId, (db) => db.query("select public.fam_disconnect_gmail()"));
    return "Gmail desconectado.";
  }, [PATH]);
}

export async function syncGmailMockAction(): Promise<ActionState> {
  await load();
  return run(async () => {
    if (env.gmailMode !== "mock" || !env.localDevAuth) throw new Error("Disponível apenas no modo local (GMAIL_MODE=mock).");
    const r = await runGmailSync();
    const items = (r.summary ?? []).reduce((a, s) => a + s.items, 0);
    return `Sincronização simulada concluída: ${items} item(ns) novo(s) na fila de revisão.`;
  }, [PATH, "/revisao"]);
}
