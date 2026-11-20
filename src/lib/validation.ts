import { z } from "zod";
import { isValidISODate } from "./domain/dates";
import { parseBRL } from "./domain/money";

export const uuid = z.string().uuid();
export const isoDate = z.string().refine(isValidISODate, "Data inválida");
export const visibility = z.enum(["pessoal", "compartilhado"]);
export const kind = z.enum(["receita", "despesa"]);
export const costType = z.enum(["fixa", "variavel"]);
export const paymentMethod = z.enum(["pix", "cartao_credito", "cartao_debito", "boleto", "dinheiro", "transferencia", "debito_automatico"]);

/** Valor digitado em reais -> centavos inteiros positivos. */
export const moneyInput = z
  .union([z.string(), z.number()])
  .transform((v, ctx) => {
    const cents = typeof v === "number" ? (Number.isSafeInteger(v) ? v : null) : parseBRL(v);
    if (cents === null || cents <= 0) {
      ctx.addIssue({ code: "custom", message: "Valor inválido" });
      return z.NEVER;
    }
    return cents;
  });

export const optionalUuid = z.preprocess((v) => (v === "" || v === null ? undefined : v), uuid.optional());
export const optionalText = (max: number) => z.preprocess((v) => (typeof v === "string" && v.trim() === "" ? undefined : v), z.string().trim().max(max).optional());

export const entryInput = z.object({
  kind,
  description: z.string().trim().min(1, "Descreva o lançamento").max(140),
  amountCents: moneyInput,
  occurredOn: isoDate,
  categoryId: optionalUuid,
  paymentMethod: paymentMethod.default("pix"),
  costType: costType.default("variavel"),
  visibility: visibility.default("pessoal"),
  notes: optionalText(500),
});
export type EntryInput = z.infer<typeof entryInput>;

export const cardInput = z.object({
  nickname: z.string().trim().min(1).max(60),
  brand: z.enum(["visa", "mastercard", "elo", "amex", "hipercard", "outra"]),
  last4: z.string().regex(/^\d{4}$/, "Informe os 4 últimos dígitos"),
  closingDay: z.coerce.number().int().min(1).max(31),
  dueDay: z.coerce.number().int().min(1).max(31),
  limitCents: z.preprocess((v) => (v === "" || v === undefined ? "0,00" : v), z.union([z.string(), z.number()])).transform((v) => (typeof v === "number" ? v : parseBRL(v) ?? 0)),
  visibility: visibility.default("compartilhado"),
});

export const purchaseInput = z.object({
  cardId: uuid,
  description: z.string().trim().min(1).max(140),
  totalCents: moneyInput,
  installments: z.coerce.number().int().min(1).max(48),
  purchasedOn: isoDate,
  categoryId: optionalUuid,
  visibility: visibility.default("pessoal"),
  costType: costType.default("variavel"),
});
