"use client";
/**
 * Gráficos SVG animados (sem dependências externas).
 * Paleta categórica validada (azul/laranja) com contraste e separação para daltonismo,
 * legenda sempre presente com 2 séries, tooltip ao passar o mouse/foco e tabela acessível.
 */
import { motion } from "motion/react";
import { useState } from "react";
import { formatBRL } from "@/lib/domain/money";

function compact(cents: number): string {
  const v = Math.abs(cents) / 100;
  const s = v >= 1_000_000 ? `${(v / 1_000_000).toFixed(1).replace(".", ",")} mi` : v >= 1000 ? `${(v / 1000).toFixed(v >= 10_000 ? 0 : 1).replace(".", ",")} mil` : v.toFixed(0);
  return `${cents < 0 ? "-" : ""}R$ ${s}`;
}

function niceMax(v: number): number {
  if (v <= 0) return 100;
  const p = Math.pow(10, Math.floor(Math.log10(v)));
  const n = v / p;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * p;
}

function Legend({ items }: { items: { label: string; color: string }[] }) {
  return (
    <ul className="flex flex-wrap gap-4 text-xs text-ink-2" aria-label="Legenda">
      {items.map((i) => (
        <li key={i.label} className="flex items-center gap-1.5">
          <span aria-hidden className="h-2.5 w-2.5 rounded-sm" style={{ background: i.color }} />
          {i.label}
        </li>
      ))}
    </ul>
  );
}

export interface IncomeExpensePoint {
  label: string;
  receitas: number;
  despesas: number;
}

export function IncomeExpenseChart({ data }: { data: IncomeExpensePoint[] }) {
  const [hover, setHover] = useState<number | null>(null);
  const W = 640, H = 240, pad = { l: 56, r: 8, t: 12, b: 28 };
  const max = niceMax(Math.max(1, ...data.flatMap((d) => [d.receitas, d.despesas])));
  const iw = W - pad.l - pad.r, ih = H - pad.t - pad.b;
  const group = iw / Math.max(data.length, 1);
  const bw = Math.min(22, (group - 14) / 2);
  const y = (v: number) => pad.t + ih - (v / max) * ih;
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((t) => t * max);
  return (
    <figure className="space-y-3">
      <Legend items={[{ label: "Receitas", color: "var(--series-1)" }, { label: "Despesas", color: "var(--series-2)" }]} />
      <div className="relative">
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Receitas e despesas por mês">
          {ticks.map((t) => (
            <g key={t}>
              <line x1={pad.l} x2={W - pad.r} y1={y(t)} y2={y(t)} stroke="var(--grid)" />
              <text x={pad.l - 8} y={y(t) + 4} textAnchor="end" fontSize="10" fill="var(--text-3)">{compact(t)}</text>
            </g>
          ))}
          {data.map((d, i) => {
            const x0 = pad.l + i * group + group / 2 - bw - 1;
            return (
              <g key={d.label} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)} onFocus={() => setHover(i)} onBlur={() => setHover(null)} tabIndex={0} aria-label={`${d.label}: receitas ${formatBRL(d.receitas)}, despesas ${formatBRL(d.despesas)}`}>
                <rect x={pad.l + i * group} y={pad.t} width={group} height={ih} fill={hover === i ? "var(--surface-2)" : "transparent"} rx={8} />
                {[d.receitas, d.despesas].map((v, k) => (
                  <motion.rect
                    key={k}
                    x={x0 + k * (bw + 2)}
                    width={bw}
                    rx={4}
                    fill={k === 0 ? "var(--series-1)" : "var(--series-2)"}
                    initial={{ y: y(0), height: 0 }}
                    animate={{ y: y(v), height: Math.max(0, y(0) - y(v)) }}
                    transition={{ duration: 0.8, delay: i * 0.05 + k * 0.05, ease: [0.16, 1, 0.3, 1] }}
                  />
                ))}
                <text x={pad.l + i * group + group / 2} y={H - 8} textAnchor="middle" fontSize="11" fill="var(--text-2)">{d.label}</text>
              </g>
            );
          })}
        </svg>
        {hover !== null && data[hover] && (
          <div className="pointer-events-none absolute top-2 rounded-xl border border-line bg-surface-solid px-3 py-2 text-xs shadow-xl" style={{ left: `${Math.min(70, ((hover + 0.5) / data.length) * 100)}%` }}>
            <p className="mb-1 font-semibold">{data[hover].label}</p>
            <p className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-sm" style={{ background: "var(--series-1)" }} />Receitas: <b className="num">{formatBRL(data[hover].receitas)}</b></p>
            <p className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-sm" style={{ background: "var(--series-2)" }} />Despesas: <b className="num">{formatBRL(data[hover].despesas)}</b></p>
            <p className="mt-1 text-ink-3">Resultado: <span className="num">{formatBRL(data[hover].receitas - data[hover].despesas)}</span></p>
          </div>
        )}
      </div>
      <table className="sr-only">
        <caption>Receitas e despesas por mês</caption>
        <thead><tr><th>Mês</th><th>Receitas</th><th>Despesas</th></tr></thead>
        <tbody>{data.map((d) => <tr key={d.label}><td>{d.label}</td><td>{formatBRL(d.receitas)}</td><td>{formatBRL(d.despesas)}</td></tr>)}</tbody>
      </table>
    </figure>
  );
}

