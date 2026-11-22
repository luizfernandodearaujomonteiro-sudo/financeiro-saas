import { ShieldCheck, Sparkles, Wallet } from "lucide-react";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth/session";
import { env } from "@/lib/env";
import { FadeIn } from "@/components/ui/motion";
import { LoginForm } from "./LoginForm";

export const metadata = { title: "Entrar" };
export const dynamic = "force-dynamic";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  if (await getSessionUser().catch(() => null)) redirect("/painel");
  const { next } = await searchParams;
  return (
    <main className="grid min-h-dvh place-items-center px-4 py-10">
      <div className="grid w-full max-w-5xl items-center gap-10 md:grid-cols-2">
        <FadeIn className="hidden md:block">
          <span className="inline-flex items-center gap-2 rounded-full bg-surface-2 px-3 py-1 text-xs text-ink-2 ring-1 ring-line"><Sparkles aria-hidden className="h-3.5 w-3.5 text-brand" /> Painel da família</span>
          <h1 className="mt-5 text-5xl leading-[1.05] font-black tracking-tight">
            Suas finanças, <span className="text-gradient">juntos</span> e no controle.
          </h1>
          <p className="mt-4 max-w-md text-ink-2">Lançamentos, cartões, faturas, contas a pagar e metas em um só lugar — com privacidade: o que é pessoal continua pessoal.</p>
          <ul className="mt-8 space-y-3 text-sm text-ink-2">
            <li className="flex items-center gap-3"><Wallet aria-hidden className="h-5 w-5 text-brand-2" /> Visão da casa + visão individual</li>
            <li className="flex items-center gap-3"><ShieldCheck aria-hidden className="h-5 w-5 text-brand-2" /> Dados isolados por família (RLS) e sessão segura</li>
          </ul>
          <svg aria-hidden viewBox="0 0 400 140" className="mt-10 w-full max-w-md opacity-80">
            <defs><linearGradient id="g" x1="0" x2="1"><stop offset="0" stopColor="var(--brand)" /><stop offset="1" stopColor="var(--brand-2)" /></linearGradient></defs>
            <path d="M0 110 C 60 100, 80 60, 140 70 S 230 30, 280 40 S 360 10, 400 14" fill="none" stroke="url(#g)" strokeWidth="3" strokeLinecap="round" />
            {[30, 90, 150, 210, 270, 330].map((x, i) => <rect key={x} x={x} y={120 - (i + 2) * 12} width="18" height={(i + 2) * 12} rx="4" fill="url(#g)" opacity={0.18 + i * 0.08} />)}
          </svg>
        </FadeIn>
        <FadeIn delay={0.1}>
          <div className="glass glass-gradient mx-auto w-full max-w-md p-7 md:p-8">
            <div className="mb-6 flex items-center gap-3">
              <span className="grid h-11 w-11 place-items-center rounded-2xl bg-gradient-to-br from-brand to-brand-2 text-lg font-black text-brand-ink shadow-[0_0_28px_-6px_var(--glow)]">F</span>
              <div>
                <h2 className="text-xl font-bold">Entrar</h2>
                <p className="text-xs text-ink-3">Finanças da Família</p>
              </div>
            </div>
            <LoginForm next={next} hint={env.localDevAuth} />
          </div>
        </FadeIn>
      </div>
    </main>
  );
}
