const express = require('express');
const PDFDocument = require('pdfkit');
const { supabaseAdmin } = require('../config/supabase');

const router = express.Router();

// Helper para formatar moeda
const formatCurrency = (value) => {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL'
  }).format(value);
};

// Helper para formatar data
const formatDate = (date) => {
  return new Date(date).toLocaleDateString('pt-BR');
};

// Helper para calcular período
const getPeriodo = (tipo, dataInicio, dataFim) => {
  const hoje = new Date();
  let inicio, fim;

  switch (tipo) {
    case 'mes_atual':
      inicio = new Date(hoje.getFullYear(), hoje.getMonth(), 1);
      fim = new Date(hoje.getFullYear(), hoje.getMonth() + 1, 0);
      break;
    case 'ultimo_mes':
      inicio = new Date(hoje.getFullYear(), hoje.getMonth() - 1, 1);
      fim = new Date(hoje.getFullYear(), hoje.getMonth(), 0);
      break;
    case '3_meses':
      inicio = new Date(hoje.getFullYear(), hoje.getMonth() - 2, 1);
      fim = new Date(hoje.getFullYear(), hoje.getMonth() + 1, 0);
      break;
    case 'personalizado':
      inicio = new Date(dataInicio);
      fim = new Date(dataFim);
      break;
    default:
      inicio = new Date(hoje.getFullYear(), hoje.getMonth(), 1);
      fim = new Date(hoje.getFullYear(), hoje.getMonth() + 1, 0);
  }

  return {
    inicio: inicio.toISOString().split('T')[0],
    fim: fim.toISOString().split('T')[0]
  };
};

// GET /api/relatorios/dashboard - Dados do dashboard
router.get('/dashboard', async (req, res) => {
  try {
    const { periodo = 'mes_atual', data_inicio, data_fim } = req.query;
    const { inicio, fim } = getPeriodo(periodo, data_inicio, data_fim);

    // Buscar todos os lançamentos do período
    const { data: lancamentos, error } = await supabaseAdmin
      .from('lancamentos')
      .select('*, categorias(id, nome, cor)')
      .eq('empresa_id', req.user.empresa_id)
      .gte('data', inicio)
      .lte('data', fim)
      .order('data', { ascending: true });

    if (error) {
      return res.status(400).json({ error: 'Erro ao buscar dados', details: error.message });
    }

    // Calcular totais
    let totalReceitas = 0;
    let totalDespesas = 0;
    let custosFixos = 0;
    let custosVariaveis = 0;

    const despesasPorCategoria = {};
    const dadosPorDia = {};

    lancamentos.forEach(l => {
      const valor = parseFloat(l.valor);
      const dataStr = l.data;

      if (l.tipo === 'receita') {
        totalReceitas += valor;
      } else {
        totalDespesas += valor;
        
        if (l.fixo_variavel === 'fixo') {
          custosFixos += valor;
        } else {
          custosVariaveis += valor;
        }

        // Agrupar por categoria
        const catNome = l.categorias?.nome || 'Sem categoria';
        const catCor = l.categorias?.cor || '#6366f1';
        if (!despesasPorCategoria[catNome]) {
          despesasPorCategoria[catNome] = { valor: 0, cor: catCor };
        }
        despesasPorCategoria[catNome].valor += valor;
      }

      // Agrupar por dia para gráfico de linha
      if (!dadosPorDia[dataStr]) {
        dadosPorDia[dataStr] = { receitas: 0, despesas: 0 };
      }
      if (l.tipo === 'receita') {
        dadosPorDia[dataStr].receitas += valor;
      } else {
        dadosPorDia[dataStr].despesas += valor;
      }
    });

    const resultado = totalReceitas - totalDespesas;
    const margem = totalReceitas > 0 ? ((resultado / totalReceitas) * 100) : 0;

    // Calcular margem de contribuição e ponto de equilíbrio
    const margemContribuicao = totalReceitas - custosVariaveis;
    const margemContribuicaoPercent = totalReceitas > 0 
      ? (margemContribuicao / totalReceitas) * 100 
      : 0;
    const pontoEquilibrio = margemContribuicaoPercent > 0 
      ? custosFixos / (margemContribuicaoPercent / 100) 
      : 0;

    // Formatar dados para gráficos
    const graficoLinha = Object.entries(dadosPorDia)
      .map(([data, valores]) => ({
        data: formatDate(data),
        dataOriginal: data,
        receitas: valores.receitas,
        despesas: valores.despesas
      }))
      .sort((a, b) => a.dataOriginal.localeCompare(b.dataOriginal));

    const graficoDonut = Object.entries(despesasPorCategoria)
      .map(([nome, { valor, cor }]) => ({
        nome,
        valor,
        cor
      }))
      .sort((a, b) => b.valor - a.valor);

    res.json({
      periodo: { inicio, fim },
      cards: {
        receitas: totalReceitas,
        despesas: totalDespesas,
        resultado,
        margem: margem.toFixed(2)
      },
      custos: {
        fixos: custosFixos,
        variaveis: custosVariaveis,
        margemContribuicao,
        margemContribuicaoPercent: margemContribuicaoPercent.toFixed(2),
        pontoEquilibrio
      },
      graficos: {
        linha: graficoLinha,
        donut: graficoDonut,
        barras: [
          { nome: 'Fixos', valor: custosFixos, cor: '#ef4444' },
          { nome: 'Variáveis', valor: custosVariaveis, cor: '#f59e0b' }
        ]
      }
    });
  } catch (error) {
    console.error('Erro ao buscar dados do dashboard:', error);
    res.status(500).json({ error: 'Erro interno' });
  }
});

