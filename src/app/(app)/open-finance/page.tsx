import { Building2, CreditCard, FlaskConical, Landmark, RefreshCw, ShieldCheck, Trash2, Wallet } from "lucide-react";
import { requireCtx } from "@/lib/auth/member";
import { withUser } from "@/lib/db";
import { formatDateBR } from "@/lib/domain/dates";
import { env } from "@/lib/env";
import { listMyAccounts, listMyItems } from "@/lib/pluggy/service";
import { listCards } from "@/lib/services/cards";
import { ActionForm, SubmitButton } from "@/components/ui/client";
import { FadeIn, Stagger, StaggerItem } from "@/components/ui/motion";
import { Badge, Card, CardTitle, EmptyState, Money, PageHeader, Select, VisibilityBadge } from "@/components/ui/primitives";
import { removeAction, shareAccountAction, shareEntryAction, syncAction } from "./actions";
import { MockConnectButton, PluggyConnectButton } from "./ConnectButtons";

export const dynamic = "force-dynamic";
export const metadata = { title: "Open Finance" };

const MODE: Record<string, { label: string; tone: "neutral" | "brand" | "good" | "warn" | "bad" }> = {
  live: { label: "Produção", tone: "good" },
  sandbox: { label: "Sandbox", tone: "warn" },
  mock: { label: "Simulado (local)", tone: "brand" },
  off: { label: "Desativado", tone: "neutral" },
};

function ShareForm({ kind, id, visibility }: { kind: "conta" | "cartao"; id: string; visibility: string }) {
  return (
    <ActionForm action={shareAccountAction} className="mt-3 space-y-2">
      <input type="hidden" name="kind" value={kind} />
      <input type="hidden" name="id" value={id} />
      <div className="flex flex-wrap items-center gap-2">
        <Select name="visibility" defaultValue={visibility} aria-label="Visibilidade" className="h-9 w-auto min-w-44">
          <option value="pessoal">🔒 Pessoal (só eu)</option>
          <option value="compartilhado">🏠 Compartilhar com a família</option>
        </Select>
        <SubmitButton variant="secondary" className="h-9 text-xs">Salvar</SubmitButton>
      </div>
      <label className="flex items-center gap-2 text-xs text-ink-3">
        <input type="checkbox" name="apply" className="h-4 w-4 accent-[var(--brand)]" /> Aplicar também aos lançamentos já importados
      </label>
    </ActionForm>
  );
}

