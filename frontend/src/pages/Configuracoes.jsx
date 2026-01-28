import { useState, useEffect } from 'react'
import { useAuth } from '../contexts/AuthContext'
import api from '../services/api'
import {
  Building2,
  User,
  Settings,
  Download,
  Save,
  Check,
  AlertCircle,
  FileText,
  Database
} from 'lucide-react'

export default function Configuracoes() {
  const { user, empresa, refreshUserData } = useAuth()
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [success, setSuccess] = useState('')
  const [error, setError] = useState('')

  const [empresaData, setEmpresaData] = useState({
    nome: '',
    segmento: ''
  })

  const [configData, setConfigData] = useState({
    moeda: 'BRL',
    dia_inicio_mes: 1,
    periodo_padrao: 'mes_atual'
  })

  useEffect(() => {
    loadData()
  }, [])

  const loadData = async () => {
    setLoading(true)
    try {
      const [empresaRes, configRes] = await Promise.all([
        api.getEmpresa(),
        api.getConfiguracoes()
      ])
      setEmpresaData({
        nome: empresaRes.nome || '',
        segmento: empresaRes.segmento || ''
      })
      setConfigData({
        moeda: configRes.moeda || 'BRL',
        dia_inicio_mes: configRes.dia_inicio_mes || 1,
        periodo_padrao: configRes.periodo_padrao || 'mes_atual'
      })
    } catch (err) {
      setError('Erro ao carregar configurações')
    } finally {
      setLoading(false)
    }
  }

  const handleSaveEmpresa = async () => {
    setSaving(true)
    setError('')
    try {
      await api.atualizarEmpresa(empresaData)
      setSuccess('Dados da empresa atualizados!')
      refreshUserData()
      setTimeout(() => setSuccess(''), 3000)
    } catch (err) {
      setError(err.message || 'Erro ao salvar')
    } finally {
      setSaving(false)
    }
  }

  const handleSaveConfig = async () => {
    setSaving(true)
    setError('')
    try {
      await api.atualizarConfiguracoes(configData)
      setSuccess('Configurações salvas!')
      setTimeout(() => setSuccess(''), 3000)
    } catch (err) {
      setError(err.message || 'Erro ao salvar')
    } finally {
      setSaving(false)
    }
  }

  const handleDownloadBackup = async () => {
    try {
      const data = await api.downloadBackup()
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `backup-${empresaData.nome.replace(/\s/g, '-')}-${new Date().toISOString().split('T')[0]}.json`
      document.body.appendChild(a)
      a.click()
      window.URL.revokeObjectURL(url)
      document.body.removeChild(a)
      setSuccess('Backup baixado!')
      setTimeout(() => setSuccess(''), 3000)
    } catch (err) {
      setError('Erro ao gerar backup')
    }
  }

  const handleDownloadCSV = async () => {
    try {
      const blob = await api.downloadCSV()
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `lancamentos-${new Date().toISOString().split('T')[0]}.csv`
      document.body.appendChild(a)
      a.click()
      window.URL.revokeObjectURL(url)
      document.body.removeChild(a)
      setSuccess('CSV exportado!')
      setTimeout(() => setSuccess(''), 3000)
    } catch (err) {
      setError('Erro ao exportar CSV')
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-10 h-10 border-4 border-primary-600 border-t-transparent rounded-full animate-spin"></div>
      </div>
    )
  }

  return (
    <div className="space-y-6 pb-20 lg:pb-0 max-w-3xl">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Configurações</h1>
        <p className="text-gray-600">Gerencie sua conta e preferências</p>
      </div>

      {/* Mensagens */}
      {error && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-lg flex items-center gap-3">
          <AlertCircle className="w-5 h-5 text-red-500" />
          <p className="text-red-700">{error}</p>
        </div>
      )}

      {success && (
        <div className="p-4 bg-green-50 border border-green-200 rounded-lg flex items-center gap-3">
          <Check className="w-5 h-5 text-green-500" />
          <p className="text-green-700">{success}</p>
        </div>
      )}

      {/* Dados do Usuário */}
      <div className="card">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 bg-primary-100 rounded-lg flex items-center justify-center">
            <User className="w-5 h-5 text-primary-600" />
          </div>
          <div>
            <h2 className="text-lg font-semibold">Seu Perfil</h2>
            <p className="text-sm text-gray-500">Informações da sua conta</p>
          </div>
        </div>

        <div className="grid gap-4">
          <div>
            <label className="label">Nome</label>
            <input
              type="text"
              value={user?.nome || ''}
              className="input bg-gray-50"
              disabled
            />
          </div>
          <div>
            <label className="label">E-mail</label>
            <input
              type="email"
              value={user?.email || ''}
              className="input bg-gray-50"
              disabled
            />
          </div>
        </div>

        <p className="text-xs text-gray-500 mt-4">
          Para alterar seu nome ou e-mail, entre em contato com o suporte.
        </p>
      </div>

      {/* Dados da Empresa */}
      <div className="card">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
            <Building2 className="w-5 h-5 text-blue-600" />
          </div>
          <div>
            <h2 className="text-lg font-semibold">Dados da Empresa</h2>
            <p className="text-sm text-gray-500">Informações do seu negócio</p>
          </div>
        </div>

        <div className="grid gap-4">
          <div>
            <label className="label">Nome da Empresa</label>
            <input
              type="text"
              value={empresaData.nome}
              onChange={(e) => setEmpresaData({ ...empresaData, nome: e.target.value })}
              className="input"
            />
          </div>
          <div>
            <label className="label">Segmento</label>
            <select
              value={empresaData.segmento}
              onChange={(e) => setEmpresaData({ ...empresaData, segmento: e.target.value })}
              className="select"
            >
              <option value="">Selecione...</option>
              <option value="Confeitaria">Confeitaria</option>
              <option value="Barbearia">Barbearia</option>
              <option value="Lanchonete">Lanchonete</option>
              <option value="Restaurante">Restaurante</option>
              <option value="Clínica">Clínica</option>
              <option value="Salão de Beleza">Salão de Beleza</option>
              <option value="Pet Shop">Pet Shop</option>
              <option value="Mercado">Mercado</option>
              <option value="Outro">Outro</option>
            </select>
          </div>
        </div>

        <button
          onClick={handleSaveEmpresa}
          disabled={saving}
          className="btn btn-primary mt-4"
        >
          {saving ? (
            <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
          ) : (
            <>
              <Save className="w-4 h-4" />
              Salvar Empresa
            </>
          )}
        </button>
      </div>

      {/* Preferências */}
      <div className="card">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 bg-amber-100 rounded-lg flex items-center justify-center">
            <Settings className="w-5 h-5 text-amber-600" />
          </div>
          <div>
            <h2 className="text-lg font-semibold">Preferências</h2>
            <p className="text-sm text-gray-500">Personalize sua experiência</p>
          </div>
        </div>

        <div className="grid gap-4">
          <div>
            <label className="label">Moeda</label>
            <select
              value={configData.moeda}
              onChange={(e) => setConfigData({ ...configData, moeda: e.target.value })}
              className="select"
            >
              <option value="BRL">Real (R$)</option>
              <option value="USD">Dólar ($)</option>
              <option value="EUR">Euro (€)</option>
            </select>
          </div>
          <div>
            <label className="label">Dia de Início do Mês</label>
            <select
              value={configData.dia_inicio_mes}
              onChange={(e) => setConfigData({ ...configData, dia_inicio_mes: parseInt(e.target.value) })}
              className="select"
            >
              {Array.from({ length: 28 }, (_, i) => i + 1).map(dia => (
                <option key={dia} value={dia}>Dia {dia}</option>
              ))}
            </select>
            <p className="text-xs text-gray-500 mt-1">
              Útil se você prefere fechar o mês em uma data diferente do dia 1
            </p>
          </div>
          <div>
            <label className="label">Período Padrão nos Relatórios</label>
            <select
              value={configData.periodo_padrao}
              onChange={(e) => setConfigData({ ...configData, periodo_padrao: e.target.value })}
              className="select"
            >
              <option value="mes_atual">Mês Atual</option>
              <option value="ultimo_mes">Mês Passado</option>
              <option value="3_meses">Últimos 3 Meses</option>
            </select>
          </div>
        </div>

        <button
          onClick={handleSaveConfig}
          disabled={saving}
          className="btn btn-primary mt-4"
        >
          {saving ? (
            <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
          ) : (
            <>
              <Save className="w-4 h-4" />
              Salvar Preferências
            </>
          )}
        </button>
      </div>

      {/* Exportar Dados */}
      <div className="card">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 bg-green-100 rounded-lg flex items-center justify-center">
            <Download className="w-5 h-5 text-green-600" />
          </div>
          <div>
            <h2 className="text-lg font-semibold">Exportar Dados</h2>
            <p className="text-sm text-gray-500">Baixe seus dados</p>
          </div>
        </div>

        <div className="grid sm:grid-cols-2 gap-4">
          <button
            onClick={handleDownloadBackup}
            className="flex items-center gap-3 p-4 border rounded-lg hover:bg-gray-50 transition-colors text-left"
          >
            <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center flex-shrink-0">
              <Database className="w-5 h-5 text-blue-600" />
            </div>
            <div>
              <p className="font-medium">Backup Completo</p>
              <p className="text-sm text-gray-500">Todos os dados em JSON</p>
            </div>
          </button>

          <button
            onClick={handleDownloadCSV}
            className="flex items-center gap-3 p-4 border rounded-lg hover:bg-gray-50 transition-colors text-left"
          >
            <div className="w-10 h-10 bg-green-100 rounded-lg flex items-center justify-center flex-shrink-0">
              <FileText className="w-5 h-5 text-green-600" />
            </div>
            <div>
              <p className="font-medium">Lançamentos CSV</p>
              <p className="text-sm text-gray-500">Compatível com Excel</p>
            </div>
          </button>
        </div>
      </div>

      {/* Info */}
      <div className="card bg-gray-50">
        <p className="text-sm text-gray-600 text-center">
          Sistema de Gestão Financeira v1.0.0
          <br />
          <span className="text-xs">Desenvolvido para pequenos negócios</span>
        </p>
      </div>
    </div>
  )
}
