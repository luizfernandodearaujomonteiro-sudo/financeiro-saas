/**
 * Pix: validação de chaves (CPF, CNPJ, e-mail, telefone +55, EVP) e do
 * "Pix copia e cola" (BR Code / EMV MPM) com CRC16-CCITT (poly 0x1021, init 0xFFFF).
 */
export type PixKeyType = "cpf" | "cnpj" | "email" | "telefone" | "evp";

export type PixKeyResult = { ok: true; type: PixKeyType; key: string } | { ok: false; error: string };

export function isValidCPF(raw: string): boolean {
  const d = raw.replace(/\D/g, "");
  if (d.length !== 11 || /^(\d)\1{10}$/.test(d)) return false;
  const calc = (len: number) => {
    let sum = 0;
    for (let i = 0; i < len; i++) sum += Number(d[i]) * (len + 1 - i);
    const r = (sum * 10) % 11;
    return r === 10 ? 0 : r;
  };
  return calc(9) === Number(d[9]) && calc(10) === Number(d[10]);
}

export function isValidCNPJ(raw: string): boolean {
  const d = raw.replace(/\D/g, "");
  if (d.length !== 14 || /^(\d)\1{13}$/.test(d)) return false;
  const calc = (len: number) => {
    const weights = len === 12 ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
    let sum = 0;
    for (let i = 0; i < len; i++) sum += Number(d[i]) * weights[i]!;
    const r = sum % 11;
    return r < 2 ? 0 : 11 - r;
  };
  return calc(12) === Number(d[12]) && calc(13) === Number(d[13]);
}

const EMAIL_RE = /^[A-Za-z0-9._%+-]{1,64}@[A-Za-z0-9.-]{1,190}\.[A-Za-z]{2,24}$/;
const EVP_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PHONE_RE = /^\+55[1-9]{2}9?\d{8}$/;

/** Valida uma chave Pix. Sem `type`, detecta: telefone precisa do prefixo +55. */
export function validatePixKey(raw: string, type?: PixKeyType): PixKeyResult {
  const s = (raw ?? "").trim();
  if (!s) return { ok: false, error: "chave Pix vazia" };
  const check = (t: PixKeyType): PixKeyResult | null => {
    switch (t) {
      case "email":
        return s.length <= 77 && EMAIL_RE.test(s) ? { ok: true, type: t, key: s.toLowerCase() } : null;
      case "evp":
        return EVP_RE.test(s) ? { ok: true, type: t, key: s.toLowerCase() } : null;
      case "telefone": {
        const p = "+" + s.replace(/\D/g, "");
        return s.trim().startsWith("+") && PHONE_RE.test(p) ? { ok: true, type: t, key: p } : null;
      }
      case "cpf": {
        const d = s.replace(/[.\-\s]/g, "");
        return /^\d{11}$/.test(d) && isValidCPF(d) ? { ok: true, type: t, key: d } : null;
      }
      case "cnpj": {
        const d = s.replace(/[.\-/\s]/g, "");
        return /^\d{14}$/.test(d) && isValidCNPJ(d) ? { ok: true, type: t, key: d } : null;
      }
    }
  };
  if (type) return check(type) ?? { ok: false, error: `chave Pix do tipo ${type} inválida` };
  for (const t of ["email", "evp", "telefone", "cpf", "cnpj"] as const) {
    const r = check(t);
    if (r) return r;
  }
  return { ok: false, error: "chave Pix inválida (CPF, CNPJ, e-mail, telefone +55 ou chave aleatória)" };
}

/** CRC16-CCITT-FALSE sobre os bytes UTF-8. Retorna 4 dígitos hexadecimais maiúsculos. */
export function crc16ccitt(payload: string): string {
  let crc = 0xffff;
  for (const byte of new TextEncoder().encode(payload)) {
    crc ^= byte << 8;
    for (let i = 0; i < 8; i++) crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
  }
  return crc.toString(16).toUpperCase().padStart(4, "0");
}

