"use client";
import { useMemo, useState } from "react";
import { ActionForm, SubmitButton } from "@/components/ui/client";
import { Field, Input, Select } from "@/components/ui/primitives";
import { formatDateBR } from "@/lib/domain/dates";
import { parseBRL, formatBRL } from "@/lib/domain/money";
import { planInstallments } from "@/lib/domain/invoices";
import type { ActionState } from "@/lib/actions";

interface Opt { id: string; name: string; kind?: string }
interface CardOpt { id: string; nickname: string; last4: string; closing_day: number; due_day: number }

const METHODS: [string, string][] = [
  ["pix", "Pix"], ["cartao_credito", "Cartão de crédito"], ["cartao_debito", "Cartão de débito"], ["boleto", "Boleto"],
  ["dinheiro", "Dinheiro"], ["transferencia", "Transferência"], ["debito_automatico", "Débito automático"],
];

export function EntryForm({ action, categories, cards, today }: { action: (p: ActionState, fd: FormData) => Promise<ActionState>; categories: Opt[]; cards: CardOpt[]; today: string }) {
  const [kind, setKind] = useState<"despesa" | "receita">("despesa");
  const [method, setMethod] = useState("pix");
  const [cardId, setCardId] = useState(cards[0]?.id ?? "");
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(today);
  const [inst, setInst] = useState(1);
  const isCredit = kind === "despesa" && method === "cartao_credito";
  const preview = useMemo(() => {
    const card = cards.find((c) => c.id === cardId);
    const cents = parseBRL(amount);
    if (!isCredit || !card || !cents || cents <= 0 || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
    try {
      return planInstallments({ closingDay: card.closing_day, dueDay: card.due_day }, date, cents, inst);
    } catch {
      return null;
    }
  }, [isCredit, cards, cardId, amount, date, inst]);

  return (
    <ActionForm action={action} resetOnSuccess className="space-y-4">
      <div role="radiogroup" aria-label="Tipo" className="grid grid-cols-2 gap-2 rounded-xl bg-surface-2 p-1 ring-1 ring-line">
        {(["despesa", "receita"] as const).map((k) => (
          <label key={k} className={`cursor-pointer rounded-lg py-2 text-center text-sm font-medium transition ${kind === k ? (k === "despesa" ? "bg-bad/20 text-bad" : "bg-good/20 text-good") : "text-ink-3"}`}>
            <input type="radio" name="kind" value={k} checked={kind === k} onChange={() => setKind(k)} className="sr-only" />
            {k === "despesa" ? "Despesa" : "Receita"}
          </label>
        ))}
      </div>
      <Field label="Descrição"><Input name="description" required maxLength={140} placeholder="Ex.: Supermercado" /></Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label={isCredit ? "Valor total" : "Valor"}><Input name="amountCents" inputMode="decimal" required placeholder="0,00" value={amount} onChange={(e) => setAmount(e.target.value)} /></Field>
        <Field label="Data"><Input name="occurredOn" type="date" required value={date} onChange={(e) => setDate(e.target.value)} /></Field>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Categoria">
          <Select name="categoryId" defaultValue="">
            <option value="">Sem categoria</option>
            {categories.filter((c) => c.kind === kind).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </Select>
        </Field>
        <Field label="Forma de pagamento">
          <Select name="paymentMethod" value={method} onChange={(e) => setMethod(e.target.value)}>
            {METHODS.filter(([v]) => kind === "despesa" || !v.startsWith("cartao")).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </Select>
        </Field>
      </div>
      {isCredit && (
        <div className="grid grid-cols-2 gap-3 rounded-xl bg-surface-2 p-3 ring-1 ring-line">
          <Field label="Cartão">
            <Select name="cardId" value={cardId} onChange={(e) => setCardId(e.target.value)} required>
              {cards.map((c) => <option key={c.id} value={c.id}>{c.nickname} •••• {c.last4}</option>)}
            </Select>
          </Field>
          <Field label="Parcelas"><Input name="installments" type="number" min={1} max={48} value={inst} onChange={(e) => setInst(Math.max(1, Math.min(48, Number(e.target.value) || 1)))} /></Field>
          {preview && (
            <ul className="col-span-2 max-h-32 space-y-1 overflow-y-auto text-xs text-ink-2" aria-label="Prévia das parcelas">
              {preview.map((p) => <li key={p.number} className="flex justify-between"><span>{p.number}/{p.total} · fatura vence {formatDateBR(p.invoice.dueDate)}</span><span className="num">{formatBRL(p.amountCents)}</span></li>)}
            </ul>
          )}
          {cards.length === 0 && <p className="col-span-2 text-xs text-warn">Cadastre um cartão em Cartões primeiro.</p>}
        </div>
      )}
      <div className="grid grid-cols-2 gap-3">
        <Field label="Custo">
          <Select name="costType" defaultValue="variavel"><option value="variavel">Variável</option><option value="fixa">Fixo</option></Select>
        </Field>
        <Field label="Visibilidade" hint="Pessoal: só você vê">
          <Select name="visibility" defaultValue="compartilhado"><option value="compartilhado">🏠 Compartilhado</option><option value="pessoal">🔒 Pessoal</option></Select>
        </Field>
      </div>
      <Field label="Observações"><Input name="notes" maxLength={500} /></Field>
      <SubmitButton className="w-full">Adicionar</SubmitButton>
    </ActionForm>
  );
}
