import { useState, useEffect } from 'react'
import api from '../services/api'
import {
  Plus,
  Search,
  Filter,
  Edit2,
  Trash2,
  Copy,
  X,
  Check,
  AlertCircle,
  TrendingUp,
  TrendingDown,
  ChevronLeft,
  ChevronRight
} from 'lucide-react'

const formatCurrency = (value) => {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL'
  }).format(value)
}

const formatDate = (date) => {
  return new Date(date + 'T00:00:00').toLocaleDateString('pt-BR')
}

const formasPagamento = [
  { value: 'pix', label: 'PIX' },
  { value: 'dinheiro', label: 'Dinheiro' },
  { value: 'cartao', label: 'Cartão' },
  { value: 'boleto', label: 'Boleto' }
]

const centrosCusto = [
  { value: 'producao', label: 'Produção' },
  { value: 'atendimento', label: 'Atendimento' },
  { value: 'administracao', label: 'Administração' }
]

const initialFormData = {
  tipo: 'despesa',
  descricao: '',
  valor: '',
  data: new Date().toISOString().split('T')[0],
  categoria_id: '',
  forma_pagamento: '',
  centro_custo: '',
  fixo_variavel: 'variavel',
  observacoes: ''
}

export default function Lancamentos() {
  const [lancamentos, setLancamentos] = useState([])
  const [categorias, setCategorias] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  
  // Filtros
  const [filtros, setFiltros] = useState({
    tipo: '',
    categoria_id: '',
    data_inicio: '',
    data_fim: ''
  })
  const [showFiltros, setShowFiltros] = useState(false)
  const [busca, setBusca] = useState('')
  
  // Modal
  const [modalOpen, setModalOpen] = useState(false)
  const [editando, setEditando] = useState(null)
  const [formData, setFormData] = useState(initialFormData)
  const [saving, setSaving] = useState(false)
  
  // Paginação
  const [pagination, setPagination] = useState({
    page: 1,
    limit: 20,
    total: 0,
    totalPages: 0
  })

  // Seleção múltipla
  const [selecionados, setSelecionados] = useState([])

  useEffect(() => {
    loadCategorias()
  }, [])

  useEffect(() => {
    loadLancamentos()
  }, [filtros, pagination.page])

  const loadCategorias = async () => {
    try {
      const data = await api.getCategorias()
      setCategorias(data)
    } catch (err) {
      console.error('Erro ao carregar categorias:', err)
    }
  }

  const loadLancamentos = async () => {
    setLoading(true)
    try {
      const params = {
        page: pagination.page,
        limit: pagination.limit,
        ...Object.fromEntries(
          Object.entries(filtros).filter(([_, v]) => v !== '')
        )
      }
      const response = await api.getLancamentos(params)
      setLancamentos(response.data)
      setPagination(prev => ({
        ...prev,
        total: response.pagination.total,
        totalPages: response.pagination.totalPages
      }))
    } catch (err) {
      setError('Erro ao carregar lançamentos')
    } finally {
      setLoading(false)
    }
  }

  const handleOpenModal = (lancamento = null) => {
    if (lancamento) {
      setEditando(lancamento.id)
      setFormData({
        tipo: lancamento.tipo,
        descricao: lancamento.descricao,
        valor: lancamento.valor.toString(),
        data: lancamento.data,
        categoria_id: lancamento.categoria_id || '',
        forma_pagamento: lancamento.forma_pagamento || '',
        centro_custo: lancamento.centro_custo || '',
        fixo_variavel: lancamento.fixo_variavel || 'variavel',
        observacoes: lancamento.observacoes || ''
      })
    } else {
      setEditando(null)
      setFormData(initialFormData)
    }
    setModalOpen(true)
  }

  const handleCloseModal = () => {
    setModalOpen(false)
    setEditando(null)
    setFormData(initialFormData)
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setSaving(true)
    setError('')

    try {
      const dados = {
        ...formData,
        valor: parseFloat(formData.valor.replace(',', '.')),
        categoria_id: formData.categoria_id || null,
        forma_pagamento: formData.forma_pagamento || null,
        centro_custo: formData.centro_custo || null,
        fixo_variavel: formData.tipo === 'despesa' ? formData.fixo_variavel : null
      }

      if (editando) {
        await api.atualizarLancamento(editando, dados)
        setSuccess('Lançamento atualizado com sucesso!')
      } else {
        await api.criarLancamento(dados)
        setSuccess('Lançamento criado com sucesso!')
      }

      handleCloseModal()
      loadLancamentos()
      setTimeout(() => setSuccess(''), 3000)
    } catch (err) {
      setError(err.message || 'Erro ao salvar lançamento')
    } finally {
      setSaving(false)
    }
  }

  const handleDuplicar = async (id) => {
    try {
      await api.duplicarLancamento(id)
      setSuccess('Lançamento duplicado!')
      loadLancamentos()
      setTimeout(() => setSuccess(''), 3000)
    } catch (err) {
      setError('Erro ao duplicar lançamento')
    }
  }

  const handleExcluir = async (id) => {
    if (!confirm('Tem certeza que deseja excluir este lançamento?')) return

    try {
      await api.excluirLancamento(id)
      setSuccess('Lançamento excluído!')
      loadLancamentos()
      setTimeout(() => setSuccess(''), 3000)
    } catch (err) {
      setError('Erro ao excluir lançamento')
    }
  }

  const handleExcluirSelecionados = async () => {
    if (!confirm(`Excluir ${selecionados.length} lançamento(s)?`)) return

    try {
      await api.excluirLancamentos(selecionados)
      setSuccess(`${selecionados.length} lançamento(s) excluído(s)!`)
      setSelecionados([])
      loadLancamentos()
      setTimeout(() => setSuccess(''), 3000)
    } catch (err) {
      setError('Erro ao excluir lançamentos')
    }
  }

  const toggleSelecionado = (id) => {
    setSelecionados(prev =>
      prev.includes(id)
        ? prev.filter(i => i !== id)
        : [...prev, id]
    )
  }

  const toggleTodos = () => {
    if (selecionados.length === lancamentos.length) {
      setSelecionados([])
    } else {
      setSelecionados(lancamentos.map(l => l.id))
    }
  }

  const lancamentosFiltrados = lancamentos.filter(l =>
    l.descricao.toLowerCase().includes(busca.toLowerCase())
  )

  const categoriasDoTipo = categorias.filter(c => c.tipo === formData.tipo)

  return (
    <div className="space-y-6 pb-20 lg:pb-0">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Lançamentos</h1>
          <p className="text-gray-600">Gerencie suas receitas e despesas</p>
        </div>
        <button
          onClick={() => handleOpenModal()}
          className="btn btn-primary"
        >
          <Plus className="w-5 h-5" />
          Novo Lançamento
        </button>
      </div>

      {/* Mensagens */}
      {error && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-lg flex items-center gap-3">
          <AlertCircle className="w-5 h-5 text-red-500" />
          <p className="text-red-700">{error}</p>
          <button onClick={() => setError('')} className="ml-auto">
            <X className="w-4 h-4 text-red-500" />
          </button>
        </div>
      )}

      {success && (
        <div className="p-4 bg-green-50 border border-green-200 rounded-lg flex items-center gap-3">
          <Check className="w-5 h-5 text-green-500" />
          <p className="text-green-700">{success}</p>
        </div>
      )}

      {/* Barra de busca e filtros */}
      <div className="card p-4">
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
            <input
              type="text"
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Buscar por descrição..."
              className="input pl-10"
            />
          </div>
          <button
            onClick={() => setShowFiltros(!showFiltros)}
            className={`btn ${showFiltros ? 'btn-primary' : 'btn-secondary'}`}
          >
            <Filter className="w-5 h-5" />
            Filtros
          </button>
        </div>

        {showFiltros && (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mt-4 pt-4 border-t">
            <div>
              <label className="label">Tipo</label>
              <select
                value={filtros.tipo}
                onChange={(e) => setFiltros({ ...filtros, tipo: e.target.value })}
                className="select"
              >
                <option value="">Todos</option>
                <option value="receita">Receitas</option>
                <option value="despesa">Despesas</option>
              </select>
            </div>
            <div>
              <label className="label">Categoria</label>
              <select
                value={filtros.categoria_id}
                onChange={(e) => setFiltros({ ...filtros, categoria_id: e.target.value })}
                className="select"
              >
                <option value="">Todas</option>
                {categorias.map(c => (
                  <option key={c.id} value={c.id}>{c.nome}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="label">Data Início</label>
              <input
                type="date"
                value={filtros.data_inicio}
                onChange={(e) => setFiltros({ ...filtros, data_inicio: e.target.value })}
                className="input"
              />
            </div>
            <div>
              <label className="label">Data Fim</label>
              <input
                type="date"
                value={filtros.data_fim}
                onChange={(e) => setFiltros({ ...filtros, data_fim: e.target.value })}
                className="input"
              />
            </div>
          </div>
        )}
      </div>

      {/* Ações em lote */}
      {selecionados.length > 0 && (
        <div className="card p-3 bg-primary-50 flex items-center justify-between">
          <span className="text-primary-700 font-medium">
            {selecionados.length} selecionado(s)
          </span>
          <button
            onClick={handleExcluirSelecionados}
            className="btn btn-danger py-1.5"
          >
            <Trash2 className="w-4 h-4" />
            Excluir
          </button>
        </div>
      )}

      {/* Tabela */}
      <div className="card overflow-hidden p-0">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="px-4 py-3 text-left">
                  <input
                    type="checkbox"
                    checked={selecionados.length === lancamentos.length && lancamentos.length > 0}
                    onChange={toggleTodos}
                    className="rounded"
                  />
                </th>
                <th className="px-4 py-3 text-left text-sm font-medium text-gray-600">Data</th>
                <th className="px-4 py-3 text-left text-sm font-medium text-gray-600">Descrição</th>
                <th className="px-4 py-3 text-left text-sm font-medium text-gray-600 hidden sm:table-cell">Categoria</th>
                <th className="px-4 py-3 text-left text-sm font-medium text-gray-600 hidden lg:table-cell">Tipo Custo</th>
                <th className="px-4 py-3 text-right text-sm font-medium text-gray-600">Valor</th>
                <th className="px-4 py-3 text-right text-sm font-medium text-gray-600">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {loading ? (
                <tr>
                  <td colSpan={7} className="px-4 py-12 text-center text-gray-500">
                    Carregando...
                  </td>
                </tr>
              ) : lancamentosFiltrados.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-12 text-center text-gray-500">
                    Nenhum lançamento encontrado
                  </td>
                </tr>
              ) : (
                lancamentosFiltrados.map((lancamento) => (
                  <tr key={lancamento.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3">
                      <input
                        type="checkbox"
                        checked={selecionados.includes(lancamento.id)}
                        onChange={() => toggleSelecionado(lancamento.id)}
                        className="rounded"
                      />
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-600">
                      {formatDate(lancamento.data)}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        {lancamento.tipo === 'receita' ? (
                          <TrendingUp className="w-4 h-4 text-green-500 flex-shrink-0" />
                        ) : (
                          <TrendingDown className="w-4 h-4 text-red-500 flex-shrink-0" />
                        )}
                        <span className="text-sm font-medium text-gray-900 truncate max-w-[200px]">
                          {lancamento.descricao}
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-3 hidden sm:table-cell">
                      {lancamento.categorias ? (
                        <span 
                          className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium"
                          style={{ 
                            backgroundColor: `${lancamento.categorias.cor}20`,
                            color: lancamento.categorias.cor
                          }}
                        >
                          {lancamento.categorias.nome}
                        </span>
                      ) : (
                        <span className="text-gray-400 text-sm">-</span>
                      )}
                    </td>
                    <td className="px-4 py-3 hidden lg:table-cell">
                      {lancamento.tipo === 'despesa' && lancamento.fixo_variavel && (
                        <span className={`badge ${
                          lancamento.fixo_variavel === 'fixo' 
                            ? 'badge-warning' 
                            : 'badge-info'
                        }`}>
                          {lancamento.fixo_variavel === 'fixo' ? 'Fixo' : 'Variável'}
                        </span>
                      )}
                    </td>
                    <td className={`px-4 py-3 text-right font-medium ${
                      lancamento.tipo === 'receita' ? 'text-green-600' : 'text-red-600'
                    }`}>
                      {lancamento.tipo === 'receita' ? '+' : '-'}
                      {formatCurrency(lancamento.valor)}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          onClick={() => handleOpenModal(lancamento)}
                          className="p-1.5 hover:bg-gray-100 rounded"
                          title="Editar"
                        >
                          <Edit2 className="w-4 h-4 text-gray-500" />
                        </button>
                        <button
                          onClick={() => handleDuplicar(lancamento.id)}
                          className="p-1.5 hover:bg-gray-100 rounded"
                          title="Duplicar"
                        >
                          <Copy className="w-4 h-4 text-gray-500" />
                        </button>
                        <button
                          onClick={() => handleExcluir(lancamento.id)}
                          className="p-1.5 hover:bg-red-50 rounded"
                          title="Excluir"
                        >
                          <Trash2 className="w-4 h-4 text-red-500" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Paginação */}
        {pagination.totalPages > 1 && (
          <div className="px-4 py-3 border-t flex items-center justify-between">
            <span className="text-sm text-gray-600">
              {pagination.total} lançamento(s)
            </span>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setPagination(p => ({ ...p, page: p.page - 1 }))}
                disabled={pagination.page === 1}
                className="btn btn-ghost p-2 disabled:opacity-50"
              >
                <ChevronLeft className="w-5 h-5" />
              </button>
              <span className="text-sm text-gray-600">
                Página {pagination.page} de {pagination.totalPages}
              </span>
              <button
                onClick={() => setPagination(p => ({ ...p, page: p.page + 1 }))}
                disabled={pagination.page === pagination.totalPages}
                className="btn btn-ghost p-2 disabled:opacity-50"
              >
                <ChevronRight className="w-5 h-5" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Modal de criação/edição */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div 
            className="fixed inset-0 bg-black/50"
            onClick={handleCloseModal}
          />
          <div className="relative bg-white rounded-xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="sticky top-0 bg-white border-b px-6 py-4 flex items-center justify-between">
              <h2 className="text-lg font-semibold">
                {editando ? 'Editar Lançamento' : 'Novo Lançamento'}
              </h2>
              <button onClick={handleCloseModal} className="p-1 hover:bg-gray-100 rounded">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              {/* Tipo */}
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setFormData({ ...formData, tipo: 'receita', categoria_id: '' })}
                  className={`p-3 rounded-lg border-2 flex items-center justify-center gap-2 transition-colors ${
                    formData.tipo === 'receita'
                      ? 'border-green-500 bg-green-50 text-green-700'
                      : 'border-gray-200 hover:border-gray-300'
                  }`}
                >
                  <TrendingUp className="w-5 h-5" />
                  Receita
                </button>
                <button
                  type="button"
                  onClick={() => setFormData({ ...formData, tipo: 'despesa', categoria_id: '' })}
                  className={`p-3 rounded-lg border-2 flex items-center justify-center gap-2 transition-colors ${
                    formData.tipo === 'despesa'
                      ? 'border-red-500 bg-red-50 text-red-700'
                      : 'border-gray-200 hover:border-gray-300'
                  }`}
                >
                  <TrendingDown className="w-5 h-5" />
                  Despesa
                </button>
              </div>

              {/* Descrição */}
              <div>
                <label className="label">Descrição *</label>
                <input
                  type="text"
                  value={formData.descricao}
                  onChange={(e) => setFormData({ ...formData, descricao: e.target.value })}
                  className="input"
                  placeholder="Ex: Venda de bolo de chocolate"
                  required
                />
              </div>

              {/* Valor e Data */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="label">Valor *</label>
                  <input
                    type="text"
                    value={formData.valor}
                    onChange={(e) => setFormData({ ...formData, valor: e.target.value })}
                    className="input"
                    placeholder="0,00"
                    required
                  />
                </div>
                <div>
                  <label className="label">Data *</label>
                  <input
                    type="date"
                    value={formData.data}
                    onChange={(e) => setFormData({ ...formData, data: e.target.value })}
                    className="input"
                    required
                  />
                </div>
              </div>

              {/* Categoria */}
              <div>
                <label className="label">Categoria</label>
                <select
                  value={formData.categoria_id}
                  onChange={(e) => setFormData({ ...formData, categoria_id: e.target.value })}
                  className="select"
                >
                  <option value="">Selecione...</option>
                  {categoriasDoTipo.map(c => (
                    <option key={c.id} value={c.id}>{c.nome}</option>
                  ))}
                </select>
              </div>

              {/* Forma de pagamento e Centro de custo */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="label">Forma de Pagamento</label>
                  <select
                    value={formData.forma_pagamento}
                    onChange={(e) => setFormData({ ...formData, forma_pagamento: e.target.value })}
                    className="select"
                  >
                    <option value="">Selecione...</option>
                    {formasPagamento.map(f => (
                      <option key={f.value} value={f.value}>{f.label}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="label">Centro de Custo</label>
                  <select
                    value={formData.centro_custo}
                    onChange={(e) => setFormData({ ...formData, centro_custo: e.target.value })}
                    className="select"
                  >
                    <option value="">Selecione...</option>
                    {centrosCusto.map(c => (
                      <option key={c.value} value={c.value}>{c.label}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Fixo/Variável (só para despesas) */}
              {formData.tipo === 'despesa' && (
                <div>
                  <label className="label">Tipo de Custo *</label>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setFormData({ ...formData, fixo_variavel: 'fixo' })}
                      className={`p-3 rounded-lg border-2 text-sm ${
                        formData.fixo_variavel === 'fixo'
                          ? 'border-amber-500 bg-amber-50 text-amber-700'
                          : 'border-gray-200 hover:border-gray-300'
                      }`}
                    >
                      <strong>Fixo</strong>
                      <p className="text-xs mt-1 opacity-75">Não varia com vendas</p>
                    </button>
                    <button
                      type="button"
                      onClick={() => setFormData({ ...formData, fixo_variavel: 'variavel' })}
                      className={`p-3 rounded-lg border-2 text-sm ${
                        formData.fixo_variavel === 'variavel'
                          ? 'border-blue-500 bg-blue-50 text-blue-700'
                          : 'border-gray-200 hover:border-gray-300'
                      }`}
                    >
                      <strong>Variável</strong>
                      <p className="text-xs mt-1 opacity-75">Varia com vendas</p>
                    </button>
                  </div>
                </div>
              )}

              {/* Observações */}
              <div>
                <label className="label">Observações</label>
                <textarea
                  value={formData.observacoes}
                  onChange={(e) => setFormData({ ...formData, observacoes: e.target.value })}
                  className="input min-h-[80px]"
                  placeholder="Anotações adicionais..."
                />
              </div>

              {/* Botões */}
              <div className="flex gap-3 pt-4">
                <button
                  type="button"
                  onClick={handleCloseModal}
                  className="btn btn-secondary flex-1"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="btn btn-primary flex-1"
                >
                  {saving ? (
                    <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  ) : editando ? (
                    'Salvar'
                  ) : (
                    'Criar'
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
