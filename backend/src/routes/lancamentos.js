const express = require('express');
const { body, query, validationResult } = require('express-validator');
const { supabaseAdmin } = require('../config/supabase');

const router = express.Router();

// GET /api/lancamentos - Listar lançamentos com filtros
router.get('/', async (req, res) => {
  try {
    const { 
      tipo, 
      categoria_id, 
      forma_pagamento,
      fixo_variavel,
      data_inicio, 
      data_fim,
      page = 1,
      limit = 50
    } = req.query;

    let queryBuilder = supabaseAdmin
      .from('lancamentos')
      .select('*, categorias(id, nome, cor, icone)', { count: 'exact' })
      .eq('empresa_id', req.user.empresa_id)
      .order('data', { ascending: false })
      .order('created_at', { ascending: false });

    // Aplicar filtros
    if (tipo) {
      queryBuilder = queryBuilder.eq('tipo', tipo);
    }

    if (categoria_id) {
      queryBuilder = queryBuilder.eq('categoria_id', categoria_id);
    }

    if (forma_pagamento) {
      queryBuilder = queryBuilder.eq('forma_pagamento', forma_pagamento);
    }

    if (fixo_variavel) {
      queryBuilder = queryBuilder.eq('fixo_variavel', fixo_variavel);
    }

    if (data_inicio) {
      queryBuilder = queryBuilder.gte('data', data_inicio);
    }

    if (data_fim) {
      queryBuilder = queryBuilder.lte('data', data_fim);
    }

    // Paginação
    const offset = (parseInt(page) - 1) * parseInt(limit);
    queryBuilder = queryBuilder.range(offset, offset + parseInt(limit) - 1);

    const { data: lancamentos, error, count } = await queryBuilder;

    if (error) {
      return res.status(400).json({ error: 'Erro ao buscar lançamentos', details: error.message });
    }

    res.json({
      data: lancamentos,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: count,
        totalPages: Math.ceil(count / parseInt(limit))
      }
    });
  } catch (error) {
    console.error('Erro ao buscar lançamentos:', error);
    res.status(500).json({ error: 'Erro interno' });
  }
});

// GET /api/lancamentos/:id - Buscar lançamento por ID
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const { data: lancamento, error } = await supabaseAdmin
      .from('lancamentos')
      .select('*, categorias(id, nome, cor, icone)')
      .eq('id', id)
      .eq('empresa_id', req.user.empresa_id)
      .single();

    if (error || !lancamento) {
      return res.status(404).json({ error: 'Lançamento não encontrado' });
    }

    res.json(lancamento);
  } catch (error) {
    console.error('Erro ao buscar lançamento:', error);
    res.status(500).json({ error: 'Erro interno' });
  }
});

// POST /api/lancamentos - Criar novo lançamento
router.post('/', [
  body('tipo').isIn(['receita', 'despesa']).withMessage('Tipo deve ser receita ou despesa'),
  body('descricao').notEmpty().withMessage('Descrição é obrigatória'),
  body('valor').isFloat({ min: 0.01 }).withMessage('Valor deve ser maior que zero'),
  body('data').isDate().withMessage('Data inválida'),
  body('categoria_id').optional().isUUID(),
  body('centro_custo').optional().isIn(['producao', 'atendimento', 'administracao']),
  body('forma_pagamento').optional().isIn(['pix', 'dinheiro', 'cartao', 'boleto']),
  body('fixo_variavel').optional().isIn(['fixo', 'variavel']),
  body('observacoes').optional()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { 
      tipo, 
      descricao, 
      valor, 
      data, 
      categoria_id, 
      centro_custo,
      forma_pagamento, 
      fixo_variavel, 
      observacoes 
    } = req.body;

    // Se for despesa, fixo_variavel é recomendado
    if (tipo === 'despesa' && !fixo_variavel) {
      console.warn('Despesa sem classificação fixo/variável');
    }

    const { data: lancamento, error } = await supabaseAdmin
      .from('lancamentos')
      .insert({
        empresa_id: req.user.empresa_id,
        tipo,
        descricao,
        valor: parseFloat(valor),
        data,
        categoria_id: categoria_id || null,
        centro_custo: centro_custo || null,
        forma_pagamento: forma_pagamento || null,
        fixo_variavel: tipo === 'despesa' ? (fixo_variavel || 'variavel') : null,
        observacoes: observacoes || null
      })
      .select('*, categorias(id, nome, cor, icone)')
      .single();

    if (error) {
      return res.status(400).json({ error: 'Erro ao criar lançamento', details: error.message });
    }

    res.status(201).json({
      message: 'Lançamento criado com sucesso',
      lancamento
    });
  } catch (error) {
    console.error('Erro ao criar lançamento:', error);
    res.status(500).json({ error: 'Erro interno' });
  }
});

