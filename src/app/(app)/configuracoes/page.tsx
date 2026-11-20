import { Bell, CheckCircle2, Mail, MessageCircle, Palette, Phone, PlugZap, RefreshCw, Settings, ShieldCheck, User, Users, Webhook } from "lucide-react";
import { requireCtx } from "@/lib/auth/member";
import { withUser } from "@/lib/db";
import { formatPhoneBR } from "@/lib/domain/phone";
import { env } from "@/lib/env";
import { getSettings, listMembers } from "@/lib/services/household";
import { getPrefs } from "@/lib/services/prefs";
import { hasPdfPassword } from "@/lib/services/pdf-password";
import { EVOLUTION_DEFAULTS, getPublicConfigAsUser } from "@/lib/whatsapp/config";
import { ActionForm, CopyButton, SubmitButton } from "@/components/ui/client";
import { FadeIn } from "@/components/ui/motion";
import { Badge, Card, CardTitle, Field, Input, LinkButton, PageHeader, Select } from "@/components/ui/primitives";
import {
  checkConnectionAction, connectQrAction, createInviteAction, disconnectGmailAction, saveMessagePrefsAction, saveSettingsAction, saveThemeAction, saveWhatsappConfigAction,
  setPhoneAction, setWebhookAction, syncGmailMockAction, testWhatsappAction, updateNameAction, savePdfPasswordAction, clearPdfPasswordAction,
} from "./actions";
import { ActionButton, InviteBox, QrBox } from "./ResultBoxes";

export const metadata = { title: "Configurações" };
export const dynamic = "force-dynamic";

const GMAIL_MSG: Record<string, { ok: boolean; text: string }> = {
  ok: { ok: true, text: "Gmail conectado com sucesso." },
  mock: { ok: true, text: "Gmail simulado conectado (modo local)." },
  erro: { ok: false, text: "Não foi possível conectar o Gmail. Tente novamente." },
  "nao-configurado": { ok: false, text: "Integração com Gmail não configurada (GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET)." },
  cancelado: { ok: false, text: "Conexão com o Gmail cancelada." },
  "sem-refresh": { ok: false, text: "O Google não devolveu um refresh token. Remova o acesso do app na sua conta Google e conecte de novo." },
  "erro-estado": { ok: false, text: "Falha de segurança na conexão (state inválido ou expirado). Tente novamente." },
};

const TOKEN_SOURCE: Record<string, { label: string; tone: "good" | "neutral" }> = {
  env: { label: "via env", tone: "good" },
  arquivo: { label: "via arquivo", tone: "good" },
  banco: { label: "armazenado cifrado", tone: "good" },
};

function SourceBadge({ source }: { source: string | null }) {
  const s = source ? TOKEN_SOURCE[source] : null;
  return s ? <Badge tone={s.tone}><ShieldCheck aria-hidden className="h-3 w-3" /> {s.label}</Badge> : <Badge tone="warn">não configurado</Badge>;
}

