/**
 * Teste de fumaça no NAVEGADOR + capturas de tela (Playwright, local).
 * Pré-requisitos: `npm run build`, banco local com seed (`npm run db:local:reset`).
 * Sobe `next start` na porta 3100 (com .env.local), faz login dos dois membros,
 * usa o simulador do WhatsApp e o Open Finance simulado, valida textos e salva
 * imagens em docs/screenshots/. Para o servidor ao final (somente o que iniciou).
 */
import { spawn } from "node:child_process";
import { chromium, type Page } from "playwright";
import { ROOT } from "./db/cluster";

const PORT = Number(process.env.SCREENSHOT_PORT ?? 3100);
const BASE = `http://localhost:${PORT}`;
const OUT = "docs/screenshots";

async function waitUp(url: string, ms = 60_000) {
  const t = Date.now();
  while (Date.now() - t < ms) {
    try {
      if ((await fetch(url)).ok) return;
    } catch {
      /* ainda subindo */
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error("servidor não subiu");
}

async function login(page: Page, email: string, password: string) {
  await page.goto(`${BASE}/login`);
  await page.fill('input[name="email"]', email);
  await page.fill('input[name="password"]', password);
  await page.click('button[type="submit"]');
  await page.waitForURL(`${BASE}/painel`, { timeout: 30_000 });
}

async function expectText(page: Page, text: string) {
  await page.getByText(text, { exact: false }).first().waitFor({ timeout: 15_000 });
}

async function shot(page: Page, name: string, path: string, check?: string) {
  await page.goto(`${BASE}${path}`);
  if (check) await expectText(page, check);
  await page.waitForTimeout(1300); // animações
  await page.screenshot({ path: `${OUT}/${name}.png`, fullPage: false });
  console.log(`  ✓ ${name}.png`);
}

async function main() {
  // Garante que não há outro servidor na porta (evita testar um build antigo).
  if (await fetch(`${BASE}/api/health`).then(() => true, () => false)) throw new Error(`porta ${PORT} já está em uso — pare o servidor existente ou use SCREENSHOT_PORT`);
  // Sobe o Next diretamente (sem npx) em um grupo de processos próprio, para encerrar tudo no final.
  const server = spawn(process.execPath, ["node_modules/next/dist/bin/next", "start", "-p", String(PORT)], {
    cwd: ROOT, env: { ...process.env, APP_URL: BASE }, stdio: "ignore", detached: true,
  });
  const stopServer = () => {
    try {
      if (server.pid) process.kill(-server.pid, "SIGTERM");
    } catch {
      /* já encerrado */
    }
  };
  process.on("exit", stopServer);
  const browser = await chromium.launch();
  try {
    await waitUp(`${BASE}/api/health`);
    console.log("Servidor local no ar. Capturando telas…");

    // ---- Luiz (dono), tema escuro, desktop ----
    const ctxL = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1, locale: "pt-BR", timezoneId: "America/Sao_Paulo" });
    await ctxL.addCookies([{ name: "fam_theme", value: "dark", url: BASE }]);
    const p = await ctxL.newPage();
    await page_login_check(p);
    await shot(p, "01-painel-escuro", "/painel", "Resultado do mês");
    await shot(p, "02-lancamentos", "/lancamentos", "Novo lançamento");
    await shot(p, "03-cartoes", "/cartoes", "Nubank");
    await shot(p, "04-contas-a-pagar", "/contas", "Condomínio");
    await shot(p, "05-revisao", "/revisao", "PADARIA");
    // Open Finance simulado: conectar -> webhook -> importar
    await p.goto(`${BASE}/open-finance`);
    await p.getByRole("button", { name: "Conectar banco simulado" }).click();
    await expectText(p, "Cartão Simulado Visa");
    await shot(p, "06-open-finance", "/open-finance", "Cartão Simulado Visa");
    // lançamentos importados: pagamento de fatura / transferência com selo "fora dos relatórios"
    await p.goto(`${BASE}/lancamentos?visao=minha`);
    const badge = p.getByText("fora dos relatórios").first();
    await badge.waitFor({ timeout: 15_000 });
    await badge.scrollIntoViewIfNeeded();
    await p.mouse.wheel(0, -160);
    await p.waitForTimeout(900);
    await p.screenshot({ path: `${OUT}/06b-lancamentos-fora-dos-relatorios.png` });
    console.log("  ✓ 06b-lancamentos-fora-dos-relatorios.png");
    await shot(p, "07-metas", "/metas", "Reserva de emergência");
    await shot(p, "08-relatorios", "/relatorios", "equilíbrio");
    await shot(p, "09-patrimonio", "/patrimonio", "Patrimônio");
    await shot(p, "10-investimentos", "/investimentos", "PETR4");
    await shot(p, "11-busca", "/busca?q=mercado", "Supermercado Extra");
    await shot(p, "12-configuracoes-whatsapp", "/configuracoes#whatsapp", "assistente da família");
    // Simulador: comandos + alertas (mensagens de código separadas)
    await p.goto(`${BASE}/simulador`);
    for (const cmd of ["gastei 50 mercado", "fatura nubank"]) {
      await p.fill('input[name="text"]', cmd);
      await p.getByRole("button", { name: "Enviar" }).click();
      await p.waitForTimeout(1200);
    }
    await p.getByRole("button", { name: /Rodar alertas de vencimento agora/ }).click();
    await p.waitForTimeout(1500);
    await p.goto(`${BASE}/simulador`);
    await expectText(p, "Gasto registrado");
    await expectText(p, "Conta a pagar");
    await p.waitForTimeout(1000);
    // rola a conversa até as mensagens de alerta (texto + código em mensagens separadas)
    await p.locator('ol[aria-label="Conversa"]').evaluate((el) => (el.scrollTop = el.scrollHeight));
    await p.waitForTimeout(400);
    await p.screenshot({ path: `${OUT}/13-simulador-whatsapp.png`, fullPage: false });
    console.log("  ✓ 13-simulador-whatsapp.png");
    await p.locator('ol[aria-label="Conversa"]').evaluate((el) => (el.scrollTop = el.scrollHeight - el.clientHeight - 520));
    await p.waitForTimeout(400);
    await p.screenshot({ path: `${OUT}/14-simulador-alertas-codigos.png`, fullPage: false });
    console.log("  ✓ 14-simulador-alertas-codigos.png");

    // ---- Mesmo navegador: Luiz sai, Esposa entra -> tema dela (claro), não o dele (escuro) ----
    if ((await p.evaluate(() => document.documentElement.dataset.theme)) !== "dark") throw new Error("tema do Luiz deveria ser escuro");
    await p.getByRole("button", { name: "Sair" }).click();
    await p.waitForURL(`${BASE}/login`);
    await login(p, "esposa@familia.local", "Esposa@Local2026");
    const wifeTheme = await p.evaluate(() => document.documentElement.dataset.theme);
    if (wifeTheme !== "light") throw new Error(`tema da esposa deveria ser claro (veio ${wifeTheme})`);
    console.log("  ✓ tema por perfil: esposa entra no mesmo navegador e recebe o tema dela");
    const e = p;
    await shot(e, "15-painel-claro-esposa", "/painel", "Olá, Esposa");
    await e.goto(`${BASE}/lancamentos?visao=tudo`);
    if (await e.getByText("Jogo na Steam").count()) throw new Error("VAZAMENTO: esposa viu lançamento pessoal do Luiz");
    console.log("  ✓ esposa não vê lançamentos pessoais do Luiz");

    // ---- Mobile (escuro) ----
    const ctxM = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, locale: "pt-BR", timezoneId: "America/Sao_Paulo" });
    await ctxM.addCookies([{ name: "fam_theme", value: "dark", url: BASE }]);
    const m = await ctxM.newPage();
    await login(m, "luiz@familia.local", "Luiz@Local2026");
    await shot(m, "16-mobile-painel", "/painel", "Resultado do mês");
    await shot(m, "17-mobile-contas", "/contas", "Condomínio");
    // login page (não autenticado)
    const anon = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
    await anon.goto(`${BASE}/login`);
    await anon.waitForTimeout(1000);
    await anon.screenshot({ path: `${OUT}/00-login.png` });
    console.log("  ✓ 00-login.png");
    // conta de outro app: autentica, mas não tem acesso
    const other = await (await browser.newContext()).newPage();
    await other.goto(`${BASE}/login`);
    await other.fill('input[name="email"]', "outroapp@exemplo.local");
    await other.fill('input[name="password"]', "OutroApp@2026xx");
    await other.click('button[type="submit"]');
    await other.waitForURL(`${BASE}/sem-acesso`, { timeout: 30_000 });
    console.log("  ✓ conta sem família é redirecionada para /sem-acesso");
    console.log("Fumaça no navegador OK.");
  } finally {
    await browser.close();
    stopServer();
  }
}

async function page_login_check(p: Page) {
  await p.goto(`${BASE}/login`);
  await p.fill('input[name="email"]', "luiz@familia.local");
  await p.fill('input[name="password"]', "senha-errada-123");
  await p.click('button[type="submit"]');
  await expectText(p, "E-mail ou senha incorretos");
  await login(p, "luiz@familia.local", "Luiz@Local2026");
  console.log("  ✓ login do Luiz (e recusa de senha errada)");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
