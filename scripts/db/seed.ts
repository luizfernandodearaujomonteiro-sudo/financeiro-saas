/**
 * Seed do banco LOCAL (nunca rode contra o Supabase). Idempotente: recria os dados de demonstração.
 * Logins locais:
 *   luiz@familia.local    / Luiz@Local2026   (dono)
 *   esposa@familia.local  / Esposa@Local2026 (membro)
 *   outroapp@exemplo.local/ OutroApp@2026xx  (conta de OUTRO app no auth.users compartilhado: sem acesso)
 */
import pg from "pg";
import { hashPassword } from "../../src/lib/security/password";
import { addDays, addMonths, monthStartOf, todayISO, toISODate, parseISODate } from "../../src/lib/domain/dates";
import { planInstallments } from "../../src/lib/domain/invoices";
import { arrecadacaoBarcodeToLine, bancarioBarcodeToLine, buildArrecadacaoBarcode, buildBancarioBarcode, dateToFactor } from "../../src/lib/domain/boleto";
import { buildPixCopiaECola } from "../../src/lib/domain/pix";

export const SEED_USERS = {
  luiz: { id: "11111111-1111-4111-8111-111111111111", email: "luiz@familia.local", password: "Luiz@Local2026", name: "Luiz", phone: "+5511990000001" },
  esposa: { id: "22222222-2222-4222-8222-222222222222", email: "esposa@familia.local", password: "Esposa@Local2026", name: "Esposa", phone: "+5511990000002" },
  outro: { id: "33333333-3333-4333-8333-333333333333", email: "outroapp@exemplo.local", password: "OutroApp@2026xx", name: "Outro App" },
};

