/**
 * Bootstrap da família em PRODUÇÃO (Supabase compartilhado). Escreve SOMENTE em tabelas fam_
 * via as funções fam_bootstrap_household / fam_bootstrap_add_member.
 * As contas precisam existir no auth.users (crie no painel do Supabase Auth ou use contas existentes).
 *
 *   DATABASE_URL_ADMIN=... npx tsx scripts/bootstrap.ts --owner-email luiz@... --owner-name Luiz \
 *       --household "Família do Luiz" [--member-email esposa@... --member-name "Nome"] [--yes]
 * Sem --yes apenas mostra o que faria (dry-run).
 */
import pg from "pg";

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 ? process.argv[i + 1] : undefined;
}

async function main() {
  const url = process.env.DATABASE_URL_ADMIN; // papel administrativo, só para este script (nunca na Vercel)
  if (!url) throw new Error("Defina DATABASE_URL_ADMIN (conexão administrativa, usada só neste script)");
  const ownerEmail = arg("owner-email"), ownerName = arg("owner-name") ?? "Dono", household = arg("household") ?? "Nossa família";
  const memberEmail = arg("member-email"), memberName = arg("member-name") ?? "Membro";
  const apply = process.argv.includes("--yes");
  if (!ownerEmail) throw new Error("--owner-email é obrigatório");
  const c = new pg.Client({ connectionString: url, ssl: /localhost|127\.0\.0\.1/.test(url) ? undefined : { rejectUnauthorized: false } });
  await c.connect();
  try {
    const find = async (email: string) => (await c.query("select id from auth.users where lower(email) = lower($1)", [email])).rows[0]?.id as string | undefined;
    const owner = await find(ownerEmail);
    if (!owner) throw new Error(`Conta ${ownerEmail} não existe no auth.users`);
    const member = memberEmail ? await find(memberEmail) : undefined;
    if (memberEmail && !member) throw new Error(`Conta ${memberEmail} não existe no auth.users`);
    console.log(`Família "${household}": dono ${ownerEmail}${memberEmail ? `, membro ${memberEmail}` : ""}`);
    if (!apply) return console.log("Dry-run. Rode novamente com --yes para aplicar.");
    await c.query("begin");
    const hh = (await c.query("select public.fam_bootstrap_household($1, $2, $3) as id", [owner, household, ownerName])).rows[0].id;
    if (member) await c.query("select public.fam_bootstrap_add_member($1, $2, $3)", [hh, member, memberName]);
    await c.query("insert into public.fam_household_settings (household_id) values ($1) on conflict do nothing", [hh]);
    await c.query("commit");
    console.log(`OK — família criada: ${hh}`);
  } catch (e) {
    await c.query("rollback").catch(() => {});
    throw e;
  } finally {
    await c.end();
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
