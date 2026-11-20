export function normalizeText(s: string): string {
  return (s ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const STOP = new Set(["de", "da", "do", "das", "dos", "e", "a", "o", "no", "na", "em", "com", "para", "pra", "pg", "pgto", "compra", "pag", "pagamento"]);

export function tokens(s: string): string[] {
  return normalizeText(s)
    .split(" ")
    .filter((t) => t.length > 1 && !STOP.has(t) && !/^\d+$/.test(t));
}
