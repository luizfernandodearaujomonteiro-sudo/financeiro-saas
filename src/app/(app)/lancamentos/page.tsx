import { ArrowLeftRight, Eye, EyeOff, Pencil, Plus, Repeat, Trash2 } from "lucide-react";
import { requireCtx } from "@/lib/auth/member";
import { currentMonthStart, formatDateBR, normalizeMonthParam, todayISO } from "@/lib/domain/dates";
import { centsToInput } from "@/lib/domain/money";
import { summarize } from "@/lib/domain/reports";
import { listCards } from "@/lib/services/cards";
import { listCategories } from "@/lib/services/categories";
import { listEntriesForMonth } from "@/lib/services/entries";
import { parseView } from "@/lib/services/types";
import { MonthNav, ViewSwitcher } from "@/components/layout/ViewSwitcher";
import { ActionForm, Disclosure, SubmitButton } from "@/components/ui/client";
import { AnimatedMoney, Stagger, StaggerItem } from "@/components/ui/motion";
import { Badge, Card, CardTitle, EmptyState, Field, Input, Money, PageHeader, Select, VisibilityBadge } from "@/components/ui/primitives";
import { createEntryAction, deleteEntryAction, toggleExclusionAction, toggleVisibilityAction, updateEntryAction } from "./actions";
import { EntryForm } from "./EntryForm";

export const dynamic = "force-dynamic";
export const metadata = { title: "Lançamentos" };

const METHOD_LABEL: Record<string, string> = {
  pix: "Pix", cartao_credito: "Crédito", cartao_debito: "Débito", boleto: "Boleto", dinheiro: "Dinheiro", transferencia: "Transferência", debito_automatico: "Déb. automático",
};
const SOURCE_LABEL: Record<string, string> = { whatsapp: "WhatsApp", pluggy: "Open Finance", gmail: "Fatura", importacao: "Importado" };
const EXCLUDE_LABEL: Record<string, string> = { pagamento_fatura: "Pagamento de fatura", transferencia: "Transferência entre contas", manual: "Fora dos relatórios" };