// GET /api/relatorios/dre - DRE Simplificada
router.get('/dre', async (req, res) => {
  try {
    const { periodo = 'mes_atual', data_inicio, data_fim } = req.query;
    const { inicio, fim } = getPeriodo(periodo, data_inicio, data_fim);

    const { data: lancamentos, error } = await supabaseAdmin
      .from('lancamentos')
      .select('tipo, valor, fixo_variavel')
      .eq('empresa_id', req.user.empresa_id)
      .gte('data', inicio)
      .lte('data', fim);

    if (error) {
      return res.status(400).json({ error: 'Erro ao buscar dados', details: error.message });
    }

    let receitaTotal = 0;
    let custosVariaveis = 0;
    let custosFixos = 0;

    lancamentos.forEach(l => {
      const valor = parseFloat(l.valor);
      if (l.tipo === 'receita') {
        receitaTotal += valor;
      } else {
        if (l.fixo_variavel === 'fixo') {
          custosFixos += valor;
        } else {
          custosVariaveis += valor;
        }
      }
    });

    const margemContribuicao = receitaTotal - custosVariaveis;
    const resultado = margemContribuicao - custosFixos;

    res.json({
      periodo: { inicio, fim },
      dre: {
        receitaTotal,
        custosVariaveis,
        margemContribuicao,
        custosFixos,
        resultado
      },
      percentuais: {
        custosVariaveisPercent: receitaTotal > 0 ? ((custosVariaveis / receitaTotal) * 100).toFixed(2) : 0,
        margemContribuicaoPercent: receitaTotal > 0 ? ((margemContribuicao / receitaTotal) * 100).toFixed(2) : 0,
        custosFixosPercent: receitaTotal > 0 ? ((custosFixos / receitaTotal) * 100).toFixed(2) : 0,
        resultadoPercent: receitaTotal > 0 ? ((resultado / receitaTotal) * 100).toFixed(2) : 0
      }
    });
  } catch (error) {
    console.error('Erro ao gerar DRE:', error);
    res.status(500).json({ error: 'Erro interno' });
  }
});

// GET /api/relatorios/mensal - Resultado por mês
router.get('/mensal', async (req, res) => {
  try {
    const { meses = 6 } = req.query;
    const hoje = new Date();
    const inicio = new Date(hoje.getFullYear(), hoje.getMonth() - parseInt(meses) + 1, 1);

    const { data: lancamentos, error } = await supabaseAdmin
      .from('lancamentos')
      .select('tipo, valor, data, fixo_variavel')
      .eq('empresa_id', req.user.empresa_id)
      .gte('data', inicio.toISOString().split('T')[0])
      .order('data', { ascending: true });

    if (error) {
      return res.status(400).json({ error: 'Erro ao buscar dados', details: error.message });
    }

    // Agrupar por mês
    const dadosPorMes = {};

    lancamentos.forEach(l => {
      const data = new Date(l.data);
      const mesAno = `${data.getFullYear()}-${String(data.getMonth() + 1).padStart(2, '0')}`;
      
      if (!dadosPorMes[mesAno]) {
        dadosPorMes[mesAno] = {
          receitas: 0,
          despesas: 0,
          fixos: 0,
          variaveis: 0
        };
      }

      const valor = parseFloat(l.valor);
      if (l.tipo === 'receita') {
        dadosPorMes[mesAno].receitas += valor;
      } else {
        dadosPorMes[mesAno].despesas += valor;
        if (l.fixo_variavel === 'fixo') {
          dadosPorMes[mesAno].fixos += valor;
        } else {
          dadosPorMes[mesAno].variaveis += valor;
        }
      }
    });

    // Formatar para gráfico
    const mesesNomes = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
    
    const resultado = Object.entries(dadosPorMes)
      .map(([mesAno, valores]) => {
        const [ano, mes] = mesAno.split('-');
        return {
          mes: `${mesesNomes[parseInt(mes) - 1]}/${ano.slice(2)}`,
          mesAno,
          receitas: valores.receitas,
          despesas: valores.despesas,
          resultado: valores.receitas - valores.despesas,
          fixos: valores.fixos,
          variaveis: valores.variaveis
        };
      })
      .sort((a, b) => a.mesAno.localeCompare(b.mesAno));

    res.json(resultado);
  } catch (error) {
    console.error('Erro ao gerar relatório mensal:', error);
    res.status(500).json({ error: 'Erro interno' });
  }
});

