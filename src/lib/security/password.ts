/** Hash de senha para o modo LOCAL_DEV_AUTH (scrypt). Em produção o Supabase Auth cuida disso. */
import { randomBytes, scrypt as scryptCb, timingSafeEqual, type ScryptOptions } from "node:crypto";
import { z } from "zod";

function scrypt(password: string, salt: Buffer, keylen: number, opts: ScryptOptions): Promise<Buffer> {
  return new Promise((resolve, reject) => scryptCb(password, salt, keylen, opts, (err, key) => (err ? reject(err) : resolve(key))));
}

const N = 16384, r = 8, p = 1;

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await scrypt(password, salt, 32, { N, r, p });
  return `scrypt$${N}$${r}$${p}$${salt.toString("base64")}$${key.toString("base64")}`;
}

export async function verifyPassword(password: string, stored: string | null | undefined): Promise<boolean> {
  const parts = (stored ?? "").split("$");
  if (parts.length !== 6 || parts[0] !== "scrypt") {
    // custo equivalente para não revelar se o usuário existe
    await scrypt(password, Buffer.alloc(16), 32, { N, r, p });
    return false;
  }
  const [, n, rr, pp, salt, hash] = parts;
  const expected = Buffer.from(hash!, "base64");
  const key = await scrypt(password, Buffer.from(salt!, "base64"), expected.length, { N: Number(n), r: Number(rr), p: Number(pp) });
  return timingSafeEqual(key, expected);
}

/** Política de senha: mínimo 12 caracteres, com letras e números. */
export const passwordSchema = z
  .string()
  .min(12, "A senha precisa ter pelo menos 12 caracteres")
  .max(128, "Senha longa demais")
  .refine((s) => /[A-Za-zÀ-ÿ]/.test(s) && /\d/.test(s), "Use letras e números");
