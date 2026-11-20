"use client";
import { Building2, CheckCircle2, Loader2, XCircle } from "lucide-react";
import { useActionState, useState, useTransition } from "react";
import type { ActionState } from "@/lib/actions";
import { connectMockAction, registerItemAction } from "./actions";

interface PluggyConnectOptions {
  connectToken: string;
  includeSandbox?: boolean;
  onSuccess: (data: { item: { id: string } }) => void;
  onError?: (err: unknown) => void;
}

declare global {
  interface Window {
    PluggyConnect?: new (opts: PluggyConnectOptions) => { init: () => void };
  }
}

function Message({ state }: { state: ActionState }) {
  if (!state) return null;
  return (
    <p role={state.ok ? "status" : "alert"} className={`mt-3 flex items-start gap-2 text-sm ${state.ok ? "text-good" : "text-bad"}`}>
      {state.ok ? <CheckCircle2 aria-hidden className="mt-0.5 h-4 w-4 shrink-0" /> : <XCircle aria-hidden className="mt-0.5 h-4 w-4 shrink-0" />}
      {state.ok ? state.message : state.error}
    </p>
  );
}

const btn = "inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-brand to-brand-2 px-5 text-sm font-medium text-brand-ink shadow-[0_8px_24px_-10px_var(--glow)] transition hover:brightness-110 disabled:opacity-60";

export function MockConnectButton() {
  const [state, action, pending] = useActionState(connectMockAction, null);
  return (
    <form action={action}>
      <button type="submit" disabled={pending} className={btn}>
        {pending ? <Loader2 aria-hidden className="h-4 w-4 animate-spin" /> : <Building2 aria-hidden className="h-4 w-4" />}
        {pending ? "Conectando e importando…" : "Conectar banco simulado"}
      </button>
      <Message state={state} />
    </form>
  );
}

function loadScript(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    if (window.PluggyConnect) return resolve();
    const existing = document.querySelector<HTMLScriptElement>(`script[data-pluggy="1"]`);
    if (existing) {
      existing.addEventListener("load", () => resolve());
      existing.addEventListener("error", () => reject(new Error("falha ao carregar o widget")));
      return;
    }
    const s = document.createElement("script");
    s.src = src;
    s.async = true;
    s.dataset.pluggy = "1";
    s.onload = () => resolve();
    s.onerror = () => reject(new Error("falha ao carregar o widget"));
    document.head.appendChild(s);
  });
}

/** Widget Pluggy Connect (produção/sandbox). O connect token é gerado no servidor para o membro logado. */
export function PluggyConnectButton({ scriptUrl }: { scriptUrl: string }) {
  const [state, setState] = useState<ActionState>(null);
  const [pending, start] = useTransition();
  const [opening, setOpening] = useState(false);

  async function open() {
    setState(null);
    setOpening(true);
    try {
      const res = await fetch("/api/pluggy/connect-token", { method: "POST" });
      const j = (await res.json()) as { accessToken?: string; includeSandbox?: boolean; error?: string };
      if (!res.ok || !j.accessToken) throw new Error(j.error ?? "não foi possível iniciar a conexão");
      await loadScript(scriptUrl);
      if (!window.PluggyConnect) throw new Error("widget indisponível");
      new window.PluggyConnect({
        connectToken: j.accessToken,
        includeSandbox: j.includeSandbox,
        onSuccess: ({ item }) => start(async () => setState(await registerItemAction(item.id))),
        onError: () => setState({ ok: false, error: "A conexão com o banco não foi concluída." }),
      }).init();
    } catch (e) {
      setState({ ok: false, error: e instanceof Error ? e.message : "erro" });
    } finally {
      setOpening(false);
    }
  }

  return (
    <div>
      <button type="button" onClick={open} disabled={opening || pending} className={btn}>
        {opening || pending ? <Loader2 aria-hidden className="h-4 w-4 animate-spin" /> : <Building2 aria-hidden className="h-4 w-4" />}
        {pending ? "Importando dados…" : opening ? "Abrindo…" : "Conectar meu banco"}
      </button>
      <Message state={state} />
    </div>
  );
}
