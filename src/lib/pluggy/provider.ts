import "server-only";
import { env } from "../env";
import { createPluggyClient } from "./client";
import { createMockPluggy } from "./mock";
import type { PluggyProvider } from "./types";

export function getPluggyProvider(mode = env.pluggyMode): PluggyProvider {
  if (mode === "mock") return createMockPluggy();
  if (mode === "off") throw new Error("Open Finance desativado (PLUGGY_MODE=off)");
  const clientId = process.env.PLUGGY_CLIENT_ID, clientSecret = process.env.PLUGGY_CLIENT_SECRET;
  if (!clientId || !clientSecret) throw new Error("PLUGGY_CLIENT_ID/PLUGGY_CLIENT_SECRET não configurados");
  return createPluggyClient({ clientId, clientSecret, sandbox: mode === "sandbox" });
}