/** Barras horizontais de um único matiz (magnitude), com rótulo direto. */
export function CategoryBars({ data, max = 8 }: { data: { name: string; cents: number }[]; max?: number }) {
  const rows = data.slice(0, max);
  const top = Math.max(1, ...rows.map((r) => r.cents));
  const total = data.reduce((a, r) => a + r.cents, 0);
  return (
    <ul className="space-y-2.5" aria-label="Despesas por categoria">
      {rows.map((r, i) => (
        <li key={r.name} className="group">
          <div className="mb-1 flex items-baseline justify-between gap-2 text-xs">
            <span className="truncate text-ink-2">{r.name}</span>
            <span className="num text-ink">{formatBRL(r.cents)} <span className="text-ink-3">· {total ? Math.round((r.cents / total) * 100) : 0}%</span></span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-surface-2">
            <motion.div className="h-full rounded-full" style={{ background: "var(--series-1)" }} initial={{ width: 0 }} animate={{ width: `${(r.cents / top) * 100}%` }} transition={{ duration: 0.8, delay: i * 0.05, ease: [0.16, 1, 0.3, 1] }} />
          </div>
        </li>
      ))}
    </ul>
  );
}

/** Linha com área para tendência (série única). */
export function TrendChart({ data, label }: { data: { label: string; cents: number }[]; label: string }) {
  const [hover, setHover] = useState<number | null>(null);
  const W = 640, H = 200, pad = { l: 56, r: 12, t: 14, b: 26 };
  if (data.length === 0) return <p className="text-sm text-ink-3">Sem histórico ainda.</p>;
  const vals = data.map((d) => d.cents);
  const lo = Math.min(0, ...vals), hi = niceMax(Math.max(...vals, 1));
  const iw = W - pad.l - pad.r, ih = H - pad.t - pad.b;
  const x = (i: number) => pad.l + (data.length === 1 ? iw / 2 : (i / (data.length - 1)) * iw);
  const y = (v: number) => pad.t + ih - ((v - lo) / (hi - lo || 1)) * ih;
  const path = data.map((d, i) => `${i ? "L" : "M"}${x(i)},${y(d.cents)}`).join(" ");
  const area = `${path} L${x(data.length - 1)},${y(lo)} L${x(0)},${y(lo)} Z`;
  return (
    <figure className="relative">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label={label} onMouseLeave={() => setHover(null)}>
        <defs>
          <linearGradient id="trendFill" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="var(--series-1)" stopOpacity="0.35" />
            <stop offset="100%" stopColor="var(--series-1)" stopOpacity="0" />
          </linearGradient>
        </defs>
        {[0, 0.5, 1].map((t) => {
          const v = lo + t * (hi - lo);
          return (
            <g key={t}>
              <line x1={pad.l} x2={W - pad.r} y1={y(v)} y2={y(v)} stroke="var(--grid)" />
              <text x={pad.l - 8} y={y(v) + 4} textAnchor="end" fontSize="10" fill="var(--text-3)">{compact(v)}</text>
            </g>
          );
        })}
        <motion.path d={area} fill="url(#trendFill)" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.8 }} />
        <motion.path d={path} fill="none" stroke="var(--series-1)" strokeWidth={2} strokeLinecap="round" initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 1.1, ease: "easeInOut" }} />
        {data.map((d, i) => (
          <g key={d.label}>
            <rect x={x(i) - iw / data.length / 2} y={pad.t} width={iw / data.length} height={ih} fill="transparent" onMouseEnter={() => setHover(i)} />
            <circle cx={x(i)} cy={y(d.cents)} r={hover === i ? 5 : 3} fill="var(--series-1)" stroke="var(--surface-solid)" strokeWidth={2} />
            <text x={x(i)} y={H - 6} textAnchor="middle" fontSize="10" fill="var(--text-3)">{d.label}</text>
          </g>
        ))}
        {hover !== null && <line x1={x(hover)} x2={x(hover)} y1={pad.t} y2={pad.t + ih} stroke="var(--border-strong)" strokeDasharray="3 3" />}
      </svg>
      {hover !== null && data[hover] && (
        <div className="pointer-events-none absolute top-1 rounded-xl border border-line bg-surface-solid px-3 py-1.5 text-xs shadow-xl" style={{ left: `${Math.min(75, (x(hover) / W) * 100)}%` }}>
          {data[hover].label}: <b className="num">{formatBRL(data[hover].cents)}</b>
        </div>
      )}
      <table className="sr-only"><caption>{label}</caption><tbody>{data.map((d) => <tr key={d.label}><td>{d.label}</td><td>{formatBRL(d.cents)}</td></tr>)}</tbody></table>
    </figure>
  );
}

