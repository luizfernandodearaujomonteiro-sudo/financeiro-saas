import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { addMonths, monthLabel } from "@/lib/domain/dates";
import type { View } from "@/lib/services/types";

const VIEWS: { v: View; label: string; hint: string }[] = [
  { v: "tudo", label: "Tudo que vejo", hint: "compartilhados + seus pessoais" },
  { v: "familia", label: "Casa", hint: "somente compartilhados" },
  { v: "minha", label: "Só eu", hint: "somente os seus" },
];

export function ViewSwitcher({ base, view, month }: { base: string; view: View; month: string }) {
  return (
    <div role="tablist" aria-label="Visão" className="inline-flex rounded-xl bg-surface-2 p-1 ring-1 ring-line">
      {VIEWS.map((x) => (
        <Link
          key={x.v}
          role="tab"
          aria-selected={view === x.v}
          title={x.hint}
          href={`${base}?visao=${x.v}&mes=${month.slice(0, 7)}`}
          className={`rounded-lg px-3 py-1.5 text-xs font-medium transition ${view === x.v ? "bg-gradient-to-r from-brand to-brand-2 text-brand-ink shadow" : "text-ink-3 hover:text-ink"}`}
        >
          {x.label}
        </Link>
      ))}
    </div>
  );
}

export function MonthNav({ base, view, month }: { base: string; view: View; month: string }) {
  const link = (m: string) => `${base}?visao=${view}&mes=${m.slice(0, 7)}`;
  return (
    <div className="inline-flex items-center gap-1 rounded-xl bg-surface-2 p-1 ring-1 ring-line">
      <Link href={link(addMonths(month, -1))} aria-label="Mês anterior" className="rounded-lg p-1.5 text-ink-3 hover:text-ink"><ChevronLeft aria-hidden className="h-4 w-4" /></Link>
      <span className="min-w-36 text-center text-sm font-medium capitalize">{monthLabel(month)}</span>
      <Link href={link(addMonths(month, 1))} aria-label="Próximo mês" className="rounded-lg p-1.5 text-ink-3 hover:text-ink"><ChevronRight aria-hidden className="h-4 w-4" /></Link>
    </div>
  );
}
