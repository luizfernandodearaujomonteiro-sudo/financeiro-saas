import { Ban, CheckCircle2, MessageCircle, Plus, Receipt, Trash2 } from "lucide-react";
import { requireCtx } from "@/lib/auth/member";
import { formatBoletoLine } from "@/lib/domain/boleto";
import { diffDays, formatDateBR, todayISO } from "@/lib/domain/dates";
import { listBills, type BillRow } from "@/lib/services/bills";
import { listCategories } from "@/lib/services/categories";
import { buildDueAlertMessages } from "@/lib/whatsapp/messages";
import { ActionForm, CopyButton, Disclosure, SubmitButton } from "@/components/ui/client";
import { AnimatedMoney, FadeIn, Stagger, StaggerItem } from "@/components/ui/motion";
import { Badge, Card, CardTitle, EmptyState, Field, Input, Money, PageHeader, Select, Textarea, VisibilityBadge } from "@/components/ui/primitives";
import { cancelBillAction, createBillAction, deleteBillAction, payBillAction } from "./actions";
import { CodeFields } from "./CodeFields";

export const dynamic = "force-dynamic";
export const metadata = { title: "Contas a pagar" };

function dueBadge(days: number) {
  if (days < 0) return <Badge tone="bad">Vencida há {-days} dia{days === -1 ? "" : "s"}</Badge>;
  if (days === 0) return <Badge tone="bad">Vence hoje</Badge>;
  if (days === 1) return <Badge tone="warn">Vence amanhã</Badge>;
  if (days <= 5) return <Badge tone="warn">Vence em {days} dias</Badge>;
  return <Badge>Vence em {days} dias</Badge>;
}

