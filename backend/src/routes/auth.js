const express = require('express');
const { body, validationResult } = require('express-validator');
const { supabase, supabaseAdmin } = require('../config/supabase');

const router = express.Router();

// Validações
const cadastroValidation = [
  body('empresa_nome').notEmpty().withMessage('Nome da empresa é obrigatório'),
  body('segmento').optional(),
  body('usuario_nome').notEmpty().withMessage('Nome do usuário é obrigatório'),
  body('email').isEmail().withMessage('Email inválido'),
  body('senha').isLength({ min: 6 }).withMessage('Senha deve ter no mínimo 6 caracteres')
];

const loginValidation = [
  body('email').isEmail().withMessage('Email inválido'),
  body('senha').notEmpty().withMessage('Senha é obrigatória')
];

// POST /api/auth/cadastro - Cadastrar nova empresa + usuário
router.post('/cadastro', cadastroValidation, async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { empresa_nome, segmento, usuario_nome, email, senha } = req.body;

    // 1. Criar usuário no Supabase Auth
    const { data: authData, error: authError } = await supabase.auth.signUp({
      email,
      password: senha
    });

    if (authError) {
      return res.status(400).json({ 
        error: 'Erro ao criar usuário',
        details: authError.message 
      });
    }

    const userId = authData.user.id;

    // 2. Criar empresa (usando admin para bypassar RLS)
    const { data: empresa, error: empresaError } = await supabaseAdmin
      .from('empresas')
      .insert({
        nome: empresa_nome,
        segmento: segmento || null
      })
      .select()
      .single();

    if (empresaError) {
      // Rollback: deletar usuário criado
      await supabaseAdmin.auth.admin.deleteUser(userId);
      return res.status(400).json({ 
        error: 'Erro ao criar empresa',
        details: empresaError.message 
      });
    }

    // 3. Criar perfil do usuário
    const { error: usuarioError } = await supabaseAdmin
      .from('usuarios')
      .insert({
        id: userId,
        empresa_id: empresa.id,
        nome: usuario_nome,
        email: email,
        role: 'admin' // Primeiro usuário é admin
      });

    if (usuarioError) {
      // Rollback
      await supabaseAdmin.from('empresas').delete().eq('id', empresa.id);
      await supabaseAdmin.auth.admin.deleteUser(userId);
      return res.status(400).json({ 
        error: 'Erro ao criar perfil de usuário',
        details: usuarioError.message 
      });
    }

    // 4. Criar categorias padrão
    const categoriasPadrao = [
      // Receitas
      { empresa_id: empresa.id, nome: 'Vendas', tipo: 'receita', cor: '#22c55e', icone: 'shopping-cart' },
      { empresa_id: empresa.id, nome: 'Serviços', tipo: 'receita', cor: '#10b981', icone: 'briefcase' },
      { empresa_id: empresa.id, nome: 'Outros Recebimentos', tipo: 'receita', cor: '#14b8a6', icone: 'plus-circle' },
      // Despesas
      { empresa_id: empresa.id, nome: 'Aluguel', tipo: 'despesa', cor: '#ef4444', icone: 'home' },
      { empresa_id: empresa.id, nome: 'Salários', tipo: 'despesa', cor: '#f97316', icone: 'users' },
      { empresa_id: empresa.id, nome: 'Insumos', tipo: 'despesa', cor: '#f59e0b', icone: 'package' },
      { empresa_id: empresa.id, nome: 'Marketing', tipo: 'despesa', cor: '#eab308', icone: 'megaphone' },
      { empresa_id: empresa.id, nome: 'Energia', tipo: 'despesa', cor: '#84cc16', icone: 'zap' },
      { empresa_id: empresa.id, nome: 'Internet/Telefone', tipo: 'despesa', cor: '#22c55e', icone: 'wifi' },
      { empresa_id: empresa.id, nome: 'Contador', tipo: 'despesa', cor: '#14b8a6', icone: 'calculator' },
      { empresa_id: empresa.id, nome: 'Manutenção', tipo: 'despesa', cor: '#06b6d4', icone: 'tool' },
      { empresa_id: empresa.id, nome: 'Impostos', tipo: 'despesa', cor: '#8b5cf6', icone: 'file-text' },
      { empresa_id: empresa.id, nome: 'Outras Despesas', tipo: 'despesa', cor: '#6366f1', icone: 'minus-circle' }
    ];

    await supabaseAdmin.from('categorias').insert(categoriasPadrao);

    // 5. Criar configurações padrão
    await supabaseAdmin.from('configuracoes').insert({
      empresa_id: empresa.id,
      moeda: 'BRL',
      dia_inicio_mes: 1,
      periodo_padrao: 'mes_atual'
    });

    res.status(201).json({
      message: 'Cadastro realizado com sucesso!',
      user: {
        id: userId,
        email: email,
        nome: usuario_nome
      },
      empresa: {
        id: empresa.id,
        nome: empresa.nome
      }
    });

  } catch (error) {
    console.error('Erro no cadastro:', error);
    res.status(500).json({ error: 'Erro interno no cadastro' });
  }
});

