/**
 * Testes REAIS de RLS contra o Postgres local com as migrations fam_.
 * Cada consulta roda como `authenticated` com o claim `sub` do usuário.
 */
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { SEED_USERS } from "../../scripts/db/seed";
import { asUser, freshTestDb } from "../support/db";

const { luiz, esposa, outro } = SEED_USERS;
let pool: pg.Pool;
let householdId: string;
let itau: string;
let nubank: string;

beforeAll(async () => {
  const db = await freshTestDb();
  householdId = db.householdId;
  itau = db.itau;
  nubank = db.nubank;
  pool = new pg.Pool({ connectionString: db.url, max: 4 });
});
afterAll(async () => {
  await pool?.end();
});

const count = async (userId: string | null, sql: string, params: unknown[] = []) =>
  asUser(pool, userId, async (c) => Number((await c.query(`select count(*)::int as n from (${sql}) x`, params)).rows[0].n));

describe("cobertura de RLS", () => {
  it("TODAS as tabelas fam_ têm RLS habilitado e nenhum privilégio para anon", async () => {
    const r = await pool.query(`select c.relname, c.relrowsecurity from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relkind = 'r' and c.relname like 'fam\\_%'`);
    expect(r.rows.length).toBeGreaterThanOrEqual(29);
    expect(r.rows.filter((x) => !x.relrowsecurity).map((x) => x.relname)).toEqual([]);
    const grants = await pool.query(`select table_name, privilege_type from information_schema.role_table_grants where grantee = 'anon' and table_name like 'fam\\_%'`);
    expect(grants.rows).toEqual([]);
  });
  it("as migrations não criam objetos fora do prefixo fam_ no schema public", async () => {
    const t = await pool.query(`select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relkind in ('r','v','m','S') and c.relname not like 'fam\\_%' and c.relname not like 'invest\\_%'`);
    expect(t.rows.map((r) => r.relname).filter((n) => !n.startsWith("fam_"))).toEqual([]);
    const f = await pool.query(`select p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname not like 'fam\\_%'`);
    expect(f.rows).toEqual([]);
  });
});

describe("lançamentos: pessoal x compartilhado", () => {
  it("Luiz vê os compartilhados e os próprios pessoais, mas NÃO os pessoais da esposa", async () => {
    expect(await count(luiz.id, "select 1 from fam_entries where owner_id = $1 and visibility = 'pessoal'", [esposa.id])).toBe(0);
    expect(await count(luiz.id, "select 1 from fam_entries where owner_id = $1 and visibility = 'compartilhado'", [esposa.id])).toBeGreaterThan(0);
    expect(await count(luiz.id, "select 1 from fam_entries where owner_id = $1 and visibility = 'pessoal'", [luiz.id])).toBeGreaterThan(0);
  });
  it("A esposa vê os compartilhados e os próprios pessoais, mas NÃO os pessoais do Luiz", async () => {
    expect(await count(esposa.id, "select 1 from fam_entries where owner_id = $1 and visibility = 'pessoal'", [luiz.id])).toBe(0);
    expect(await count(esposa.id, "select 1 from fam_entries where owner_id = $1 and visibility = 'compartilhado'", [luiz.id])).toBeGreaterThan(0);
    const total = await pool.query("select count(*)::int n from fam_entries");
    const visible = await count(esposa.id, "select 1 from fam_entries");
    expect(visible).toBeLessThan(total.rows[0].n);
  });
  it("um membro não altera nem apaga lançamento compartilhado do outro", async () => {
    const upd = await asUser(pool, esposa.id, (c) => c.query("update fam_entries set amount_cents = 1 where owner_id = $1 and visibility = 'compartilhado'", [luiz.id]));
    expect(upd.rowCount).toBe(0);
    const del = await asUser(pool, esposa.id, (c) => c.query("delete from fam_entries where owner_id = $1", [luiz.id]));
    expect(del.rowCount).toBe(0);
  });
  it("não é possível inserir lançamento em nome de outra pessoa", async () => {
    await expect(asUser(pool, esposa.id, (c) => c.query(
      "insert into fam_entries (household_id, owner_id, kind, description, amount_cents, occurred_on, budget_month) values ($1,$2,'despesa','x',100,'2026-11-01','2026-11-01')",
      [householdId, luiz.id]))).rejects.toThrow(/row-level security/);
  });
  it("não é possível tornar pessoal (ou alterar) o lançamento de outra pessoa trocando o dono", async () => {
    const r = await asUser(pool, esposa.id, (c) => c.query("update fam_entries set owner_id = $1 where owner_id = $1", [esposa.id]));
    expect(r.rowCount).toBeGreaterThan(0); // os próprios: ok
    await expect(asUser(pool, esposa.id, (c) => c.query("update fam_entries set owner_id = $2 where owner_id = $1", [esposa.id, luiz.id]))).rejects.toThrow(/row-level security/);
  });
});

