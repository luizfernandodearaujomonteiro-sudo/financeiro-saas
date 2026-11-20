/**
 * Leitura centralizada das variáveis de ambiente (somente servidor).
 * Toda variável está documentada em .env.example.
 */
import "server-only";

function bool(v: string | undefined, def = false): boolean {
  if (v === undefined || v === "") return def;
  return ["1", "true", "yes", "sim", "on"].includes(v.toLowerCase());
}

export const env = {
  get appUrl() {
    return (process.env.APP_URL ?? "http://localhost:3000").replace(/\/$/, "");
  },
  get isVercel() {
    return Boolean(process.env.VERCEL);
  },
  get localDevAuth() {
    const on = bool(process.env.LOCAL_DEV_AUTH);
    if (on && (process.env.VERCEL || process.env.VERCEL_ENV)) {
      throw new Error("LOCAL_DEV_AUTH não pode ser usado na Vercel/produção");
    }
    return on;
  },
  get databaseUrl() {
    const url = process.env.DATABASE_URL;
    if (url) return url;
    if (bool(process.env.LOCAL_DEV_AUTH)) {
      // local: conecta como fin_financeiro_app (NOINHERIT), igual à produção — nunca como superusuário
      const port = process.env.LOCAL_PG_PORT ?? "54329";
      const pw = encodeURIComponent(process.env.LOCAL_PG_APP_PASSWORD ?? "fam-app-local-dev");
      return `postgres://fin_financeiro_app:${pw}@127.0.0.1:${port}/${process.env.LOCAL_PG_DATABASE ?? "financeiro"}`;
    }
    throw new Error("DATABASE_URL não configurada");
  },
  supabaseUrl: () => process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
  supabaseAnonKey: () => process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "",
  supabaseServiceRoleKey: () => process.env.SUPABASE_SERVICE_ROLE_KEY ?? "",
  secret(name: "LOCAL_SESSION_SECRET" | "LOGIN_RATE_LIMIT_SECRET" | "CRON_SECRET" | "WHATSAPP_WEBHOOK_SECRET" | "PLUGGY_WEBHOOK_SECRET" | "OAUTH_STATE_SECRET"): string | null {
    const v = process.env[name];
    return v && v.length >= 24 ? v : null; // segredos curtos = não configurado (falha fechada)
  },
  get storageDriver(): "local" | "supabase" {
    return (process.env.STORAGE_DRIVER ?? (bool(process.env.LOCAL_DEV_AUTH) ? "local" : "supabase")) === "local" ? "local" : "supabase";
  },
  get localStorageDir() {
    return process.env.LOCAL_STORAGE_DIR ?? ".local/storage";
  },
  get gmailMode(): "live" | "mock" | "off" {
    const m = process.env.GMAIL_MODE;
    if (m === "mock" || m === "off" || m === "live") return m;
    return process.env.GOOGLE_CLIENT_ID ? "live" : bool(process.env.LOCAL_DEV_AUTH) ? "mock" : "off";
  },
  get pluggyMode(): "live" | "sandbox" | "mock" | "off" {
    const m = process.env.PLUGGY_MODE;
    if (m === "live" || m === "sandbox" || m === "mock" || m === "off") return m;
    return process.env.PLUGGY_CLIENT_ID ? "live" : bool(process.env.LOCAL_DEV_AUTH) ? "mock" : "off";
  },
  get whatsappProvider(): "evolution" | "meta" | "simulator" {
    const p = process.env.WHATSAPP_PROVIDER;
    if (p === "meta" || p === "simulator" || p === "evolution") return p;
    return bool(process.env.LOCAL_DEV_AUTH) ? "simulator" : "evolution";
  },
  get evolutionAllowConnect() {
    return bool(process.env.EVOLUTION_ALLOW_CONNECT, false);
  },
  get simulatorEnabled() {
    return bool(process.env.LOCAL_DEV_AUTH) || process.env.WHATSAPP_PROVIDER === "simulator";
  },
};
