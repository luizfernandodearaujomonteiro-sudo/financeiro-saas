import { useState, useEffect } from 'react'
import { useAuth } from '../contexts/AuthContext'
import api from '../services/api'
import {
  TrendingUp,
  TrendingDown,
  DollarSign,
  Percent,
  Calendar,
  RefreshCw,
  AlertCircle
} from 'lucide-react'
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
  Legend
} from 'recharts'

const periodos = [
  { value: 'mes_atual', label: 'Mês Atual' },
  { value: 'ultimo_mes', label: 'Mês Passado' },
  { value: '3_meses', label: 'Últimos 3 Meses' }
]

const formatCurrency = (value) => {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL'
  }).format(value)
}

export default function Dashboard() {
  const { empresa } = useAuth()
  const [periodo, setPeriodo] = useState('mes_atual')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [data, setData] = useState(null)

  useEffect(() => {
    loadDashboard()
  }, [periodo])

  const loadDashboard = async () => {
    setLoading(true)
    setError('')
    try {
      const response = await api.getDashboard({ periodo })
      setData(response)
    } catch (err) {
      setError('Erro ao carregar dados do dashboard')
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  const getResultadoColor = (valor) => {
    if (valor > 0) return 'text-green-600'
    if (valor < 0) return 'text-red-600'
    return 'text-gray-600'
  }

  const getResultadoBg = (valor) => {
    if (valor > 0) return 'bg-green-50'
    if (valor < 0) return 'bg-red-50'
    return 'bg-gray-50'
  }

  if (loading && !data) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <div className="w-10 h-10 border-4 border-primary-600 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-gray-600">Carregando dados...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6 pb-20 lg:pb-0">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
          <p className="text-gray-600">Visão geral das finanças de {empresa?.nome}</p>
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
          <button
            onClick={loadDashboard}
            className="btn btn-ghost p-2"
            title="Atualizar"
          >
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
          {/* Cards principais */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="card">
              <div className="flex items-center justify-between mb-3">
                <span className="text-sm text-gray-600">Receitas</span>
                <div className="w-8 h-8 bg-green-100 rounded-lg flex items-center justify-center">
                  <TrendingUp className="w-4 h-4 text-green-600" />
                </div>
              </div>
              <p className="text-xl lg:text-2xl font-bold text-green-600">
                {formatCurrency(data.cards.receitas)}
              </p>
            </div>

            <div className="card">
              <div className="flex items-center justify-between mb-3">
                <span className="text-sm text-gray-600">Despesas</span>
                <div className="w-8 h-8 bg-red-100 rounded-lg flex items-center justify-center">
                  <TrendingDown className="w-4 h-4 text-red-600" />
                </div>
              </div>
              <p className="text-xl lg:text-2xl font-bold text-red-600">
                {formatCurrency(data.cards.despesas)}
              </p>
            </div>

            <div className={`card ${getResultadoBg(data.cards.resultado)}`}>
              <div className="flex items-center justify-between mb-3">
                <span className="text-sm text-gray-600">Resultado</span>
                <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                  data.cards.resultado >= 0 ? 'bg-green-200' : 'bg-red-200'
                }`}>
                  <DollarSign className={`w-4 h-4 ${getResultadoColor(data.cards.resultado)}`} />
                </div>
              </div>
              <p className={`text-xl lg:text-2xl font-bold ${getResultadoColor(data.cards.resultado)}`}>
                {formatCurrency(data.cards.resultado)}
              </p>
            </div>

            <div className="card">
              <div className="flex items-center justify-between mb-3">
                <span className="text-sm text-gray-600">Margem</span>
                <div className="w-8 h-8 bg-primary-100 rounded-lg flex items-center justify-center">
                  <Percent className="w-4 h-4 text-primary-600" />
                </div>
              </div>
              <p className={`text-xl lg:text-2xl font-bold ${getResultadoColor(parseFloat(data.cards.margem))}`}>
                {data.cards.margem}%
              </p>
            </div>
          </div>

          {/* Cards de custos */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <div className="card bg-gradient-to-br from-amber-50 to-white">
              <p className="text-sm text-gray-600 mb-1">Custos Fixos</p>
              <p className="text-lg font-bold text-amber-600">
                {formatCurrency(data.custos.fixos)}
              </p>
              <p className="text-xs text-gray-500 mt-1">
                Aluguel, salários, contas fixas...
              </p>
            </div>
            <div className="card bg-gradient-to-br from-orange-50 to-white">
              <p className="text-sm text-gray-600 mb-1">Custos Variáveis</p>
              <p className="text-lg font-bold text-orange-600">
                {formatCurrency(data.custos.variaveis)}
              </p>
              <p className="text-xs text-gray-500 mt-1">
                Insumos, materiais, comissões...
              </p>
            </div>
            <div className="card bg-gradient-to-br from-blue-50 to-white">
              <p className="text-sm text-gray-600 mb-1">Margem de Contribuição</p>
              <p className="text-lg font-bold text-blue-600">
                {formatCurrency(data.custos.margemContribuicao)}
              </p>
              <p className="text-xs text-gray-500 mt-1">
                Receita - Custos Variáveis
              </p>
            </div>
          </div>

          {/* Gráficos */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Gráfico de linha - Receitas vs Despesas */}
            <div className="card">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">
                Receitas vs Despesas
              </h3>
              {data.graficos.linha.length > 0 ? (
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={data.graficos.linha}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                      <XAxis 
                        dataKey="data" 
                        tick={{ fontSize: 12 }}
                        tickLine={false}
                      />
                      <YAxis 
                        tick={{ fontSize: 12 }}
                        tickLine={false}
                        tickFormatter={(value) => `R$${value/1000}k`}
                      />
                      <Tooltip 
                        formatter={(value) => formatCurrency(value)}
                        labelStyle={{ color: '#374151' }}
                      />
                      <Line 
                        type="monotone" 
                        dataKey="receitas" 
                        stroke="#22c55e" 
                        strokeWidth={2}
                        dot={{ r: 4 }}
                        name="Receitas"
                      />
                      <Line 
                        type="monotone" 
                        dataKey="despesas" 
                        stroke="#ef4444" 
                        strokeWidth={2}
                        dot={{ r: 4 }}
                        name="Despesas"
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <div className="h-64 flex items-center justify-center text-gray-500">
                  Sem dados para o período selecionado
                </div>
              )}
            </div>

            {/* Gráfico de pizza - Despesas por categoria */}
            <div className="card">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">
                Despesas por Categoria
              </h3>
              {data.graficos.donut.length > 0 ? (
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={data.graficos.donut}
                        cx="50%"
                        cy="50%"
                        innerRadius={50}
                        outerRadius={80}
                        paddingAngle={2}
                        dataKey="valor"
                        nameKey="nome"
                      >
                        {data.graficos.donut.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.cor} />
                        ))}
                      </Pie>
                      <Tooltip 
                        formatter={(value) => formatCurrency(value)}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <div className="h-64 flex items-center justify-center text-gray-500">
                  Sem despesas no período
                </div>
              )}
              {/* Legenda */}
              <div className="flex flex-wrap gap-2 mt-4 justify-center">
                {data.graficos.donut.slice(0, 5).map((item, index) => (
                  <div key={index} className="flex items-center gap-1.5 text-xs">
                    <div 
                      className="w-3 h-3 rounded-full"
                      style={{ backgroundColor: item.cor }}
                    />
                    <span className="text-gray-600">{item.nome}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Gráfico de barras - Fixos vs Variáveis */}
            <div className="card lg:col-span-2">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">
                Custos Fixos vs Variáveis
              </h3>
              <div className="h-48">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart 
                    data={data.graficos.barras}
                    layout="vertical"
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                    <XAxis 
                      type="number"
                      tick={{ fontSize: 12 }}
                      tickFormatter={(value) => formatCurrency(value)}
                    />
                    <YAxis 
                      type="category"
                      dataKey="nome"
                      tick={{ fontSize: 12 }}
                      width={80}
                    />
                    <Tooltip 
                      formatter={(value) => formatCurrency(value)}
                    />
                    <Bar 
                      dataKey="valor" 
                      radius={[0, 4, 4, 0]}
                    >
                      {data.graficos.barras.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.cor} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
              
              {/* Dica educativa */}
              <div className="mt-4 p-3 bg-blue-50 rounded-lg">
                <p className="text-sm text-blue-800">
                  💡 <strong>Dica:</strong> Custos fixos são aqueles que não mudam com seu volume de vendas (aluguel, salários). 
                  Custos variáveis aumentam ou diminuem conforme você vende mais ou menos (ingredientes, embalagens).
                </p>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