// GET /api/relatorios/ponto-equilibrio - Cálculo do ponto de equilíbrio
router.get('/ponto-equilibrio', async (req, res) => {
  try {
    const { periodo = 'mes_atual', data_inicio, data_fim } = req.query;
    const { inicio, fim } = getPeriodo(periodo, data_inicio, data_fim);

    const { data: lancamentos, error } = await supabaseAdmin
      .from('lancamentos')
      .select('tipo, valor, fixo_variavel')
      .eq('empresa_id', req.user.empresa_id)
      .gte('data', inicio)
      .lte('data', fim);

    if (error) {
      return res.status(400).json({ error: 'Erro ao buscar dados', details: error.message });
    }

    let receitaTotal = 0;
    let custosVariaveis = 0;
    let custosFixos = 0;

    lancamentos.forEach(l => {
      const valor = parseFloat(l.valor);
      if (l.tipo === 'receita') {
        receitaTotal += valor;
      } else {
        if (l.fixo_variavel === 'fixo') {
          custosFixos += valor;
        } else {
          custosVariaveis += valor;
        }
      }
    });

    // Cálculos
    const margemContribuicao = receitaTotal - custosVariaveis;
    const margemContribuicaoPercent = receitaTotal > 0 
      ? (margemContribuicao / receitaTotal) * 100 
      : 0;

    // Ponto de equilíbrio = Custos Fixos / (Margem de Contribuição %)
    const pontoEquilibrio = margemContribuicaoPercent > 0 
      ? custosFixos / (margemContribuicaoPercent / 100) 
      : 0;

    // Posição em relação ao ponto de equilíbrio
    const diferencaReceita = receitaTotal - pontoEquilibrio;
    const percentualPE = pontoEquilibrio > 0 
      ? ((receitaTotal / pontoEquilibrio) * 100) 
      : 0;

    res.json({
      periodo: { inicio, fim },
      dados: {
        receitaTotal,
        custosVariaveis,
        custosFixos,
        margemContribuicao,
        margemContribuicaoPercent: margemContribuicaoPercent.toFixed(2)
      },
      pontoEquilibrio: {
        valor: pontoEquilibrio,
        diferencaReceita,
        percentualAtingido: percentualPE.toFixed(2),
        status: receitaTotal >= pontoEquilibrio ? 'acima' : 'abaixo'
      },
      mensagem: receitaTotal >= pontoEquilibrio
        ? `Parabéns! Você está ${((percentualPE - 100).toFixed(1))}% acima do ponto de equilíbrio.`
        : `Para empatar, você precisa faturar aproximadamente ${formatCurrency(pontoEquilibrio)}. Faltam ${formatCurrency(pontoEquilibrio - receitaTotal)}.`
    });
  } catch (error) {
    console.error('Erro ao calcular ponto de equilíbrio:', error);
    res.status(500).json({ error: 'Erro interno' });
  }
});