describe("usuário do auth.users compartilhado que NÃO é membro", () => {
  const tables = ["fam_households", "fam_profiles", "fam_household_members", "fam_categories", "fam_entries", "fam_cards", "fam_invoices", "fam_bills",
    "fam_goals", "fam_goal_contributions", "fam_bank_accounts", "fam_review_queue", "fam_whatsapp_numbers", "fam_whatsapp_config", "fam_networth_snapshots", "fam_card_purchases"];
  it.each(tables)("não vê nada em %s", async (t) => {
    expect(await count(outro.id, `select 1 from ${t}`)).toBe(0);
  });
  it("não consegue inserir dados na família de outra pessoa", async () => {
    await expect(asUser(pool, outro.id, (c) => c.query(
      "insert into fam_entries (household_id, owner_id, kind, description, amount_cents, occurred_on, budget_month) values ($1,$2,'despesa','x',100,'2026-11-01','2026-11-01')",
      [householdId, outro.id]))).rejects.toThrow();
    await expect(asUser(pool, outro.id, (c) => c.query("insert into fam_categories (household_id, name, kind) values ($1, 'Hack', 'despesa')", [householdId]))).rejects.toThrow(/row-level security/);
  });
  it("RPCs de investimentos não devolvem nada", async () => {
    expect(await count(outro.id, "select * from fam_invest_positions()")).toBe(0);
  });
});

describe("cadastro (signup) não concede nada", () => {
  const novo = "44444444-4444-4444-8444-444444444444";
  beforeAll(async () => {
    await pool.query("insert into auth.users (id, email) values ($1, 'novo@exemplo.local') on conflict do nothing", [novo]);
  });
  it("não existe trigger em auth.users criando família/membro/perfil", async () => {
    const trg = await pool.query("select tgname from pg_trigger t join pg_class c on c.oid = t.tgrelid join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'auth' and c.relname = 'users' and not t.tgisinternal");
    expect(trg.rows).toEqual([]);
    expect((await pool.query("select count(*)::int n from fam_profiles where id = $1", [novo])).rows[0].n).toBe(0);
    expect((await pool.query("select count(*)::int n from fam_household_members where user_id = $1", [novo])).rows[0].n).toBe(0);
  });
  it("o usuário novo não consegue se colocar em uma família nem criar família", async () => {
    await expect(asUser(pool, novo, (c) => c.query("insert into fam_household_members (household_id, user_id, role) values ($1, $2, 'owner')", [householdId, novo]))).rejects.toThrow(/permission denied/);
    await expect(asUser(pool, novo, (c) => c.query("insert into fam_households (name) values ('minha')"))).rejects.toThrow(/permission denied/);
    await expect(asUser(pool, novo, (c) => c.query("insert into fam_profiles (id, display_name) values ($1, 'x')", [novo]))).rejects.toThrow(/permission denied/);
    await expect(asUser(pool, novo, (c) => c.query("select fam_bootstrap_household($1, 'x', 'y')", [novo]))).rejects.toThrow(/permission denied/);
  });
  it("convite inválido não dá acesso", async () => {
    await expect(asUser(pool, novo, (c) => c.query("select fam_accept_invite('token-falso', 'Novo')"))).rejects.toThrow(/convite inválido/);
  });
});

