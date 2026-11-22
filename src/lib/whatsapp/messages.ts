/**
 * Mensagens de alerta de vencimento. O texto do alerta vai em UMA mensagem e
 * cada código (linha digitável / Pix copia e cola) vai em mensagem SEPARADA
 * contendo SOMENTE o código, sem espaços ou texto extra, para copiar com um toque.
 */
import { formatDateBR, type ISODate } from "../domain/dates";
import { formatBRL } from "../domain/money";

export interface BillForAlert {
  description: string;
  amountCents: number;
  dueDate: ISODate;
  boletoLine?: string | null;
  boletoBarcode?: string | null;
  pixCode?: string | null;
  pixKey?: string | null;
  source?: string;
  shared?: boolean;
}

/** Boleto: somente dígitos. */
export function cleanBoleto(code: string): string {
  return code.replace(/\D/g, "");
}

/** Pix copia e cola: apenas apara as pontas (o BR Code pode ter espaços internos válidos, ex.: cidade). */
export function cleanPix(code: string): string {
  return code.trim();
}

export function dueLabel(daysLeft: number): string {
  if (daysLeft < 0) return `venceu há ${-daysLeft} dia(s)`;
  if (daysLeft === 0) return "vence HOJE";
  if (daysLeft === 1) return "vence amanhã";
  return `vence em ${daysLeft} dias`;
}

/** Retorna a lista de mensagens a enviar, na ordem. */
export function buildDueAlertMessages(bill: BillForAlert, daysLeft: number): string[] {
  const codes: { label: string; value: string }[] = [];
  const line = bill.boletoLine ? cleanBoleto(bill.boletoLine) : bill.boletoBarcode ? cleanBoleto(bill.boletoBarcode) : "";
  if (line) codes.push({ label: bill.boletoLine ? "linha digitável do boleto" : "código de barras do boleto", value: line });
  if (bill.pixCode) codes.push({ label: "Pix copia e cola", value: cleanPix(bill.pixCode) });
  else if (bill.pixKey) codes.push({ label: "chave Pix", value: bill.pixKey.trim() });

  const header = [
    `🔔 *Conta a pagar* — ${dueLabel(daysLeft)}`,
    `${bill.description}${bill.shared ? " (casa)" : ""}`,
    `Valor: ${formatBRL(bill.amountCents)}`,
    `Vencimento: ${formatDateBR(bill.dueDate)}`,
  ];
  if (codes.length) {
    header.push("", `Na próxima mensagem: ${codes.map((c) => c.label).join(" e ")} — toque e segure para copiar.`);
  } else {
    header.push("", "⚠️ Código de pagamento indisponível para esta conta" + (bill.source === "pluggy" ? " (o banco não informou boleto/Pix via Open Finance)." : "."));
  }
  return [header.join("\n"), ...codes.map((c) => c.value)];
}
