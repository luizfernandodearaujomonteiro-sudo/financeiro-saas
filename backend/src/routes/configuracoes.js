const express = require('express');
const { body, validationResult } = require('express-validator');
const { supabaseAdmin } = require('../config/supabase');

const router = express.Router();

// GET /api/configuracoes - Buscar configurações da empresa
router.get('/', async (req, res) => {
  try {
    const { data: config, error } = await supabaseAdmin
      .from('configuracoes')
      .select('*')
      .eq('empresa_id', req.user.empresa_id)
      .single();

    if (error && error.code !== 'PGRST116') {
      return res.status(400).json({ error: 'Erro ao buscar configurações', details: error.message });
    }

    // Se não existir, criar configurações padrão
    if (!config) {
      const { data: novaConfig, error: createError } = await supabaseAdmin
        .from('configuracoes')
        .insert({
          empresa_id: req.user.empresa_id,
          moeda: 'BRL',
          dia_inicio_mes: 1,
          periodo_padrao: 'mes_atual'
        })
        .select()
        .single();

      if (createError) {
        return res.status(400).json({ error: 'Erro ao criar configurações', details: createError.message });
      }

      return res.json(novaConfig);
    }

    res.json(config);
  } catch (error) {
    console.error('Erro ao buscar configurações:', error);
    res.status(500).json({ error: 'Erro interno' });
  }
});

// PUT /api/configuracoes - Atualizar configurações
router.put('/', [
  body('moeda').optional().isIn(['BRL', 'USD', 'EUR']),
  body('dia_inicio_mes').optional().isInt({ min: 1, max: 28 }),
  body('periodo_padrao').optional().isIn(['mes_atual', 'ultimo_mes', '3_meses'])
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { moeda, dia_inicio_mes, periodo_padrao } = req.body;
    const updateData = { updated_at: new Date().toISOString() };

    if (moeda) updateData.moeda = moeda;
    if (dia_inicio_mes) updateData.dia_inicio_mes = dia_inicio_mes;
    if (periodo_padrao) updateData.periodo_padrao = periodo_padrao;

    // Tentar atualizar
    const { data: config, error } = await supabaseAdmin
      .from('configuracoes')
      .update(updateData)
      .eq('empresa_id', req.user.empresa_id)
      .select()
      .single();

    if (error) {
      // Se não existe, criar
      if (error.code === 'PGRST116') {
        const { data: novaConfig, error: createError } = await supabaseAdmin
          .from('configuracoes')
          .insert({
            empresa_id: req.user.empresa_id,
            moeda: moeda || 'BRL',
            dia_inicio_mes: dia_inicio_mes || 1,
            periodo_padrao: periodo_padrao || 'mes_atual'
          })
          .select()
          .single();

        if (createError) {
          return res.status(400).json({ error: 'Erro ao criar configurações', details: createError.message });
        }

        return res.json({
          message: 'Configurações criadas com sucesso',
          config: novaConfig
        });
      }

      return res.status(400).json({ error: 'Erro ao atualizar configurações', details: error.message });
    }

    res.json({
      message: 'Configurações atualizadas com sucesso',
      config
    });
  } catch (error) {
    console.error('Erro ao atualizar configurações:', error);
    res.status(500).json({ error: 'Erro interno' });
  }
});

// GET /api/configuracoes/backup - Exportar todos os dados da empresa
router.get('/backup', async (req, res) => {
  try {
    const empresaId = req.user.empresa_id;

    // Buscar todos os dados
    const [empresaResult, categoriasResult, lancamentosResult, configResult] = await Promise.all([
      supabaseAdmin.from('empresas').select('*').eq('id', empresaId).single(),
      supabaseAdmin.from('categorias').select('*').eq('empresa_id', empresaId),
      supabaseAdmin.from('lancamentos').select('*').eq('empresa_id', empresaId),
      supabaseAdmin.from('configuracoes').select('*').eq('empresa_id', empresaId).single()
    ]);

    const backup = {
      versao: '1.0',
      data_exportacao: new Date().toISOString(),
      empresa: empresaResult.data,
      categorias: categoriasResult.data || [],
      lancamentos: lancamentosResult.data || [],
      configuracoes: configResult.data
    };

    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename=backup-${new Date().toISOString().split('T')[0]}.json`);
    res.json(backup);
  } catch (error) {
    console.error('Erro ao gerar backup:', error);
    res.status(500).json({ error: 'Erro interno ao gerar backup' });
  }
});

// GET /api/configuracoes/export/csv - Exportar lançamentos em CSV
router.get('/export/csv', async (req, res) => {
  try {
    const { data_inicio, data_fim } = req.query;

    let query = supabaseAdmin
      .from('lancamentos')
      .select('*, categorias(nome)')
      .eq('empresa_id', req.user.empresa_id)
      .order('data', { ascending: true });

    if (data_inicio) query = query.gte('data', data_inicio);
    if (data_fim) query = query.lte('data', data_fim);

    const { data: lancamentos, error } = await query;

    if (error) {
      return res.status(400).json({ error: 'Erro ao buscar dados', details: error.message });
    }

    // Criar CSV
    const headers = ['Data', 'Tipo', 'Descrição', 'Valor', 'Categoria', 'Fixo/Variável', 'Forma de Pagamento', 'Centro de Custo', 'Observações'];
    const rows = lancamentos.map(l => [
      l.data,
      l.tipo,
      `"${l.descricao.replace(/"/g, '""')}"`,
      l.valor,
      l.categorias?.nome || '',
      l.fixo_variavel || '',
      l.forma_pagamento || '',
      l.centro_custo || '',
      `"${(l.observacoes || '').replace(/"/g, '""')}"`
    ]);

    const csv = [headers.join(';'), ...rows.map(r => r.join(';'))].join('\n');

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename=lancamentos-${new Date().toISOString().split('T')[0]}.csv`);
    res.send('\ufeff' + csv); // BOM para Excel reconhecer UTF-8
  } catch (error) {
    console.error('Erro ao exportar CSV:', error);
    res.status(500).json({ error: 'Erro interno ao exportar CSV' });
  }
});

module.exports = router;
