"use client";
import { CalendarClock } from "lucide-react";
import { useMemo, useState } from "react";
import { formatDateBR, monthLabel, todayISO } from "@/lib/domain/dates";
import { planInstallments } from "@/lib/domain/invoices";
import { formatBRL, parseBRL } from "@/lib/domain/money";

interface CardOpt {
  id: string;
  nickname: string;
  closing_day: number;
  due_day: number;
}

interface CategoryOpt {
  id: string;
  name: string;
}

const inputCls = "h-10 w-full rounded-xl border border-line bg-surface-solid/60 px-3 text-sm text-ink placeholder:text-ink-3 focus:border-brand focus:outline-none";

/** Campos da compra + prévia ao vivo das parcelas (regra de fechamento do domínio). */
export function PurchaseFields({ cards, categories }: { cards: CardOpt[]; categories: CategoryOpt[] }) {
  const [cardId, setCardId] = useState(cards[0]?.id ?? "");
  const [total, setTotal] = useState("");
  const [n, setN] = useState(1);
  const [date, setDate] = useState(todayISO());
  const card = cards.find((c) => c.id === cardId);
  const cents = parseBRL(total);

  const plan = useMemo(() => {
    if (!card || !cents || cents <= 0 || n < 1 || n > 48 || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
    try {
      return planInstallments({ closingDay: card.closing_day, dueDay: card.due_day }, date, cents, n);
    } catch {
      return null;
    }
  }, [card, cents, n, date]);

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-1.5">
          <span className="text-xs font-medium text-ink-2">Cartão</span>
          <select name="cardId" required value={cardId} onChange={(e) => setCardId(e.target.value)} className={inputCls}>
            {cards.map((c) => (
              <option key={c.id} value={c.id}>{c.nickname}</option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-xs font-medium text-ink-2">Descrição</span>
          <input name="description" required maxLength={140} placeholder="Ex.: Geladeira" className={inputCls} />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-xs font-medium text-ink-2">Valor total (R$)</span>
          <input name="totalCents" required inputMode="decimal" placeholder="0,00" value={total} onChange={(e) => setTotal(e.target.value)} className={inputCls} />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-xs font-medium text-ink-2">Parcelas</span>
          <input name="installments" type="number" min={1} max={48} required value={n} onChange={(e) => setN(Number(e.target.value))} className={inputCls} />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-xs font-medium text-ink-2">Data da compra</span>
          <input name="purchasedOn" type="date" required value={date} onChange={(e) => setDate(e.target.value)} className={inputCls} />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-xs font-medium text-ink-2">Categoria</span>
          <select name="categoryId" className={inputCls} defaultValue="">
            <option value="">Sem categoria</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-xs font-medium text-ink-2">Visibilidade</span>
          <select name="visibility" className={inputCls} defaultValue="pessoal">
            <option value="pessoal">🔒 Pessoal (só eu)</option>
            <option value="compartilhado">🏠 Compartilhado (casa)</option>
          </select>
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-xs font-medium text-ink-2">Tipo de custo</span>
          <select name="costType" className={inputCls} defaultValue="variavel">
            <option value="variavel">Variável</option>
            <option value="fixa">Fixa</option>
          </select>
        </label>
      </div>

      <div className="rounded-xl bg-surface-2 p-3 ring-1 ring-line" aria-live="polite">
        <p className="mb-2 flex items-center gap-2 text-xs font-semibold text-ink-2">
          <CalendarClock aria-hidden className="h-4 w-4 text-brand" /> Prévia das parcelas
        </p>
        {plan ? (
          <ol className="max-h-56 space-y-1 overflow-y-auto pr-1 text-xs">
            {plan.map((p) => (
              <li key={p.number} className="flex items-center justify-between gap-2 rounded-lg px-2 py-1 odd:bg-surface-solid/40">
                <span className="text-ink-2">
                  {p.number}/{p.total} · fatura de <b className="text-ink">{monthLabel(p.invoice.referenceMonth)}</b>
                  <span className="text-ink-3"> (vence {formatDateBR(p.invoice.dueDate)})</span>
                </span>
                <span className="num font-medium">{formatBRL(p.amountCents)}</span>
              </li>
            ))}
          </ol>
        ) : (
          <p className="text-xs text-ink-3">Informe cartão, valor e data para ver em quais faturas cada parcela cai.</p>
        )}
      </div>
    </div>
  );
}
