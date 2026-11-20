/** Extrai (de forma defensiva) códigos de pagamento expostos pela Pluggy e valida antes de guardar. */
import { parseBoleto } from "../domain/boleto";
import { parsePixCopiaECola } from "../domain/pix";

export interface PaymentCodes {
  boletoLine: string | null;
  boletoBarcode: string | null;
  pixCode: string | null;
}

function pick(obj: Record<string, unknown> | null | undefined, keys: string[]): string | null {
  if (!obj) return null;
  for (const k of keys) {
    const v = obj[k];
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  return null;
}

export function extractPaymentCodes(source: Record<string, unknown> | null | undefined, reference?: string): PaymentCodes {
  const nested = [source, source?.boletoMetadata, source?.paymentData, (source?.paymentData as Record<string, unknown> | undefined)?.boletoMetadata, source?.boleto]
    .filter((x): x is Record<string, unknown> => Boolean(x) && typeof x === "object");
  let boletoLine: string | null = null, boletoBarcode: string | null = null, pixCode: string | null = null;
  for (const o of nested) {
    const raw = pick(o, ["digitableLine", "linhaDigitavel", "barcode", "barCode", "codigoBarras"]);
    if (raw && !boletoLine) {
      const b = parseBoleto(raw, reference);
      if (b.ok) {
        boletoLine = b.line;
        boletoBarcode = b.barcode;
      }
    }
    const pix = pick(o, ["pixCode", "pixCopyPaste", "pixQrCode", "brCode", "emv", "qrCode"]);
    if (pix && !pixCode) {
      const p = parsePixCopiaECola(pix);
      if (p.ok) pixCode = p.code;
    }
  }
  return { boletoLine, boletoBarcode, pixCode };
}