function BillCard({ bill, today, mine }: { bill: BillRow; today: string; mine: boolean }) {
  const days = diffDays(today, bill.due_date);
  const hasCode = Boolean(bill.boleto_line || bill.boleto_barcode || bill.pix_code || bill.pix_key);
  const preview = buildDueAlertMessages(
    {
      description: bill.description,
      amountCents: bill.amount_cents,
      dueDate: bill.due_date,
      boletoLine: bill.boleto_line,
      boletoBarcode: bill.boleto_barcode,
      pixCode: bill.pix_code,
      pixKey: bill.pix_key,
      source: bill.source,
      shared: bill.visibility === "compartilhado",
    },
    Math.max(days, 0),
  );
  const line = bill.boleto_line ?? bill.boleto_barcode;
  return (
    <Card lift className="space-y-3 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate font-semibold">{bill.description}</p>
          <p className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-ink-3">
            {formatDateBR(bill.due_date)} · {bill.owner_name}
            {bill.category_name && <> · {bill.category_name}</>}
          </p>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {bill.status === "pendente" ? dueBadge(days) : bill.status === "paga" ? <Badge tone="good">Paga</Badge> : <Badge>Cancelada</Badge>}
            <VisibilityBadge v={bill.visibility} />
            {bill.source === "pluggy" ? <Badge tone="brand">Open Finance</Badge> : bill.source === "importacao" ? <Badge>Importada</Badge> : <Badge>Manual</Badge>}
          </div>
        </div>
        <Money cents={bill.amount_cents} className="text-lg font-bold" />
      </div>

      {line && (
        <div className="rounded-xl bg-surface-2 p-3 ring-1 ring-line">
          <div className="mb-1 flex items-center justify-between gap-2">
            <span className="text-[11px] font-medium text-ink-3">{bill.boleto_line ? "Linha digitável" : "Código de barras"}</span>
            <CopyButton value={line.replace(/\D/g, "")} label="Copiar código" />
          </div>
          <p className="code-box text-xs">{bill.boleto_line ? formatBoletoLine(bill.boleto_line) : line}</p>
        </div>
      )}
      {bill.pix_code && (
        <div className="rounded-xl bg-surface-2 p-3 ring-1 ring-line">
          <div className="mb-1 flex items-center justify-between gap-2">
            <span className="text-[11px] font-medium text-ink-3">Pix copia e cola</span>
            <CopyButton value={bill.pix_code} label="Copiar Pix" />
          </div>
          <p className="code-box line-clamp-3 text-[11px]">{bill.pix_code}</p>
        </div>
      )}
      {bill.pix_key && (
        <div className="flex items-center justify-between gap-2 rounded-xl bg-surface-2 px-3 py-2 ring-1 ring-line">
          <span className="text-xs"><span className="text-ink-3">Chave Pix ({bill.pix_key_type}):</span> <span className="code-box">{bill.pix_key}</span></span>
          <CopyButton value={bill.pix_key} label="Copiar chave" />
        </div>
      )}
      {!hasCode && (
        <p className="rounded-xl bg-warn/10 px-3 py-2 text-xs text-warn ring-1 ring-warn/30">
          Código de pagamento indisponível{bill.source === "pluggy" ? " — o banco não informou boleto/Pix via Open Finance." : "."}
        </p>
      )}

      {bill.status === "pendente" && (
        <Disclosure summary={<span className="flex items-center gap-1.5 text-xs font-medium text-ink-2"><MessageCircle aria-hidden className="h-3.5 w-3.5 text-good" /> Prévia do alerta no WhatsApp</span>}>
          <ol className="space-y-2" aria-label="Mensagens que serão enviadas, em ordem">
            {preview.map((m, i) => (
              <li key={i} className="max-w-[92%] rounded-2xl rounded-tl-sm bg-surface-solid px-3 py-2 text-xs whitespace-pre-wrap ring-1 ring-line">
                <span className={i > 0 ? "code-box" : ""}>{m}</span>
                <span className="mt-1 block text-right text-[10px] text-ink-3">mensagem {i + 1} de {preview.length}{i > 0 ? " · somente o código" : ""}</span>
              </li>
            ))}
          </ol>
        </Disclosure>
      )}

      {bill.status === "pendente" && (
        <div className="flex flex-wrap gap-2">
          <ActionForm action={payBillAction}>
            <input type="hidden" name="id" value={bill.id} />
            <SubmitButton className="h-8 text-xs" pendingText="Pagando…"><CheckCircle2 aria-hidden className="h-3.5 w-3.5" /> Marcar como paga</SubmitButton>
          </ActionForm>
          <ActionForm action={cancelBillAction}>
            <input type="hidden" name="id" value={bill.id} />
            <SubmitButton variant="secondary" className="h-8 text-xs"><Ban aria-hidden className="h-3.5 w-3.5" /> Cancelar</SubmitButton>
          </ActionForm>
          {mine && (
            <ActionForm action={deleteBillAction}>
              <input type="hidden" name="id" value={bill.id} />
              <SubmitButton variant="ghost" className="h-8 text-xs"><Trash2 aria-hidden className="h-3.5 w-3.5" /> Excluir</SubmitButton>
            </ActionForm>
          )}
        </div>
      )}
    </Card>
  );
}

