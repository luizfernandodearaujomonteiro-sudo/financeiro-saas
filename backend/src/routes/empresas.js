const express = require('express');
const { body, validationResult } = require('express-validator');
const { supabaseAdmin } = require('../config/supabase');

const router = express.Router();

// GET /api/empresas/minha - Dados da empresa do usuário
router.get('/minha', async (req, res) => {
  try {
    const { data: empresa, error } = await supabaseAdmin
      .from('empresas')
      .select('*')
      .eq('id', req.user.empresa_id)
      .single();

    if (error) {
      return res.status(404).json({ error: 'Empresa não encontrada' });
    }

    res.json(empresa);
  } catch (error) {
    console.error('Erro ao buscar empresa:', error);
    res.status(500).json({ error: 'Erro interno' });
  }
});

// PUT /api/empresas/minha - Atualizar dados da empresa
router.put('/minha', [
  body('nome').optional().notEmpty().withMessage('Nome não pode ser vazio'),
  body('segmento').optional()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { nome, segmento } = req.body;
    const updateData = { updated_at: new Date().toISOString() };
    
    if (nome) updateData.nome = nome;
    if (segmento !== undefined) updateData.segmento = segmento;

    const { data: empresa, error } = await supabaseAdmin
      .from('empresas')
      .update(updateData)
      .eq('id', req.user.empresa_id)
      .select()
      .single();

    if (error) {
      return res.status(400).json({ error: 'Erro ao atualizar empresa', details: error.message });
    }

    res.json({
      message: 'Empresa atualizada com sucesso',
      empresa
    });
  } catch (error) {
    console.error('Erro ao atualizar empresa:', error);
    res.status(500).json({ error: 'Erro interno' });
  }
});

// GET /api/empresas/usuarios - Listar usuários da empresa
router.get('/usuarios', async (req, res) => {
  try {
    const { data: usuarios, error } = await supabaseAdmin
      .from('usuarios')
      .select('id, nome, email, role, created_at')
      .eq('empresa_id', req.user.empresa_id)
      .order('created_at', { ascending: true });

    if (error) {
      return res.status(400).json({ error: 'Erro ao buscar usuários', details: error.message });
    }

    res.json(usuarios);
  } catch (error) {
    console.error('Erro ao buscar usuários:', error);
    res.status(500).json({ error: 'Erro interno' });
  }
});

module.exports = router;
