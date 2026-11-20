// Ambiente do teste ponta a ponta (somente local; nenhum serviço externo é chamado).
import { randomBytes } from "node:crypto";
import { testAppUrl } from "../support/db";

Object.assign(process.env, {
  DATABASE_URL: testAppUrl, // conecta como fam_app (NOINHERIT), igual à produção
  LOCAL_DEV_AUTH: "true",
  APP_URL: "http://localhost:3999",
  LOCAL_SESSION_SECRET: "e2e-session-secret-0123456789abcdef",
  LOGIN_RATE_LIMIT_SECRET: "e2e-ratelimit-secret-0123456789abcdef",
  WHATSAPP_WEBHOOK_SECRET: "e2e-whatsapp-secret-0123456789abcdef",
  PLUGGY_WEBHOOK_SECRET: "e2e-pluggy-secret-0123456789abcdef",
  CRON_SECRET: "e2e-cron-secret-0123456789abcdef",
  TOKEN_ENCRYPTION_KEY: randomBytes(32).toString("base64"),
  META_WHATSAPP_APP_SECRET: "e2e-meta-app-secret",
  META_WHATSAPP_VERIFY_TOKEN: "e2e-meta-verify-token",
  EVOLUTION_INSTANCE_NAME: "financeiro",
  WHATSAPP_PROVIDER: "simulator",
  PLUGGY_MODE: "mock",
  GMAIL_MODE: "mock",
  STORAGE_DRIVER: "local",
  LOCAL_STORAGE_DIR: ".local/storage-test",
});
