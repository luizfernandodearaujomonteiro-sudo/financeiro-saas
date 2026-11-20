"use client";
import { CheckCircle2, XCircle } from "lucide-react";
import { useState } from "react";
import { formatBoletoLine, parseBoleto } from "@/lib/domain/boleto";
import { formatDateBR, todayISO } from "@/lib/domain/dates";
import { formatBRL } from "@/lib/domain/money";
import { parsePixCopiaECola, validatePixKey } from "@/lib/domain/pix";

const inputCls = "w-full rounded-xl border border-line bg-surface-solid/60 px-3 py-2 text-sm text-ink placeholder:text-ink-3 focus:border-brand focus:outline-none";

function Feedback({ ok, children }: { ok: boolean; children: React.ReactNode }) {
  return (
    <p className={`mt-1 flex items-start gap-1.5 text-[11px] ${ok ? "text-good" : "text-bad"}`} role={ok ? "status" : "alert"}>
      {ok ? <CheckCircle2 aria-hidden className="mt-px h-3.5 w-3.5 shrink-0" /> : <XCircle aria-hidden className="mt-px h-3.5 w-3.5 shrink-0" />}
      <span>{children}</span>
    </p>
  );
}

const PIX_TYPE: Record<string, string> = { cpf: "CPF", cnpj: "CNPJ", email: "e-mail", telefone: "telefone", evp: "chave aleatória" };

/** Campos de boleto / Pix com validação ao vivo (dígitos verificadores e CRC16). */
export function CodeFields() {
  const [boleto, setBoleto] = useState("");
  const [pix, setPix] = useState("");
  const [key, setKey] = useState("");
  const b = boleto.trim() ? parseBoleto(boleto, todayISO()) : null;
  const p = pix.trim() ? parsePixCopiaECola(pix) : null;
  const k = key.trim() ? validatePixKey(key) : null;
  return (
    <div className="space-y-3">
      <label className="block">
        <span className="mb-1.5 block text-xs font-medium text-ink-2">Linha digitável ou código de barras (opcional)</span>
        <input name="boleto" value={boleto} onChange={(e) => setBoleto(e.target.value)} inputMode="numeric" maxLength={80} placeholder="47 ou 48 dígitos (ou 44 do código de barras)" className={`${inputCls} h-10 font-mono`} />
        {b &&
          (b.ok ? (
            <Feedback ok>
              Boleto {b.kind === "bancario" ? "bancário" : "de arrecadação/convênio"} válido
              {b.amountCents ? ` · ${formatBRL(b.amountCents)}` : ""}
              {b.dueDate ? ` · vence ${formatDateBR(b.dueDate)}` : ""}
              <span className="block font-mono text-ink-3">{formatBoletoLine(b.line)}</span>
            </Feedback>
          ) : (
            <Feedback ok={false}>{b.error}</Feedback>
          ))}
      </label>
      <label className="block">
        <span className="mb-1.5 block text-xs font-medium text-ink-2">Pix copia e cola (opcional)</span>
        <textarea name="pixCode" value={pix} onChange={(e) => setPix(e.target.value)} rows={2} maxLength={512} placeholder="000201…6304XXXX" className={`${inputCls} font-mono text-xs`} />
        {p &&
          (p.ok ? (
            <Feedback ok>
              Código Pix válido (CRC ok){p.merchantName ? ` · ${p.merchantName}` : ""}{p.amountCents ? ` · ${formatBRL(p.amountCents)}` : ""}{p.key ? ` · chave ${p.key}` : ""}
            </Feedback>
          ) : (
            <Feedback ok={false}>{p.error}</Feedback>
          ))}
      </label>
      <label className="block">
        <span className="mb-1.5 block text-xs font-medium text-ink-2">Chave Pix (opcional)</span>
        <input name="pixKey" value={key} onChange={(e) => setKey(e.target.value)} maxLength={80} placeholder="CPF, CNPJ, e-mail, +55 telefone ou chave aleatória" className={`${inputCls} h-10`} />
        {k && (k.ok ? <Feedback ok>Chave {PIX_TYPE[k.type]} válida: {k.key}</Feedback> : <Feedback ok={false}>{k.error}</Feedback>)}
      </label>
    </div>
  );
}
