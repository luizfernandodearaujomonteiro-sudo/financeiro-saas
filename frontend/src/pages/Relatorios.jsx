import { useState, useEffect } from 'react'
import api from '../services/api'
import {
  FileText,
  Download,
  RefreshCw,
  TrendingUp,
  TrendingDown,
  Calendar,
  AlertCircle
} from 'lucide-react'
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
  LineChart,
  Line
} from 'recharts'

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

export default function Relatorios() {
  const [periodo, setPeriodo] = useState('mes_atual')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [dre, setDre] = useState(null)
  const [mensal, setMensal] = useState([])
  const [downloadingPDF, setDownloadingPDF] = useState(false)

  useEffect(() => {
    loadRelatorios()
  }, [periodo])

  const loadRelatorios = async () => {
    setLoading(true)
    setError('')
    try {
      const [dreData, mensalData] = await Promise.all([
        api.getDRE({ periodo }),
        api.getRelatorioMensal(6)
      ])
      setDre(dreData)
      setMensal(mensalData)
    } catch (err) {
      setError('Erro ao carregar relatórios')
    } finally {
      setLoading(false)
    }
  }

  const handleDownloadPDF = async () => {
    setDownloadingPDF(true)
    try {
      const blob = await api.downloadPDF({ periodo, tipo: 'completo' })
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `relatorio-financeiro-${new Date().toISOString().split('T')[0]}.pdf`
      document.body.appendChild(a)
      a.click()
      window.URL.revokeObjectURL(url)
      document.body.removeChild(a)
    } catch (err) {
      setError('Erro ao baixar PDF')
    } finally {
      setDownloadingPDF(false)
    }
  }

  const getResultColor = (value) => {
    if (value > 0) return 'text-green-600'
    if (value < 0) return 'text-red-600'
    return 'text-gray-600'
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <div className="w-10 h-10 border-4 border-primary-600 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-gray-600">Carregando relatórios...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6 pb-20 lg:pb-0">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Relatórios</h1>
          <p className="text-gray-600">Análise financeira detalhada</p>
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
            onClick={handleDownloadPDF}
            disabled={downloadingPDF}
            className="btn btn-primary"
          >
            {downloadingPDF ? (
              <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
            ) : (
              <>
                <Download className="w-5 h-5" />
                <span className="hidden sm:inline">Exportar PDF</span>
              </>
            )}
          </button>
        </div>
      </div>

      {error && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-lg flex items-center gap-3">
          <AlertCircle className="w-5 h-5 text-red-500" />
          <p className="text-red-700">{error}</p>
        </div>
      )}

      {/* DRE Simplificada */}
      {dre && (
        <div className="card">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 bg-primary-100 rounded-lg flex items-center justify-center">
              <FileText className="w-5 h-5 text-primary-600" />
            </div>
            <div>
              <h2 className="text-lg font-semibold">DRE Simplificada</h2>
              <p className="text-sm text-gray-500">Demonstração do Resultado do Exercício</p>
            </div>
          </div>

          <div className="space-y-3">
            {/* Receita */}
            <div className="flex items-center justify-between py-3 border-b">
              <div className="flex items-center gap-2">
                <TrendingUp className="w-5 h-5 text-green-500" />
                <span className="font-medium">Receita Total</span>
              </div>
              <span className="text-lg font-semibold text-green-600">
                {formatCurrency(dre.dre.receitaTotal)}
              </span>
            </div>

            {/* Custos Variáveis */}
            <div className="flex items-center justify-between py-3 border-b">
              <div className="flex items-center gap-2">
                <TrendingDown className="w-5 h-5 text-orange-500" />
                <span className="font-medium">(-) Custos Variáveis</span>
                <span className="text-xs text-gray-500 bg-gray-100 px-2 py-0.5 rounded">
                  {dre.percentuais.custosVariaveisPercent}%
                </span>
              </div>
              <span className="text-lg font-medium text-orange-600">
                {formatCurrency(dre.dre.custosVariaveis)}
              </span>
            </div>

            {/* Margem de Contribuição */}
            <div className="flex items-center justify-between py-3 bg-blue-50 px-4 -mx-4 rounded-lg">
              <div>
                <span className="font-semibold text-blue-900">(=) Margem de Contribuição</span>
                <span className="text-xs text-blue-600 bg-blue-100 px-2 py-0.5 rounded ml-2">
                  {dre.percentuais.margemContribuicaoPercent}%
                </span>
              </div>
              <span className="text-lg font-bold text-blue-600">
                {formatCurrency(dre.dre.margemContribuicao)}
              </span>
            </div>

            {/* Custos Fixos */}
            <div className="flex items-center justify-between py-3 border-b">
              <div className="flex items-center gap-2">
                <TrendingDown className="w-5 h-5 text-red-500" />
                <span className="font-medium">(-) Custos Fixos</span>
                <span className="text-xs text-gray-500 bg-gray-100 px-2 py-0.5 rounded">
                  {dre.percentuais.custosFixosPercent}%
                </span>
              </div>
              <span className="text-lg font-medium text-red-600">
                {formatCurrency(dre.dre.custosFixos)}
              </span>
            </div>

            {/* Resultado */}
            <div className={`flex items-center justify-between py-4 px-4 -mx-4 rounded-lg ${
              dre.dre.resultado >= 0 ? 'bg-green-50' : 'bg-red-50'
            }`}>
              <div>
                <span className={`font-bold text-lg ${getResultColor(dre.dre.resultado)}`}>
                  (=) Resultado Final
                </span>
                <span className={`text-xs px-2 py-0.5 rounded ml-2 ${
                  dre.dre.resultado >= 0 ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                }`}>
                  {dre.percentuais.resultadoPercent}%
                </span>
              </div>
              <span className={`text-2xl font-bold ${getResultColor(dre.dre.resultado)}`}>
                {formatCurrency(dre.dre.resultado)}
              </span>
            </div>
          </div>

          {/* Dica educativa */}
          <div className="mt-6 p-4 bg-amber-50 rounded-lg border border-amber-200">
            <p className="text-sm text-amber-800">
              💡 <strong>Entendendo a DRE:</strong> A Margem de Contribuição mostra quanto sobra 
              das vendas após pagar os custos variáveis. Este valor é usado para cobrir os 
              custos fixos. O que sobrar é seu lucro!
            </p>
          </div>
        </div>
      )}

      {/* Gráfico de Resultado Mensal */}
      {mensal.length > 0 && (
        <div className="card">
          <h2 className="text-lg font-semibold mb-4">Resultado por Mês</h2>
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={mensal}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="mes" tick={{ fontSize: 12 }} />
                <YAxis 
                  tick={{ fontSize: 12 }}
                  tickFormatter={(value) => `R$${(value/1000).toFixed(0)}k`}
                />
                <Tooltip 
                  formatter={(value) => formatCurrency(value)}
                  labelStyle={{ color: '#374151' }}
                />
                <Legend />
                <Bar dataKey="receitas" name="Receitas" fill="#22c55e" radius={[4, 4, 0, 0]} />
                <Bar dataKey="despesas" name="Despesas" fill="#ef4444" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* Gráfico de Custos Fixos vs Variáveis */}
      {mensal.length > 0 && (
        <div className="card">
          <h2 className="text-lg font-semibold mb-4">Custos Fixos vs Variáveis por Mês</h2>
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={mensal}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="mes" tick={{ fontSize: 12 }} />
                <YAxis 
                  tick={{ fontSize: 12 }}
                  tickFormatter={(value) => `R$${(value/1000).toFixed(0)}k`}
                />
                <Tooltip 
                  formatter={(value) => formatCurrency(value)}
                  labelStyle={{ color: '#374151' }}
                />
                <Legend />
                <Line 
                  type="monotone" 
                  dataKey="fixos" 
                  name="Custos Fixos" 
                  stroke="#f59e0b" 
                  strokeWidth={2}
                  dot={{ r: 4 }}
                />
                <Line 
                  type="monotone" 
                  dataKey="variaveis" 
                  name="Custos Variáveis" 
                  stroke="#06b6d4" 
                  strokeWidth={2}
                  dot={{ r: 4 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>

          {/* Insight */}
          <div className="mt-4 p-4 bg-blue-50 rounded-lg">
            <p className="text-sm text-blue-800">
              📊 <strong>Análise:</strong> Custos fixos devem permanecer estáveis mês a mês, 
              enquanto custos variáveis acompanham o volume de vendas. Se seus custos fixos 
              estão subindo sem aumento de receita, atenção!
            </p>
          </div>
        </div>
      )}

      {/* Tabela de resumo mensal */}
      {mensal.length > 0 && (
        <div className="card overflow-hidden p-0">
          <div className="px-6 py-4 border-b">
            <h2 className="text-lg font-semibold">Resumo Mensal Detalhado</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-sm font-medium text-gray-600">Mês</th>
                  <th className="px-4 py-3 text-right text-sm font-medium text-gray-600">Receitas</th>
                  <th className="px-4 py-3 text-right text-sm font-medium text-gray-600">Despesas</th>
                  <th className="px-4 py-3 text-right text-sm font-medium text-gray-600">Fixos</th>
                  <th className="px-4 py-3 text-right text-sm font-medium text-gray-600">Variáveis</th>
                  <th className="px-4 py-3 text-right text-sm font-medium text-gray-600">Resultado</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {mensal.map((m, i) => (
                  <tr key={i} className="hover:bg-gray-50">
                    <td className="px-4 py-3 font-medium">{m.mes}</td>
                    <td className="px-4 py-3 text-right text-green-600">
                      {formatCurrency(m.receitas)}
                    </td>
                    <td className="px-4 py-3 text-right text-red-600">
                      {formatCurrency(m.despesas)}
                    </td>
                    <td className="px-4 py-3 text-right text-amber-600">
                      {formatCurrency(m.fixos)}
                    </td>
                    <td className="px-4 py-3 text-right text-cyan-600">
                      {formatCurrency(m.variaveis)}
                    </td>
                    <td className={`px-4 py-3 text-right font-semibold ${getResultColor(m.resultado)}`}>
                      {formatCurrency(m.resultado)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
