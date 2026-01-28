const express = require('express');
const { body, param, validationResult } = require('express-validator');
const { supabaseAdmin } = require('../config/supabase');

const router = express.Router();

// GET /api/categorias - Listar todas as categorias da empresa
router.get('/', async (req, res) => {
  try {
    const { tipo, ativo } = req.query;
    
    let query = supabaseAdmin
      .from('categorias')
      .select('*')
      .eq('empresa_id', req.user.empresa_id)
      .order('nome', { ascending: true });

    if (tipo) {
      query = query.eq('tipo', tipo);
    }

    if (ativo !== undefined) {
      query = query.eq('ativo', ativo === 'true');
    }

    const { data: categorias, error } = await query;

    if (error) {
      return res.status(400).json({ error: 'Erro ao buscar categorias', details: error.message });
    }

    res.json(categorias);
  } catch (error) {
    console.error('Erro ao buscar categorias:', error);
    res.status(500).json({ error: 'Erro interno' });
  }
});

// GET /api/categorias/:id - Buscar categoria por ID
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const { data: categoria, error } = await supabaseAdmin
      .from('categorias')
      .select('*')
      .eq('id', id)
      .eq('empresa_id', req.user.empresa_id)
      .single();

    if (error || !categoria) {
      return res.status(404).json({ error: 'Categoria não encontrada' });
    }

    res.json(categoria);
  } catch (error) {
    console.error('Erro ao buscar categoria:', error);
    res.status(500).json({ error: 'Erro interno' });
  }
});

// POST /api/categorias - Criar nova categoria
router.post('/', [
  body('nome').notEmpty().withMessage('Nome é obrigatório'),
  body('tipo').isIn(['receita', 'despesa']).withMessage('Tipo deve ser receita ou despesa'),
  body('cor').optional().matches(/^#[0-9A-Fa-f]{6}$/).withMessage('Cor deve ser hexadecimal'),
  body('icone').optional()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { nome, tipo, cor, icone } = req.body;

    // Verificar se já existe categoria com mesmo nome
    const { data: existente } = await supabaseAdmin
      .from('categorias')
      .select('id')
      .eq('empresa_id', req.user.empresa_id)
      .eq('nome', nome)
      .eq('tipo', tipo)
      .single();

    if (existente) {
      return res.status(400).json({ error: 'Já existe uma categoria com esse nome' });
    }

    const { data: categoria, error } = await supabaseAdmin
      .from('categorias')
      .insert({
        empresa_id: req.user.empresa_id,
        nome,
        tipo,
        cor: cor || '#6366f1',
        icone: icone || 'tag'
      })
      .select()
      .single();

    if (error) {
      return res.status(400).json({ error: 'Erro ao criar categoria', details: error.message });
    }

    res.status(201).json({
      message: 'Categoria criada com sucesso',
      categoria
    });
  } catch (error) {
    console.error('Erro ao criar categoria:', error);
    res.status(500).json({ error: 'Erro interno' });
  }
});

// PUT /api/categorias/:id - Atualizar categoria
router.put('/:id', [
  body('nome').optional().notEmpty().withMessage('Nome não pode ser vazio'),
  body('cor').optional().matches(/^#[0-9A-Fa-f]{6}$/).withMessage('Cor deve ser hexadecimal'),
  body('icone').optional(),
  body('ativo').optional().isBoolean()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { id } = req.params;
    const { nome, cor, icone, ativo } = req.body;

    // Verificar se categoria existe e pertence à empresa
    const { data: existente, error: checkError } = await supabaseAdmin
      .from('categorias')
      .select('id')
      .eq('id', id)
      .eq('empresa_id', req.user.empresa_id)
      .single();

    if (checkError || !existente) {
      return res.status(404).json({ error: 'Categoria não encontrada' });
    }

    const updateData = { updated_at: new Date().toISOString() };
    if (nome) updateData.nome = nome;
    if (cor) updateData.cor = cor;
    if (icone) updateData.icone = icone;
    if (ativo !== undefined) updateData.ativo = ativo;

    const { data: categoria, error } = await supabaseAdmin
      .from('categorias')
      .update(updateData)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      return res.status(400).json({ error: 'Erro ao atualizar categoria', details: error.message });
    }

    res.json({
      message: 'Categoria atualizada com sucesso',
      categoria
    });
  } catch (error) {
    console.error('Erro ao atualizar categoria:', error);
    res.status(500).json({ error: 'Erro interno' });
  }
});

// DELETE /api/categorias/:id - Remover categoria
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    // Verificar se categoria existe e pertence à empresa
    const { data: existente, error: checkError } = await supabaseAdmin
      .from('categorias')
      .select('id')
      .eq('id', id)
      .eq('empresa_id', req.user.empresa_id)
      .single();

    if (checkError || !existente) {
      return res.status(404).json({ error: 'Categoria não encontrada' });
    }

    // Verificar se há lançamentos usando esta categoria
    const { data: lancamentos } = await supabaseAdmin
      .from('lancamentos')
      .select('id')
      .eq('categoria_id', id)
      .limit(1);

    if (lancamentos && lancamentos.length > 0) {
      return res.status(400).json({ 
        error: 'Não é possível excluir categoria com lançamentos vinculados',
        suggestion: 'Desative a categoria ou mova os lançamentos para outra categoria'
      });
    }

    const { error } = await supabaseAdmin
      .from('categorias')
      .delete()
      .eq('id', id);

    if (error) {
      return res.status(400).json({ error: 'Erro ao excluir categoria', details: error.message });
    }

    res.json({ message: 'Categoria excluída com sucesso' });
  } catch (error) {
    console.error('Erro ao excluir categoria:', error);
    res.status(500).json({ error: 'Erro interno' });
  }
});

// GET /api/categorias/resumo/custos - Resumo de custos fixos e variáveis
router.get('/resumo/custos', async (req, res) => {
  try {
    const { mes, ano } = req.query;
    
    const dataInicio = mes && ano 
      ? `${ano}-${mes.padStart(2, '0')}-01`
      : new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0];
    
    const dataFim = mes && ano
      ? `${ano}-${mes.padStart(2, '0')}-31`
      : new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0).toISOString().split('T')[0];

    const { data: lancamentos, error } = await supabaseAdmin
      .from('lancamentos')
      .select('valor, fixo_variavel')
      .eq('empresa_id', req.user.empresa_id)
      .eq('tipo', 'despesa')
      .gte('data', dataInicio)
      .lte('data', dataFim);

    if (error) {
      return res.status(400).json({ error: 'Erro ao buscar dados', details: error.message });
    }

    const resumo = {
      total_fixo: 0,
      total_variavel: 0,
      total_geral: 0
    };

    lancamentos.forEach(l => {
      if (l.fixo_variavel === 'fixo') {
        resumo.total_fixo += parseFloat(l.valor);
      } else if (l.fixo_variavel === 'variavel') {
        resumo.total_variavel += parseFloat(l.valor);
      }
      resumo.total_geral += parseFloat(l.valor);
    });

    res.json(resumo);
  } catch (error) {
    console.error('Erro ao buscar resumo:', error);
    res.status(500).json({ error: 'Erro interno' });
  }
});

module.exports = router;
