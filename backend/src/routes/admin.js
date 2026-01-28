const express = require('express');
const { supabaseAdmin, supabase } = require('../config/supabase');

const router = express.Router();

// Middleware de autenticação admin (chave especial ou super admin)
const adminAuthMiddleware = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    const adminKey = req.headers['x-admin-key'];

    // Verificar chave admin (para acesso sem login)
    if (adminKey === process.env.ADMIN_SECRET_KEY) {
      req.isAdmin = true;
      return next();
    }

    // Verificar token de usuário admin
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.split(' ')[1];
      const { data: { user }, error } = await supabase.auth.getUser(token);

      if (error || !user) {
        return res.status(401).json({ error: 'Token inválido' });
      }

      const { data: userData } = await supabaseAdmin
        .from('usuarios')
        .select('role')
        .eq('id', user.id)
        .single();

      if (userData?.role === 'super_admin') {
        req.isAdmin = true;
        req.userId = user.id;
        return next();
      }
    }

    return res.status(403).json({ 
      error: 'Acesso negado. Credenciais de administrador necessárias.',
      hint: 'Use x-admin-key no header ou faça login como super_admin'
    });
  } catch (error) {
    console.error('Erro no middleware admin:', error);
    return res.status(500).json({ error: 'Erro interno de autenticação' });
  }
};

// GET /api/admin/empresas - Listar todas as empresas
router.get('/empresas', adminAuthMiddleware, async (req, res) => {
  try {
    const { page = 1, limit = 20, search } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);

    let query = supabaseAdmin
      .from('empresas')
      .select('*', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(offset, offset + parseInt(limit) - 1);

    if (search) {
      query = query.ilike('nome', `%${search}%`);
    }

    const { data: empresas, error, count } = await query;

    if (error) {
      return res.status(400).json({ error: 'Erro ao buscar empresas', details: error.message });
    }

    // Buscar quantidade de usuários e lançamentos por empresa
    const empresasComStats = await Promise.all(
      empresas.map(async (empresa) => {
        const [usuariosResult, lancamentosResult] = await Promise.all([
          supabaseAdmin
            .from('usuarios')
            .select('id', { count: 'exact' })
            .eq('empresa_id', empresa.id),
          supabaseAdmin
            .from('lancamentos')
            .select('id', { count: 'exact' })
            .eq('empresa_id', empresa.id)
        ]);

        return {
          ...empresa,
          total_usuarios: usuariosResult.count || 0,
          total_lancamentos: lancamentosResult.count || 0
        };
      })
    );

    res.json({
      data: empresasComStats,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: count,
        totalPages: Math.ceil(count / parseInt(limit))
      }
    });
  } catch (error) {
    console.error('Erro ao listar empresas:', error);
    res.status(500).json({ error: 'Erro interno' });
  }
});

// GET /api/admin/empresas/:id - Detalhes de uma empresa
router.get('/empresas/:id', adminAuthMiddleware, async (req, res) => {
  try {
    const { id } = req.params;

    const { data: empresa, error } = await supabaseAdmin
      .from('empresas')
      .select('*')
      .eq('id', id)
      .single();

    if (error || !empresa) {
      return res.status(404).json({ error: 'Empresa não encontrada' });
    }

    // Buscar usuários da empresa
    const { data: usuarios } = await supabaseAdmin
      .from('usuarios')
      .select('id, nome, email, role, created_at')
      .eq('empresa_id', id);

    // Buscar estatísticas
    const { data: lancamentos } = await supabaseAdmin
      .from('lancamentos')
      .select('tipo, valor')
      .eq('empresa_id', id);

    let totalReceitas = 0;
    let totalDespesas = 0;
    lancamentos?.forEach(l => {
      if (l.tipo === 'receita') totalReceitas += parseFloat(l.valor);
      else totalDespesas += parseFloat(l.valor);
    });

    res.json({
      empresa,
      usuarios: usuarios || [],
      estatisticas: {
        total_usuarios: usuarios?.length || 0,
        total_lancamentos: lancamentos?.length || 0,
        total_receitas: totalReceitas,
        total_despesas: totalDespesas,
        resultado: totalReceitas - totalDespesas
      }
    });
  } catch (error) {
    console.error('Erro ao buscar empresa:', error);
    res.status(500).json({ error: 'Erro interno' });
  }
});

// GET /api/admin/stats - Estatísticas gerais do sistema
router.get('/stats', adminAuthMiddleware, async (req, res) => {
  try {
    const [empresasResult, usuariosResult, lancamentosResult] = await Promise.all([
      supabaseAdmin.from('empresas').select('id', { count: 'exact' }),
      supabaseAdmin.from('usuarios').select('id', { count: 'exact' }),
      supabaseAdmin.from('lancamentos').select('id', { count: 'exact' })
    ]);

    // Empresas criadas nos últimos 30 dias
    const trintaDiasAtras = new Date();
    trintaDiasAtras.setDate(trintaDiasAtras.getDate() - 30);

    const { count: novasEmpresas } = await supabaseAdmin
      .from('empresas')
      .select('id', { count: 'exact' })
      .gte('created_at', trintaDiasAtras.toISOString());

    res.json({
      total_empresas: empresasResult.count || 0,
      total_usuarios: usuariosResult.count || 0,
      total_lancamentos: lancamentosResult.count || 0,
      novas_empresas_30_dias: novasEmpresas || 0
    });
  } catch (error) {
    console.error('Erro ao buscar estatísticas:', error);
    res.status(500).json({ error: 'Erro interno' });
  }
});

// DELETE /api/admin/empresas/:id - Remover empresa (cuidado!)
router.delete('/empresas/:id', adminAuthMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const { confirmar } = req.body;

    if (confirmar !== 'CONFIRMAR_EXCLUSAO') {
      return res.status(400).json({ 
        error: 'Confirmação necessária',
        hint: 'Envie { "confirmar": "CONFIRMAR_EXCLUSAO" } no body'
      });
    }

    // Buscar usuários para deletar do auth
    const { data: usuarios } = await supabaseAdmin
      .from('usuarios')
      .select('id')
      .eq('empresa_id', id);

    // Deletar empresa (cascade vai deletar categorias, lançamentos, etc)
    const { error } = await supabaseAdmin
      .from('empresas')
      .delete()
      .eq('id', id);

    if (error) {
      return res.status(400).json({ error: 'Erro ao excluir empresa', details: error.message });
    }

    // Deletar usuários do auth
    if (usuarios) {
      for (const usuario of usuarios) {
        await supabaseAdmin.auth.admin.deleteUser(usuario.id);
      }
    }

    res.json({ message: 'Empresa excluída com sucesso' });
  } catch (error) {
    console.error('Erro ao excluir empresa:', error);
    res.status(500).json({ error: 'Erro interno' });
  }
});

module.exports = router;
