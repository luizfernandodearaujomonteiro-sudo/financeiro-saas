/**
 * Telefones em E.164. Para números brasileiros, normaliza o 9º dígito de celular:
 * o WhatsApp às vezes entrega "55 11 8765-4321" (sem o 9) para contas antigas.
 */
export function normalizePhone(raw: string): string | null {
  let d = (raw ?? "").replace(/\D/g, "");
  if (!d) return null;
  if (d.length === 10 || d.length === 11) d = "55" + d; // número nacional sem DDI
  if (d.startsWith("55")) {
    const national = d.slice(2);
    if (national.length === 10 && /^[1-9]{2}[6-9]/.test(national)) {
      d = "55" + national.slice(0, 2) + "9" + national.slice(2);
    } else if (!(national.length === 11 && /^[1-9]{2}9/.test(national)) && !(national.length === 10 && /^[1-9]{2}[2-5]/.test(national))) {
      return null;
    }
  }
  if (d.length < 8 || d.length > 15 || d.startsWith("0")) return null;
  return "+" + d;
}

/** "5511987654321@s.whatsapp.net" ou "5511987654321:12@s.whatsapp.net" -> "+5511987654321". Grupos -> null. */
export function jidToPhone(jid: string): string | null {
  if (!jid || jid.endsWith("@g.us") || jid.includes("broadcast")) return null;
  const user = jid.split("@")[0]?.split(":")[0] ?? "";
  if (!/^\d{8,15}$/.test(user)) return null;
  return normalizePhone(user);
}

/** Formato usado pela Evolution API: DDI + número, sem "+". */
export function toProviderNumber(e164: string): string {
  return e164.replace(/\D/g, "");
}

export function formatPhoneBR(e164: string): string {
  const m = /^\+55(\d{2})(\d{4,5})(\d{4})$/.exec(e164);
  return m ? `+55 (${m[1]}) ${m[2]}-${m[3]}` : e164;
}