/** Divisão entre dois membros (barra empilhada com 2px de espaço, rótulos diretos + legenda). */
export function ShareBar({ members }: { members: { name: string; shareBp: number | null; totalCents: number | null }[] }) {
  const colors = ["var(--series-1)", "var(--series-2)"];
  const valid = members.filter((m) => (m.shareBp ?? 0) > 0);
  return (
    <figure className="space-y-3">
      <Legend items={members.slice(0, 2).map((m, i) => ({ label: m.name, color: colors[i]! }))} />
      <div className="flex h-9 w-full gap-[2px] overflow-hidden rounded-xl bg-surface-2" role="img" aria-label={members.map((m) => `${m.name}: ${((m.shareBp ?? 0) / 100).toFixed(1)}%`).join(", ")}>
        {valid.length === 0 && <span className="m-auto text-xs text-ink-3">Sem gastos compartilhados no mês</span>}
        {members.slice(0, 2).map((m, i) =>
          (m.shareBp ?? 0) > 0 ? (
            <motion.div key={m.name} className="flex h-full items-center justify-center text-xs font-semibold text-white" style={{ background: colors[i] }} initial={{ width: 0 }} animate={{ width: `${(m.shareBp ?? 0) / 100}%` }} transition={{ duration: 0.9, ease: [0.16, 1, 0.3, 1] }}>
              {(m.shareBp ?? 0) >= 1200 ? `${Math.round((m.shareBp ?? 0) / 100)}%` : ""}
            </motion.div>
          ) : null,
        )}
      </div>
    </figure>
  );
}