describe("convites (fluxo explícito)", () => {
  const dono2 = "55555555-5555-4555-8555-555555555555", convidado = "66666666-6666-4666-8666-666666666666", terceiro = "77777777-7777-4777-8777-777777777777";
  let token = "";
  beforeAll(async () => {
    await pool.query("insert into auth.users (id, email) values ($1,'dono2@x.local'), ($2,'conv@x.local'), ($3,'terc@x.local') on conflict do nothing", [dono2, convidado, terceiro]);
    await pool.query("select fam_bootstrap_household($1, 'Outra família', 'Dono 2')", [dono2]);
  });
  it("só o dono cria convite; família com 2 membros não aceita mais convites", async () => {
    await expect(asUser(pool, esposa.id, (c) => c.query("select fam_create_invite()"))).rejects.toThrow(/apenas o dono/);
    await expect(asUser(pool, luiz.id, (c) => c.query("select fam_create_invite()"))).rejects.toThrow(/2 membros/);
    token = (await asUser(pool, dono2, (c) => c.query("select fam_create_invite() as t"))).rows[0].t;
    expect(token).toMatch(/^[0-9a-f]{64}$/);
    // o banco guarda só o hash
    expect((await pool.query("select count(*)::int n from fam_household_invites where token_hash = $1", [token])).rows[0].n).toBe(0);
  });
  it("aceitar convite cria membro 'member'; não dá para reutilizar", async () => {
    expect((await asUser(pool, null, (c) => c.query("select fam_invite_info($1) as n", [token]), "anon")).rows[0].n).toBe("Outra família");
    await asUser(pool, convidado, (c) => c.query("select fam_accept_invite($1, 'Convidada')", [token]));
    const role = await asUser(pool, convidado, (c) => c.query("select role from fam_household_members where user_id = auth.uid()"));
    expect(role.rows[0].role).toBe("member");
    await expect(asUser(pool, terceiro, (c) => c.query("select fam_accept_invite($1, 'X')", [token]))).rejects.toThrow(/convite inválido/);
    // a nova família não enxerga a família do Luiz
    expect(await count(convidado, "select 1 from fam_entries where household_id = $1", [householdId])).toBe(0);
  });
  it("membro não altera o próprio papel", async () => {
    await expect(asUser(pool, convidado, (c) => c.query("update fam_household_members set role = 'owner' where user_id = auth.uid()"))).rejects.toThrow(/permission denied/);
  });
});

describe("cartões, faturas e contas", () => {
  it("cartão pessoal da esposa e suas faturas são invisíveis para o Luiz", async () => {
    expect(await count(luiz.id, "select 1 from fam_cards where id = $1", [itau])).toBe(0);
    expect(await count(luiz.id, "select 1 from fam_invoices where card_id = $1", [itau])).toBe(0);
    expect(await count(esposa.id, "select 1 from fam_invoices where card_id = $1", [itau])).toBeGreaterThan(0);
    expect(await count(esposa.id, "select 1 from fam_invoices where card_id = $1", [nubank])).toBeGreaterThan(0);
  });
  it("Luiz não lança compra no cartão pessoal da esposa (trigger)", async () => {
    await expect(asUser(pool, luiz.id, (c) => c.query(
      "insert into fam_entries (household_id, owner_id, kind, description, amount_cents, occurred_on, budget_month, payment_method, card_id) values ($1,$2,'despesa','x',100,'2026-11-01','2026-11-01','cartao_credito',$3)",
      [householdId, luiz.id, itau]))).rejects.toThrow(/cartão não disponível/);
  });
  it("total da fatura não pode ser alterado pelo usuário (só pelo trigger)", async () => {
    await expect(asUser(pool, luiz.id, (c) => c.query("update fam_invoices set total_cents = 0 where card_id = $1", [nubank]))).rejects.toThrow(/permission denied/);
    const ok = await asUser(pool, luiz.id, (c) => c.query("update fam_invoices set status = 'paga' where card_id = $1 and status = 'aberta' returning id", [nubank]));
    expect(ok.rowCount).toBeGreaterThanOrEqual(0);
  });
  it("trigger mantém o total da fatura igual à soma das parcelas", async () => {
    const r = await pool.query(`select i.id, i.total_cents, coalesce(sum(case when e.kind='despesa' then e.amount_cents else -e.amount_cents end),0)::bigint s
      from fam_invoices i left join fam_entries e on e.invoice_id = i.id group by i.id`);
    for (const row of r.rows) expect(Number(row.total_cents)).toBe(Number(row.s));
  });
  it("conta pessoal (Academia) da esposa não aparece para o Luiz; compartilhadas sim", async () => {
    expect(await count(luiz.id, "select 1 from fam_bills where description = 'Academia'")).toBe(0);
    expect(await count(esposa.id, "select 1 from fam_bills where description = 'Academia'")).toBe(1);
    expect(await count(luiz.id, "select 1 from fam_bills where visibility = 'compartilhado'")).toBeGreaterThanOrEqual(4);
  });
  it("fila de revisão é só do dono", async () => {
    expect(await count(luiz.id, "select 1 from fam_review_queue")).toBeGreaterThan(0);
    expect(await count(esposa.id, "select 1 from fam_review_queue")).toBe(0);
  });
});

