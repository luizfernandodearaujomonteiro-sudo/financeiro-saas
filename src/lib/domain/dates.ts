/**
 * Datas de calendário como strings ISO "YYYY-MM-DD" (sem fuso).
 * "Hoje" e "agora" são calculados em America/Sao_Paulo.
 */
export const APP_TIMEZONE = "America/Sao_Paulo";

export type ISODate = string; // YYYY-MM-DD
export type MonthStart = string; // YYYY-MM-01

export interface ZonedParts {
  year: number;
  month: number; // 1-12
  day: number;
  hour: number;
  minute: number;
  weekday: number; // 0 = domingo
}

const WEEKDAYS: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

export function zonedParts(now: Date = new Date(), timeZone = APP_TIMEZONE): ZonedParts {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    weekday: "short",
    hourCycle: "h23",
  });
  const parts = Object.fromEntries(fmt.formatToParts(now).map((p) => [p.type, p.value]));
  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    hour: Number(parts.hour) % 24,
    minute: Number(parts.minute),
    weekday: WEEKDAYS[parts.weekday as string] ?? 0,
  };
}

export function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

export function toISODate(y: number, m: number, d: number): ISODate {
  return `${String(y).padStart(4, "0")}-${pad2(m)}-${pad2(d)}`;
}

export function todayISO(now: Date = new Date()): ISODate {
  const p = zonedParts(now);
  return toISODate(p.year, p.month, p.day);
}

export function currentMonthStart(now: Date = new Date()): MonthStart {
  const p = zonedParts(now);
  return toISODate(p.year, p.month, 1);
}

export function parseISODate(iso: string): { y: number; m: number; d: number } {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) throw new Error(`data inválida: ${iso}`);
  const y = Number(m[1]), mo = Number(m[2]), d = Number(m[3]);
  if (mo < 1 || mo > 12 || d < 1 || d > daysInMonth(y, mo)) throw new Error(`data inválida: ${iso}`);
  return { y, m: mo, d };
}

export function isValidISODate(iso: string): boolean {
  try {
    parseISODate(iso);
    return true;
  } catch {
    return false;
  }
}

export function daysInMonth(y: number, m: number): number {
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

export function addMonthsYM(y: number, m: number, delta: number): { y: number; m: number } {
  const idx = y * 12 + (m - 1) + delta;
  return { y: Math.floor(idx / 12), m: (idx % 12) + 1 };
}

/** Dia limitado ao tamanho do mês (ex.: dia 31 em fevereiro -> 28/29). */
export function clampedDate(y: number, m: number, day: number): ISODate {
  return toISODate(y, m, Math.min(day, daysInMonth(y, m)));
}

export function monthStartOf(iso: ISODate): MonthStart {
  const { y, m } = parseISODate(iso);
  return toISODate(y, m, 1);
}

export function addMonths(monthStart: MonthStart, delta: number): MonthStart {
  const { y, m } = parseISODate(monthStart);
  const r = addMonthsYM(y, m, delta);
  return toISODate(r.y, r.m, 1);
}

export function addDays(iso: ISODate, delta: number): ISODate {
  const { y, m, d } = parseISODate(iso);
  const dt = new Date(Date.UTC(y, m - 1, d + delta));
  return toISODate(dt.getUTCFullYear(), dt.getUTCMonth() + 1, dt.getUTCDate());
}

/** b - a em dias. */
export function diffDays(a: ISODate, b: ISODate): number {
  const pa = parseISODate(a), pb = parseISODate(b);
  return Math.round((Date.UTC(pb.y, pb.m - 1, pb.d) - Date.UTC(pa.y, pa.m - 1, pa.d)) / 86_400_000);
}

export function monthEnd(monthStart: MonthStart): ISODate {
  const { y, m } = parseISODate(monthStart);
  return toISODate(y, m, daysInMonth(y, m));
}

export function formatDateBR(iso: ISODate): string {
  const { y, m, d } = parseISODate(iso);
  return `${pad2(d)}/${pad2(m)}/${y}`;
}

const MONTHS_PT = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
const MONTHS_SHORT = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

export function monthLabel(monthStart: MonthStart, short = false): string {
  const { y, m } = parseISODate(monthStart);
  return short ? `${MONTHS_SHORT[m - 1]}/${String(y).slice(2)}` : `${MONTHS_PT[m - 1]} de ${y}`;
}

/** Aceita "YYYY-MM" ou "YYYY-MM-DD"; devolve início do mês ou null. */
export function normalizeMonthParam(v: string | undefined | null): MonthStart | null {
  if (!v) return null;
  const m = /^(\d{4})-(\d{2})(?:-\d{2})?$/.exec(v);
  if (!m) return null;
  const mo = Number(m[2]);
  if (mo < 1 || mo > 12) return null;
  return `${m[1]}-${m[2]}-01`;
}
