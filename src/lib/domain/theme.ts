/** Tema: escuro / claro / automático por horário (America/Sao_Paulo). */
import { zonedParts } from "./dates";

export type ThemeMode = "dark" | "light" | "auto";
export type ResolvedTheme = "dark" | "light";

export const DEFAULT_DARK_START = 18;
export const DEFAULT_DARK_END = 6;

/**
 * Escuro quando a hora local está no intervalo [start, end) — que pode cruzar a
 * meia-noite (padrão 18h–6h). start === end significa "sempre escuro".
 */
export function isDarkHour(hour: number, start = DEFAULT_DARK_START, end = DEFAULT_DARK_END): boolean {
  if (start === end) return true;
  return start < end ? hour >= start && hour < end : hour >= start || hour < end;
}

export function resolveTheme(mode: ThemeMode, opts: { now?: Date; start?: number; end?: number } = {}): ResolvedTheme {
  if (mode === "dark" || mode === "light") return mode;
  const hour = zonedParts(opts.now ?? new Date()).hour;
  return isDarkHour(hour, opts.start, opts.end) ? "dark" : "light";
}
