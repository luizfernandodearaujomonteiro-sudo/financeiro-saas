import { ChevronLeft, ChevronRight } from "lucide-react";
import Link from "next/link";
import { addMonths, monthLabel } from "@/lib/domain/dates";
import type { View } from "@/lib/services/types";

const VIEWS: { v: View; label: string }[] = [
  { v: "tudo", label: "Tudo que vejo" },
  { v: "familia", label: "Família" },
  { v: "minha", label: "Só eu" },
];

export function MonthViewSelector({ base, month, view }: { base: string; month: string; view: View }) {
  const href = (m: string, v: View) => `${base}?mes=${m.slice(0, 7)}&visao=${v}`;
  return (
    <div className="flex flex-wrap items-center gap-2">
      <nav aria-label="Mês" className="flex items-center gap-1 rounded-xl bg-surface-2 p-1 ring-1 ring-line">
        <Link href={href(addMonths(month, -1), view)} aria-label="Mês anterior" className="grid h-8 w-8 place-items-center rounded-lg text-ink-2 hover:bg-surface-solid hover:text-ink">
          <ChevronLeft aria-hidden className="h-4 w-4" />
        </Link>
        <span className="min-w-36 px-2 text-center text-sm font-medium capitalize">{monthLabel(month)}</span>
        <Link href={href(addMonths(month, 1), view)} aria-label="Próximo mês" className="grid h-8 w-8 place-items-center rounded-lg text-ink-2 hover:bg-surface-solid hover:text-ink">
          <ChevronRight aria-hidden className="h-4 w-4" />
        </Link>
      </nav>
      <nav aria-label="Visão" className="flex rounded-xl bg-surface-2 p-1 ring-1 ring-line">
        {VIEWS.map((o) => (
          <Link
            key={o.v}
            href={href(month, o.v)}
            aria-current={o.v === view ? "page" : undefined}
            className={`rounded-lg px-3 py-1.5 text-xs font-medium transition ${o.v === view ? "bg-brand text-brand-ink" : "text-ink-3 hover:text-ink"}`}
          >
            {o.label}
          </Link>
        ))}
      </nav>
    </div>
  );
}