export interface EmvField {
  id: string;
  value: string;
}

export function parseEmvFields(s: string): EmvField[] | null {
  const out: EmvField[] = [];
  let i = 0;
  while (i < s.length) {
    if (i + 4 > s.length) return null;
    const id = s.slice(i, i + 2);
    const len = Number(s.slice(i + 2, i + 4));
    if (!/^\d{2}$/.test(id) || !Number.isInteger(len) || i + 4 + len > s.length) return null;
    out.push({ id, value: s.slice(i + 4, i + 4 + len) });
    i += 4 + len;
  }
  return out;
}

export type PixCodeResult =
  | { ok: true; code: string; key: string | null; url: string | null; amountCents: number | null; merchantName: string | null; merchantCity: string | null; txid: string | null }
  | { ok: false; error: string };

/** Valida um Pix copia e cola (estrutura TLV + CRC16). */
export function parsePixCopiaECola(raw: string): PixCodeResult {
  const code = (raw ?? "").trim();
  if (code.length < 20 || code.length > 512) return { ok: false, error: "tamanho inválido" };
  if (!code.startsWith("000201")) return { ok: false, error: "não começa com o indicador de formato 000201" };
  const crcIdx = code.length - 8;
  if (code.slice(crcIdx, crcIdx + 4) !== "6304") return { ok: false, error: "campo CRC (6304) ausente no final" };
  const expected = crc16ccitt(code.slice(0, crcIdx + 4));
  if (expected !== code.slice(-4).toUpperCase()) return { ok: false, error: "CRC16 inválido (código corrompido ou incompleto)" };
  const fields = parseEmvFields(code);
  if (!fields) return { ok: false, error: "estrutura EMV inválida" };
  const get = (id: string) => fields.find((f) => f.id === id)?.value ?? null;
  const mai = get("26");
  let key: string | null = null;
  let url: string | null = null;
  if (mai) {
    const sub = parseEmvFields(mai);
    if (!sub) return { ok: false, error: "dados da conta (26) inválidos" };
    const gui = sub.find((f) => f.id === "00")?.value?.toLowerCase();
    if (gui !== "br.gov.bcb.pix") return { ok: false, error: "GUI diferente de br.gov.bcb.pix" };
    key = sub.find((f) => f.id === "01")?.value ?? null;
    url = sub.find((f) => f.id === "25")?.value ?? null;
  } else {
    return { ok: false, error: "dados da conta Pix (26) ausentes" };
  }
  const amount = get("54");
  let amountCents: number | null = null;
  if (amount) {
    const m = /^(\d+)(?:\.(\d{1,2}))?$/.exec(amount);
    if (!m) return { ok: false, error: "valor (54) inválido" };
    amountCents = Number(m[1]) * 100 + Number((m[2] ?? "").padEnd(2, "0"));
  }
  const add = get("62");
  const txid = add ? parseEmvFields(add)?.find((f) => f.id === "05")?.value ?? null : null;
  return { ok: true, code, key, url, amountCents, merchantName: get("59"), merchantCity: get("60"), txid };
}

function tlv(id: string, value: string): string {
  return id + String(value.length).padStart(2, "0") + value;
}

/** Gera um BR Code estático (seeds/testes/simulador). */
export function buildPixCopiaECola(opts: { key: string; name: string; city: string; amountCents?: number; txid?: string }): string {
  const mai = tlv("00", "br.gov.bcb.pix") + tlv("01", opts.key);
  let payload = tlv("00", "01") + tlv("26", mai) + tlv("52", "0000") + tlv("53", "986");
  if (opts.amountCents) payload += tlv("54", `${Math.floor(opts.amountCents / 100)}.${String(opts.amountCents % 100).padStart(2, "0")}`);
  payload += tlv("58", "BR") + tlv("59", opts.name.slice(0, 25)) + tlv("60", opts.city.slice(0, 15)) + tlv("62", tlv("05", opts.txid ?? "***"));
  payload += "6304";
  return payload + crc16ccitt(payload);
}