export default async function ConfiguracoesPage({ searchParams }: { searchParams: Promise<{ gmail?: string }> }) {
  const { member } = await requireCtx();
  const ctx = { userId: member.userId, householdId: member.householdId };
  const isOwner = member.role === "owner";
  const { gmail } = await searchParams;
  const [prefs, members, settings, wa, gmailConn, pdfPw] = await Promise.all([
    getPrefs(member.userId),
    listMembers(ctx),
    getSettings(ctx),
    getPublicConfigAsUser(ctx, isOwner),
    withUser(member.userId, (db) =>
      db.one<{ status: string; email: string | null; last_sync_at: Date | null; last_error: string | null }>(
        "select status, email, last_sync_at, last_error from public.fin_financeiro_gmail_connections where user_id = auth.uid()",
      ),
    ),
    hasPdfPassword(ctx),
  ]);
  const gmailMsg = gmail ? GMAIL_MSG[gmail] : undefined;
  const hours = Array.from({ length: 24 }, (_, h) => h);

  return (
    <div className="space-y-6">
      <PageHeader icon={Settings} title="Configurações" subtitle="Perfil, aparência, família, alertas e integrações." />

      <div className="grid gap-6 xl:grid-cols-2">
        <FadeIn>
          <Card className="h-full">
            <CardTitle icon={User}>Perfil</CardTitle>
            <ActionForm action={updateNameAction} className="flex flex-wrap items-end gap-3">
              <Field label="Nome exibido" className="min-w-52 flex-1"><Input name="name" defaultValue={member.displayName} maxLength={60} required /></Field>
              <SubmitButton>Salvar</SubmitButton>
            </ActionForm>
            <p className="mt-3 text-xs text-ink-3">Papel na família: <Badge tone={isOwner ? "brand" : "neutral"}>{isOwner ? "Dono" : "Membro"}</Badge></p>
          </Card>
        </FadeIn>

        <FadeIn delay={0.03}>
          <Card className="h-full">
            <CardTitle icon={Palette}>Aparência</CardTitle>
            <ActionForm action={saveThemeAction} className="grid gap-3 sm:grid-cols-3">
              <Field label="Tema">
                <Select name="themeMode" defaultValue={prefs.theme_mode}>
                  <option value="dark">Escuro</option>
                  <option value="light">Claro</option>
                  <option value="auto">Automático por horário</option>
                </Select>
              </Field>
              <Field label="Escuro a partir de" hint="Horário de Brasília">
                <Select name="autoDarkStart" defaultValue={String(prefs.auto_dark_start)}>
                  {hours.map((h) => <option key={h} value={h}>{String(h).padStart(2, "0")}h</option>)}
                </Select>
              </Field>
              <Field label="Claro a partir de">
                <Select name="autoDarkEnd" defaultValue={String(prefs.auto_dark_end)}>
                  {hours.map((h) => <option key={h} value={h}>{String(h).padStart(2, "0")}h</option>)}
                </Select>
              </Field>
              <div className="sm:col-span-3"><SubmitButton>Salvar tema</SubmitButton></div>
            </ActionForm>
            <p className="mt-3 text-xs text-ink-3">No modo automático o painel fica escuro entre os horários escolhidos (padrão 18h–6h, America/Sao_Paulo). A escolha fica salva no seu perfil.</p>
          </Card>
        </FadeIn>

        <FadeIn delay={0.06}>
          <Card className="h-full">
            <CardTitle icon={Users}>Família — {member.householdName}</CardTitle>
            <ul className="space-y-2">
              {members.map((m) => (
                <li key={m.user_id} className="flex items-center justify-between gap-3 rounded-xl bg-surface-2 px-3 py-2.5 ring-1 ring-line">
                  <span className="flex items-center gap-2.5">
                    <span className="grid h-8 w-8 place-items-center rounded-full bg-gradient-to-br from-brand to-brand-2 text-xs font-bold text-brand-ink">{m.display_name.slice(0, 1).toUpperCase()}</span>
                    <span>
                      <span className="block text-sm font-medium">{m.display_name}{m.user_id === member.userId ? " (você)" : ""}</span>
                      <span className="block text-xs text-ink-3">{m.phone_e164 ? formatPhoneBR(m.phone_e164) : "sem WhatsApp"}</span>
                    </span>
                  </span>
                  <Badge tone={m.role === "owner" ? "brand" : "neutral"}>{m.role === "owner" ? "Dono" : "Membro"}</Badge>
                </li>
              ))}
            </ul>
            {isOwner && (
              <div className="mt-4">
                {members.length >= 2 ? (
                  <p className="text-xs text-ink-3">A família já tem 2 membros (limite do painel do casal).</p>
                ) : (
                  <InviteBox action={createInviteAction} />
                )}
              </div>
            )}
            <p className="mt-3 text-xs text-ink-3">O acesso só é concedido por convite aceito ou pelo bootstrap do dono — ter uma conta de login não dá acesso a nada.</p>
          </Card>
        </FadeIn>

        <FadeIn delay={0.09}>
          <Card className="h-full">
            <CardTitle icon={Bell}>Alertas</CardTitle>
            <ActionForm action={saveSettingsAction} className="grid gap-3 sm:grid-cols-2">
              <fieldset disabled={!isOwner} className="contents">
                <Field label="Avisar vencimentos com antecedência (dias)" hint="Também avisa 1 dia antes e no dia">
                  <Input name="alertDays" type="number" min={0} max={15} defaultValue={settings.bill_alert_days} required />
                </Field>
                <Field label="Janela do “desfazer” no WhatsApp (min)" hint="De 1 a 120 minutos">
                  <Input name="undoMinutes" type="number" min={1} max={120} defaultValue={settings.whatsapp_undo_minutes} required />
                </Field>
                {isOwner && <div className="sm:col-span-2"><SubmitButton>Salvar alertas</SubmitButton></div>}
              </fieldset>
            </ActionForm>
            {!isOwner && <p className="mt-3 text-xs text-ink-3">Somente o dono altera estas opções.</p>}
            <div className="mt-5 border-t border-line pt-4">
              <p className="mb-3 text-xs font-semibold tracking-wide text-ink-2 uppercase">Minhas mensagens no WhatsApp</p>
              <ActionForm action={saveMessagePrefsAction} className="space-y-2">
                <input type="hidden" name="dailyReminder" value="false" />
                <label className="flex items-center gap-3 text-sm">
                  <input type="checkbox" name="dailyReminder" value="true" defaultChecked={prefs.daily_reminder} className="h-4 w-4 accent-[var(--brand)]" />
                  Lembrete diário para registrar os gastos (20h30)
                </label>
                <input type="hidden" name="weeklySummary" value="false" />
                <label className="flex items-center gap-3 text-sm">
                  <input type="checkbox" name="weeklySummary" value="true" defaultChecked={prefs.weekly_summary} className="h-4 w-4 accent-[var(--brand)]" />
                  Resumo semanal (domingo de manhã)
                </label>
                <p className="text-[11px] text-ink-3">Alertas de vencimento continuam ativos. Vale só para o seu perfil.</p>
                <SubmitButton variant="secondary">Salvar minhas mensagens</SubmitButton>
              </ActionForm>
            </div>
          </Card>
        </FadeIn>
      </div>

      <FadeIn>
        <Card gradient>
          <CardTitle icon={MessageCircle} action={<Badge tone="brand">{wa.provider === "evolution" ? "Evolution API" : wa.provider === "meta" ? "Meta Cloud API" : "Simulador"}</Badge>}>
            WhatsApp — assistente da família
          </CardTitle>
          {wa.providerForced && (
            <p className="mb-4 rounded-xl bg-warn/10 px-3 py-2 text-sm text-warn ring-1 ring-warn/30">WHATSAPP_PROVIDER=simulator no servidor: o simulador está forçado e nenhuma mensagem real é enviada.</p>
          )}
          <div className="grid gap-6 lg:grid-cols-2">
            <div>
              {isOwner ? (
                <ActionForm action={saveWhatsappConfigAction} className="grid gap-3 sm:grid-cols-2">
                  <Field label="Provedor" className="sm:col-span-2">
                    <Select name="provider" defaultValue={wa.provider}>
                      <option value="evolution">Central Whatsapp (Evolution API) — padrão</option>
                      <option value="meta">Meta WhatsApp Cloud API</option>
                      <option value="simulator">Simulador local</option>
                    </Select>
                  </Field>
                  <Field label="Número do assistente" hint="Apenas exibição"><Input name="displayNumber" defaultValue={wa.displayNumber ?? ""} placeholder="+55 11 90000-0000" maxLength={30} /></Field>
                  <Field label="Instância (Evolution)"><Input name="evolutionInstance" defaultValue={wa.evolutionInstance || EVOLUTION_DEFAULTS.instance} required /></Field>
                  <Field label="URL base (Evolution)" className="sm:col-span-2"><Input name="evolutionBaseUrl" type="url" defaultValue={wa.evolutionBaseUrl || EVOLUTION_DEFAULTS.baseUrl} required /></Field>
                  <Field label="Token da instância" hint={<>Deixe vazio para manter. Atual: <SourceBadge source={wa.evolutionTokenSource} /></>} className="sm:col-span-2">
                    <Input name="evolutionToken" type="password" autoComplete="off" placeholder="••••••••" />
                  </Field>
                  <Field label="Meta: Phone number ID"><Input name="metaPhoneNumberId" defaultValue={wa.metaPhoneNumberId ?? ""} inputMode="numeric" /></Field>
                  <Field label="Meta: Access token" hint={<>Vazio mantém. Atual: <SourceBadge source={wa.metaTokenSource} /></>}>
                    <Input name="metaAccessToken" type="password" autoComplete="off" placeholder="••••••••" />
                  </Field>
                  <div className="sm:col-span-2"><SubmitButton>Salvar configuração</SubmitButton></div>
                </ActionForm>
              ) : (
                <div className="space-y-2 text-sm text-ink-2">
                  <p>Provedor configurado pelo dono: <b>{wa.provider}</b>{wa.displayNumber ? ` · número ${wa.displayNumber}` : ""}.</p>
                  <p className="text-xs text-ink-3">Você pode cadastrar o seu telefone abaixo para usar os comandos e receber alertas.</p>
                </div>
              )}
            </div>

            <div className="space-y-4">
              <div className="rounded-xl bg-surface-2 p-4 ring-1 ring-line">
                <p className="mb-2 flex items-center gap-2 text-sm font-medium"><Webhook aria-hidden className="h-4 w-4 text-brand" /> URL do webhook</p>
                <div className="flex flex-wrap items-center gap-2">
                  <code className="code-box min-w-0 flex-1 text-xs">{wa.webhookUrl}</code>
                  <CopyButton value={wa.webhookUrl} />
                </div>
                <p className="mt-2 text-xs text-ink-3">
                  Segredo do webhook (WHATSAPP_WEBHOOK_SECRET): {wa.webhookSecretConfigured ? <Badge tone="good"><CheckCircle2 aria-hidden className="h-3 w-3" /> configurado</Badge> : <Badge tone="warn">não configurado — o webhook recusa tudo</Badge>}
                </p>
                <p className="mt-2 text-xs text-ink-3">A Evolution envia <code className="code-box">Authorization: Bearer &lt;segredo&gt;</code>; a Meta assina com <code className="code-box">X-Hub-Signature-256</code>.</p>
              </div>

              {isOwner && (
                <div className="space-y-3">
                  <div className="flex flex-wrap gap-2">
                    <ActionButton action={testWhatsappAction} label={<><PlugZap aria-hidden className="h-4 w-4" /> Testar</>} pendingText="Enviando…" />
                    <ActionButton action={checkConnectionAction} label={<><RefreshCw aria-hidden className="h-4 w-4" /> Verificar conexão</>} pendingText="Consultando…" />
                    <ActionButton
                      action={setWebhookAction}
                      label={<><Webhook aria-hidden className="h-4 w-4" /> Configurar webhook</>}
                      pendingText="Configurando…"
                      disabled={!(wa.provider === "evolution" && wa.evolutionTokenSource && wa.webhookSecretConfigured)}
                    />
                  </div>
                  {wa.provider === "evolution" && (
                    <div className="rounded-xl bg-surface-2 p-4 text-xs text-ink-2 ring-1 ring-line">
                      <p>
                        A instância <code className="code-box">{wa.evolutionInstance}</code> já existe na Central (conexão atual: <b>close</b>, sem webhook). O QR code só deve ser gerado depois que a Central aplicar o
                        proxy residencial — até lá o botão fica bloqueado (<code className="code-box">EVOLUTION_ALLOW_CONNECT=false</code>).
                      </p>
                      <div className="mt-3"><QrBox action={connectQrAction} allowed={wa.allowConnect} /></div>
                    </div>
                  )}
                  <p className="text-xs text-ink-3">Nenhuma ação acima roda sozinha: elas só chamam a API do provedor quando você clica.</p>
                </div>
              )}
            </div>
          </div>

          <div className="mt-6 border-t border-line pt-5">
            <p className="mb-3 flex items-center gap-2 text-sm font-medium"><Phone aria-hidden className="h-4 w-4 text-brand" /> Telefone de cada membro</p>
            <div className="grid gap-3 md:grid-cols-2">
              {members.map((m) => {
                const canEdit = isOwner || m.user_id === member.userId;
                return (
                  <ActionForm key={m.user_id} action={setPhoneAction} className="rounded-xl bg-surface-2 p-3 ring-1 ring-line">
                    <input type="hidden" name="userId" value={m.user_id} />
                    <div className="flex flex-wrap items-end gap-2">
                      <Field label={m.display_name} className="min-w-44 flex-1" hint={m.phone_e164 ? `Atual: ${formatPhoneBR(m.phone_e164)}` : "Sem telefone — mensagens deste membro serão ignoradas"}>
                        <Input name="phone" defaultValue={m.phone_e164 ?? ""} placeholder="(11) 98765-4321" disabled={!canEdit} inputMode="tel" />
                      </Field>
                      {canEdit && <SubmitButton variant="secondary">Salvar</SubmitButton>}
                    </div>
                  </ActionForm>
                );
              })}
            </div>
            <p className="mt-2 text-xs text-ink-3">Mensagens de números não cadastrados são ignoradas e não recebem nenhum dado.</p>
          </div>
        </Card>
      </FadeIn>

      <FadeIn>
        <Card id="gmail">
          <CardTitle icon={Mail} action={<Badge tone={env.gmailMode === "live" ? "good" : env.gmailMode === "mock" ? "brand" : "neutral"}>Gmail: {env.gmailMode}</Badge>}>Gmail — faturas por e-mail</CardTitle>
          {gmailMsg && (
            <p role={gmailMsg.ok ? "status" : "alert"} className={`mb-3 rounded-xl px-3 py-2 text-sm ring-1 ${gmailMsg.ok ? "bg-good/10 text-good ring-good/30" : "bg-bad/10 text-bad ring-bad/30"}`}>{gmailMsg.text}</p>
          )}
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="text-sm text-ink-2">
              {gmailConn && gmailConn.status !== "desconectado" ? (
                <>
                  <p>Status: <Badge tone={gmailConn.status === "conectado" ? "good" : "bad"}>{gmailConn.status}</Badge> {gmailConn.email && <span className="ml-1">{gmailConn.email}</span>}</p>
                  <p className="mt-1 text-xs text-ink-3">Última sincronização: {gmailConn.last_sync_at ? new Date(gmailConn.last_sync_at).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" }) : "nunca"}</p>
                  {gmailConn.last_error && <p className="mt-1 text-xs text-bad">Erro: {gmailConn.last_error}</p>}
                </>
              ) : (
                <p>Conecte o <b>seu</b> Gmail (somente leitura) para importar faturas de cartão em PDF. Os itens vão para a sua fila de Revisão.</p>
              )}
            </div>
            <div className="flex flex-wrap gap-2">
              {gmailConn && gmailConn.status !== "desconectado" ? (
                <ActionButton action={disconnectGmailAction} label="Desconectar" variant="danger" pendingText="Desconectando…" />
              ) : (
                <LinkButton href="/api/integrations/gmail/connect" variant="primary"><Mail aria-hidden className="h-4 w-4" /> Conectar Gmail</LinkButton>
              )}
              {env.gmailMode === "mock" && env.localDevAuth && <ActionButton action={syncGmailMockAction} label={<><RefreshCw aria-hidden className="h-4 w-4" /> Sincronizar agora (mock)</>} pendingText="Sincronizando…" />}
            </div>
          </div>
          <div className="mt-5 border-t border-line pt-4">
            <p className="mb-1 text-xs font-semibold tracking-wide text-ink-2 uppercase">Senha dos PDFs de fatura (opcional)</p>
            <p className="mb-3 text-xs text-ink-3">
              Muitos bancos protegem a fatura com senha (geralmente dígitos do CPF). Se cadastrar, a sincronização do Gmail consegue ler esses PDFs.
              A senha é guardada <b>cifrada</b> e nunca é exibida de volta. Status: {pdfPw ? <Badge tone="good">cadastrada</Badge> : <Badge>não cadastrada</Badge>}
            </p>
            <ActionForm action={savePdfPasswordAction} resetOnSuccess className="flex flex-wrap items-end gap-2">
              <Field label="Nova senha" className="min-w-56 flex-1"><Input name="pdfPassword" type="password" autoComplete="off" maxLength={64} required /></Field>
              <SubmitButton variant="secondary">Salvar senha</SubmitButton>
            </ActionForm>
            {pdfPw && <div className="mt-2"><ActionButton action={clearPdfPasswordAction} label="Remover senha" variant="danger" pendingText="Removendo…" /></div>}
          </div>
        </Card>
      </FadeIn>
    </div>
  );
}