export default async function ContasPage() {
  const { member } = await requireCtx();
  const ctx = { userId: member.userId, householdId: member.householdId };
  const [bills, categories] = await Promise.all([listBills(ctx), listCategories(ctx)]);
  const today = todayISO();
  const pending = bills.filter((b) => b.status === "pendente");
  const done = bills.filter((b) => b.status !== "pendente").slice(0, 12);
  const pendingTotal = pending.reduce((a, b) => a + b.amount_cents, 0);
  const next7 = pending.filter((b) => diffDays(today, b.due_date) <= 7).reduce((a, b) => a + b.amount_cents, 0);

  return (
    <div className="space-y-6">
      <PageHeader title="Contas a pagar" subtitle="Boleto e Pix validados; alertas no WhatsApp com o código em mensagem separada." icon={Receipt} />

      <div className="grid gap-4 sm:grid-cols-3">
        <Card gradient>
          <p className="text-xs text-ink-3">Pendentes</p>
          <AnimatedMoney cents={pendingTotal} className="text-2xl font-bold" />
          <p className="text-xs text-ink-3">{pending.length} conta(s)</p>
        </Card>
        <Card>
          <p className="text-xs text-ink-3">Vencendo em 7 dias</p>
          <AnimatedMoney cents={next7} className="text-2xl font-bold text-warn" />
        </Card>
        <Card>
          <p className="text-xs text-ink-3">Com código para pagar</p>
          <p className="num text-2xl font-bold">{pending.filter((b) => b.boleto_line || b.boleto_barcode || b.pix_code || b.pix_key).length}<span className="text-base text-ink-3">/{pending.length}</span></p>
        </Card>
      </div>

      <div className="grid gap-6 xl:grid-cols-[1fr_minmax(0,420px)]">
        <div className="space-y-6">
          <section>
            <h2 className="mb-3 text-sm font-semibold tracking-wide text-ink-2 uppercase">Pendentes</h2>
            {pending.length === 0 ? (
              <Card><EmptyState icon={Receipt} title="Nenhuma conta pendente">Cadastre boletos e Pix para receber alertas antes do vencimento.</EmptyState></Card>
            ) : (
              <Stagger className="grid gap-4 md:grid-cols-2">
                {pending.map((b) => (
                  <StaggerItem key={b.id}><BillCard bill={b} today={today} mine={b.owner_id === member.userId} /></StaggerItem>
                ))}
              </Stagger>
            )}
          </section>
          {done.length > 0 && (
            <section>
              <h2 className="mb-3 text-sm font-semibold tracking-wide text-ink-2 uppercase">Pagas e canceladas</h2>
              <Card className="p-0">
                <ul className="divide-y divide-line text-sm">
                  {done.map((b) => (
                    <li key={b.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
                      <span className="min-w-0">
                        <span className="block truncate">{b.description}</span>
                        <span className="text-xs text-ink-3">{formatDateBR(b.due_date)} · {b.owner_name}</span>
                      </span>
                      <span className="flex items-center gap-2">
                        {b.status === "paga" ? <Badge tone="good">Paga</Badge> : <Badge>Cancelada</Badge>}
                        <Money cents={b.amount_cents} />
                      </span>
                    </li>
                  ))}
                </ul>
              </Card>
            </section>
          )}
        </div>

        <FadeIn>
          <Card gradient className="xl:sticky xl:top-6">
            <CardTitle icon={Plus}>Nova conta a pagar</CardTitle>
            <ActionForm action={createBillAction} resetOnSuccess className="space-y-3">
              <Field label="Descrição"><Input name="description" required maxLength={140} placeholder="Ex.: Conta de luz" /></Field>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Valor (R$)"><Input name="amountCents" required inputMode="decimal" placeholder="0,00" /></Field>
                <Field label="Vencimento"><Input name="dueDate" type="date" required defaultValue={today} /></Field>
                <Field label="Categoria">
                  <Select name="categoryId" defaultValue="">
                    <option value="">Sem categoria</option>
                    {categories.filter((c) => c.kind === "despesa" && c.active).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </Select>
                </Field>
                <Field label="Tipo de custo">
                  <Select name="costType" defaultValue="fixa">
                    <option value="fixa">Fixa</option>
                    <option value="variavel">Variável</option>
                  </Select>
                </Field>
              </div>
              <Field label="Visibilidade" hint="Compartilhada: os dois recebem o alerta. Pessoal: só você.">
                <Select name="visibility" defaultValue="compartilhado">
                  <option value="compartilhado">🏠 Compartilhada (casa)</option>
                  <option value="pessoal">🔒 Pessoal</option>
                </Select>
              </Field>
              <CodeFields />
              <Field label="Observações"><Textarea name="notes" rows={2} maxLength={500} /></Field>
              <SubmitButton className="w-full">Cadastrar conta</SubmitButton>
            </ActionForm>
          </Card>
        </FadeIn>
      </div>
    </div>
  );
}
