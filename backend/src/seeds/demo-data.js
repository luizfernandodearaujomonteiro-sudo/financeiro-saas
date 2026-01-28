/**
 * Script para criar dados de demonstração
 * Execute com: npm run seed
 */

require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ Configure SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY no .env');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

// Dados de demonstração para uma confeitaria
const DEMO_EMAIL = 'demo@confeitariadoce.com.br';
const DEMO_SENHA = 'demo123456';

async function seed() {
  console.log('🌱 Iniciando seed de dados de demonstração...\n');

  try {
    // 1. Verificar se já existe
    const { data: existente } = await supabase
      .from('usuarios')
      .select('id')
      .eq('email', DEMO_EMAIL)
      .single();

    if (existente) {
      console.log('⚠️  Dados de demonstração já existem. Pulando...');
      console.log(`📧 Email: ${DEMO_EMAIL}`);
      console.log(`🔑 Senha: ${DEMO_SENHA}`);
      return;
    }

    // 2. Criar usuário no Auth
    console.log('👤 Criando usuário de demonstração...');
    const { data: authData, error: authError } = await supabase.auth.admin.createUser({
      email: DEMO_EMAIL,
      password: DEMO_SENHA,
      email_confirm: true
    });

    if (authError) {
      throw new Error(`Erro ao criar usuário: ${authError.message}`);
    }

    const userId = authData.user.id;
    console.log('✅ Usuário criado');

    // 3. Criar empresa
    console.log('🏢 Criando empresa...');
    const { data: empresa, error: empresaError } = await supabase
      .from('empresas')
      .insert({
        nome: 'Confeitaria Doce Sabor',
        segmento: 'Confeitaria'
      })
      .select()
      .single();

    if (empresaError) throw empresaError;
    console.log('✅ Empresa criada');

    // 4. Criar perfil do usuário
    console.log('📝 Criando perfil...');
    await supabase.from('usuarios').insert({
      id: userId,
      empresa_id: empresa.id,
      nome: 'Maria Silva',
      email: DEMO_EMAIL,
      role: 'admin'
    });
    console.log('✅ Perfil criado');

    // 5. Criar categorias
    console.log('📁 Criando categorias...');
    const categorias = [
      // Receitas
      { empresa_id: empresa.id, nome: 'Vendas de Bolos', tipo: 'receita', cor: '#22c55e', icone: 'cake' },
      { empresa_id: empresa.id, nome: 'Vendas de Doces', tipo: 'receita', cor: '#10b981', icone: 'candy' },
      { empresa_id: empresa.id, nome: 'Encomendas', tipo: 'receita', cor: '#14b8a6', icone: 'clipboard-list' },
      { empresa_id: empresa.id, nome: 'Delivery', tipo: 'receita', cor: '#06b6d4', icone: 'truck' },
      // Despesas
      { empresa_id: empresa.id, nome: 'Aluguel', tipo: 'despesa', cor: '#ef4444', icone: 'home' },
      { empresa_id: empresa.id, nome: 'Ingredientes', tipo: 'despesa', cor: '#f97316', icone: 'shopping-basket' },
      { empresa_id: empresa.id, nome: 'Embalagens', tipo: 'despesa', cor: '#f59e0b', icone: 'package' },
      { empresa_id: empresa.id, nome: 'Funcionários', tipo: 'despesa', cor: '#eab308', icone: 'users' },
      { empresa_id: empresa.id, nome: 'Energia', tipo: 'despesa', cor: '#84cc16', icone: 'zap' },
      { empresa_id: empresa.id, nome: 'Gás', tipo: 'despesa', cor: '#22c55e', icone: 'flame' },
      { empresa_id: empresa.id, nome: 'Marketing', tipo: 'despesa', cor: '#14b8a6', icone: 'megaphone' },
      { empresa_id: empresa.id, nome: 'Manutenção', tipo: 'despesa', cor: '#06b6d4', icone: 'tool' },
      { empresa_id: empresa.id, nome: 'Contador', tipo: 'despesa', cor: '#8b5cf6', icone: 'calculator' },
    ];

    const { data: categoriasInseridas, error: catError } = await supabase
      .from('categorias')
      .insert(categorias)
      .select();

    if (catError) throw catError;
    console.log('✅ Categorias criadas');

    // Mapear categorias por nome
    const catMap = {};
    categoriasInseridas.forEach(c => {
      catMap[c.nome] = c.id;
    });

    // 6. Criar lançamentos de demonstração (últimos 3 meses)
    console.log('💰 Criando lançamentos de demonstração...');
    
    const hoje = new Date();
    const lancamentos = [];

    // Função helper para criar data
    const criarData = (diasAtras) => {
      const data = new Date(hoje);
      data.setDate(data.getDate() - diasAtras);
      return data.toISOString().split('T')[0];
    };

    // Despesas fixas mensais (últimos 3 meses)
    for (let mes = 0; mes < 3; mes++) {
      const diasBase = mes * 30;
      
      // Aluguel
      lancamentos.push({
        empresa_id: empresa.id,
        tipo: 'despesa',
        descricao: `Aluguel - ${mes === 0 ? 'Mês Atual' : mes === 1 ? 'Mês Passado' : '2 Meses Atrás'}`,
        valor: 2500,
        data: criarData(diasBase + 5),
        categoria_id: catMap['Aluguel'],
        fixo_variavel: 'fixo',
        forma_pagamento: 'boleto',
        centro_custo: 'administracao'
      });

      // Energia
      lancamentos.push({
        empresa_id: empresa.id,
        tipo: 'despesa',
        descricao: 'Conta de Energia',
        valor: 450 + Math.random() * 100,
        data: criarData(diasBase + 10),
        categoria_id: catMap['Energia'],
        fixo_variavel: 'fixo',
        forma_pagamento: 'boleto',
        centro_custo: 'producao'
      });

      // Gás
      lancamentos.push({
        empresa_id: empresa.id,
        tipo: 'despesa',
        descricao: 'Gás de Cozinha',
        valor: 180,
        data: criarData(diasBase + 15),
        categoria_id: catMap['Gás'],
        fixo_variavel: 'fixo',
        forma_pagamento: 'dinheiro',
        centro_custo: 'producao'
      });

      // Funcionários
      lancamentos.push({
        empresa_id: empresa.id,
        tipo: 'despesa',
        descricao: 'Pagamento Funcionário - Confeiteira',
        valor: 2200,
        data: criarData(diasBase + 5),
        categoria_id: catMap['Funcionários'],
        fixo_variavel: 'fixo',
        forma_pagamento: 'pix',
        centro_custo: 'producao'
      });

      // Contador
      lancamentos.push({
        empresa_id: empresa.id,
        tipo: 'despesa',
        descricao: 'Honorários Contador',
        valor: 350,
        data: criarData(diasBase + 20),
        categoria_id: catMap['Contador'],
        fixo_variavel: 'fixo',
        forma_pagamento: 'pix',
        centro_custo: 'administracao'
      });
    }

    // Despesas variáveis e receitas (distribuídas nos últimos 60 dias)
    const vendasDiarias = [
      { descricao: 'Bolo de Chocolate 2kg', valor: 120, cat: 'Vendas de Bolos' },
      { descricao: 'Bolo de Cenoura 1.5kg', valor: 85, cat: 'Vendas de Bolos' },
      { descricao: 'Bolo Red Velvet 2kg', valor: 150, cat: 'Vendas de Bolos' },
      { descricao: 'Brigadeiros (100 un)', valor: 80, cat: 'Vendas de Doces' },
      { descricao: 'Beijinhos (50 un)', valor: 45, cat: 'Vendas de Doces' },
      { descricao: 'Bem-casados (30 un)', valor: 90, cat: 'Vendas de Doces' },
      { descricao: 'Encomenda Bolo Casamento', valor: 450, cat: 'Encomendas' },
      { descricao: 'Encomenda Festa Infantil', valor: 280, cat: 'Encomendas' },
      { descricao: 'Delivery Cupcakes', valor: 65, cat: 'Delivery' },
    ];

    const comprasIngredientes = [
      { descricao: 'Farinha de Trigo (10kg)', valor: 45 },
      { descricao: 'Açúcar Refinado (5kg)', valor: 25 },
      { descricao: 'Chocolate em Pó (2kg)', valor: 65 },
      { descricao: 'Ovos (30 un)', valor: 28 },
      { descricao: 'Leite Condensado (cx)', valor: 85 },
      { descricao: 'Creme de Leite (cx)', valor: 72 },
      { descricao: 'Manteiga (2kg)', valor: 55 },
      { descricao: 'Chocolate Nobre (2kg)', valor: 95 },
    ];

    // Gerar receitas (vendas) - mais no início do mês
    for (let dia = 0; dia < 60; dia++) {
      // 2-4 vendas por dia
      const numVendas = 2 + Math.floor(Math.random() * 3);
      for (let v = 0; v < numVendas; v++) {
        const venda = vendasDiarias[Math.floor(Math.random() * vendasDiarias.length)];
        lancamentos.push({
          empresa_id: empresa.id,
          tipo: 'receita',
          descricao: venda.descricao,
          valor: venda.valor * (0.9 + Math.random() * 0.2),
          data: criarData(dia),
          categoria_id: catMap[venda.cat],
          forma_pagamento: ['pix', 'cartao', 'dinheiro'][Math.floor(Math.random() * 3)],
          centro_custo: 'producao'
        });
      }

      // Compras de ingredientes a cada 3-5 dias
      if (dia % 4 === 0) {
        const numCompras = 2 + Math.floor(Math.random() * 3);
        for (let c = 0; c < numCompras; c++) {
          const compra = comprasIngredientes[Math.floor(Math.random() * comprasIngredientes.length)];
          lancamentos.push({
            empresa_id: empresa.id,
            tipo: 'despesa',
            descricao: compra.descricao,
            valor: compra.valor * (0.9 + Math.random() * 0.2),
            data: criarData(dia),
            categoria_id: catMap['Ingredientes'],
            fixo_variavel: 'variavel',
            forma_pagamento: ['pix', 'cartao', 'dinheiro'][Math.floor(Math.random() * 3)],
            centro_custo: 'producao'
          });
        }
      }

      // Embalagens semanais
      if (dia % 7 === 0) {
        lancamentos.push({
          empresa_id: empresa.id,
          tipo: 'despesa',
          descricao: 'Caixas e Embalagens',
          valor: 120 + Math.random() * 50,
          data: criarData(dia),
          categoria_id: catMap['Embalagens'],
          fixo_variavel: 'variavel',
          forma_pagamento: 'cartao',
          centro_custo: 'producao'
        });
      }
    }

    // Marketing mensal
    lancamentos.push({
      empresa_id: empresa.id,
      tipo: 'despesa',
      descricao: 'Anúncios Instagram',
      valor: 200,
      data: criarData(15),
      categoria_id: catMap['Marketing'],
      fixo_variavel: 'variavel',
      forma_pagamento: 'cartao',
      centro_custo: 'administracao'
    });

    // Inserir lançamentos em lotes
    const batchSize = 50;
    for (let i = 0; i < lancamentos.length; i += batchSize) {
      const batch = lancamentos.slice(i, i + batchSize);
      const { error } = await supabase.from('lancamentos').insert(batch);
      if (error) throw error;
    }
    console.log(`✅ ${lancamentos.length} lançamentos criados`);

    // 7. Criar configurações
    console.log('⚙️  Criando configurações...');
    await supabase.from('configuracoes').insert({
      empresa_id: empresa.id,
      moeda: 'BRL',
      dia_inicio_mes: 1,
      periodo_padrao: 'mes_atual'
    });
    console.log('✅ Configurações criadas');

    console.log('\n========================================');
    console.log('🎉 Seed concluído com sucesso!');
    console.log('========================================');
    console.log(`📧 Email: ${DEMO_EMAIL}`);
    console.log(`🔑 Senha: ${DEMO_SENHA}`);
    console.log(`🏢 Empresa: Confeitaria Doce Sabor`);
    console.log('========================================\n');

  } catch (error) {
    console.error('❌ Erro no seed:', error);
    process.exit(1);
  }
}

seed();
