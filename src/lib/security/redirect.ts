/**
 * Validação estrita do destino pós-login (`next`) para evitar open redirect.
 * Aceita só caminhos internos: começam com UMA barra, sem barra invertida, sem esquema,
 * sem caracteres de controle e com conjunto restrito de caracteres. Também confere a
 * forma DECODIFICADA (ex.: "/%5Cevil.com" -> "/\evil.com", "/%2F%2Fevil.com" -> "///evil.com").
 */
export const SAFE_PATH_RE = /^\/(?![\/\\])[A-Za-z0-9\-._~\/?=&%]*$/;
export const DEFAULT_AFTER_LOGIN = "/painel";

export function safeNextPath(raw: unknown, fallback = DEFAULT_AFTER_LOGIN): string {
  if (typeof raw !== "string" || raw.length === 0 || raw.length > 512) return fallback;
  if (!SAFE_PATH_RE.test(raw)) return fallback;
  let decoded: string;
  try {
    decoded = decodeURIComponent(raw);
  } catch {
    return fallback; // "%" malformado
  }
  if (decoded.includes("\\") || /[\u0000-\u001f\u007f]/.test(decoded) || decoded.startsWith("//") || /^\/[^/]*:/.test(decoded)) return fallback;
  return raw;
}
