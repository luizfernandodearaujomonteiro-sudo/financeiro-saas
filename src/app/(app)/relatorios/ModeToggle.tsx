"use client";
import { ActionForm } from "@/components/ui/client";
import { setComparisonModeAction } from "./actions";

export function ModeToggle({ mode }: { mode: "valores" | "percentuais" }) {
  const next = mode === "valores" ? "percentuais" : "valores";
  return (
    <ActionForm action={setComparisonModeAction}>
      <input type="hidden" name="mode" value={next} />
      <div role="group" aria-label="Modo de exibição" className="inline-flex rounded-xl bg-surface-2 p-1 ring-1 ring-line">
        {(["valores", "percentuais"] as const).map((m) => (
          <button
            key={m}
            type={m === mode ? "button" : "submit"}
            aria-pressed={m === mode}
            className={`rounded-lg px-3 py-1.5 text-xs font-medium transition ${m === mode ? "bg-brand text-brand-ink" : "text-ink-3 hover:text-ink"}`}
          >
            {m === "valores" ? "Valores" : "Só percentuais"}
          </button>
        ))}
      </div>
    </ActionForm>
  );
}
