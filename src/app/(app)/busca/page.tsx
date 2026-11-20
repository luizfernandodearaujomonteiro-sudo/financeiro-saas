import { Clock, CreditCard, Search, SearchX, Trash2, User } from "lucide-react";
import Link from "next/link";
import { requireCtx } from "@/lib/auth/member";
import { formatDateBR } from "@/lib/domain/dates";
import { listCards } from "@/lib/services/cards";
import { listCategories } from "@/lib/services/categories";
import { listMembers } from "@/lib/services/household";
import { recentSearches, searchEntries, searchInput } from "@/lib/services/search";
import { ActionForm, SubmitButton } from "@/components/ui/client";
import { FadeIn, Stagger, StaggerItem } from "@/components/ui/motion";
import { Badge, Card, CardTitle, EmptyState, Field, Input, Money, PageHeader, Select, VisibilityBadge } from "@/components/ui/primitives";
import { clearHistoryAction, searchAction } from "./actions";

export const metadata = { title: "Busca" };
export const dynamic = "force-dynamic";

function Highlight({ text, q }: { text: string; q: string }) {
  if (!q) return <>{text}</>;
  const i = text.toLowerCase().indexOf(q.toLowerCase());
  if (i < 0) return <>{text}</>;
  return (
    <>
      {text.slice(0, i)}
      <mark className="rounded bg-brand/25 px-0.5 text-ink">{text.slice(i, i + q.length)}</mark>
      {text.slice(i + q.length)}
    </>
  );
}

type SP = Record<string, string | undefined>;

export default async function BuscaPage({ searchParams }: { searchParams: Promise<SP> }) {
  const { member } = await requireCtx();
  const ctx = { userId: member.userId, householdId: member.householdId };
  const sp = await searchParams;
  const parsed = searchInput.safeParse(Object.fromEntries(Object.entries(sp).filter(([, v]) => typeof v === "string" && v !== "")));
  const filters = parsed.success ? parsed.data : { q: "" };
  const hasQuery = parsed.success && Object.values(parsed.data).some(Boolean);
  const [cats, members, cards, recent, results] = await Promise.all([
    listCategories(ctx),
    listMembers(ctx),
    listCards(ctx),
    recentSearches(ctx),
    hasQuery && parsed.success ? searchEntries(ctx, parsed.data) : Promise.resolve([]),
  ]);
  const total = results.reduce((a, r) => a + (r.kind === "despesa" ? -r.amount_cents : r.amount_cents), 0);

  return (
    <div className="space-y-6">
      <PageHeader icon={Search} title="Busca" subtitle="Encontre gastos por descrição, categoria, valor (ex.: 50,00), data (ex.: 15/10), cartão ou membro." />

      <FadeIn>
        <Card gradient>
          <form action={searchAction} className="space-y-4" role="search">
            <div className="relative">
              <Search aria-hidden className="pointer-events-none absolute top-1/2 left-3.5 h-5 w-5 -translate-y-1/2 text-ink-3" />
              <input
                name="q"
                defaultValue={filters.q}
                maxLength={120}
                aria-label="Termo de busca"
                placeholder="mercado, uber, 189,90, 15/10…"
                className="h-12 w-full rounded-2xl border border-line bg-surface-solid/60 pr-28 pl-11 text-base focus:border-brand focus:outline-none"
              />
              <div className="absolute top-1/2 right-1.5 -translate-y-1/2"><SubmitButton pendingText="Buscando…">Buscar</SubmitButton></div>
            </div>
            <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
              <Field label="Categoria">
                <Select name="categoryId" defaultValue={filters.categoryId ?? ""}>
                  <option value="">Todas</option>
                  {cats.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </Select>
              </Field>
              <Field label="Membro">
                <Select name="ownerId" defaultValue={filters.ownerId ?? ""}>
                  <option value="">Todos</option>
                  {members.map((m) => <option key={m.user_id} value={m.user_id}>{m.display_name}</option>)}
                </Select>
              </Field>
              <Field label="Cartão">
                <Select name="cardId" defaultValue={filters.cardId ?? ""}>
                  <option value="">Qualquer</option>
                  {cards.map((c) => <option key={c.id} value={c.id}>{c.nickname} •••• {c.last4}</option>)}
                </Select>
              </Field>
              <Field label="Tipo">
                <Select name="kind" defaultValue={filters.kind ?? ""}>
                  <option value="">Todos</option>
                  <option value="despesa">Despesas</option>
                  <option value="receita">Receitas</option>
                </Select>
              </Field>
              <Field label="De"><Input name="from" type="date" defaultValue={filters.from ?? ""} /></Field>
              <Field label="Até"><Input name="to" type="date" defaultValue={filters.to ?? ""} /></Field>
            </div>
          </form>
        </Card>
      </FadeIn>

      {recent.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="flex items-center gap-1.5 text-xs text-ink-3"><Clock aria-hidden className="h-3.5 w-3.5" /> Recentes:</span>
          {recent.map((r) => (
            <Link key={r.id} href={`/busca?q=${encodeURIComponent(r.query)}`} className="rounded-full bg-surface-2 px-3 py-1 text-xs text-ink-2 ring-1 ring-line transition hover:text-ink hover:ring-brand/40">
              {r.query}
            </Link>
          ))}
          <ActionForm action={clearHistoryAction} className="inline-flex">
            <SubmitButton variant="ghost" pendingText="…" className="h-7 px-2 text-xs text-ink-3"><Trash2 aria-hidden className="h-3.5 w-3.5" /> Limpar histórico</SubmitButton>
          </ActionForm>
        </div>
      )}

      {hasQuery && (
        <Card>
          <CardTitle icon={Search} action={<span className="text-xs text-ink-3">{results.length === 100 ? "100+ resultados (refine a busca)" : `${results.length} resultado(s)`} · saldo <Money cents={total} /></span>}>Resultados</CardTitle>
          {results.length === 0 ? (
            <EmptyState icon={SearchX} title="Nada encontrado">Tente outro termo ou remova filtros. Lançamentos pessoais de outro membro nunca aparecem.</EmptyState>
          ) : (
            <Stagger className="divide-y divide-line">
              {results.map((r) => (
                <StaggerItem key={r.id}>
                  <div className="flex flex-wrap items-center justify-between gap-3 py-3">
                    <div className="min-w-0">
                      <p className="truncate font-medium"><Highlight text={r.description} q={filters.q ?? ""} /></p>
                      <p className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-ink-3">
                        <span>{formatDateBR(r.occurred_on)}</span>
                        {r.category_name && (
                          <span className="flex items-center gap-1"><span aria-hidden className="h-2 w-2 rounded-full" style={{ background: r.category_color ?? "#64748b" }} /><Highlight text={r.category_name} q={filters.q ?? ""} /></span>
                        )}
                        <span className="flex items-center gap-1"><User aria-hidden className="h-3 w-3" /> {r.owner_name}</span>
                        {r.card_nickname && <span className="flex items-center gap-1"><CreditCard aria-hidden className="h-3 w-3" /> {r.card_nickname}</span>}
                        {r.installment_total && <Badge>{r.installment_number}/{r.installment_total}</Badge>}
                      </p>
                    </div>
                    <div className="flex items-center gap-3">
                      <VisibilityBadge v={r.visibility} />
                      <Money cents={r.kind === "despesa" ? -r.amount_cents : r.amount_cents} sign className={`font-semibold ${r.kind === "despesa" ? "text-ink" : "text-good"}`} />
                    </div>
                  </div>
                </StaggerItem>
              ))}
            </Stagger>
          )}
        </Card>
      )}
    </div>
  );
}
