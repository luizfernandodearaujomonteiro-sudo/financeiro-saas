"use client";
import { Lock, Mail } from "lucide-react";
import { useActionState } from "react";
import { motion } from "motion/react";
import { loginAction } from "@/app/actions/auth";
import { SubmitButton } from "@/components/ui/client";

export function LoginForm({ next, hint }: { next?: string; hint?: boolean }) {
  const [state, action] = useActionState(loginAction, null);
  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="next" value={next ?? ""} />
      <label className="block">
        <span className="mb-1.5 block text-xs font-medium text-ink-2">E-mail</span>
        <span className="relative block">
          <Mail aria-hidden className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-ink-3" />
          <input name="email" type="email" autoComplete="email" required className="h-11 w-full rounded-xl border border-line bg-surface-solid/60 pr-3 pl-9 text-sm focus:border-brand focus:outline-none" placeholder="voce@exemplo.com" />
        </span>
      </label>
      <label className="block">
        <span className="mb-1.5 block text-xs font-medium text-ink-2">Senha</span>
        <span className="relative block">
          <Lock aria-hidden className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-ink-3" />
          <input name="password" type="password" autoComplete="current-password" required className="h-11 w-full rounded-xl border border-line bg-surface-solid/60 pr-3 pl-9 text-sm focus:border-brand focus:outline-none" placeholder="••••••••••••" />
        </span>
      </label>
      {state && !state.ok && (
        <motion.p role="alert" initial={{ opacity: 0, x: -6 }} animate={{ opacity: 1, x: [0, -6, 6, -3, 0] }} className="rounded-xl bg-bad/10 px-3 py-2 text-sm text-bad ring-1 ring-bad/30">
          {state.error}
        </motion.p>
      )}
      <SubmitButton className="h-11 w-full" pendingText="Entrando…">Entrar</SubmitButton>
      {hint && (
        <p className="rounded-xl bg-surface-2 p-3 text-xs text-ink-3 ring-1 ring-line">
          <b className="text-ink-2">Modo local:</b> luiz@familia.local / Luiz@Local2026 · esposa@familia.local / Esposa@Local2026
        </p>
      )}
    </form>
  );
}
