import { BellRing, CalendarDays, Info, MessageCircle, Phone, Sun } from "lucide-react";
import { notFound } from "next/navigation";
import { requireCtx } from "@/lib/auth/member";
import { withUser } from "@/lib/db";
import { formatPhoneBR } from "@/lib/domain/phone";
import { env } from "@/lib/env";
import { listConversation } from "@/lib/whatsapp/simulate";
import { CopyButton } from "@/components/ui/client";
import { FadeIn } from "@/components/ui/motion";
import { Badge, Card, CardTitle, EmptyState, LinkButton, PageHeader } from "@/components/ui/primitives";
import { runAlertsAction, runDailyAction, runWeeklyAction } from "./actions";
import { Composer } from "./Composer";
import { JobButton } from "./JobButtons";

export const metadata = { title: "Simulador WhatsApp" };
export const dynamic = "force-dynamic";

function isCode(body: string): boolean {
  return /^\d{44,48}$/.test(body) || body.startsWith("000201");
}

/** Renderiza *negrito* do WhatsApp de forma segura (sem HTML). */
function WaText({ text }: { text: string }) {
  const parts = text.split(/(\*[^*\n]+\*)/g);
  return (
    <>
      {parts.map((p, i) => (p.startsWith("*") && p.endsWith("*") && p.length > 2 ? <b key={i}>{p.slice(1, -1)}</b> : <span key={i}>{p}</span>))}
    </>
  );
}

function time(d: string) {
  return new Date(d).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" });
}

export default async function SimuladorPage() {
  if (!env.simulatorEnabled) notFound();
  const { member } = await requireCtx();
  const ctx = { userId: member.userId, householdId: member.householdId };
  const [messages, phone] = await Promise.all([
    listConversation(ctx, 80),
    withUser(member.userId, (db) => db.one<{ phone_e164: string }>("select phone_e164 from public.fin_financeiro_whatsapp_numbers where user_id = auth.uid()")),
  ]);
  const ordered = [...messages].reverse();

  return (
    <div className="space-y-6">
      <PageHeader icon={MessageCircle} title="Simulador WhatsApp" subtitle="Teste o assistente localmente, sem a instância real." actions={<Badge tone="brand">modo local</Badge>} />

      <div className="grid gap-6 xl:grid-cols-3">
        <FadeIn className="xl:col-span-2">
          <Card gradient className="flex h-[70dvh] min-h-[520px] flex-col p-0">
            <div className="flex items-center gap-3 border-b border-line px-5 py-3">
              <span className="grid h-10 w-10 place-items-center rounded-full bg-gradient-to-br from-good to-brand-2 text-sm font-black text-brand-ink">F</span>
              <div className="min-w-0">
                <p className="text-sm font-semibold">Assistente Financeiro</p>
                <p className="flex items-center gap-1 text-xs text-ink-3"><Phone aria-hidden className="h-3 w-3" /> Você está escrevendo como {phone ? formatPhoneBR(phone.phone_e164) : "— (sem telefone)"}</p>
              </div>
            </div>
            <ol className="flex flex-1 flex-col gap-2 overflow-y-auto px-4 py-4" aria-label="Conversa" aria-live="polite">
              {ordered.length === 0 && (
                <li className="m-auto">
                  <EmptyState icon={MessageCircle} title="Nenhuma mensagem ainda">Envie “ajuda” para ver os comandos.</EmptyState>
                </li>
              )}
              {ordered.map((m) => {
                const inbound = m.direction === "in";
                const code = !inbound && isCode(m.body);
                return (
                  <li key={m.id} className={`flex ${inbound ? "justify-end" : "justify-start"}`}>
                    <div
                      className={`max-w-[85%] rounded-2xl px-3.5 py-2 text-sm shadow-sm ring-1 ${
                        inbound ? "rounded-br-md bg-good/15 ring-good/30" : "rounded-bl-md bg-surface-solid ring-line"
                      } ${m.status === "erro" ? "ring-bad/50" : ""}`}
                    >
                      <p className="mb-0.5 text-[10px] font-semibold text-ink-3">{inbound ? "Você" : "Assistente"}</p>
                      {code ? (
                        <div className="space-y-2">
                          <p className="text-[10px] tracking-wide text-brand uppercase">código (mensagem separada)</p>
                          <p className="code-box rounded-lg bg-surface-2 p-2 text-xs ring-1 ring-line">{m.body}</p>
                          <CopyButton value={m.body} label="Copiar código" />
                        </div>
                      ) : (
                        <p className="whitespace-pre-wrap break-words"><WaText text={m.body} /></p>
                      )}
                      <p className="mt-1 text-right text-[10px] text-ink-3">{time(m.created_at)}{m.status === "erro" ? " · falhou" : ""}</p>
                    </div>
                  </li>
                );
              })}
            </ol>
            <div className="border-t border-line p-4">
              {phone ? (
                <Composer />
              ) : (
                <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-ink-2">
                  <span>Cadastre seu telefone para simular mensagens.</span>
                  <LinkButton href="/configuracoes">Ir para Configurações</LinkButton>
                </div>
              )}
            </div>
          </Card>
        </FadeIn>

        <div className="space-y-6">
          <FadeIn delay={0.05}>
            <Card>
              <CardTitle icon={BellRing}>Rotinas agendadas (cron)</CardTitle>
              <div className="space-y-3">
                <JobButton action={runAlertsAction}><BellRing aria-hidden className="h-4 w-4" /> Rodar alertas de vencimento agora</JobButton>
                <JobButton action={runDailyAction}><Sun aria-hidden className="h-4 w-4" /> Lembrete diário</JobButton>
                <JobButton action={runWeeklyAction}><CalendarDays aria-hidden className="h-4 w-4" /> Resumo semanal</JobButton>
              </div>
              <p className="mt-4 text-xs text-ink-3">
                Os alertas de vencimento enviam o texto em uma mensagem e o código (linha digitável do boleto e/ou Pix copia e cola) em mensagens <b>separadas</b>, contendo só o código, para copiar com um toque.
                Contas compartilhadas avisam os dois; pessoais, só o dono.
              </p>
            </Card>
          </FadeIn>
          <FadeIn delay={0.1}>
            <Card>
              <CardTitle icon={Info}>Como funciona</CardTitle>
              <ul className="list-disc space-y-1.5 pl-5 text-xs text-ink-2">
                <li>Cada mensagem vira um payload no formato da <b>Evolution API</b> (<code className="code-box">messages.upsert</code>, remoteJid do seu telefone).</li>
                <li>O payload passa pela <b>mesma rota</b> do webhook real (<code className="code-box">/api/whatsapp/webhook</code>) com <code className="code-box">Authorization: Bearer</code>.</li>
                <li>O comando roda com as permissões do remetente (RLS): pessoal continua pessoal.</li>
                <li>As respostas são registradas pelo provedor simulado — nenhuma API externa é chamada.</li>
              </ul>
            </Card>
          </FadeIn>
        </div>
      </div>
    </div>
  );
}
