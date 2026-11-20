import { z } from "zod";
import { withUser } from "../db";
import type { ThemeMode } from "../domain/theme";

export interface Prefs {
  theme_mode: ThemeMode;
  auto_dark_start: number;
  auto_dark_end: number;
  comparison_mode: "valores" | "percentuais";
}

export const DEFAULT_PREFS: Prefs = { theme_mode: "dark", auto_dark_start: 18, auto_dark_end: 6, comparison_mode: "valores" };

export async function getPrefs(userId: string): Promise<Prefs> {
  const r = await withUser(userId, (db) => db.one<Prefs>("select theme_mode, auto_dark_start, auto_dark_end, comparison_mode from public.fam_profile_prefs where user_id = auth.uid()"));
  return r ?? DEFAULT_PREFS;
}

const blankToUndefined = (v: unknown) => (v === null || v === "" ? undefined : v);
const hour = z.preprocess(blankToUndefined, z.coerce.number().int().min(0).max(23).optional());

export const prefsInput = z.object({
  themeMode: z.preprocess(blankToUndefined, z.enum(["dark", "light", "auto"]).optional()),
  autoDarkStart: hour,
  autoDarkEnd: hour,
  comparisonMode: z.preprocess(blankToUndefined, z.enum(["valores", "percentuais"]).optional()),
});

export async function savePrefs(userId: string, raw: unknown) {
  const v = prefsInput.parse(raw);
  const cur = await getPrefs(userId);
  const next: Prefs = {
    theme_mode: v.themeMode ?? cur.theme_mode,
    auto_dark_start: v.autoDarkStart ?? cur.auto_dark_start,
    auto_dark_end: v.autoDarkEnd ?? cur.auto_dark_end,
    comparison_mode: v.comparisonMode ?? cur.comparison_mode,
  };
  await withUser(userId, (db) =>
    db.query(
      `insert into public.fam_profile_prefs (user_id, theme_mode, auto_dark_start, auto_dark_end, comparison_mode) values (auth.uid(), $1, $2, $3, $4)
       on conflict (user_id) do update set theme_mode = excluded.theme_mode, auto_dark_start = excluded.auto_dark_start,
         auto_dark_end = excluded.auto_dark_end, comparison_mode = excluded.comparison_mode, updated_at = now()`,
      [next.theme_mode, next.auto_dark_start, next.auto_dark_end, next.comparison_mode],
    ),
  );
  return next;
}