export default async function Lancamentos({ searchParams }: { searchParams: Promise<{ visao?: string; mes?: string }> }) {
  const sp = await searchParams;
  const { member } = await requireCtx();
  const ctx = { userId: member.userId, householdId: member.householdId };
  const view = parseView(sp.visao);
  const month = normalizeMonthParam(sp.mes) ?? currentMonthStart();
  const [entries, categories, cards] = await Promise.all([listEntriesForMonth(ctx, month, view), listCategories(ctx), listCards(ctx)]);
  const s = summarize(entries);
  const usableCards = cards.filter((c) => c.active && (c.owner_id === member.userId || c.visibility === "compartilhado"));
  const byDay = new Map<string, typeof entries>();
  for (const e of entries) byDay.set(e.occurred_on, [...(byDay.get(e.occurred_on) ?? []), e]);

  return (
    <div className="space-y-6">
      <PageHeader title="Lançamentos" subtitle="Receitas e despesas do mês (cartão: mês da fatura)" icon={ArrowLeftRight}
        actions={<><ViewSwitcher base="/lancamentos" view={view} month={month} /><MonthNav base="/lancamentos" view={view} month={month} /></>} />
      <div className="grid grid-cols-3 gap-3">
        {[["Receitas", s.receitas, "text-good"], ["Despesas", s.despesas, "text-bad"], ["Resultado", s.resultado, s.resultado >= 0 ? "text-ink" : "text-bad"]].map(([l, v, c]) => (
          <Card key={l as string} className="p-4"><p className="text-xs text-ink-3">{l}</p><AnimatedMoney cents={v as number} className={`mt-1 block text-lg font-bold md:text-2xl ${c}`} /></Card>
        ))}
      </div>
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_380px]">
        <Card>
          <CardTitle icon={ArrowLeftRight}>{entries.length} lançamento(s)</CardTitle>
          {entries.length === 0 && <EmptyState icon={ArrowLeftRight} title="Nada por aqui">Adicione um lançamento ou envie “gastei 50 mercado” no WhatsApp.</EmptyState>}
          <div className="space-y-5">
            {[...byDay.entries()].map(([day, list]) => (
              <section key={day} aria-label={formatDateBR(day)}>
                <h3 className="mb-2 text-xs font-semibold tracking-wide text-ink-3 uppercase">{formatDateBR(day)}</h3>
                <Stagger className="space-y-2">
                  {list.map((e) => {
                    const mine = e.owner_id === member.userId;
                    return (
                      <StaggerItem key={e.id}>
                        <div className="lift rounded-xl bg-surface-2 p-3 ring-1 ring-line">
                          <div className="flex items-start justify-between gap-3">
                            <div className="flex min-w-0 items-start gap-3">
                              <span aria-hidden className="mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: e.category_color ?? "var(--text-3)" }} />
                              <div className="min-w-0">
                                <p className="truncate font-medium">{e.description}</p>
                                <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px] text-ink-3">
                                  <span>{e.category_name ?? "Sem categoria"}</span>·<span>{e.owner_name}</span>
                                  <VisibilityBadge v={e.visibility} />
                                  <Badge>{METHOD_LABEL[e.payment_method] ?? e.payment_method}</Badge>
                                  {e.card_nickname && <Badge tone="brand">{e.card_nickname}{e.installment_total ? ` · ${e.installment_number}/${e.installment_total}` : ""}</Badge>}
                                  {SOURCE_LABEL[e.source] && <Badge tone="good">{SOURCE_LABEL[e.source]}</Badge>}
                                  {e.cost_type === "fixa" && <Badge>Fixo</Badge>}
                                  {e.exclude_from_reports && (
                                    <Badge tone="warn"><Repeat aria-hidden className="h-3 w-3" /> {EXCLUDE_LABEL[e.exclude_reason ?? "manual"]} · fora dos relatórios</Badge>
                                  )}
                                  {!e.exclude_from_reports && e.kind === "receita" && e.card_id && <Badge tone="good">Estorno (reduz despesa)</Badge>}
                                </div>
                              </div>
                            </div>
                            <Money cents={e.kind === "receita" ? e.amount_cents : -e.amount_cents} sign className={`shrink-0 font-semibold ${e.exclude_from_reports ? "text-ink-3 line-through decoration-1" : e.kind === "receita" ? "text-good" : ""}`} />
                          </div>
                          {mine && (
                            <div className="mt-2 border-t border-line pt-2">
                              <Disclosure summary={<span className="flex items-center gap-3 text-xs text-ink-3"><Pencil aria-hidden className="h-3.5 w-3.5" /> Editar / ações</span>}>
                                <ActionForm action={updateEntryAction} className="grid gap-3 sm:grid-cols-2">
                                  <input type="hidden" name="id" value={e.id} />
                                  <input type="hidden" name="kind" value={e.kind} />
                                  <input type="hidden" name="paymentMethod" value={e.payment_method} />
                                  <Field label="Descrição"><Input name="description" defaultValue={e.description} required /></Field>
                                  <Field label="Valor"><Input name="amountCents" defaultValue={centsToInput(e.amount_cents)} required /></Field>
                                  <Field label="Data"><Input name="occurredOn" type="date" defaultValue={e.occurred_on} disabled={Boolean(e.card_id)} /></Field>
                                  {e.card_id && <input type="hidden" name="occurredOn" value={e.occurred_on} />}
                                  <Field label="Categoria">
                                    <Select name="categoryId" defaultValue={e.category_id ?? ""}>
                                      <option value="">Sem categoria</option>
                                      {categories.filter((c) => c.kind === e.kind).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                                    </Select>
                                  </Field>
                                  <Field label="Custo"><Select name="costType" defaultValue={e.cost_type}><option value="variavel">Variável</option><option value="fixa">Fixo</option></Select></Field>
                                  <Field label="Visibilidade"><Select name="visibility" defaultValue={e.visibility}><option value="compartilhado">Compartilhado</option><option value="pessoal">Pessoal</option></Select></Field>
                                  <div className="sm:col-span-2"><SubmitButton variant="secondary">Salvar alterações</SubmitButton></div>
                                </ActionForm>
                                <div className="mt-3 flex flex-wrap gap-2">
                                  <form action={toggleVisibilityAction}>
                                    <input type="hidden" name="id" value={e.id} />
                                    <input type="hidden" name="visibility" value={e.visibility === "pessoal" ? "compartilhado" : "pessoal"} />
                                    <button className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-surface-2 px-2.5 text-xs ring-1 ring-line hover:ring-line-strong">
                                      {e.visibility === "pessoal" ? <Eye aria-hidden className="h-3.5 w-3.5" /> : <EyeOff aria-hidden className="h-3.5 w-3.5" />}
                                      {e.visibility === "pessoal" ? "Compartilhar com a família" : "Tornar pessoal"}
                                    </button>
                                  </form>
                                  <form action={toggleExclusionAction}>
                                    <input type="hidden" name="id" value={e.id} />
                                    <input type="hidden" name="exclude" value={e.exclude_from_reports ? "false" : "true"} />
                                    <button className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-surface-2 px-2.5 text-xs ring-1 ring-line hover:ring-line-strong">
                                      <Repeat aria-hidden className="h-3.5 w-3.5" />
                                      {e.exclude_from_reports ? "Contar nos relatórios" : "Marcar como pagamento de fatura / transferência"}
                                    </button>
                                  </form>
                                  <form action={deleteEntryAction}>
                                    <input type="hidden" name="id" value={e.id} />
                                    <button className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-bad/10 px-2.5 text-xs text-bad ring-1 ring-bad/30 hover:bg-bad/20">
                                      <Trash2 aria-hidden className="h-3.5 w-3.5" /> {e.installment_total && e.installment_total > 1 ? "Excluir compra (todas as parcelas)" : "Excluir"}
                                    </button>
                                  </form>
                                </div>
                              </Disclosure>
                            </div>
                          )}
                        </div>
                      </StaggerItem>
                    );
                  })}
                </Stagger>
              </section>
            ))}
          </div>
        </Card>
        <Card gradient className="h-fit lg:sticky lg:top-6">
          <CardTitle icon={Plus}>Novo lançamento</CardTitle>
          <EntryForm action={createEntryAction} categories={categories.filter((c) => c.active)} cards={usableCards} today={todayISO()} />
        </Card>
      </div>
    </div>
  );
}
