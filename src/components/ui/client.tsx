"use client";
import { CheckCircle2, Copy, Loader2, XCircle } from "lucide-react";
import { useActionState, useEffect, useRef, useState, type ReactNode } from "react";
import { useFormStatus } from "react-dom";
import { AnimatePresence, motion } from "motion/react";
import type { ActionState } from "@/lib/actions";

type Action = (prev: ActionState, fd: FormData) => Promise<ActionState>;

export function SubmitButton({ children, variant = "primary", className = "", pendingText = "Salvando…" }: { children: ReactNode; variant?: "primary" | "secondary" | "danger" | "ghost"; className?: string; pendingText?: string }) {
  const { pending } = useFormStatus();
  const styles: Record<string, string> = {
    primary: "bg-gradient-to-r from-brand to-brand-2 text-brand-ink shadow-[0_8px_24px_-10px_var(--glow)] hover:brightness-110",
    secondary: "bg-surface-2 text-ink ring-1 ring-line hover:ring-line-strong",
    danger: "bg-bad/15 text-bad ring-1 ring-bad/30 hover:bg-bad/25",
    ghost: "text-ink-2 hover:bg-surface-2",
  };
  return (
    <button type="submit" disabled={pending} className={`inline-flex h-10 items-center justify-center gap-2 rounded-xl px-4 text-sm font-medium transition disabled:opacity-60 ${styles[variant]} ${className}`}>
      {pending ? <Loader2 aria-hidden className="h-4 w-4 animate-spin" /> : null}
      {pending ? pendingText : children}
    </button>
  );
}

/** Formulário ligado a uma server action, com mensagem animada de sucesso/erro. */
export function ActionForm({ action, children, className, resetOnSuccess, onDone }: { action: Action; children: ReactNode; className?: string; resetOnSuccess?: boolean; onDone?: (s: ActionState) => void }) {
  const [state, formAction] = useActionState(action, null);
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state?.ok && resetOnSuccess) ref.current?.reset();
    if (state) onDone?.(state);
  }, [state, resetOnSuccess, onDone]);
  return (
    <form ref={ref} action={formAction} className={className}>
      {children}
      <AnimatePresence mode="wait">
        {state && (
          <motion.p
            key={JSON.stringify(state)}
            role={state.ok ? "status" : "alert"}
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className={`mt-3 flex items-center gap-2 text-sm ${state.ok ? "text-good" : "text-bad"}`}
          >
            {state.ok ? <CheckCircle2 aria-hidden className="h-4 w-4" /> : <XCircle aria-hidden className="h-4 w-4" />}
            {state.ok ? state.message : state.error}
          </motion.p>
        )}
      </AnimatePresence>
    </form>
  );
}

export function CopyButton({ value, label = "Copiar" }: { value: string; label?: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        await navigator.clipboard.writeText(value);
        setDone(true);
        setTimeout(() => setDone(false), 1500);
      }}
      className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-surface-2 px-2.5 text-xs text-ink-2 ring-1 ring-line hover:text-ink"
    >
      {done ? <CheckCircle2 aria-hidden className="h-3.5 w-3.5 text-good" /> : <Copy aria-hidden className="h-3.5 w-3.5" />}
      {done ? "Copiado!" : label}
    </button>
  );
}

export function Disclosure({ summary, children, defaultOpen = false }: { summary: ReactNode; children: ReactNode; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div>
      <button type="button" aria-expanded={open} onClick={() => setOpen(!open)} className="flex w-full items-center justify-between gap-2 text-left">
        {summary}
        <span aria-hidden className={`text-ink-3 transition ${open ? "rotate-180" : ""}`}>▾</span>
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
            <div className="pt-4">{children}</div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
