"use client";
import { CheckCircle2, Send, XCircle } from "lucide-react";
import { useActionState, useEffect, useRef } from "react";
import { useFormStatus } from "react-dom";
import { sendSimulatedAction } from "./actions";

const QUICK = ["gastei 50 mercado", "gastei 120 luz compartilhado", "recebi 3000 salario", "saldo", "fatura nubank", "contas", "desfazer", "ajuda"];

function SendBtn() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} aria-label="Enviar" className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-gradient-to-br from-brand to-brand-2 text-brand-ink transition hover:brightness-110 disabled:opacity-60">
      <Send aria-hidden className={`h-4.5 w-4.5 ${pending ? "animate-pulse" : ""}`} />
    </button>
  );
}

export function Composer() {
  const [state, action] = useActionState(sendSimulatedAction, null);
  const formRef = useRef<HTMLFormElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (state?.ok) {
      formRef.current?.reset();
      inputRef.current?.focus();
    }
  }, [state]);
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2" aria-label="Comandos rápidos">
        {QUICK.map((q) => (
          <button
            key={q}
            type="button"
            onClick={() => {
              if (!inputRef.current || !formRef.current) return;
              inputRef.current.value = q;
              formRef.current.requestSubmit();
            }}
            className="rounded-full bg-surface-2 px-3 py-1.5 text-xs text-ink-2 ring-1 ring-line transition hover:text-ink hover:ring-brand/40"
          >
            {q}
          </button>
        ))}
      </div>
      <form ref={formRef} action={action} className="flex items-center gap-2">
        <input
          ref={inputRef}
          name="text"
          required
          maxLength={1000}
          autoComplete="off"
          aria-label="Mensagem"
          placeholder="Digite um comando, ex.: gastei 32,90 uber"
          className="h-11 flex-1 rounded-full border border-line bg-surface-solid/60 px-4 text-sm focus:border-brand focus:outline-none"
        />
        <SendBtn />
      </form>
      {state && (
        <p role={state.ok ? "status" : "alert"} className={`flex items-center gap-2 text-xs ${state.ok ? "text-good" : "text-bad"}`}>
          {state.ok ? <CheckCircle2 aria-hidden className="h-3.5 w-3.5" /> : <XCircle aria-hidden className="h-3.5 w-3.5" />}
          {state.ok ? state.message : state.error}
        </p>
      )}
    </div>
  );
}