export async function seed(url: string, opts: { quiet?: boolean; today?: string } = {}) {
  const log = (m: string) => !opts.quiet && console.log(m);
  const c = new pg.Client({ connectionString: url });
  await c.connect();
  const q = (sql: string, params: unknown[] = []) => c.query(sql, params);
  const today = opts.today ?? todayISO();
  const month = monthStartOf(today);
  try {
    await q("begin");
    // limpa dados de demonstração anteriores (somente local)
    await q("delete from public.fam_households where name = 'Família do Luiz'");
    await q("delete from public.fam_profiles where id = any($1::uuid[])", [Object.values(SEED_USERS).map((u) => u.id)]);
    await q("delete from public.invest_profiles where id = any($1::uuid[])", [Object.values(SEED_USERS).map((u) => u.id)]);
    await q("delete from public.fam_login_attempts");
    await q("delete from public.fam_whatsapp_inbound");
    await q("delete from auth.users where id = any($1::uuid[])", [Object.values(SEED_USERS).map((u) => u.id)]);

    for (const u of Object.values(SEED_USERS)) {
      await q("insert into auth.users (id, email, encrypted_password, raw_user_meta_data) values ($1, $2, $3, $4)", [u.id, u.email, await hashPassword(u.password), JSON.stringify({ display_name: u.name })]);
    }
    const { luiz, esposa } = SEED_USERS;
    const hh = (await q("select public.fam_bootstrap_household($1, 'Família do Luiz', $2) as id", [luiz.id, luiz.name])).rows[0].id as string;
    await q("select public.fam_bootstrap_add_member($1, $2, $3)", [hh, esposa.id, esposa.name]);
    await q("insert into public.fam_household_settings (household_id, whatsapp_undo_minutes, bill_alert_days) values ($1, 10, 3)", [hh]);
    await q("insert into public.fam_whatsapp_config (household_id, provider, display_number, evolution_base_url, evolution_instance, updated_by) values ($1, 'simulator', '+55 11 99000-0000', 'https://centralw.ftcplay.com', 'financeiro', $2)", [hh, luiz.id]);
    await q("insert into public.fam_whatsapp_numbers (user_id, household_id, phone_e164) values ($1,$2,$3), ($4,$2,$5)", [luiz.id, hh, luiz.phone, esposa.id, esposa.phone]);
    await q("insert into public.fam_profile_prefs (user_id, theme_mode) values ($1, 'dark'), ($2, 'light')", [luiz.id, esposa.id]);

    const cat = new Map<string, string>((await q("select id, name from public.fam_categories where household_id = $1", [hh])).rows.map((r) => [r.name, r.id]));
    const C = (n: string) => cat.get(n) ?? null;

    // contas
    await q(`insert into public.fam_bank_accounts (household_id, owner_id, name, institution, balance_cents, visibility) values
      ($1, $2, 'Conta conjunta', 'Banco do Brasil', 1550000, 'compartilhado'),
      ($1, $2, 'Conta pessoal Luiz', 'Nubank', 820000, 'pessoal'),
      ($1, $3, 'Conta pessoal', 'Itaú', 610000, 'pessoal')`, [hh, luiz.id, esposa.id]);

    // cartões
    const nubank = (await q(`insert into public.fam_cards (household_id, owner_id, nickname, brand, last4, closing_day, due_day, limit_cents, visibility)
      values ($1, $2, 'Nubank', 'mastercard', '4321', 25, 5, 1200000, 'compartilhado') returning id`, [hh, luiz.id])).rows[0].id as string;
    const itau = (await q(`insert into public.fam_cards (household_id, owner_id, nickname, brand, last4, closing_day, due_day, limit_cents, visibility)
      values ($1, $2, 'Itaú Click', 'visa', '8765', 3, 10, 800000, 'pessoal') returning id`, [hh, esposa.id])).rows[0].id as string;

    const entry = async (owner: string, vis: string, kind: string, desc: string, cents: number, date: string, catName: string, cost = "variavel", method = "pix", source = "manual") =>
      q(`insert into public.fam_entries (household_id, owner_id, visibility, kind, description, amount_cents, occurred_on, budget_month, category_id, payment_method, cost_type, source)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`, [hh, owner, vis, kind, desc, cents, date, monthStartOf(date), C(catName), method, cost, source]);

    for (let i = 5; i >= 0; i--) {
      const m = addMonths(month, -i);
      const { y, m: mm } = parseISODate(m);
      const day = (d: number) => {
        const iso = toISODate(y, mm, d);
        return iso > today ? today : iso;
      };
      if (m === month && Number(today.slice(8)) < 5) continue;
      await entry(luiz.id, "compartilhado", "receita", "Salário Luiz", 900000, day(5), "Salário", "fixa", "transferencia");
      await entry(esposa.id, "compartilhado", "receita", "Salário", 750000, day(5), "Salário", "fixa", "transferencia");
      await entry(luiz.id, "compartilhado", "despesa", "Aluguel", 280000, day(6), "Moradia", "fixa", "boleto");
      await entry(esposa.id, "compartilhado", "despesa", "Condomínio", 78000, day(7), "Moradia", "fixa", "pix");
      await entry(luiz.id, "compartilhado", "despesa", "Conta de luz", 21390 + i * 730, day(8), "Contas da casa", "fixa", "boleto");
      await entry(esposa.id, "compartilhado", "despesa", "Internet fibra", 11990, day(9), "Contas da casa", "fixa", "debito_automatico");
      await entry(luiz.id, "compartilhado", "despesa", "Supermercado Extra", 64320 + i * 1510, day(10), "Mercado");
      await entry(esposa.id, "compartilhado", "despesa", "Feira e hortifruti", 18750 + i * 300, day(12), "Mercado", "variavel", "dinheiro");
      await entry(luiz.id, "pessoal", "despesa", "Jogo na Steam", 9990, day(13), "Lazer");
      await entry(esposa.id, "pessoal", "despesa", "Roupas Renner", 32990 - i * 1000, day(14), "Vestuário");
      await entry(esposa.id, "compartilhado", "despesa", "Farmácia", 8790, day(15), "Saúde");
      await entry(luiz.id, "compartilhado", "despesa", "Uber", 4590, day(16), "Transporte", "variavel", "pix", "whatsapp");
      await entry(esposa.id, "pessoal", "despesa", "Café com amigas", 6400, day(18), "Restaurantes");
      if (i % 2 === 0) await entry(luiz.id, "pessoal", "receita", "Freela site", 180000, day(20), "Freelance");
    }

    // compras parceladas no cartão (usa a regra de fatura do domínio)
    const purchase = async (owner: string, card: string, cycle: { closingDay: number; dueDay: number }, vis: string, desc: string, total: number, n: number, date: string, catName: string) => {
      const p = (await q(`insert into public.fam_card_purchases (household_id, owner_id, card_id, visibility, description, total_cents, installments, purchased_on, category_id)
        values ($1,$2,$3,$4,$5,$6,$7,$8,$9) returning id`, [hh, owner, card, vis, desc, total, n, date, C(catName)])).rows[0].id;
      for (const inst of planInstallments(cycle, date, total, n)) {
        const inv = (await q(`insert into public.fam_invoices (household_id, card_id, reference_month, closing_date, due_date) values ($1,$2,$3,$4,$5)
          on conflict (card_id, reference_month) do update set closing_date = excluded.closing_date returning id`, [hh, card, inst.invoice.referenceMonth, inst.invoice.closingDate, inst.invoice.dueDate])).rows[0].id;
        await q(`insert into public.fam_entries (household_id, owner_id, visibility, kind, description, amount_cents, occurred_on, budget_month, category_id, payment_method, cost_type,
            card_id, invoice_id, purchase_id, installment_number, installment_total) values ($1,$2,$3,'despesa',$4,$5,$6,$7,$8,'cartao_credito','variavel',$9,$10,$11,$12,$13)`,
          [hh, owner, vis, desc, inst.amountCents, date, inst.invoice.referenceMonth, C(catName), card, inv, p, inst.number, inst.total]);
      }
    };
    const nuCycle = { closingDay: 25, dueDay: 5 }, itCycle = { closingDay: 3, dueDay: 10 };
    await purchase(luiz.id, nubank, nuCycle, "compartilhado", "Geladeira Brastemp", 420000, 10, addDays(today, -62), "Moradia");
    await purchase(luiz.id, nubank, nuCycle, "compartilhado", "Netflix", 5590, 1, addDays(today, -4), "Assinaturas");
    await purchase(esposa.id, nubank, nuCycle, "compartilhado", "iFood jantar", 8790, 1, addDays(today, -2), "Restaurantes");
    await purchase(luiz.id, nubank, nuCycle, "compartilhado", "Pneus do carro", 159600, 4, addDays(today, -20), "Transporte");
    await purchase(esposa.id, itau, itCycle, "pessoal", "Curso de inglês", 239400, 6, addDays(today, -35), "Educação");
    await purchase(esposa.id, itau, itCycle, "pessoal", "Perfume", 38900, 2, addDays(today, -9), "Vestuário");
    // fatura antiga já paga
    await q("update public.fam_invoices set status = 'paga', paid_at = now() where due_date < $1", [today]);

    // contas a pagar com códigos válidos
    const luzDue = addDays(today, 3), netDue = addDays(today, 5), condDue = addDays(today, 1), acadDue = addDays(today, 3), ipvaDue = addDays(today, 10);
    const luzLine = arrecadacaoBarcodeToLine(buildArrecadacaoBarcode("3", "6", 23480, "0048" + luzDue.replace(/-/g, "") + "0".repeat(17)));
    const netLine = bancarioBarcodeToLine(buildBancarioBarcode("341", dateToFactor(netDue), 11990, "1570000123456789012345678"));
    const condPix = buildPixCopiaECola({ key: "11222333000181", name: "COND RESIDENCIAL", city: "SAO PAULO", amountCents: 78000, txid: "COND" + today.replace(/-/g, "") });
    await q(`insert into public.fam_bills (household_id, owner_id, visibility, description, amount_cents, due_date, category_id, cost_type, boleto_line, boleto_barcode, pix_code, pix_key, pix_key_type) values
      ($1, $2, 'compartilhado', 'Conta de luz (Enel)', 23480, $4, $6, 'fixa', $8, null, null, null, null),
      ($1, $3, 'compartilhado', 'Internet fibra', 11990, $5, $6, 'fixa', $9, null, null, null, null),
      ($1, $3, 'compartilhado', 'Condomínio', 78000, $10, $7, 'fixa', null, null, $11, null, null),
      ($1, $3, 'pessoal', 'Academia', 12900, $12, $13, 'fixa', null, null, null, 'financeiro@academia.com.br', 'email'),
      ($1, $2, 'compartilhado', 'IPVA (cota 3)', 61230, $14, $15, 'fixa', null, null, null, null, null)`,
      [hh, luiz.id, esposa.id, luzDue, netDue, C("Contas da casa"), C("Moradia"), luzLine, netLine, condDue, condPix, acadDue, C("Saúde"), ipvaDue, C("Impostos e taxas")]);

    // metas
    const reserva = (await q(`insert into public.fam_goals (household_id, owner_id, visibility, name, kind, monthly_target_cents, total_target_cents, start_month)
      values ($1, $2, 'compartilhado', 'Reserva de emergência', 'poupanca', 150000, 3000000, $3) returning id`, [hh, luiz.id, addMonths(month, -4)])).rows[0].id;
    const viagem = (await q(`insert into public.fam_goals (household_id, owner_id, visibility, name, kind, monthly_target_cents, total_target_cents, start_month)
      values ($1, $2, 'pessoal', 'Viagem de férias', 'poupanca', 60000, 720000, $3) returning id`, [hh, esposa.id, addMonths(month, -2)])).rows[0].id;
    const invest = (await q(`insert into public.fam_goals (household_id, owner_id, visibility, name, kind, monthly_target_cents, start_month)
      values ($1, $2, 'compartilhado', 'Aportar em investimentos', 'investimento', 100000, $3) returning id`, [hh, luiz.id, addMonths(month, -3)])).rows[0].id;
    const contrib = (g: string, owner: string, m: string, cents: number, note: string | null = null) =>
      q("insert into public.fam_goal_contributions (household_id, goal_id, owner_id, month, amount_cents, note) values ($1,$2,$3,$4,$5,$6)", [hh, g, owner, m, cents, note]);
    await contrib(reserva, luiz.id, addMonths(month, -4), 150000);
    await contrib(reserva, esposa.id, addMonths(month, -3), 150000);
    await contrib(reserva, luiz.id, addMonths(month, -2), 200000, "13º adiantado");
    await contrib(reserva, esposa.id, addMonths(month, -1), 120000);
    await contrib(reserva, luiz.id, month, 90000);
    await contrib(viagem, esposa.id, addMonths(month, -2), 60000);
    await contrib(viagem, esposa.id, addMonths(month, -1), 60000);
    await contrib(viagem, esposa.id, month, 30000);
    for (let i = 3; i >= 0; i--) await contrib(invest, luiz.id, addMonths(month, -i), i === 0 ? 50000 : 100000);

    // fila de revisão (itens de uma fatura do Gmail, para o Luiz)
    const items: [string, number, number | null, number | null, string][] = [
      ["PADARIA PAO QUENTE", 1850, null, null, "Restaurantes"],
      ["POSTO IPIRANGA CENTRO", 21000, null, null, "Transporte"],
      ["MAGAZINE LOJA", 14990, 2, 6, "Outras despesas"],
      ["DROGARIA SAO PAULO", 4735, null, null, "Saúde"],
    ];
    for (const [i, [desc, cents, n, t, catName]] of items.entries()) {
      await q(`insert into public.fam_review_queue (household_id, owner_id, source, card_id, description, amount_cents, occurred_on, installment_number, installment_total, suggested_category, dedupe_hash)
        values ($1,$2,'gmail',$3,$4,$5,$6,$7,$8,$9,$10)`, [hh, luiz.id, nubank, desc, cents, addDays(today, -(i * 2 + 2)), n, t, C(catName), `seed-${i}`]);
    }

    // investimentos (stubs locais das tabelas invest_*) para o Luiz
    await q("insert into public.invest_profiles (id, display_name) values ($1, 'Luiz')", [luiz.id]);
    const broker = (await q("insert into public.invest_brokers (user_id, name) values ($1, 'XP Investimentos') returning id", [luiz.id])).rows[0].id;
    const assets: [string, string, string, string, string, string][] = [
      ["PETR4", "Petrobras PN", "br_stock", "100", "3250.00", "38.45"],
      ["ITSA4", "Itaúsa PN", "br_stock", "300", "2910.00", "10.87"],
      ["HGLG11", "CSHG Logística FII", "br_fii", "20", "3180.00", "162.30"],
      ["IVVB11", "iShares S&P 500", "br_etf", "15", "4200.00", "331.10"],
    ];
    for (const [ticker, name, type, qty, total, price] of assets) {
      const asset = (await q("insert into public.invest_assets (ticker, name, asset_type) values ($1,$2,$3) on conflict (ticker) do update set name = excluded.name returning id", [ticker, name, type])).rows[0].id;
      const h = (await q("insert into public.invest_holdings (user_id, broker_id, asset_id, total_quantity, average_price, total_invested) values ($1,$2,$3,$4,$5,$6) returning id",
        [luiz.id, broker, asset, qty, (Number(total) / Number(qty)).toFixed(8), total])).rows[0].id;
      await q("insert into public.invest_transactions (user_id, holding_id, type, quantity, total_value, executed_at) values ($1,$2,'buy',$3,$4,$5)", [luiz.id, h, qty, total, addDays(today, -120) + "T15:00:00Z"]);
      await q("insert into public.invest_price_cache (asset_id, current_price) values ($1,$2) on conflict (asset_id) do update set current_price = excluded.current_price, fetched_at = now()", [asset, price]);
    }
    await q("insert into public.fam_invest_links (user_id, household_id, invest_profile_id, visibility) values ($1,$2,$1,'compartilhado')", [luiz.id, hh]);

    // histórico de patrimônio (meses anteriores)
    for (let i = 5; i >= 1; i--) {
      const m = addMonths(month, -i);
      const fam = 1550000 + 1300000 - 250000 - i * 60000;
      await q("insert into public.fam_networth_snapshots (household_id, user_id, month, accounts_cents, investments_cents, debts_cents, net_cents) values ($1,null,$2,$3,$4,$5,$6)",
        [hh, m, 1550000 - i * 40000, 1300000 - i * 25000, 250000 - i * 5000, fam]);
      await q("insert into public.fam_networth_snapshots (household_id, user_id, month, accounts_cents, investments_cents, debts_cents, net_cents) values ($1,$2,$3,$4,$5,$6,$7)",
        [hh, luiz.id, m, 2370000 - i * 50000, 1300000 - i * 25000, 260000, 3410000 - i * 75000]);
    }
    await q("insert into public.fam_search_history (user_id, household_id, query) values ($1,$2,'mercado'), ($1,$2,'uber')", [luiz.id, hh]);
    await q("commit");
    log(`Seed local concluído (família ${hh}).`);
    log(`  Luiz:   ${luiz.email} / ${luiz.password}`);
    log(`  Esposa: ${esposa.email} / ${esposa.password}`);
    log(`  (sem acesso) ${SEED_USERS.outro.email} / ${SEED_USERS.outro.password}`);
    return { householdId: hh, nubank, itau, reserva };
  } catch (e) {
    await q("rollback");
    throw e;
  } finally {
    await c.end();
  }
}