describe("segredos e tabelas internas", () => {
  it.each(["fam_oauth_tokens", "fam_whatsapp_secrets", "fam_login_attempts", "fam_whatsapp_inbound", "fam_notification_log"])("%s é inacessível para usuários", async (t) => {
    await expect(asUser(pool, luiz.id, (c) => c.query(`select * from ${t}`))).rejects.toThrow(/permission denied/);
  });
  it("só o dono lê os segredos cifrados do WhatsApp via RPC", async () => {
    await expect(asUser(pool, esposa.id, (c) => c.query("select * from fam_get_whatsapp_secrets()"))).rejects.toThrow(/apenas o dono/);
    await asUser(pool, luiz.id, (c) => c.query("select fam_set_whatsapp_secrets('v1.cifrado', null)"));
    const r = await asUser(pool, luiz.id, (c) => c.query("select * from fam_get_whatsapp_secrets()"));
    expect(r.rows[0].evolution_token_enc).toBe("v1.cifrado");
  });
  it("membro define o próprio telefone; só o dono define o de outro", async () => {
    await expect(asUser(pool, esposa.id, (c) => c.query("select fam_set_member_phone($1, '+5511911112222')", [luiz.id]))).rejects.toThrow(/apenas o dono/);
    await asUser(pool, esposa.id, (c) => c.query("select fam_set_member_phone($1, '+5511990000002')", [esposa.id]));
  });
  it("limite de login: anon só acessa via RPC", async () => {
    const key = "a".repeat(64);
    await asUser(pool, null, (c) => c.query("select fam_record_login_attempt($1, false)", [key]), "anon");
    const n = await asUser(pool, null, (c) => c.query("select fam_login_failures($1, 900) as n", [key]), "anon");
    expect(n.rows[0].n).toBe(1);
    await expect(asUser(pool, null, (c) => c.query("select * from fam_login_attempts"), "anon")).rejects.toThrow(/permission denied/);
  });
});

describe("investimentos (ponte somente leitura para invest_*)", () => {
  it("esposa vê posições COMPARTILHADAS do Luiz pela RPC, mas não lê invest_holdings diretamente", async () => {
    expect(await count(esposa.id, "select * from fam_invest_positions()")).toBe(4);
    expect(await count(esposa.id, "select 1 from invest_holdings")).toBe(0);
  });
  it("quando o Luiz deixa pessoal, a esposa deixa de ver", async () => {
    await asUser(pool, luiz.id, (c) => c.query("update fam_invest_links set visibility = 'pessoal' where user_id = auth.uid()"));
    expect(await count(esposa.id, "select * from fam_invest_positions()")).toBe(0);
    expect(await count(luiz.id, "select * from fam_invest_positions()")).toBe(4);
    await asUser(pool, luiz.id, (c) => c.query("update fam_invest_links set visibility = 'compartilhado' where user_id = auth.uid()"));
  });
  it("vincular perfil de investimentos só funciona para o próprio login", async () => {
    const r = await asUser(pool, esposa.id, (c) => c.query("select fam_link_invest_profile('pessoal') as ok"));
    expect(r.rows[0].ok).toBe(false); // esposa não tem invest_profile
  });
});

describe("dados por perfil", () => {
  it("histórico de busca, preferências e mensagens são só do próprio perfil", async () => {
    expect(await count(esposa.id, "select 1 from fam_search_history")).toBe(0);
    expect(await count(luiz.id, "select 1 from fam_search_history")).toBe(2);
    expect(await count(esposa.id, "select 1 from fam_profile_prefs where user_id = $1", [luiz.id])).toBe(0);
  });
  it("snapshot de patrimônio pessoal do Luiz não aparece para a esposa", async () => {
    expect(await count(esposa.id, "select 1 from fam_networth_snapshots where user_id = $1", [luiz.id])).toBe(0);
    expect(await count(esposa.id, "select 1 from fam_networth_snapshots where user_id is null")).toBeGreaterThan(0);
  });
  it("aportes de meta pessoal da esposa são invisíveis para o Luiz", async () => {
    expect(await count(luiz.id, "select 1 from fam_goals where name = 'Viagem de férias'")).toBe(0);
    expect(await count(luiz.id, "select 1 from fam_goal_contributions c join fam_goals g on g.id = c.goal_id where g.name = 'Viagem de férias'")).toBe(0);
    expect(await count(esposa.id, "select 1 from fam_goal_contributions")).toBeGreaterThan(0);
  });
});