// PUT /api/lancamentos/:id - Atualizar lançamento
router.put('/:id', [
  body('tipo').optional().isIn(['receita', 'despesa']),
  body('descricao').optional().notEmpty(),
  body('valor').optional().isFloat({ min: 0.01 }),
  body('data').optional().isDate(),
  body('categoria_id').optional(),
  body('centro_custo').optional(),
  body('forma_pagamento').optional(),
  body('fixo_variavel').optional(),
  body('observacoes').optional()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { id } = req.params;

    // Verificar se lançamento existe e pertence à empresa
    const { data: existente, error: checkError } = await supabaseAdmin
      .from('lancamentos')
      .select('id')
      .eq('id', id)
      .eq('empresa_id', req.user.empresa_id)
      .single();

    if (checkError || !existente) {
      return res.status(404).json({ error: 'Lançamento não encontrado' });
    }

    const updateData = { updated_at: new Date().toISOString() };
    const fields = ['tipo', 'descricao', 'valor', 'data', 'categoria_id', 'centro_custo', 'forma_pagamento', 'fixo_variavel', 'observacoes'];
    
    fields.forEach(field => {
      if (req.body[field] !== undefined) {
        updateData[field] = req.body[field];
      }
    });

    if (updateData.valor) {
      updateData.valor = parseFloat(updateData.valor);
    }

    const { data: lancamento, error } = await supabaseAdmin
      .from('lancamentos')
      .update(updateData)
      .eq('id', id)
      .select('*, categorias(id, nome, cor, icone)')
      .single();

    if (error) {
      return res.status(400).json({ error: 'Erro ao atualizar lançamento', details: error.message });
    }

    res.json({
      message: 'Lançamento atualizado com sucesso',
      lancamento
    });
  } catch (error) {
    console.error('Erro ao atualizar lançamento:', error);
    res.status(500).json({ error: 'Erro interno' });
  }
});

// POST /api/lancamentos/:id/duplicar - Duplicar lançamento
router.post('/:id/duplicar', async (req, res) => {
  try {
    const { id } = req.params;
    const { nova_data } = req.body;

    // Buscar lançamento original
    const { data: original, error: findError } = await supabaseAdmin
      .from('lancamentos')
      .select('*')
      .eq('id', id)
      .eq('empresa_id', req.user.empresa_id)
      .single();

    if (findError || !original) {
      return res.status(404).json({ error: 'Lançamento não encontrado' });
    }

    // Criar cópia
    const { data: lancamento, error } = await supabaseAdmin
      .from('lancamentos')
      .insert({
        empresa_id: req.user.empresa_id,
        tipo: original.tipo,
        descricao: original.descricao,
        valor: original.valor,
        data: nova_data || original.data,
        categoria_id: original.categoria_id,
        centro_custo: original.centro_custo,
        forma_pagamento: original.forma_pagamento,
        fixo_variavel: original.fixo_variavel,
        observacoes: original.observacoes
      })
      .select('*, categorias(id, nome, cor, icone)')
      .single();

    if (error) {
      return res.status(400).json({ error: 'Erro ao duplicar lançamento', details: error.message });
    }

    res.status(201).json({
      message: 'Lançamento duplicado com sucesso',
      lancamento
    });
  } catch (error) {
    console.error('Erro ao duplicar lançamento:', error);
    res.status(500).json({ error: 'Erro interno' });
  }
});

// DELETE /api/lancamentos/:id - Excluir lançamento
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    // Verificar se lançamento existe e pertence à empresa
    const { data: existente, error: checkError } = await supabaseAdmin
      .from('lancamentos')
      .select('id')
      .eq('id', id)
      .eq('empresa_id', req.user.empresa_id)
      .single();

    if (checkError || !existente) {
      return res.status(404).json({ error: 'Lançamento não encontrado' });
    }

    const { error } = await supabaseAdmin
      .from('lancamentos')
      .delete()
      .eq('id', id);

    if (error) {
      return res.status(400).json({ error: 'Erro ao excluir lançamento', details: error.message });
    }

    res.json({ message: 'Lançamento excluído com sucesso' });
  } catch (error) {
    console.error('Erro ao excluir lançamento:', error);
    res.status(500).json({ error: 'Erro interno' });
  }
});

// DELETE /api/lancamentos - Excluir múltiplos lançamentos
router.delete('/', [
  body('ids').isArray({ min: 1 }).withMessage('Informe pelo menos um ID')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { ids } = req.body;

    const { error } = await supabaseAdmin
      .from('lancamentos')
      .delete()
      .in('id', ids)
      .eq('empresa_id', req.user.empresa_id);

    if (error) {
      return res.status(400).json({ error: 'Erro ao excluir lançamentos', details: error.message });
    }

    res.json({ message: `${ids.length} lançamento(s) excluído(s) com sucesso` });
  } catch (error) {
    console.error('Erro ao excluir lançamentos:', error);
    res.status(500).json({ error: 'Erro interno' });
  }
});

module.exports = router;
