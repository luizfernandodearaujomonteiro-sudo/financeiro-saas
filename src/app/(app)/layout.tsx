import { LogOut, Search } from "lucide-react";
import Link from "next/link";
import { cookies } from "next/headers";
import { decodeTheme, THEME_COOKIE } from "@/lib/theme-cookie";
import { requireCtx } from "@/lib/auth/member";
import { withUser } from "@/lib/db";
import { env } from "@/lib/env";
import { MobileNav, SideNav } from "@/components/layout/AppNav";
import { ThemeToggle } from "@/components/layout/ThemeToggle";
import { logoutAction } from "@/app/actions/auth";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const { member } = await requireCtx();
  const pending = await withUser(member.userId, (db) => db.one<{ n: number }>("select count(*)::int as n from public.fin_financeiro_review_queue where owner_id = auth.uid() and status = 'pendente'"));
  const simulator = env.simulatorEnabled;
  const themeMode = decodeTheme((await cookies()).get(THEME_COOKIE)?.value).mode;
  return (
    <div className="mx-auto flex min-h-dvh max-w-[1440px] gap-6 px-3 pb-28 md:px-6 md:pb-8">
      <aside className="sticky top-0 hidden h-dvh w-60 shrink-0 flex-col gap-6 py-6 md:flex">
        <Link href="/painel" className="flex items-center gap-2.5 px-2">
          <span className="grid h-9 w-9 place-items-center rounded-xl bg-gradient-to-br from-brand to-brand-2 text-sm font-black text-brand-ink shadow-[0_0_24px_-4px_var(--glow)]">F</span>
          <span className="leading-tight">
            <span className="block text-sm font-bold">Finanças</span>
            <span className="block text-[11px] text-ink-3">{member.householdName}</span>
          </span>
        </Link>
        <div className="-mx-1 flex-1 overflow-y-auto px-1">
          <SideNav simulator={simulator} reviewCount={pending?.n ?? 0} />
        </div>
      </aside>
      <div className="min-w-0 flex-1">
        <header className="sticky top-0 z-30 -mx-3 mb-4 flex items-center justify-between gap-3 px-3 py-3 backdrop-blur-md md:static md:mx-0 md:px-0 md:py-6 md:backdrop-blur-none">
          <div className="md:hidden">
            <p className="text-sm font-bold">Finanças</p>
            <p className="text-[11px] text-ink-3">{member.householdName}</p>
          </div>
          <Link href="/busca" className="hidden h-10 flex-1 items-center gap-2 rounded-xl bg-surface-2 px-3 text-sm text-ink-3 ring-1 ring-line transition hover:text-ink md:flex md:max-w-md">
            <Search aria-hidden className="h-4 w-4" /> Buscar gastos, categorias, valores…
          </Link>
          <div className="flex items-center gap-2">
            <Link href="/busca" aria-label="Buscar" className="grid h-10 w-10 place-items-center rounded-xl bg-surface-2 text-ink-2 ring-1 ring-line md:hidden"><Search aria-hidden className="h-4 w-4" /></Link>
            <ThemeToggle initialMode={themeMode} />
            <span className="hidden items-center gap-2 rounded-xl bg-surface-2 px-3 py-2 text-sm ring-1 ring-line sm:flex">
              <span className="grid h-6 w-6 place-items-center rounded-full bg-gradient-to-br from-brand to-brand-2 text-[11px] font-bold text-brand-ink">{member.displayName.slice(0, 1).toUpperCase()}</span>
              {member.displayName}
            </span>
            <form action={logoutAction}>
              <button type="submit" aria-label="Sair" title="Sair" className="grid h-10 w-10 place-items-center rounded-xl bg-surface-2 text-ink-2 ring-1 ring-line hover:text-bad"><LogOut aria-hidden className="h-4 w-4" /></button>
            </form>
          </div>
        </header>
        <main id="conteudo">{children}</main>
      </div>
      <MobileNav simulator={simulator} reviewCount={pending?.n ?? 0} />
    </div>
  );
}