export default async function OpenFinancePage() {
  const { member } = await requireCtx();
  const ctx = { userId: member.userId, householdId: member.householdId };
  const mode = env.pluggyMode;
  const [items, accounts, cards, recent] = await Promise.all([
    listMyItems(ctx),
    listMyAccounts(ctx),
    listCards(ctx),
    withUser(ctx.userId, (db) =>
      db.query<{ id: string; description: string; amount_cents: number; kind: "receita" | "despesa"; occurred_on: string; visibility: "pessoal" | "compartilhado"; category_name: string | null }>(
        `select e.id, e.description, e.amount_cents, e.kind, e.occurred_on, e.visibility, c.name as category_name
           from public.fin_financeiro_entries e left join public.fin_financeiro_categories c on c.id = e.category_id
          where e.source = 'pluggy' and e.owner_id = auth.uid() order by e.occurred_on desc, e.created_at desc limit 30`,
      ),
    ),
  ]);
  const importedAccounts = accounts.filter((a) => a.pluggy_account_id);
  const importedCards = cards.filter((c) => c.pluggy_account_id);

  return (
    <div className="space-y-6">
      <PageHeader title="Open Finance" subtitle="Cada membro conecta as próprias contas. O que é importado é pessoal até você decidir compartilhar." icon={Building2} actions={<Badge tone={MODE[mode]?.tone}>{MODE[mode]?.label ?? mode}</Badge>} />

      <div className="grid gap-6 lg:grid-cols-[1fr_minmax(0,380px)]">
        <FadeIn>
          <Card gradient>
            <CardTitle icon={Wallet}>Minhas conexões</CardTitle>
            {items.length === 0 ? (
              <EmptyState icon={Landmark} title="Nenhum banco conectado">Conecte sua conta para importar saldos, cartões, transações e faturas automaticamente.</EmptyState>
            ) : (
              <ul className="space-y-3">
                {items.map((it) => (
                  <li key={it.id} className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-surface-2 p-4 ring-1 ring-line">
                    <span className="min-w-0">
                      <span className="block font-medium">{it.connector_name ?? "Banco"}</span>
                      <span className="flex flex-wrap items-center gap-1.5 text-xs text-ink-3">
                        <Badge tone={MODE[it.mode]?.tone}>{MODE[it.mode]?.label ?? it.mode}</Badge>
                        {it.status && <Badge tone={it.status === "erro" ? "bad" : "neutral"}>{it.status}</Badge>}
                        {it.last_sync_at ? `Última sincronização: ${new Date(it.last_sync_at).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}` : "Ainda não sincronizado"}
                      </span>
                      {it.last_error && <span className="mt-1 block text-xs text-bad">{it.last_error}</span>}
                    </span>
                    <span className="flex gap-2">
                      <ActionForm action={syncAction}>
                        <input type="hidden" name="itemId" value={it.item_id} />
                        <SubmitButton variant="secondary" className="h-8 text-xs" pendingText="Sincronizando…"><RefreshCw aria-hidden className="h-3.5 w-3.5" /> Sincronizar</SubmitButton>
                      </ActionForm>
                      <ActionForm action={removeAction}>
                        <input type="hidden" name="itemId" value={it.item_id} />
                        <SubmitButton variant="ghost" className="h-8 text-xs" pendingText="Removendo…"><Trash2 aria-hidden className="h-3.5 w-3.5" /> Remover</SubmitButton>
                      </ActionForm>
                    </span>
                  </li>
                ))}
              </ul>
            )}
            <div className="mt-5">
              {mode === "mock" ? (
                <MockConnectButton />
              ) : mode === "live" || mode === "sandbox" ? (
                <PluggyConnectButton scriptUrl={process.env.PLUGGY_CONNECT_SCRIPT_URL ?? "https://cdn.pluggy.ai/pluggy-connect/v2.8.2/pluggy-connect.js"} />
              ) : (
                <p className="text-sm text-ink-3">Open Finance desativado. Configure PLUGGY_MODE e as credenciais (veja docs/ENTREGA.md).</p>
              )}
            </div>
          </Card>
        </FadeIn>

        <div className="space-y-4">
          <Card>
            <CardTitle icon={ShieldCheck}>Privacidade</CardTitle>
            <ul className="space-y-2 text-sm text-ink-2">
              <li>• A conexão é <b>sua</b>: a outra pessoa da família não vê suas credenciais nem suas contas.</li>
              <li>• Guardamos apenas o identificador da conexão (item); nada de senha do banco.</li>
              <li>• Tudo o que é importado entra como <b>pessoal</b>. Compartilhe uma conta/cartão inteiro ou transação por transação.</li>
            </ul>
          </Card>
          {mode !== "live" && (
            <Card>
              <CardTitle icon={FlaskConical}>Testar sem banco real</CardTitle>
              <ul className="space-y-2 text-sm text-ink-2">
                <li><b>Simulado (PLUGGY_MODE=mock):</b> o botão cria uma conexão fictícia e roda o mesmo fluxo do webhook (contas, cartões, transações com categoria automática e faturas com e sem código de pagamento).</li>
                <li><b>Sandbox (PLUGGY_MODE=sandbox):</b> no widget escolha o conector <b>Pluggy Bank</b> e use usuário <code className="code-box">user-ok</code> / senha <code className="code-box">password-ok</code>.</li>
              </ul>
            </Card>
          )}
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardTitle icon={Landmark}>Contas importadas</CardTitle>
          {importedAccounts.length === 0 ? (
            <p className="text-sm text-ink-3">Nenhuma conta importada ainda.</p>
          ) : (
            <Stagger className="space-y-3">
              {importedAccounts.map((a) => (
                <StaggerItem key={a.id}>
                  <div className="rounded-2xl bg-surface-2 p-4 ring-1 ring-line">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span>
                        <span className="block font-medium">{a.name}</span>
                        <span className="flex items-center gap-1.5 text-xs text-ink-3">{a.institution} <VisibilityBadge v={a.visibility} /></span>
                      </span>
                      <Money cents={a.balance_cents} className="text-lg font-semibold" />
                    </div>
                    {a.owner_id === member.userId && <ShareForm kind="conta" id={a.id} visibility={a.visibility} />}
                  </div>
                </StaggerItem>
              ))}
            </Stagger>
          )}
        </Card>
        <Card>
          <CardTitle icon={CreditCard}>Cartões importados</CardTitle>
          {importedCards.length === 0 ? (
            <p className="text-sm text-ink-3">Nenhum cartão importado ainda.</p>
          ) : (
            <Stagger className="space-y-3">
              {importedCards.map((c) => (
                <StaggerItem key={c.id}>
                  <div className="rounded-2xl bg-surface-2 p-4 ring-1 ring-line">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span>
                        <span className="block font-medium">{c.nickname} <span className="text-ink-3">•••• {c.last4}</span></span>
                        <span className="flex items-center gap-1.5 text-xs text-ink-3">Fecha dia {c.closing_day} · vence dia {c.due_day} <VisibilityBadge v={c.visibility} /></span>
                      </span>
                      {c.limit_cents > 0 && <span className="text-xs text-ink-3">Limite <Money cents={c.limit_cents} /></span>}
                    </div>
                    {c.owner_id === member.userId && <ShareForm kind="cartao" id={c.id} visibility={c.visibility} />}
                  </div>
                </StaggerItem>
              ))}
            </Stagger>
          )}
        </Card>
      </div>

      <Card>
        <CardTitle icon={RefreshCw}>Minhas transações importadas (últimas 30)</CardTitle>
        {recent.length === 0 ? (
          <p className="text-sm text-ink-3">Sem transações importadas.</p>
        ) : (
          <ul className="divide-y divide-line text-sm">
            {recent.map((e) => (
              <li key={e.id} className="flex flex-wrap items-center justify-between gap-3 py-2.5">
                <span className="min-w-0">
                  <span className="block truncate">{e.description}</span>
                  <span className="text-xs text-ink-3">{formatDateBR(e.occurred_on)} · {e.category_name ?? "Sem categoria"}</span>
                </span>
                <span className="flex items-center gap-3">
                  <Money cents={e.kind === "despesa" ? -e.amount_cents : e.amount_cents} sign className={e.kind === "receita" ? "text-good" : ""} />
                  <ActionForm action={shareEntryAction} className="flex items-center gap-2">
                    <input type="hidden" name="id" value={e.id} />
                    <input type="hidden" name="visibility" value={e.visibility === "compartilhado" ? "pessoal" : "compartilhado"} />
                    <SubmitButton variant="ghost" className="h-8 px-2 text-xs" pendingText="…">
                      {e.visibility === "compartilhado" ? "🏠 Compartilhado · tornar pessoal" : "🔒 Pessoal · compartilhar"}
                    </SubmitButton>
                  </ActionForm>
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
