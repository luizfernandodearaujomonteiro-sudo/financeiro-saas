/** Cria .env.local para desenvolvimento LOCAL com segredos aleatórios (não sobrescreve se já existir). */
import { randomBytes } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { ROOT } from "./db/cluster";

export function ensureLocalEnv(): string {
  const file = path.join(ROOT, ".env.local");
  if (fs.existsSync(file)) return file;
  const r = () => randomBytes(32).toString("base64url");
  const content = `# Gerado por npm run setup:local — SOMENTE desenvolvimento local. Não commitar.
APP_URL=http://localhost:3000
LOCAL_DEV_AUTH=true
LOCAL_SESSION_SECRET=${r()}
LOGIN_RATE_LIMIT_SECRET=${r()}
TOKEN_ENCRYPTION_KEY=${randomBytes(32).toString("base64")}
CRON_SECRET=${r()}
OAUTH_STATE_SECRET=${r()}
WHATSAPP_WEBHOOK_SECRET=${r()}
PLUGGY_WEBHOOK_SECRET=${r()}
WHATSAPP_PROVIDER=simulator
PLUGGY_MODE=mock
GMAIL_MODE=mock
STORAGE_DRIVER=local
LOCAL_STORAGE_DIR=.local/storage
EVOLUTION_BASE_URL=https://centralw.ftcplay.com
EVOLUTION_INSTANCE_NAME=financeiro
EVOLUTION_ALLOW_CONNECT=false
LOCAL_PG_PORT=54329
`;
  fs.writeFileSync(file, content, { mode: 0o600 });
  return file;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const existed = fs.existsSync(path.join(ROOT, ".env.local"));
  ensureLocalEnv();
  console.log(existed ? ".env.local já existe (mantido)." : ".env.local criado com segredos aleatórios para uso local.");
}
