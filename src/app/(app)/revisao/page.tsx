import { Check, FileText, History, Inbox, Upload, X } from "lucide-react";
import { requireCtx } from "@/lib/auth/member";
import { formatDateBR } from "@/lib/domain/dates";
import { centsToInput } from "@/lib/domain/money";
import { listCards } from "@/lib/services/cards";
import { listCategories } from "@/lib/services/categories";
import { listReview } from "@/lib/services/review";
import { ActionForm, SubmitButton } from "@/components/ui/client";
import { FadeIn, Stagger, StaggerItem } from "@/components/ui/motion";
import { Badge, Card, CardTitle, EmptyState, Field, Input, Money, PageHeader, Select } from "@/components/ui/primitives";
import { approveAction, rejectAction, uploadAction } from "./actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "Revisão de importações" };

const SOURCE: Record<string, string> = { gmail: "Gmail", upload: "PDF enviado", pluggy: "Open Finance" };

export default async function RevisaoPage() {
  const { member } = await requireCtx();
  const ctx = { userId: member.userId, householdId: member.householdId };
  const [items, cards, categories] = await Promise.all([listReview(ctx, "todas"), listCards(ctx), listCategories(ctx)]);
  const pending = items.filter((i) => i.status === "pendente");
  const history = items.filter((i) => i.status !== "pendente").slice(0, 15);
  const activeCards = cards.filter((c) => c.active);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Revisão"
        subtitle="Itens lidos das faturas (Gmail ou PDF enviado). Aprove, edite ou rejeite antes de virarem lançamentos."
        icon={Inbox}
        actions={<Badge tone={pending.length ? "brand" : "neutral"}>{pending.length} pendente(s)</Badge>}
      />

      <div className="grid gap-6 xl:grid-cols-[1fr_minmax(0,380px)]">
        <section aria-label="Itens pendentes">
          {pending.length === 0 ? (
            <Card><EmptyState icon={Inbox} title="Tudo revisado!">Novas faturas do Gmail aparecem aqui automaticamente. Você também pode enviar um PDF.</EmptyState></Card>
          ) : (
            <Stagger className="space-y-4">
              {pending.map((it) => {
                const cats = categories.filter((c) => c.kind === it.kind && c.active);
                return (
                  <StaggerItem key={it.id}>
                    <Card lift className="p-4">
                      <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="truncate font-semibold">{it.description}</p>
                          <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-ink-3">
                            <span>{formatDateBR(it.occurred_on)}</span>
                            <Badge>{SOURCE[it.source] ?? it.source}</Badge>
                            {it.kind === "receita" && <Badge tone="good">Estorno/crédito</Badge>}
                            {it.installment_total && <Badge tone="brand">Parcela {it.installment_number}/{it.installment_total}</Badge>}
                            {it.category_name && <Badge tone="neutral">Sugestão: {it.category_name}</Badge>}
                            {it.document_id && (
                              <a href={`/api/documentos/${it.document_id}`} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-brand hover:underline">
                                <FileText aria-hidden className="h-3.5 w-3.5" /> {it.file_name ?? "documento"}
                              </a>
                            )}
                          </div>
                        </div>
                        <Money cents={it.kind === "despesa" ? it.amount_cents : -it.amount_cents} className={`text-lg font-bold ${it.kind === "receita" ? "text-good" : ""}`} />
                      </div>
                      <ActionForm action={approveAction} className="space-y-3">
                        <input type="hidden" name="id" value={it.id} />
                        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                          <Field label="Descrição" className="sm:col-span-2 lg:col-span-1"><Input name="description" defaultValue={it.description} required maxLength={140} /></Field>
                          <Field label="Valor (R$)"><Input name="amountCents" defaultValue={centsToInput(it.amount_cents)} required inputMode="decimal" /></Field>
                          <Field label="Data"><Input name="occurredOn" type="date" defaultValue={it.occurred_on} required /></Field>
                          <Field label="Categoria">
                            <Select name="categoryId" defaultValue={it.suggested_category ?? ""}>
                              <option value="">Sem categoria</option>
                              {cats.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                            </Select>
                          </Field>
                          <Field label="Cartão">
                            <Select name="cardId" defaultValue={it.card_id ?? ""}>
                              <option value="">Sem cartão</option>
                              {activeCards.map((c) => <option key={c.id} value={c.id}>{c.nickname} •••• {c.last4}</option>)}
                            </Select>
                          </Field>
                          <Field label="Visibilidade">
                            <Select name="visibility" defaultValue="pessoal">
                              <option value="pessoal">🔒 Pessoal</option>
                              <option value="compartilhado">🏠 Compartilhado</option>
                            </Select>
                          </Field>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          <SubmitButton className="h-9 text-xs" pendingText="Aprovando…"><Check aria-hidden className="h-4 w-4" /> Aprovar</SubmitButton>
                        </div>
                      </ActionForm>
                      <ActionForm action={rejectAction} className="mt-2">
                        <input type="hidden" name="id" value={it.id} />
                        <SubmitButton variant="ghost" className="h-8 text-xs" pendingText="Rejeitando…"><X aria-hidden className="h-3.5 w-3.5" /> Rejeitar</SubmitButton>
                      </ActionForm>
                    </Card>
                  </StaggerItem>
                );
              })}
            </Stagger>
          )}
        </section>

        <div className="space-y-6">
          <FadeIn>
            <Card gradient>
              <CardTitle icon={Upload}>Enviar PDF de fatura</CardTitle>
              <ActionForm action={uploadAction} resetOnSuccess className="space-y-3">
                <Field label="Arquivo (PDF, até 8 MB)">
                  <input name="file" type="file" accept="application/pdf,.pdf" required className="block w-full text-sm text-ink-2 file:mr-3 file:h-9 file:rounded-lg file:border-0 file:bg-surface-2 file:px-3 file:text-sm file:text-ink file:ring-1 file:ring-line" />
                </Field>
                <Field label="Cartão da fatura (opcional)">
                  <Select name="cardId" defaultValue="">
                    <option value="">Não sei / sem cartão</option>
                    {activeCards.map((c) => <option key={c.id} value={c.id}>{c.nickname} •••• {c.last4}</option>)}
                  </Select>
                </Field>
                <SubmitButton className="w-full" pendingText="Lendo PDF…">Importar</SubmitButton>
                <p className="text-[11px] text-ink-3">O PDF fica guardado de forma privada (só você acessa). PDFs com senha ainda não são suportados.</p>
              </ActionForm>
            </Card>
          </FadeIn>
          <Card>
            <CardTitle icon={History}>Revisados recentemente</CardTitle>
            {history.length === 0 ? (
              <p className="text-sm text-ink-3">Nada por aqui ainda.</p>
            ) : (
              <ul className="divide-y divide-line text-sm">
                {history.map((h) => (
                  <li key={h.id} className="flex items-center justify-between gap-2 py-2">
                    <span className="min-w-0">
                      <span className="block truncate">{h.description}</span>
                      <span className="text-xs text-ink-3">{formatDateBR(h.occurred_on)}</span>
                    </span>
                    <span className="flex items-center gap-2">
                      {h.status === "aprovado" ? <Badge tone="good">Aprovado</Badge> : <Badge tone="bad">Rejeitado</Badge>}
                      <Money cents={h.amount_cents} className="text-xs" />
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}