// POST /api/auth/login - Login
router.post('/login', loginValidation, async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { email, senha } = req.body;

    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password: senha
    });

    if (error) {
      return res.status(401).json({ 
        error: 'Credenciais inválidas',
        details: error.message 
      });
    }

    // Buscar dados do usuário
    const { data: usuario, error: userError } = await supabaseAdmin
      .from('usuarios')
      .select('*, empresas(*)')
      .eq('id', data.user.id)
      .single();

    if (userError || !usuario) {
      return res.status(401).json({ 
        error: 'Usuário não encontrado no sistema' 
      });
    }

    res.json({
      message: 'Login realizado com sucesso!',
      session: {
        access_token: data.session.access_token,
        refresh_token: data.session.refresh_token,
        expires_at: data.session.expires_at
      },
      user: {
        id: usuario.id,
        nome: usuario.nome,
        email: usuario.email,
        role: usuario.role
      },
      empresa: {
        id: usuario.empresas.id,
        nome: usuario.empresas.nome,
        segmento: usuario.empresas.segmento
      }
    });

  } catch (error) {
    console.error('Erro no login:', error);
    res.status(500).json({ error: 'Erro interno no login' });
  }
});

// POST /api/auth/logout - Logout
router.post('/logout', async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.split(' ')[1];
      await supabase.auth.signOut(token);
    }

    res.json({ message: 'Logout realizado com sucesso' });
  } catch (error) {
    console.error('Erro no logout:', error);
    res.status(500).json({ error: 'Erro interno no logout' });
  }
});

// POST /api/auth/refresh - Renovar token
router.post('/refresh', async (req, res) => {
  try {
    const { refresh_token } = req.body;

    if (!refresh_token) {
      return res.status(400).json({ error: 'Refresh token é obrigatório' });
    }

    const { data, error } = await supabase.auth.refreshSession({
      refresh_token
    });

    if (error) {
      return res.status(401).json({ 
        error: 'Não foi possível renovar a sessão',
        details: error.message 
      });
    }

    res.json({
      session: {
        access_token: data.session.access_token,
        refresh_token: data.session.refresh_token,
        expires_at: data.session.expires_at
      }
    });

  } catch (error) {
    console.error('Erro ao renovar token:', error);
    res.status(500).json({ error: 'Erro interno ao renovar token' });
  }
});

// GET /api/auth/me - Dados do usuário atual
router.get('/me', async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Token não fornecido' });
    }

    const token = authHeader.split(' ')[1];
    const { data: { user }, error } = await supabase.auth.getUser(token);

    if (error || !user) {
      return res.status(401).json({ error: 'Token inválido' });
    }

    const { data: usuario, error: userError } = await supabaseAdmin
      .from('usuarios')
      .select('*, empresas(*)')
      .eq('id', user.id)
      .single();

    if (userError || !usuario) {
      return res.status(404).json({ error: 'Usuário não encontrado' });
    }

    res.json({
      user: {
        id: usuario.id,
        nome: usuario.nome,
        email: usuario.email,
        role: usuario.role
      },
      empresa: {
        id: usuario.empresas.id,
        nome: usuario.empresas.nome,
        segmento: usuario.empresas.segmento
      }
    });

  } catch (error) {
    console.error('Erro ao buscar usuário:', error);
    res.status(500).json({ error: 'Erro interno' });
  }
});

module.exports = router;
