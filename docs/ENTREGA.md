# Entrega — Finanças da Família

Documento de entrega da reescrita do `financeiro-saas` como **painel financeiro compartilhado
do Luiz e da esposa**. Tudo foi construído e testado **localmente** (Postgres local, sem Docker,
sem tocar no Supabase de produção, sem chamar APIs externas reais e sem nenhum pagamento).

Branch: `rewrite/familia-nextjs` (nada foi enviado ao remoto; `main` não foi alterada).

---

## Sumário

0. [Revisões 1 e 2 — o que mudou](#0-revisão-1--o-que-mudou) · [Go-live: prefixo fin_financeiro_ e onboarding](#go-live-prefixo-fin_financeiro_-e-onboarding)

1. [O que foi feito](#1-o-que-foi-feito)
2. [Como rodar localmente](#2-como-rodar-localmente)
3. [Como usar](#3-como-usar)
4. [Como testar cada recurso](#4-como-testar-cada-recurso)
5. [WhatsApp — configuração completa](#5-whatsapp--configuração-completa)
6. [Open Finance (Pluggy) — sandbox e produção](#6-open-finance-pluggy--sandbox-e-produção)
7. [Gmail — faturas por pessoa](#7-gmail--faturas-por-pessoa)
8. [Go-live (Supabase + Vercel)](#go-live-supabase--vercel)
9. [Segurança](#9-segurança)
10. [Riscos e pontos de atenção](#10-riscos-e-pontos-de-atenção)
11. [Pendências / TODO](#11-pendências--todo)
12. [Capturas de tela](#12-capturas-de-tela)

---

## 0. Revisão 1 — o que mudou

Correções da revisão minuciosa (rodada 1). Cada item tem teste automatizado.

| # | Achado | Correção |
|---|---|---|
| 1 | App conectava como `postgres` (dono do projeto compartilhado); `withService()` não trocava de papel | Novo papel de login **`fin_financeiro_app` NOINHERIT** (sem `SET ROLE` não tem privilégio nenhum) com membership em `anon`/`authenticated`/`service_role`; `withService()` faz `SET LOCAL ROLE service_role` (só DML). SQL manual em `supabase/manual/fin_financeiro_app_role.sql`; `DATABASE_URL` de produção usa `fin_financeiro_app.<project-ref>` no pooler; scripts administrativos usam `DATABASE_URL_ADMIN` (nunca na Vercel). Local espelha: app, RLS e e2e conectam como `fin_financeiro_app`. Teste: sem `SET ROLE` → *permission denied*; nem `fin_financeiro_app` nem `service_role` fazem DDL. |
| 2 | RPCs de login expostas no PostgREST para a anon key | `fin_financeiro_login_failures`, `fin_financeiro_record_login_attempt` **e** `fin_financeiro_invite_info` foram para o schema **`fin_financeiro_private`** (não exposto pela Data API); EXECUTE só para os papéis do app. |
| 3a | Pagar fatura importada criava despesa duplicada | `payBill()` de conta com `card_id` não cria lançamento: marca a conta e a `fin_financeiro_invoices` correspondente como pagas. |
| 3b | Pagamento de fatura e transferências próprias contavam como receita/despesa | Coluna `exclude_from_reports` (+ `exclude_reason`) em `fin_financeiro_entries`, classificador (categoria Pluggy/descrição), respeitada em painel, relatórios, série, comparativo, resumo do WhatsApp e resumo semanal. Selo na lista de lançamentos e opção de alternar. |
| 3c | Estornos no cartão inflavam receitas | Estorno (receita no cartão) agora **reduz a despesa** em todos os relatórios; continua abatendo o total da fatura. |
| 4 | Parcelas do Pluggy caíam todas na mesma fatura | Usa `creditCardMetadata.billId` (vencimento do bill); sem ele, desloca *(n−1)* faturas a partir da compra original. Mock com duas compras parceladas. |
| 5 | Evolution v2.3.x com remetente `@lid` era ignorado | Fallback para `key.remoteJidAlt` / `key.senderPn` / `data.senderPn`; sem número → ignora com "lid sem número". Payload de outra `instance` é ignorado; mensagens de protocolo/reação também. |
| 6 | Alerta perdido quando o envio falhava | Se todas as mensagens para um destinatário falharem, a reserva em `fin_financeiro_notification_log` é removida e o próximo cron tenta de novo (sem duplicar quando dá certo). Provedor não configurado conta como falha. |
| 7 | Sem opção de desligar lembrete/resumo | `daily_reminder` e `weekly_summary` por perfil (Configurações › Alertas › Minhas mensagens); jobs respeitam. |
| 8 | PDF de fatura com senha | Detecção ("PDF protegido por senha" / "Senha do PDF incorreta") visível na Revisão com instruções; upload aceita senha **só em memória**; senha opcional por perfil **cifrada** (`fin_financeiro_pdf_passwords`, RPC SECURITY DEFINER, sem acesso de anon/authenticated) usada pelo sync do Gmail; documento com erro é reprocessado quando reenviado. |
| 9 | Mudar ciclo do cartão não atualizava faturas futuras | `updateCard()` recalcula fechamento/vencimento das faturas **abertas do mês corrente em diante** (RPC `fin_financeiro_set_invoice_dates`, só cartão próprio); passadas/pagas não mudam; lançamentos continuam na mesma fatura. Formulário "Editar cartão". |
| 10 | Tema herdado entre pessoas no mesmo navegador | No login (e no aceite de convite) o cookie de tema é gravado a partir das preferências do perfil. |
| 11 | Menores | Verify token da Meta comparado em tempo constante; webhook Pluggy por header `x-webhook-secret` (segredo fora da query string por padrão); Vitest com `import.meta.dirname`. |

Migrations: as `fin_financeiro_` existentes foram editadas (ainda não aplicadas em lugar nenhum) e há uma nova,
`20261120000700_fin_financeiro_pdf_password_invoice_dates.sql`. Continua tudo aditivo e só com objetos `fin_financeiro_`
(mais o schema novo `fin_financeiro_private`).

### Revisão 2

| # | Achado | Correção |
|---|---|---|
| 1 | Open redirect no destino pós-login: `next.startsWith("/") && !next.startsWith("//")` aceitava `/\evil.com` (o navegador trata como `//evil.com`) | `safeNextPath()` (`src/lib/security/redirect.ts`) só aceita caminhos internos que casem com `/^\/(?![\/\\])[A-Za-z0-9\-._~\/?=&%]*$/` e confere também a forma decodificada (rejeita `/%5Cevil.com`, `/%2F%2Fevil.com`, caracteres de controle e esquemas). Fallback `/painel`. É o único ponto do app que redireciona a partir de parâmetro do usuário. Testes com `/\evil.com`, `//evil.com`, `/%5Cevil.com`, `https://evil.com` (rejeitados) e `/painel?x=1` (aceito). |
| 2 | Classificador: qualquer "aplicação"/"resgate" virava transferência ("RESGATE PREMIO", "APLICACAO MULTA"); prefixo de adquirente podia virar pagamento de fatura | Aplicação/resgate exige o produto (cdb, rdb, poupança, lci, lca, fundo, tesouro, automática/aut) **ou** categoria Pluggy de investimento. Descrições com prefixo de adquirente (`PAG*JoseDaSilva`, `PG *LOJA`, `MP*…`) nunca são pagamento de fatura (nem pela categoria). No cartão, "pagamento" no início só conta com recebido/efetuado/obrigado/fatura ou sozinho. Testes unitários. |

### Go-live: prefixo `fin_financeiro_` e onboarding

- **Prefixo do banco**: todos os objetos novos passaram de `fam_` para **`fin_financeiro_`**
  (tabelas, funções, triggers, policies, índices), o schema privado é **`fin_financeiro_private`**,
  o papel de conexão é **`fin_financeiro_app`** (`supabase/manual/fin_financeiro_app_role.sql`) e o
  bucket é **`fin_financeiro_faturas`**. Os arquivos das migrations foram renomeados para
  `*_fin_financeiro_*`.
- **Nomes reservados** (já existem no projeto, são do app ANTIGO e têm dados — o app novo **não**
  cria, altera nem usa): `public.fin_financeiro_categorias`, `public.fin_financeiro_configuracoes`,
  `public.fin_financeiro_empresas`, `public.fin_financeiro_lancamentos`,
  `public.fin_financeiro_usuarios`, as views `public.fin_joao_vw_*` e a função
  `public.fin_joao_get_user_empresa_id`. Nenhum objeto novo colide com eles (o app novo usa
  `fin_financeiro_categories`, em inglês). Nenhum nome precisou ser trocado.
- **Onboarding no app**: usuário logado sem família vê **"Criar minha família"** (nome da família +
  seu nome) em `/sem-acesso`; ao enviar, a função
  `fin_financeiro_private.fin_financeiro_create_my_household(p_name, p_display_name)` cria perfil,
  família, ele como **dono**, categorias padrão e configurações — atômico, recusa quem já é membro,
  valida tamanhos; EXECUTE só para `authenticated`. Fica no schema privado (fora da Data API) porque
  o `auth.users` é compartilhado com outros apps. `SELF_ONBOARDING_ENABLED=false` desliga o caminho.
  Depois, o dono convida a esposa em Configurações › Família.
- **Sem `SUPABASE_SERVICE_ROLE_KEY`**: login (Supabase Auth `signInWithPassword` com
  `NEXT_PUBLIC_SUPABASE_URL`/`NEXT_PUBLIC_SUPABASE_ANON_KEY`), painel e onboarding funcionam; só o
  upload/leitura de PDF fica indisponível (aviso na Revisão, 503 no download, erro registrado no
  sync do Gmail).
- **Pooler em modo transaction**: as consultas usam statement **sem nome** (nunca prepared
  statements nomeados) e só `SET LOCAL`/`set_config(..., true)`, compatíveis com a porta 6543.

### Limitações conhecidas (após as revisões 1 e 2)
- **`service_role` no Supabase alcança as outras tabelas do projeto** (tem `BYPASSRLS` e os
  privilégios padrão do Supabase). O app só assume esse papel em crons, webhooks e no log de
  mensagens enviadas; requisições do painel usam `authenticated` (RLS). Ele não é dono das tabelas,
  então não consegue `ALTER`/`DROP` tabelas de outros apps — mas consegue ler/alterar dados delas.
- O classificador de pagamento de fatura/transferência é heurístico (categoria da Pluggy +
  descrição). Erros podem ser corrigidos pelo usuário com o botão de alternar na lista.
- Parcelas sem `billId` usam a regra *(n−1)* meses — bancos que reportam a data da parcela (e não
  a da compra) podem deslocar uma fatura a mais; o lançamento pode ser editado.
- Mudança de ciclo não move lançamentos entre faturas (só datas de fechamento/vencimento).
- Reenvio de alerta só quando **todas** as mensagens do destinatário falham; se o texto foi e só o
  código falhou, não há reenvio automático (o código está na tela Contas a pagar).
- O cookie de tema não é httpOnly (é cosmético e lido pelo navegador).

## 1. O que foi feito

### Correções de segurança (primeiro commit da branch)
- `backend/src/routes/admin.js`: a checagem `x-admin-key === process.env.ADMIN_SECRET_KEY` passava
  quando a variável **não existia** (`undefined === undefined`), liberando `/api/admin/*` sem login.
  Corrigido para **falhar fechado** (chave obrigatória ≥ 32 caracteres, comparação em tempo constante).
- `database/supabase-schema.sql`: removidas as políticas de INSERT `WITH CHECK (true)` em
  `empresas`/`usuarios` (permitiam a um usuário logado se vincular a outra empresa e ler seus dados).
- Depois disso, o app antigo (Express + React/Vite + `database/`) foi **removido** e substituído.
  O SQL antigo (que criava `empresas`/`usuarios`) **não faz mais parte de nenhum caminho de deploy**;
  existe apenas no histórico do git e **não deve ser executado**.

### Nova arquitetura
- **Um único app Next.js 16** (App Router, TypeScript strict), pronto para a Vercel.
- **Supabase** (Postgres + Auth + Storage) reaproveitando o projeto existente
  `bqbmvurwmsgitundbdxt` — com **migrations aditivas, somente objetos `fin_financeiro_`**.
- **RLS em todas as tabelas `fin_financeiro_`**, por pertencimento à família. Cada requisição do painel roda no
  Postgres como o papel `authenticated` com o `sub` do usuário (mesmo mecanismo do PostgREST),
  então a RLS vale também dentro do servidor.
- **Dinheiro em centavos inteiros** (`bigint`) de ponta a ponta; parse/format sem float.
- **Datas no fuso America/Sao_Paulo** ("hoje", fechamento de fatura, lembretes, tema automático).
- **Sessão em cookies httpOnly** (`@supabase/ssr`); nada em `localStorage`.
- **Limite de tentativas de login** + senha mínima de 12 caracteres (letras e números).

### Domínio
- **Família** (`fin_financeiro_households`) com **dois logins** e perfis próprios; `fin_financeiro_household_members`
  com papel `owner`/`member`. Convite por link (somente o dono) ou bootstrap pelo script.
- **Lançamentos** com dono + visibilidade (`pessoal` / `compartilhado`), formas de pagamento
  (pix, cartão de crédito/débito, boleto, dinheiro, transferência, débito automático),
  custo **fixo/variável**, categorias, origem (manual, WhatsApp, Open Finance, fatura).
  Visões: **Tudo que vejo** (compartilhados + meus pessoais), **Casa** (só compartilhados),
  **Só eu**.
- **Cartões** (bandeira, final, dia de fechamento, dia de vencimento, limite), **faturas**
  (mês de referência = mês do vencimento, total mantido por trigger, status) e **parcelas**:
  a compra cai na fatura certa pelo dia de fechamento (compra **no dia do fechamento ou depois**
  vai para a próxima fatura) e as parcelas são geradas nas faturas futuras. Centavos que sobram
  vão para as primeiras parcelas (a soma sempre bate).
- **Contas a pagar** com **boleto** (linha digitável 47/48 dígitos ou código de barras 44,
  com DVs módulo 10/11 e conversão linha ↔ código) e **Pix** (chave CPF/CNPJ/e-mail/telefone
  +55/aleatória; copia e cola com CRC16-CCITT).
- **Relatórios** portados do sistema antigo: DRE simplificada, margem de contribuição,
  **ponto de equilíbrio**, resultado mensal, despesas por categoria, série de 12 meses e
  **comparativo entre membros** (somente gastos compartilhados; modo só percentuais).
- **Metas** (pessoais ou da casa), meta mensal, meta total opcional, aportes/retiradas,
  sequência, projeção e barra de progresso animada.
- **Busca** com filtros (texto, categoria, membro, cartão, tipo, período; também por valor
  "350,00" e data "15/11") e **histórico de buscas por perfil**.
- **Patrimônio**: contas (saldos do Open Finance) + investimentos (invest-tracker, leitura) −
  faturas em aberto, com fotografia mensal e tendência — visão da família e visão pessoal.
- **Investimentos**: lê as tabelas existentes `invest_*` do app invest-tracker **somente leitura**
  (vínculo do próprio login, compartilhável). A posição é recalculada a partir das transações
  com preço médio correto após vendas (corrige o BUG-07 do invest-tracker).
- **Tema** escuro / claro / **automático por horário** (padrão escuro das 18h às 6h, configurável),
  salvo por perfil.

### Integrações (adaptadores limpos, todos com modo local/mock)
- **WhatsApp**: provedor plugável — **Evolution API** (padrão, "Central Whatsapp"),
  **Meta Cloud API** (alternativo) e **simulador local**. Comandos, desfazer, alertas de
  vencimento (código em mensagem separada), lembrete diário e resumo semanal via cron.
- **Open Finance (Pluggy)**: conexão **por membro**, sandbox, mock local completo, webhook,
  importação de contas/cartões/transações/faturas, auto-categorização pelo histórico,
  compartilhamento por conta/cartão ou por transação.
- **Gmail**: OAuth por perfil, cron que busca faturas em PDF, deduplica, guarda no Storage e
  coloca os itens numa **fila de revisão** (aprovar/editar/rejeitar). Upload manual de PDF também.

### Visual
Tema escuro "tecnológico" (com claro), cartões de vidro com borda em gradiente, elevação e brilho
no hover, contadores animados, transições de página/lista, gráficos SVG animados (paleta validada
para daltonismo, tooltip e tabela acessível), ícones `lucide-react`, foco visível, respeito a
`prefers-reduced-motion`, navegação inferior no celular.

---

## 2. Como rodar localmente

Requisitos: **Node 20.9+** (testado com Node 24). Não precisa de Docker nem de Postgres instalado:
o pacote `embedded-postgres` traz os binários do **Postgres 15** (mesma versão do Supabase).

```bash
npm install
npm run dev:local
```

O `dev:local`:
1. cria `.env.local` com segredos aleatórios (modo local: `LOCAL_DEV_AUTH=true`, WhatsApp
   `simulator`, Pluggy `mock`, Gmail `mock`, storage em disco);
2. sobe o Postgres local em `127.0.0.1:54329` (dados em `.local/pgdata`, ignorado pelo git);
3. aplica: shim local do Supabase (`supabase/local/00_*`) → migrations `fin_financeiro_` → stubs `invest_*`
   locais (`supabase/local/10_*`, **nunca** vão para o Supabase);
4. faz o seed se o banco estiver vazio e abre `http://localhost:3000`.

Logins do seed:

| Pessoa | E-mail | Senha | Telefone (simulador) |
|---|---|---|---|
| Luiz (dono) | `luiz@familia.local` | `Luiz@Local2026` | +55 11 99000-0001 |
| Esposa (membro) | `esposa@familia.local` | `Esposa@Local2026` | +55 11 99000-0002 |
| Conta de outro app | `outroapp@exemplo.local` | `OutroApp@2026xx` | — (sem acesso) |

> Renomeie "Esposa" em **Configurações › Perfil** quando for usar de verdade.

Outros comandos: `npm run db:local:stop` (para o Postgres local), `db:local:reset` (recria),
`db:local:status`. Ao sair do `dev:local` com Ctrl+C, o Postgres é parado se tiver sido iniciado por ele.

---

## 3. Como usar

- **Painel**: resultado do mês (animado), receitas/despesas, fixas, ponto de equilíbrio,
  gráfico de 6 meses, categorias, próximas contas, faturas atuais com uso do limite, metas e
  pendências de revisão. Alterne **Tudo que vejo / Casa / Só eu** e o mês.
- **Lançamentos**: adicione receita/despesa. Em **Cartão de crédito**, escolha o cartão e as
  parcelas — a prévia mostra em qual fatura cai cada parcela. Edite, compartilhe/torne pessoal
  ou exclua (compra parcelada: exclui todas as parcelas).
- **Cartões**: cadastre cartões (pessoais ou da casa), veja a fatura atual e o histórico de
  faturas com os itens; marque como paga. Em **Editar cartão** dá para mudar o ciclo — as faturas
  em aberto deste mês em diante ganham as novas datas.
- **Contas a pagar**: cadastre com linha digitável/código de barras e/ou Pix (validação ao
  digitar), copie o código, veja a **prévia do alerta do WhatsApp**, marque como paga
  (gera o lançamento; se for **fatura de cartão importada**, só marca a fatura como paga, sem
  despesa nova).
- **Lançamentos fora dos relatórios**: pagamentos de fatura e transferências entre contas próprias
  aparecem com selo e riscados; use "Contar nos relatórios" / "Marcar como pagamento de fatura /
  transferência" para corrigir. Estornos no cartão aparecem como "reduz despesa".
- **Revisão**: itens vindos das faturas (Gmail ou upload de PDF) aguardam sua aprovação;
  edite descrição/valor/data/categoria/cartão/visibilidade antes de aprovar, ou rejeite.
- **Open Finance**: cada pessoa conecta **as próprias** contas. Tudo entra como **pessoal**;
  compartilhe por conta/cartão (opcionalmente aplicando aos lançamentos já importados) ou por
  transação.
- **Metas**: crie metas mensais (ex.: "guardar R$ 1.000/mês para investimentos"), registre
  aportes/retiradas e acompanhe progresso, sequência e projeção.
- **Relatórios**: DRE simplificada, ponto de equilíbrio, 12 meses, categorias e comparativo
  entre membros (valores ou só percentuais).
- **Patrimônio**, **Investimentos**, **Busca** (com histórico).
- **Configurações**: perfil, aparência (tema/horários), família (link de convite), alertas
  (janela do "desfazer", antecedência dos alertas), **WhatsApp** (provedor, credenciais,
  webhook, testar, telefones dos membros) e **Gmail**.
- **Simulador WhatsApp** (somente local/simulador): converse com o assistente.

### Comandos do WhatsApp

| Mensagem | Efeito |
|---|---|
| `gastei 50 mercado` | despesa pessoal de R$ 50, categoria Mercado |
| `gastei 120 luz compartilhado` (ou `casa`, `nosso`) | despesa **compartilhada** |
| `recebi 3000 salario` | receita (categoria Salário) |
| `saldo` / `resumo` | resumo do mês (você + casa) |
| `fatura nubank` | fatura atual do cartão (fechamento/vencimento) |
| `contas` | contas pendentes dos próximos 15 dias |
| `desfazer` | apaga **o seu último** gasto feito pelo WhatsApp, se dentro da janela (padrão 10 min, configurável) |
| `ajuda` | lista os comandos |

Os comandos executam **com as permissões de quem enviou** (RLS): o que é pessoal continua pessoal.
Números desconhecidos não recebem resposta nem dados.

---

## 4. Como testar cada recurso

### Verificações automáticas (todas passam)

```bash
npm run typecheck
npm run lint
npm test             # 97 testes unitários
npm run test:rls     # 60 testes de RLS no Postgres local real (porta 54330, recriado do zero; conecta como fin_financeiro_app)
npm run test:e2e     # 33 testes ponta a ponta locais (conecta como fin_financeiro_app)
npm run build
npm run screenshots  # fumaça no navegador + capturas (requer build e `npx playwright install chromium`)
```

- **RLS** (`tests/rls`): A não vê os pessoais de B e vê os compartilhados; usuário do
  `auth.users` sem família não vê nada; **cadastro não concede nada** (não há trigger em
  `auth.users`; usuário novo não consegue se inserir em família, criar família, criar perfil nem
  chamar o bootstrap); convites (só o dono, uso único, limite de 2 membros); cartão/fatura/conta
  pessoal invisível; total da fatura imutável pelo usuário; tabelas de segredos inacessíveis;
  ponte de investimentos respeita compartilhamento; todas as tabelas `fin_financeiro_` com RLS e sem
  privilégio para `anon`; nenhum objeto fora do prefixo `fin_financeiro_` criado pelas migrations.
- **E2E** (`tests/e2e`): login dos dois membros e bloqueio após 5 tentativas; lançamentos
  pessoal × compartilhado; compra parcelada nas faturas certas; boleto/Pix inválidos recusados;
  fila de revisão (importa, deduplica, aprova com fatura, rejeita); Pluggy mock pela **rota real
  do webhook** (sem segredo → 401, importação pessoal, sem duplicar, auto-categorização,
  compartilhar cartão libera para o outro membro, fatura com e sem código); WhatsApp pela
  **rota real** no formato Evolution com Bearer (401 sem/errado, assinatura Meta, fromMe,
  grupo, número desconhecido, duplicado, todos os comandos, desfazer); alertas de vencimento
  pelo **cron** (401 sem `CRON_SECRET`; código Pix/linha digitável **sozinho na mensagem
  seguinte**; pessoal só para o dono; idempotente); metas, busca, patrimônio, investimentos e
  comparativo sem pessoais.
- **Navegador** (`scripts/screenshots.ts`): sobe `next start`, recusa senha errada, loga os
  dois membros, conecta o banco simulado, usa o simulador e roda os alertas, confirma que a
  esposa **não** vê o lançamento pessoal do Luiz e que a conta de outro app vai para `/sem-acesso`.

### Testes manuais rápidos (com `npm run dev:local`)

1. **Privacidade**: entre como Luiz, crie um lançamento **pessoal**; entre como Esposa (outra
   janela anônima) e veja que ele não aparece; crie um **compartilhado** e veja que aparece.
2. **Parcelas**: em Lançamentos, despesa "Cartão de crédito" → Nubank → 10x; confira a prévia
   e depois as faturas em Cartões › Nubank.
3. **Boleto/Pix**: em Contas a pagar, cole uma linha digitável e altere um dígito — a validação
   acusa o campo errado. Abra "Prévia do alerta no WhatsApp".
4. **Revisão**: em Revisão, aprove um item editando a categoria; ou envie um PDF de fatura.
   Em Configurações › Gmail (modo mock) use "Sincronizar agora (mock)" para gerar itens.
5. **WhatsApp (simulador)**: abra **Simulador WhatsApp**, toque nos atalhos (`gastei 50 mercado`,
   `recebi 3000 salario`, `saldo`, `fatura nubank`, `contas`, `desfazer`, `ajuda`).
   Clique em **Rodar alertas de vencimento agora**: chegam o texto do alerta e, **em bolhas
   separadas**, o Pix copia e cola / a linha digitável (só o código, com botão copiar). A fatura
   do "Cartão Simulado Master" (Open Finance) chega **sem código**, avisando que o banco não o
   informou. Entre como a esposa para ver os alertas dela (contas pessoais só para o dono).
6. **Open Finance (mock)**: em Open Finance, "Conectar banco simulado" → importa conta, 2 cartões,
   transações categorizadas e 2 faturas (uma com linha digitável + Pix, outra sem código).
   Compartilhe um cartão e veja-o aparecer para o outro membro.
7. **Tema**: botão de lua/sol no topo alterna escuro → claro → automático; horários em
   Configurações › Aparência.

### Simular o webhook "de fora" (como a Central faria)

Com o `dev:local` rodando (o segredo está no `.env.local`):

```bash
SECRET=$(grep ^WHATSAPP_WEBHOOK_SECRET .env.local | cut -d= -f2)
curl -s http://localhost:3000/api/whatsapp/webhook \
  -H "Authorization: Bearer $SECRET" -H "Content-Type: application/json" \
  -d '{"event":"messages.upsert","instance":"financeiro","data":{"key":{"remoteJid":"5511990000001@s.whatsapp.net","fromMe":false,"id":"TESTE123"},"pushName":"Luiz","message":{"conversation":"gastei 32,90 uber"},"messageType":"conversation"}}'
```

A resposta do assistente aparece no Simulador (provedor `simulator`).

---

## 5. WhatsApp — configuração completa

### Arquitetura
- `WHATSAPP_PROVIDER` = `evolution` (**padrão** em produção) | `meta` | `simulator`.
  Com `simulator`, o envio é sempre simulado (forçado), mesmo que a família tenha outro provedor salvo.
- Webhook único: `POST <APP_URL>/api/whatsapp/webhook`.
  - **Evolution / simulador**: exige `Authorization: Bearer <WHATSAPP_WEBHOOK_SECRET>` (comparação
    em tempo constante). Sem o segredo configurado, **recusa tudo** (falha fechada).
  - **Meta**: valida `X-Hub-Signature-256` (HMAC-SHA256 do corpo bruto com `META_WHATSAPP_APP_SECRET`);
    `GET` responde ao `hub.challenge` com `META_WHATSAPP_VERIFY_TOKEN`.
- Payload tratado como **não confiável**: validação com zod, ignora `fromMe`, ignora grupos
  (`@g.us`), deduplica por `key.id`, extrai o telefone do `remoteJid` (normalizando o 9º dígito
  de celulares BR), mapeia para o perfil em `fin_financeiro_whatsapp_numbers`; número desconhecido = silêncio.
- Envio em ordem (uma chamada por mensagem) e registro em `fin_financeiro_whatsapp_messages`.
- **Evolution v2.3.x / LID**: se o `remoteJid` vier como `<id>@lid`, o número é lido de
  `key.remoteJidAlt`, `key.senderPn` ou `data.senderPn`; sem número, a mensagem é ignorada
  ("lid sem número"). Payloads com `instance` diferente da configurada (ambiente + Configurações)
  e mensagens de protocolo/reação são ignorados.
- **Falha de envio**: se todas as mensagens de um alerta/lembrete para uma pessoa falharem, ele
  volta para a fila do próximo cron (sem duplicar quando dá certo).
- **Preferências**: cada pessoa pode desligar o lembrete diário e o resumo semanal em
  Configurações › Alertas › Minhas mensagens (alertas de vencimento continuam ativos).
- Credenciais **somente no servidor**: variáveis de ambiente, arquivo (`EVOLUTION_INSTANCE_TOKEN_FILE`)
  ou banco **cifrado** (AES-256-GCM, via RPC exclusiva do dono). A tela de Configurações mostra
  apenas a **origem** ("via env", "via arquivo", "armazenado cifrado"), nunca o valor.

### Situação atual da Central (Evolution)
- A instância **`financeiro` já existe** na Central Whatsapp (`https://centralw.ftcplay.com`).
- Estado atual: conexão **`close`**, **nenhum webhook configurado**.
- **Não** chame `/instance/connect` (QR) até a Central aplicar o **proxy residencial BR**.
  O botão "Gerar QR code" fica **desabilitado** enquanto `EVOLUTION_ALLOW_CONNECT=false` (padrão).
- Nenhuma chamada à API real foi feita durante o desenvolvimento/testes.

### Próximos passos do Luiz (Evolution)
1. **Proxy residencial BR** para a instância (combinado com a Central; ~R$ 40/mês — decisão do Luiz).
2. **Número dedicado** (chip exclusivo para o assistente).
3. **Conectar via QR**: depois que a Central confirmar o proxy, defina `EVOLUTION_ALLOW_CONNECT=true`
   e use **Configurações › WhatsApp › Gerar QR code** (ou faça pela própria Central). Volte para
   `false` depois de conectado.
4. **Webhook (após o deploy)**: URL `https://<seu-deploy>/api/whatsapp/webhook` com header
   `Authorization: Bearer <WHATSAPP_WEBHOOK_SECRET>`. Use o botão **"Configurar webhook"**
   (Configurações › WhatsApp — só habilita com provedor Evolution, token e segredo configurados) ou:

   ```bash
   curl -X POST "https://centralw.ftcplay.com/webhook/set/financeiro" \
     -H "apikey: $EVOLUTION_INSTANCE_TOKEN" -H "Content-Type: application/json" \
     -d '{"webhook":{"enabled":true,"url":"https://<seu-deploy>/api/whatsapp/webhook",
          "headers":{"Authorization":"Bearer <WHATSAPP_WEBHOOK_SECRET>","Content-Type":"application/json"},
          "events":["MESSAGES_UPSERT","CONNECTION_UPDATE"],"base64":false,"byEvents":false}}'
   ```
5. Em **Configurações › WhatsApp**, cadastre o telefone de cada membro e clique em **Testar**.

### Variáveis (Evolution)
| Variável | Valor |
|---|---|
| `WHATSAPP_PROVIDER` | `evolution` |
| `EVOLUTION_BASE_URL` | `https://centralw.ftcplay.com` (padrão) |
| `EVOLUTION_INSTANCE_NAME` | `financeiro` (padrão) |
| `EVOLUTION_INSTANCE_TOKEN` (ou `WHATSAPP_API_KEY`) | token **da instância** (header `apikey`), nunca a chave global |
| `EVOLUTION_INSTANCE_TOKEN_FILE` | alternativa: caminho do arquivo do token (ex.: `/home/box/secrets/evolution/instances/financeiro.token`, permissão 600; lido só no servidor, nunca commitado/logado) |
| `EVOLUTION_ALLOW_CONNECT` | `false` até o proxy estar aplicado |
| `WHATSAPP_WEBHOOK_URL` | `https://<deploy>/api/whatsapp/webhook` |
| `WHATSAPP_WEBHOOK_SECRET` | segredo aleatório (≥ 24 caracteres) — `openssl rand -base64 32` |

Endpoints usados pelo adaptador (`src/lib/whatsapp/evolution.ts`): `POST /message/sendText/{i}`
(`{"number":"5511...","text":"..."}`), `POST /message/sendMedia/{i}`, `POST /message/sendWhatsAppAudio/{i}`,
`GET /instance/connectionState/{i}`, `GET /instance/connect/{i}` (bloqueado pela flag),
`DELETE /instance/logout/{i}`, `POST /webhook/set/{i}`. Melhoria futura opcional:
**allowlist de IP** da Central no webhook.

### Meta WhatsApp Cloud API (provedor oficial)
1. Crie um app no Meta for Developers, adicione o produto WhatsApp e um número.
2. Gere um token permanente (System User) → `META_WHATSAPP_ACCESS_TOKEN`; anote o
   `META_WHATSAPP_PHONE_NUMBER_ID`, o **App Secret** (`META_WHATSAPP_APP_SECRET`) e defina um
   `META_WHATSAPP_VERIFY_TOKEN`.
3. Webhook: URL `https://<deploy>/api/whatsapp/webhook`, verify token igual ao configurado,
   assine o campo `messages`.
4. `WHATSAPP_PROVIDER=meta` (ou escolha "Meta" em Configurações; uma linha salva em
   `fin_financeiro_whatsapp_config` tem precedência sobre o ambiente, exceto `simulator`).
5. Atenção: fora da janela de 24 h a Meta só permite **templates aprovados** — os alertas,
   lembretes e resumos precisariam de templates (TODO, ver §11).

Comportamento do webhook Meta:
- `GET`: `hub.mode=subscribe` + `hub.verify_token` correto → devolve `hub.challenge` (text/plain, 200); senão 403.
- `POST`: assinatura `X-Hub-Signature-256` inválida ou `META_WHATSAPP_APP_SECRET` ausente → 401.
  Com assinatura válida responde **sempre 200** (mesmo em erro interno), para a Meta não reenviar
  nem desativar o webhook.
- **Vários números na mesma WABA**: só mudanças com `value.metadata.phone_number_id` igual a
  `META_WHATSAPP_PHONE_NUMBER_ID` são processadas; outros números, `statuses` e mensagens que não
  são texto são ignorados. Sem `META_WHATSAPP_PHONE_NUMBER_ID`, ignora tudo (falha fechada). O id
  do ambiente também vence o do banco no envio — nunca se envia de outro número.
- **9º dígito (BR)**: a Meta costuma mandar o `from`/wa_id de celulares sem o 9 (ex.: `552175888692`).
  A busca do remetente usa o número normalizado (`+5521975888692`) e a **resposta vai para o wa_id
  exato** recebido. Envios do cron usam o E.164 cadastrado.
- Erros de envio registram `Meta HTTP <status>: código <code>: <mensagem>` em
  `fin_financeiro_whatsapp_messages.error` (sem token).

| Variável | Valor |
|---|---|
| `WHATSAPP_PROVIDER` | `meta` |
| `META_WHATSAPP_PHONE_NUMBER_ID` | phone_number_id do número do assistente (ex.: `970939662768046`) |
| `META_WHATSAPP_ACCESS_TOKEN` | token permanente do System User |
| `META_WHATSAPP_APP_SECRET` | App Secret do app Meta |
| `META_WHATSAPP_VERIFY_TOKEN` | texto aleatório, igual ao informado no painel da Meta |
| `META_GRAPH_API_VERSION` | opcional, padrão `v21.0` |

### Alertas de vencimento (formato)
- Mensagem 1: texto do alerta (descrição, valor, vencimento, "vence em N dias / amanhã / HOJE").
- Mensagem 2 (e 3): **somente o código** — linha digitável (só dígitos) e/ou Pix copia e cola
  (aparado nas pontas; o BR Code pode conter espaços internos válidos), sem nenhum texto extra.
- Sem código: uma mensagem só, avisando "Código de pagamento indisponível" (e, se veio do
  Open Finance, que o banco não informou boleto/Pix).
- Quando: nos dias `antecedência` (padrão 3, configurável), 1 e 0 antes do vencimento; cada
  alerta é enviado uma única vez por pessoa (`fin_financeiro_notification_log`).
- Para quem: conta/fatura **compartilhada** → todos os membros com telefone; **pessoal** → só o dono.
- Crons (UTC, `vercel.json`): alertas 08:00 BRT, lembrete diário 20:30 BRT, resumo semanal domingo
  09:00 BRT.

---

## 6. Open Finance (Pluggy) — sandbox e produção

- **Por membro**: cada pessoa conecta as próprias contas em **Open Finance**. O `clientUserId` do
  connect token é o id do perfil; ao registrar e ao sincronizar, o servidor confere que o item
  pertence a quem conectou. Guardamos **apenas o item id**.
- A importação roda **como o dono do item** (RLS): contas e cartões entram como **pessoais**;
  transações herdam a visibilidade da conta/cartão; faturas viram **contas a pagar** com
  linha digitável/código de barras/Pix **se o banco expuser** (campos lidos de forma defensiva e
  validados antes de salvar). Auto-categorização pelo histórico da família + regras.
- **Modo mock** (`PLUGGY_MODE=mock`, padrão local): botão "Conectar banco simulado" cria um item e
  dispara o mesmo processamento do webhook. Dados: conta corrente, cartão Visa (fatura **com**
  linha digitável + Pix) e cartão Master (fatura **sem** código).
- **Sandbox** (`PLUGGY_MODE=sandbox` + `PLUGGY_CLIENT_ID/SECRET` de um app sandbox da Pluggy):
  o widget mostra os conectores de teste — use **Pluggy Bank** com usuário `user-ok` e senha
  `password-ok`. Confira a URL/versão atual do script do widget (`PLUGGY_CONNECT_SCRIPT_URL`).
- **Produção** (`PLUGGY_MODE=live`): cadastre o webhook **uma vez** pela API de webhooks da Pluggy,
  com URL `https://<deploy>/api/pluggy/webhook` e o header `x-webhook-secret: <PLUGGY_WEBHOOK_SECRET>`
  (eventos `item/created`, `item/updated`, `transactions/created`, `transactions/updated`, `item/deleted`).
  Evite `?secret=` na URL: query strings aparecem em logs de acesso. O connect token só inclui a URL
  com o segredo se `PLUGGY_WEBHOOK_SECRET_IN_URL=true` for definido explicitamente.
  Sincronização diária extra via cron `pluggy-sync`.
- **Pagamentos e transferências**: pagamento de fatura (débito na conta e crédito no cartão) e
  transferências entre contas da mesma pessoa entram com o selo "fora dos relatórios"; estornos no
  cartão reduzem a despesa. **Parcelas**: `billId` → fatura do banco; sem ele, *(n−1)* faturas.
- **Pagar fatura importada** (Contas a pagar): não cria despesa nova — marca a fatura do cartão
  como paga (as compras já estão lançadas).

---

## 7. Gmail — faturas por pessoa

1. Google Cloud Console → crie um projeto → ative a **Gmail API** → tela de consentimento
   (usuários de teste: os dois e-mails) → credencial **OAuth Client (Web)** com redirect
   `https://<deploy>/api/integrations/gmail/callback`.
2. `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `OAUTH_STATE_SECRET`, `TOKEN_ENCRYPTION_KEY`.
3. Cada pessoa: Configurações › Gmail › **Conectar Gmail** (escopo somente leitura).
   O refresh token é cifrado e salvo por RPC do próprio usuário.
4. O cron `gmail-sync` busca e-mails com PDF de fatura dos últimos 45 dias, deduplica por sha256,
   guarda no bucket privado `fin_financeiro_faturas` e coloca os itens na **Revisão** do dono.
5. **PDF com senha**: cadastre a senha dos PDFs em Configurações › Gmail (guardada cifrada,
   nunca exibida) para o sync ler faturas protegidas; sem ela, o documento aparece na Revisão como
   "PDF protegido por senha" e pode ser reenviado manualmente com a senha (usada só em memória).
6. Modo local: `GMAIL_MODE=mock` gera uma fatura de exemplo.

---

## Go-live (Supabase + Vercel)

> ⚠️ **O projeto `bqbmvurwmsgitundbdxt` (sa-east-1, Postgres 15) é um banco de PRODUÇÃO
> COMPARTILHADO** com outros apps (~150 tabelas; `auth.users` compartilhado). Revise tudo antes
> de aplicar. Faça um backup/snapshot antes. Nada foi aplicado nele durante este trabalho.

### 1. Revisar as migrations
`supabase/migrations/` (8 arquivos, nesta ordem):

| Arquivo | Conteúdo |
|---|---|
| `20261119000100_fin_financeiro_core_schema.sql` | tabelas `fin_financeiro_` principais |
| `20261119000200_fin_financeiro_functions.sql` | funções/triggers/RPCs `fin_financeiro_` (SECURITY DEFINER com `search_path=''`) |
| `20261119000300_fin_financeiro_rls.sql` | RLS + grants (anon sem acesso) |
| `20261119000400_fin_financeiro_invest_bridge.sql` | funções de leitura das tabelas `invest_*` (não altera `invest_*`) |
| `20261119000500_fin_financeiro_bills_goals_prefs.sql` | contas a pagar (boleto/Pix), metas, busca, patrimônio, preferências |
| `20261119000600_fin_financeiro_whatsapp_log_pluggy_sync.sql` | log do WhatsApp e grants de sincronização |
| `20261120000700_fin_financeiro_pdf_password_invoice_dates.sql` | senha de PDF cifrada por perfil e recálculo de faturas abertas |
| `20261120000800_fin_financeiro_self_onboarding.sql` | "Criar minha família" (`fin_financeiro_private.fin_financeiro_create_my_household`) |

Garantias: somente `create ... fin_financeiro_*` (tabelas, índices, funções, triggers, políticas) e o
schema novo `fin_financeiro_private` (RPCs de login/convite, não exposto pela Data API);
**nenhum** `drop`/`alter`/`insert`/`update` em tabelas existentes; **nenhum** trigger em
`auth.users`; não reutiliza nomes `fin_joao_*`; não cria `invest_*`. (Um teste automático
confere que as migrations não criam objetos fora do prefixo `fin_financeiro_`.)

Antes de aplicar, confira que nenhum dos nomes NOVOS já existe (deve voltar vazio):
```sql
select tablename from pg_tables where schemaname = 'public' and tablename in ('fin_financeiro_bank_accounts','fin_financeiro_bills','fin_financeiro_card_purchases','fin_financeiro_cards','fin_financeiro_categories','fin_financeiro_entries','fin_financeiro_gmail_connections','fin_financeiro_goal_contributions','fin_financeiro_goals','fin_financeiro_household_invites','fin_financeiro_household_members','fin_financeiro_household_settings','fin_financeiro_households','fin_financeiro_invest_links','fin_financeiro_invoice_documents','fin_financeiro_invoices','fin_financeiro_login_attempts','fin_financeiro_networth_snapshots','fin_financeiro_notification_log','fin_financeiro_oauth_tokens','fin_financeiro_pdf_passwords','fin_financeiro_pluggy_items','fin_financeiro_profile_prefs','fin_financeiro_profiles','fin_financeiro_review_queue','fin_financeiro_search_history','fin_financeiro_whatsapp_config','fin_financeiro_whatsapp_inbound','fin_financeiro_whatsapp_messages','fin_financeiro_whatsapp_numbers','fin_financeiro_whatsapp_secrets');
select n.nspname, p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
 where p.proname like 'fin\_financeiro\_%' or n.nspname = 'fin_financeiro_private';
select 1 from pg_namespace where nspname = 'fin_financeiro_private';
select 1 from pg_roles where rolname = 'fin_financeiro_app';
```
A busca por `like 'fin\_financeiro\_%'` em **tabelas** vai mostrar as 5 tabelas reservadas do app
antigo (`fin_financeiro_categorias`, `_configuracoes`, `_empresas`, `_lancamentos`, `_usuarios`):
isso é esperado — elas não são tocadas.

### 2. Aplicar
**Recomendado — SQL Editor do Supabase**: cole e execute **um arquivo por vez, na ordem**.

Alternativa — CLI (cuidado: o projeto pode ter histórico de migrations de outros apps):
```bash
supabase link --project-ref bqbmvurwmsgitundbdxt
supabase db push --dry-run     # confira EXATAMENTE o que será aplicado
supabase db push
```
Se o `db push` reclamar de migrations remotas desconhecidas, **não** use `migration repair`
às cegas — prefira o SQL Editor.

Alternativa — psql: `psql "$DATABASE_URL_ADMIN" -v ON_ERROR_STOP=1 -1 -f <arquivo>` para cada arquivo.

Confira que o schema `fin_financeiro_private` **não** está na lista de schemas expostos
(Settings › API › Exposed schemas — o padrão é só `public` e `graphql_public`).

### 2b. Papel de conexão do app (`fin_financeiro_app`)
1. Abra `supabase/manual/fin_financeiro_app_role.sql`, troque `<SENHA-FORTE>` por uma senha aleatória
   (`openssl rand -base64 32`) **sem salvar o arquivo com a senha** e execute no SQL Editor.
2. As consultas de conferência no fim do arquivo devem retornar `f, t, t, t`.
3. Confira também: `select has_schema_privilege('service_role', 'public', 'CREATE');` — se vier
   `t`, saiba que o Supabase permite `CREATE` no schema public ao `service_role`; o app nunca faz
   DDL, mas isso faz parte da limitação conhecida do `service_role` (§0).
4. `DATABASE_URL` (Vercel) = `postgres://fin_financeiro_app.<project-ref>:<senha>@aws-0-sa-east-1.pooler.supabase.com:6543/postgres`.
5. Se o `grant anon, authenticated, service_role to fin_financeiro_app` for recusado pelo Supabase, **não**
   use o papel `postgres` no app: abra um chamado/consulte a documentação de papéis customizados
   do Supabase antes do go-live.

### 3. Storage (opcional por enquanto)
Só é necessário para o upload de PDFs de fatura — e só funciona com `SUPABASE_SERVICE_ROLE_KEY`.
Sem a chave o app funciona normalmente e mostra "Upload de PDF indisponível" na Revisão.
Quando houver a chave: crie manualmente o bucket **privado** `fin_financeiro_faturas` (Storage › New bucket, sem acesso público).
O app não cria nem altera buckets. Os arquivos ficam em `<família>/<usuário>/<sha256>.pdf` e só
são lidos pelo servidor depois de a RLS confirmar que o documento é do usuário.

### 4. Contas e família
- As contas do Luiz e da esposa precisam existir no **Supabase Auth** (podem ser contas que já
  usam em outros apps — o `auth.users` é compartilhado). Para criar: Authentication › Users ›
  Add user (senha forte, ≥ 12 caracteres).
- **Caminho recomendado (pelo app)**: o Luiz entra no painel → como ainda não tem família, vê
  **"Criar minha família"** → informa o nome da família e o nome dele → vira dono e cai no
  `/painel`. Em **Configurações › Família › Gerar link de convite**, ele envia o link à esposa,
  que abre `/convite/<token>` logada com a conta dela.
- Depois que os dois estiverem dentro, opcionalmente defina `SELF_ONBOARDING_ENABLED=false` na
  Vercel (novos acessos só por convite).
- Alternativa por script (escreve somente em tabelas `fin_financeiro_`):
  ```bash
  DATABASE_URL_ADMIN="postgres://..." npm run bootstrap -- --owner-email luiz@... --owner-name Luiz \
    --household "Família do Luiz" --member-email esposa@... --member-name "<nome>"        # dry-run
  DATABASE_URL_ADMIN="postgres://..." npm run bootstrap -- ... --yes                      # aplica
  ```

### 5. Vercel
1. Importe o repositório (framework Next.js; região `gru1` em `vercel.json`).
2. Variáveis (todas documentadas em `.env.example`): `APP_URL`, `DATABASE_URL` (**papel `fin_financeiro_app`**,
   pooler em modo transaction, porta 6543 — nunca o `postgres`; `DATABASE_URL_ADMIN` **não** vai
   para a Vercel), `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`,
   `LOGIN_RATE_LIMIT_SECRET`, `TOKEN_ENCRYPTION_KEY`, `CRON_SECRET`, `OAUTH_STATE_SECRET`,
   `STORAGE_DRIVER=supabase`, `SELF_ONBOARDING_ENABLED`, Gmail, Pluggy, WhatsApp.
   `SUPABASE_SERVICE_ROLE_KEY` é **opcional** (só para o upload de PDF).
   **Nunca** defina `LOCAL_DEV_AUTH` na Vercel (o app recusa).
3. Deploy. Os crons de `vercel.json` passam a chamar `/api/cron/*` com `Authorization: Bearer $CRON_SECRET`
   (no plano Hobby os crons são diários — os horários escolhidos já respeitam isso).
4. Configure os webhooks (WhatsApp §5, Pluggy §6) e o OAuth do Google (§7).

### 6. Opcional — importar contas do antigo "fincontrol"
`scripts/import-bills.ts` **lê** `bills`/`wallets` (somente SELECT) e grava em `fin_financeiro_bills`
(origem `importacao`, `external_id = bills:<id>`, idempotente). Nunca roda sozinho; sem `--apply`
é só simulação:
```bash
DATABASE_URL_ADMIN=... npm run import:bills -- --source-user <uuid do dono das bills> --member <uuid do membro> [--visibility pessoal] --apply
```

---

## 9. Segurança

- **RLS em todas as tabelas `fin_financeiro_`**, por pertencimento: a função `fin_financeiro_is_member()` consulta
  `fin_financeiro_household_members`. Lançamentos/contas/cartões/metas/contas a pagar: compartilhado = família
  vê; pessoal = só o dono. Fila de revisão, documentos, Gmail, Open Finance, busca e preferências:
  só o dono. FKs compostas impedem referenciar dados de outra família; triggers validam que o
  cartão/conta usados são visíveis a quem lança.
- **Cadastro não concede nada**: sem trigger em `auth.users`; vínculo apenas por
  `fin_financeiro_accept_invite` (token de uso único, só hash no banco, expira em 7 dias, limite de 2
  membros), `fin_financeiro_bootstrap_household` (somente service role) ou o onboarding
  explícito `fin_financeiro_private.fin_financeiro_create_my_household` (usuário logado sem família
  cria a SUA família; não dá acesso a nenhuma outra).
- **anon** sem privilégio em nenhuma tabela; só pode chamar as RPCs de limite de login e de
  informação do convite.
- **Conexão do app**: papel `fin_financeiro_app` **NOINHERIT** — sem `SET ROLE` não tem privilégio. Por
  transação o app assume `authenticated` + claim `sub` (painel, RLS), `anon` (login/convite, só
  RPCs de `fin_financeiro_private`) ou `service_role` (só DML). Migrations e scripts administrativos usam outra
  credencial (`DATABASE_URL_ADMIN` / SQL Editor), nunca a do app.
- **RPCs para anon fora da API**: `fin_financeiro_login_failures`, `fin_financeiro_record_login_attempt` e
  `fin_financeiro_invite_info` ficam em `fin_financeiro_private`, que o PostgREST não expõe. `fin_financeiro_invite_info` poderia
  ficar no `public` (só lê com um token de 64 hex, inviável por força bruta), mas foi movida também
  para reduzir a superfície exposta.
- **`service_role`** (via `withService()`) usado somente em:
  1. crons (`/api/cron/*`);
  2. webhooks: deduplicação, identificação do remetente e filtro de instância (WhatsApp),
     localização do item (Pluggy) — o processamento em si roda **como o membro** (RLS);
  3. registro das mensagens enviadas no `fin_financeiro_whatsapp_messages` (inclui o botão "Testar" do dono);
  4. leitura da senha de PDF cifrada pelo job do Gmail;
  5. Storage em produção (upload/leitura de PDF, com a service key — opcional), sempre depois de a RLS
     autorizar o documento;
  6. somente local: verificador de senha do modo `LOCAL_DEV_AUTH` (shim `auth.users`), botões de
     jobs do simulador e "Sincronizar agora (mock)" do Gmail.
  **Limitação**: no Supabase o `service_role` também alcança tabelas de outros apps (ver §0).
- **Sessão**: cookies httpOnly (`@supabase/ssr`; `getUser()` valida o JWT no Auth a cada requisição).
- **Login**: bloqueio após 5 falhas por e-mail ou 20 por IP em 15 min (chaves HMAC), mensagens
  genéricas, senha mínima de 12 caracteres (letras e números) nos fluxos do app.
- **Webhooks e crons falham fechados**; comparações em tempo constante; payloads validados com zod
  e com limite de tamanho.
- **Segredos**: só no servidor; tokens OAuth e do WhatsApp cifrados com AES-256-GCM; `.env*`
  ignorados pelo git (exceto `.env.example` com placeholders).
- **Cabeçalhos**: HSTS, `X-Frame-Options: DENY`, `frame-ancestors 'none'`, `nosniff`, Referrer-Policy,
  Permissions-Policy.

---

## 10. Riscos e pontos de atenção

### ⚠️ ~70 tabelas públicas SEM RLS no projeto Supabase compartilhado
O projeto `bqbmvurwmsgitundbdxt` tem cerca de **70 tabelas no schema `public` com RLS
DESABILITADO** (de outros apps). Como a **anon key** desses apps é pública (vai no navegador),
**qualquer pessoa com a URL do projeto e a anon key pode ler — e possivelmente alterar — essas
tabelas pela API REST do Supabase**, sem login. Isso pode incluir dados financeiros/pessoais
(ex.: `bills`, `wallets`, `fin_joao_*`, `invest_*` conforme a configuração de cada uma).

- Este trabalho **não alterou nada** disso (fora do escopo e proibido mexer em tabelas existentes).
- As tabelas `fin_financeiro_` **não** são afetadas: todas têm RLS e nenhuma concede acesso ao `anon`.
- **Recomendação**: revisar com urgência no painel (Database › Tables, ou o *Security Advisor* do
  Supabase), decidir app por app: habilitar RLS com políticas adequadas, revogar privilégios de
  `anon`/`authenticated` das tabelas que não precisam de acesso pela API, ou mover tabelas internas
  para um schema não exposto. Faça isso com cuidado para não quebrar os outros apps.

### Outros
- **`auth.users` compartilhado**: configurações globais de Auth (tamanho mínimo de senha, limites
  de taxa, cadastro aberto) afetam todos os apps. O app exige família para qualquer acesso, mas
  ajuste os limites de taxa do Supabase Auth — eles também protegem chamadas feitas diretamente
  à API de Auth (o limite do app cobre o login pelo painel).
- **Conexão direta ao Postgres** (`DATABASE_URL` com `fin_financeiro_app`): guarde só na Vercel. Mesmo
  vazada, sem `SET ROLE` ela não lê nada — mas permite assumir `service_role`; trate como segredo
  de alto valor. `DATABASE_URL_ADMIN` (postgres) só na máquina de quem administra, nunca na Vercel.
- **Faturas de cartão via Open Finance**: a maioria dos bancos **não expõe** linha digitável/Pix da
  fatura; nesses casos o alerta avisa que o código está indisponível.
- **Evolution/Baileys** é uma API não oficial do WhatsApp: risco de bloqueio do número; use
  número dedicado e o proxy residencial recomendado pela Central.
- **Dados de investimentos**: os preços vêm do `invest_price_cache` mantido pelo invest-tracker.

---

## 11. Pendências / TODO

- **PDF com senha**: resolvido na revisão 1 (detecção, senha em memória no upload e senha cifrada
  por perfil para o Gmail). Formatos de criptografia exóticos que o pdf.js não abra continuam com
  `parse_error`.
- **Parser de fatura**: heurística genérica para o layout mais comum; layouts específicos de
  cada banco podem precisar de ajustes (os itens sempre passam pela Revisão).
- **Meta Cloud API**: mensagens de template para alertas/lembretes fora da janela de 24 h.
- **Investimentos**: provedores de preço (brapi/Finnhub/CoinGecko) e importadores CSV/XP continuam
  no invest-tracker; este app só lê. Para quem não usa o invest-tracker com o mesmo login, não há
  posições.
- **Pluggy Connect**: confirmar a URL/versão atual do script do widget no deploy.
- **Webhook Evolution**: allowlist de IP da Central (opcional).

---

## 12. Capturas de tela

Geradas localmente com `npm run screenshots` (Playwright, banco local com seed):

| Tela | Arquivo |
|---|---|
| Login | ![login](screenshots/00-login.png) |
| Painel (escuro) | ![painel](screenshots/01-painel-escuro.png) |
| Lançamentos | ![lançamentos](screenshots/02-lancamentos.png) |
| Cartões | ![cartões](screenshots/03-cartoes.png) |
| Contas a pagar (boleto/Pix) | ![contas](screenshots/04-contas-a-pagar.png) |
| Revisão | ![revisão](screenshots/05-revisao.png) |
| Open Finance (mock) | ![open finance](screenshots/06-open-finance.png) |
| Lançamentos importados: pagamento de fatura / transferência fora dos relatórios | ![fora dos relatórios](screenshots/06b-lancamentos-fora-dos-relatorios.png) |
| Metas | ![metas](screenshots/07-metas.png) |
| Relatórios | ![relatórios](screenshots/08-relatorios.png) |
| Patrimônio | ![patrimônio](screenshots/09-patrimonio.png) |
| Investimentos | ![investimentos](screenshots/10-investimentos.png) |
| Busca | ![busca](screenshots/11-busca.png) |
| Configurações › WhatsApp | ![configurações](screenshots/12-configuracoes-whatsapp.png) |
| Simulador (alertas e códigos em mensagens separadas) | ![simulador](screenshots/13-simulador-whatsapp.png) |
| Simulador (código Pix/linha digitável) | ![simulador códigos](screenshots/14-simulador-alertas-codigos.png) |
| Painel da esposa (tema claro) | ![claro](screenshots/15-painel-claro-esposa.png) |
| Celular — painel | ![mobile](screenshots/16-mobile-painel.png) |
| Celular — contas a pagar | ![mobile contas](screenshots/17-mobile-contas.png) |
| Onboarding — "Criar minha família" | ![onboarding](screenshots/18-onboarding-criar-familia.png) |