// GET /api/relatorios/pdf - Gerar relatório em PDF
router.get('/pdf', async (req, res) => {
  try {
    const { periodo = 'mes_atual', data_inicio, data_fim, tipo = 'completo' } = req.query;
    const { inicio, fim } = getPeriodo(periodo, data_inicio, data_fim);

    // Buscar dados da empresa
    const { data: empresa } = await supabaseAdmin
      .from('empresas')
      .select('nome, segmento')
      .eq('id', req.user.empresa_id)
      .single();

    // Buscar lançamentos
    const { data: lancamentos, error } = await supabaseAdmin
      .from('lancamentos')
      .select('*, categorias(nome)')
      .eq('empresa_id', req.user.empresa_id)
      .gte('data', inicio)
      .lte('data', fim)
      .order('data', { ascending: true });

    if (error) {
      return res.status(400).json({ error: 'Erro ao buscar dados', details: error.message });
    }

    // Calcular totais
    let totalReceitas = 0;
    let totalDespesas = 0;
    let custosFixos = 0;
    let custosVariaveis = 0;

    lancamentos.forEach(l => {
      const valor = parseFloat(l.valor);
      if (l.tipo === 'receita') {
        totalReceitas += valor;
      } else {
        totalDespesas += valor;
        if (l.fixo_variavel === 'fixo') custosFixos += valor;
        else custosVariaveis += valor;
      }
    });

    const resultado = totalReceitas - totalDespesas;
    const margemContribuicao = totalReceitas - custosVariaveis;

    // Criar PDF
    const doc = new PDFDocument({ margin: 50 });

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename=relatorio-${inicio}-${fim}.pdf`);

    doc.pipe(res);

    // Cabeçalho
    doc.fontSize(20).text('Relatório Financeiro', { align: 'center' });
    doc.fontSize(14).text(empresa?.nome || 'Empresa', { align: 'center' });
    doc.fontSize(10).text(`Período: ${formatDate(inicio)} a ${formatDate(fim)}`, { align: 'center' });
    doc.moveDown(2);

    // Resumo
    doc.fontSize(14).text('Resumo do Período', { underline: true });
    doc.moveDown();
    doc.fontSize(11);
    doc.text(`Receita Total: ${formatCurrency(totalReceitas)}`);
    doc.text(`Despesa Total: ${formatCurrency(totalDespesas)}`);
    doc.text(`Resultado: ${formatCurrency(resultado)}`, {
      continued: false
    });
    doc.moveDown();
    doc.text(`Custos Fixos: ${formatCurrency(custosFixos)}`);
    doc.text(`Custos Variáveis: ${formatCurrency(custosVariaveis)}`);
    doc.text(`Margem de Contribuição: ${formatCurrency(margemContribuicao)}`);
    doc.moveDown(2);

    // DRE Simplificada
    doc.fontSize(14).text('DRE Simplificada', { underline: true });
    doc.moveDown();
    doc.fontSize(11);
    doc.text(`(+) Receita Total: ${formatCurrency(totalReceitas)}`);
    doc.text(`(-) Custos Variáveis: ${formatCurrency(custosVariaveis)}`);
    doc.text(`(=) Margem de Contribuição: ${formatCurrency(margemContribuicao)}`);
    doc.text(`(-) Custos Fixos: ${formatCurrency(custosFixos)}`);
    doc.text(`(=) Resultado Final: ${formatCurrency(resultado)}`, { 
      continued: false
    });
    doc.moveDown(2);

    // Lista de lançamentos (se tipo completo)
    if (tipo === 'completo' && lancamentos.length > 0) {
      doc.addPage();
      doc.fontSize(14).text('Lançamentos do Período', { underline: true });
      doc.moveDown();
      
      // Cabeçalho da tabela
      doc.fontSize(9);
      const startX = 50;
      let y = doc.y;
      
      doc.text('Data', startX, y, { width: 60 });
      doc.text('Tipo', startX + 60, y, { width: 50 });
      doc.text('Descrição', startX + 110, y, { width: 150 });
      doc.text('Categoria', startX + 260, y, { width: 80 });
      doc.text('Valor', startX + 340, y, { width: 80, align: 'right' });
      
      doc.moveDown();
      doc.moveTo(startX, doc.y).lineTo(550, doc.y).stroke();
      doc.moveDown(0.5);

      // Linhas
      lancamentos.forEach(l => {
        if (doc.y > 700) {
          doc.addPage();
          doc.y = 50;
        }
        
        y = doc.y;
        doc.text(formatDate(l.data), startX, y, { width: 60 });
        doc.text(l.tipo === 'receita' ? 'Receita' : 'Despesa', startX + 60, y, { width: 50 });
        doc.text(l.descricao.substring(0, 25), startX + 110, y, { width: 150 });
        doc.text((l.categorias?.nome || '-').substring(0, 15), startX + 260, y, { width: 80 });
        doc.text(formatCurrency(l.valor), startX + 340, y, { width: 80, align: 'right' });
        doc.moveDown(0.8);
      });
    }

    // Rodapé
    doc.fontSize(8).text(
      `Gerado em ${new Date().toLocaleString('pt-BR')} | Sistema de Gestão Financeira`,
      50,
      doc.page.height - 50,
      { align: 'center' }
    );

    doc.end();
  } catch (error) {
    console.error('Erro ao gerar PDF:', error);
    res.status(500).json({ error: 'Erro interno ao gerar PDF' });
  }
});

module.exports = router;
