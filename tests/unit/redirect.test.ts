import { describe, expect, it } from "vitest";
import { safeNextPath } from "@/lib/security/redirect";

describe("destino pós-login (open redirect)", () => {
  it.each([
    "/\\evil.com",
    "//evil.com",
    "/%5Cevil.com",
    "/%5cevil.com",
    "/%2F%2Fevil.com",
    "/%2fevil.com",
    "https://evil.com",
    "javascript:alert(1)",
    "\\\\evil.com",
    "/\tevil.com",
    "/%09/evil.com",
    "/painel\n",
    "/%",
    "",
    "painel",
  ])("rejeita %j (volta para /painel)", (next) => {
    expect(safeNextPath(next)).toBe("/painel");
  });

  it.each(["/painel?x=1", "/painel", "/lancamentos?visao=familia&mes=2026-11", "/busca?q=mercado%20extra", "/cartoes/123e4567-e89b-12d3-a456-426614174000"])(
    "aceita caminho interno %j",
    (next) => {
      expect(safeNextPath(next)).toBe(next);
    },
  );

  it("valores que não são texto usam o padrão", () => {
    expect(safeNextPath(null)).toBe("/painel");
    expect(safeNextPath(undefined)).toBe("/painel");
    expect(safeNextPath("/" + "a".repeat(600))).toBe("/painel");
  });
});
