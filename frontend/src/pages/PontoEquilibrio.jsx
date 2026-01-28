import { useState, useEffect } from 'react'
import api from '../services/api'
import {
  Target,
  TrendingUp,
  TrendingDown,
  DollarSign,
  AlertCircle,
  CheckCircle,
  ArrowRight,
  RefreshCw
} from 'lucide-react'

const formatCurrency = (value) => {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL'
  }).format(value)
}

const periodos = [
  { value: 'mes_atual', label: 'Mês Atual' },
  { value: 'ultimo_mes', label: 'Mês Passado' },
  { value: '3_meses', label: 'Últimos 3 Meses' }
]

export default function PontoEquilibrio() {
  const [periodo, setPeriodo] = useState('mes_atual')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [data, setData] = useState(null)

  useEffect(() => {
    loadPontoEquilibrio()
  }, [periodo])

  const loadPontoEquilibrio = async () => {
    setLoading(true)
    setError('')
    try {
      const response = await api.getPontoEquilibrio({ periodo })
      setData(response)
    } catch (err) {
      setError('Erro ao calcular ponto de equilíbrio')
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <div className="w-10 h-10 border-4 border-primary-600 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-gray-600">Calculando...</p>
        </div>
      </div>
    )
  }

  const percentual = data?.pontoEquilibrio?.percentualAtingido || 0
  const acimaPE = data?.pontoEquilibrio?.status === 'acima'

  return (
    <div className="space-y-6 pb-20 lg:pb-0">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Ponto de Equilíbrio</h1>
          <p className="text-gray-600">Descubra quanto você precisa faturar para não ter prejuízo</p>
        </div>
        <div className="flex items-center gap-3">
          <select
            value={periodo}
            onChange={(e) => setPeriodo(e.target.value)}
            className="select py-2"
          >
            {periodos.map((p) => (
              <option key={p.value} value={p.value}>{p.label}</option>
            ))}
          </select>
          <button onClick={loadPontoEquilibrio} className="btn btn-ghost p-2">
            <RefreshCw className={`w-5 h-5 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {error && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-lg flex items-center gap-3">
          <AlertCircle className="w-5 h-5 text-red-500" />
          <p className="text-red-700">{error}</p>
        </div>
      )}

      {data && (
        <>
          {/* Card Principal - Ponto de Equilíbrio */}
          <div className={`card ${acimaPE ? 'bg-gradient-to-br from-green-50 to-white' : 'bg-gradient-to-br from-amber-50 to-white'}`}>
            <div className="flex items-center gap-3 mb-6">
              <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${
                acimaPE ? 'bg-green-100' : 'bg-amber-100'
              }`}>
                <Target className={`w-6 h-6 ${acimaPE ? 'text-green-600' : 'text-amber-600'}`} />
              </div>
              <div>
                <h2 className="text-lg font-semibold">Seu Ponto de Equilíbrio</h2>
                <p className="text-sm text-gray-500">Faturamento mínimo para cobrir todos os custos</p>
              </div>
            </div>

            <div className="text-center mb-6">
              <p className="text-4xl font-bold text-gray-900 mb-2">
                {formatCurrency(data.pontoEquilibrio.valor)}
              </p>
              <p className="text-gray-600">por período</p>
            </div>

            {/* Barra de progresso */}
            <div className="mb-6">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm text-gray-600">Progresso atual</span>
                <span className={`text-sm font-medium ${acimaPE ? 'text-green-600' : 'text-amber-600'}`}>
                  {percentual}%
                </span>
              </div>
              <div className="h-4 bg-gray-200 rounded-full overflow-hidden">
                <div 
                  className={`h-full rounded-full transition-all duration-500 ${
                    acimaPE ? 'bg-green-500' : 'bg-amber-500'
                  }`}
                  style={{ width: `${Math.min(parseFloat(percentual), 100)}%` }}
                />
              </div>
              <div className="flex items-center justify-between mt-2">
                <span className="text-xs text-gray-500">R$ 0</span>
                <span className="text-xs text-gray-500">
                  PE: {formatCurrency(data.pontoEquilibrio.valor)}
                </span>
              </div>
            </div>

            {/* Status */}
            <div className={`p-4 rounded-lg ${acimaPE ? 'bg-green-100' : 'bg-amber-100'}`}>
              <div className="flex items-start gap-3">
                {acimaPE ? (
                  <CheckCircle className="w-6 h-6 text-green-600 flex-shrink-0" />
                ) : (
                  <AlertCircle className="w-6 h-6 text-amber-600 flex-shrink-0" />
                )}
                <div>
                  <p className={`font-medium ${acimaPE ? 'text-green-800' : 'text-amber-800'}`}>
                    {data.mensagem}
                  </p>
                  {!acimaPE && (
                    <p className="text-sm text-amber-700 mt-1">
                      Continue trabalhando! A cada venda você se aproxima do equilíbrio.
                    </p>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Cards de dados */}
          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="card">
              <div className="flex items-center gap-2 mb-3">
                <TrendingUp className="w-5 h-5 text-green-500" />
                <span className="text-sm text-gray-600">Receita Atual</span>
              </div>
              <p className="text-xl font-bold text-green-600">
                {formatCurrency(data.dados.receitaTotal)}
              </p>
            </div>

            <div className="card">
              <div className="flex items-center gap-2 mb-3">
                <TrendingDown className="w-5 h-5 text-orange-500" />
                <span className="text-sm text-gray-600">Custos Variáveis</span>
              </div>
              <p className="text-xl font-bold text-orange-600">
                {formatCurrency(data.dados.custosVariaveis)}
              </p>
            </div>

            <div className="card">
              <div className="flex items-center gap-2 mb-3">
                <TrendingDown className="w-5 h-5 text-red-500" />
                <span className="text-sm text-gray-600">Custos Fixos</span>
              </div>
              <p className="text-xl font-bold text-red-600">
                {formatCurrency(data.dados.custosFixos)}
              </p>
            </div>

            <div className="card">
              <div className="flex items-center gap-2 mb-3">
                <DollarSign className="w-5 h-5 text-blue-500" />
                <span className="text-sm text-gray-600">Margem Contribuição</span>
              </div>
              <p className="text-xl font-bold text-blue-600">
                {data.dados.margemContribuicaoPercent}%
              </p>
            </div>
          </div>

          {/* Como funciona */}
          <div className="card">
            <h3 className="text-lg font-semibold mb-4">📚 Como funciona o cálculo?</h3>
            
            <div className="space-y-4">
              <div className="flex items-start gap-4">
                <div className="w-8 h-8 bg-primary-100 rounded-full flex items-center justify-center flex-shrink-0">
                  <span className="text-primary-600 font-bold">1</span>
                </div>
                <div>
                  <p className="font-medium">Margem de Contribuição</p>
                  <p className="text-sm text-gray-600">
                    Receita - Custos Variáveis = <strong>{formatCurrency(data.dados.margemContribuicao)}</strong>
                  </p>
                  <p className="text-xs text-gray-500 mt-1">
                    É o quanto sobra de cada venda para pagar os custos fixos
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-4">
                <div className="w-8 h-8 bg-primary-100 rounded-full flex items-center justify-center flex-shrink-0">
                  <span className="text-primary-600 font-bold">2</span>
                </div>
                <div>
                  <p className="font-medium">Margem de Contribuição %</p>
                  <p className="text-sm text-gray-600">
                    (Margem / Receita) × 100 = <strong>{data.dados.margemContribuicaoPercent}%</strong>
                  </p>
                  <p className="text-xs text-gray-500 mt-1">
                    De cada R$ 100 que entra, {data.dados.margemContribuicaoPercent} sobram para pagar fixos
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-4">
                <div className="w-8 h-8 bg-primary-100 rounded-full flex items-center justify-center flex-shrink-0">
                  <span className="text-primary-600 font-bold">3</span>
                </div>
                <div>
                  <p className="font-medium">Ponto de Equilíbrio</p>
                  <p className="text-sm text-gray-600">
                    Custos Fixos / (Margem % / 100) = <strong>{formatCurrency(data.pontoEquilibrio.valor)}</strong>
                  </p>
                  <p className="text-xs text-gray-500 mt-1">
                    Faturamento necessário para pagar todos os custos (sem lucro, sem prejuízo)
                  </p>
                </div>
              </div>
            </div>

            {/* Fórmula visual */}
            <div className="mt-6 p-4 bg-gray-50 rounded-lg">
              <p className="text-center text-sm text-gray-600 mb-3">Fórmula simplificada:</p>
              <div className="flex items-center justify-center gap-2 flex-wrap">
                <span className="px-3 py-2 bg-red-100 text-red-700 rounded-lg font-medium">
                  Custos Fixos
                </span>
                <span className="text-gray-500">÷</span>
                <span className="px-3 py-2 bg-blue-100 text-blue-700 rounded-lg font-medium">
                  Margem %
                </span>
                <span className="text-gray-500">=</span>
                <span className="px-3 py-2 bg-green-100 text-green-700 rounded-lg font-medium">
                  Ponto de Equilíbrio
                </span>
              </div>
            </div>
          </div>

          {/* Dicas */}
          <div className="grid md:grid-cols-2 gap-4">
            <div className="card bg-gradient-to-br from-blue-50 to-white">
              <h4 className="font-semibold text-blue-900 mb-2">💡 Para aumentar a margem:</h4>
              <ul className="text-sm text-blue-800 space-y-1">
                <li>• Negocie melhores preços com fornecedores</li>
                <li>• Reduza desperdícios na produção</li>
                <li>• Revise preços de venda se possível</li>
                <li>• Otimize processos para gastar menos</li>
              </ul>
            </div>

            <div className="card bg-gradient-to-br from-amber-50 to-white">
              <h4 className="font-semibold text-amber-900 mb-2">⚡ Para reduzir o PE:</h4>
              <ul className="text-sm text-amber-800 space-y-1">
                <li>• Renegocie aluguel e contratos</li>
                <li>• Avalie necessidade de cada custo fixo</li>
                <li>• Busque alternativas mais baratas</li>
                <li>• Automatize processos quando possível</li>
              </ul>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
