import { useState, useEffect } from 'react'
import api from '../services/api'
import {
  Plus,
  Edit2,
  Trash2,
  X,
  Check,
  AlertCircle,
  TrendingUp,
  TrendingDown,
  Tag
} from 'lucide-react'

const cores = [
  '#ef4444', '#f97316', '#f59e0b', '#eab308', '#84cc16',
  '#22c55e', '#10b981', '#14b8a6', '#06b6d4', '#0ea5e9',
  '#3b82f6', '#6366f1', '#8b5cf6', '#a855f7', '#d946ef',
  '#ec4899', '#f43f5e'
]

const icones = [
  'tag', 'shopping-cart', 'briefcase', 'home', 'users',
  'package', 'truck', 'zap', 'wifi', 'calculator',
  'tool', 'file-text', 'plus-circle', 'minus-circle', 'dollar-sign'
]

export default function Categorias() {
  const [categorias, setCategorias] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  
  const [modalOpen, setModalOpen] = useState(false)
  const [editando, setEditando] = useState(null)
  const [formData, setFormData] = useState({
    nome: '',
    tipo: 'despesa',
    cor: '#6366f1',
    icone: 'tag'
  })
  const [saving, setSaving] = useState(false)

  const [filtroTipo, setFiltroTipo] = useState('')

  useEffect(() => {
    loadCategorias()
  }, [])

  const loadCategorias = async () => {
    setLoading(true)
    try {
      const data = await api.getCategorias()
      setCategorias(data)
    } catch (err) {
      setError('Erro ao carregar categorias')
    } finally {
      setLoading(false)
    }
  }

  const handleOpenModal = (categoria = null) => {
    if (categoria) {
      setEditando(categoria.id)
      setFormData({
        nome: categoria.nome,
        tipo: categoria.tipo,
        cor: categoria.cor,
        icone: categoria.icone
      })
    } else {
      setEditando(null)
      setFormData({
        nome: '',
        tipo: 'despesa',
        cor: '#6366f1',
        icone: 'tag'
      })
    }
    setModalOpen(true)
  }

  const handleCloseModal = () => {
    setModalOpen(false)
    setEditando(null)
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setSaving(true)
    setError('')

    try {
      if (editando) {
        await api.atualizarCategoria(editando, formData)
        setSuccess('Categoria atualizada!')
      } else {
        await api.criarCategoria(formData)
        setSuccess('Categoria criada!')
      }

      handleCloseModal()
      loadCategorias()
      setTimeout(() => setSuccess(''), 3000)
    } catch (err) {
      setError(err.message || 'Erro ao salvar categoria')
    } finally {
      setSaving(false)
    }
  }

  const handleExcluir = async (id) => {
    if (!confirm('Tem certeza que deseja excluir esta categoria?')) return

    try {
      await api.excluirCategoria(id)
      setSuccess('Categoria excluída!')
      loadCategorias()
      setTimeout(() => setSuccess(''), 3000)
    } catch (err) {
      setError(err.message || 'Erro ao excluir categoria')
    }
  }

  const categoriasFiltradas = filtroTipo
    ? categorias.filter(c => c.tipo === filtroTipo)
    : categorias

  const categoriasReceita = categoriasFiltradas.filter(c => c.tipo === 'receita')
  const categoriasDespesa = categoriasFiltradas.filter(c => c.tipo === 'despesa')

  return (
    <div className="space-y-6 pb-20 lg:pb-0">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Categorias</h1>
          <p className="text-gray-600">Organize suas receitas e despesas</p>
        </div>
        <button
          onClick={() => handleOpenModal()}
          className="btn btn-primary"
        >
          <Plus className="w-5 h-5" />
          Nova Categoria
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

      {/* Filtro */}
      <div className="flex gap-2">
        <button
          onClick={() => setFiltroTipo('')}
          className={`btn ${!filtroTipo ? 'btn-primary' : 'btn-secondary'}`}
        >
          Todas
        </button>
        <button
          onClick={() => setFiltroTipo('receita')}
          className={`btn ${filtroTipo === 'receita' ? 'btn-success' : 'btn-secondary'}`}
        >
          <TrendingUp className="w-4 h-4" />
          Receitas
        </button>
        <button
          onClick={() => setFiltroTipo('despesa')}
          className={`btn ${filtroTipo === 'despesa' ? 'btn-danger' : 'btn-secondary'}`}
        >
          <TrendingDown className="w-4 h-4" />
          Despesas
        </button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-64">
          <div className="w-10 h-10 border-4 border-primary-600 border-t-transparent rounded-full animate-spin"></div>
        </div>
      ) : (
        <div className="grid lg:grid-cols-2 gap-6">
          {/* Categorias de Receita */}
          {(!filtroTipo || filtroTipo === 'receita') && (
            <div className="card">
              <div className="flex items-center gap-2 mb-4">
                <div className="w-8 h-8 bg-green-100 rounded-lg flex items-center justify-center">
                  <TrendingUp className="w-5 h-5 text-green-600" />
                </div>
                <h2 className="text-lg font-semibold">Receitas</h2>
                <span className="badge badge-success">{categoriasReceita.length}</span>
              </div>

              {categoriasReceita.length === 0 ? (
                <p className="text-gray-500 text-center py-8">
                  Nenhuma categoria de receita
                </p>
              ) : (
                <div className="space-y-2">
                  {categoriasReceita.map((cat) => (
                    <div
                      key={cat.id}
                      className="flex items-center justify-between p-3 rounded-lg hover:bg-gray-50 group"
                    >
                      <div className="flex items-center gap-3">
                        <div
                          className="w-10 h-10 rounded-lg flex items-center justify-center"
                          style={{ backgroundColor: `${cat.cor}20` }}
                        >
                          <Tag className="w-5 h-5" style={{ color: cat.cor }} />
                        </div>
                        <span className="font-medium">{cat.nome}</span>
                      </div>
                      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button
                          onClick={() => handleOpenModal(cat)}
                          className="p-1.5 hover:bg-gray-200 rounded"
                        >
                          <Edit2 className="w-4 h-4 text-gray-500" />
                        </button>
                        <button
                          onClick={() => handleExcluir(cat.id)}
                          className="p-1.5 hover:bg-red-100 rounded"
                        >
                          <Trash2 className="w-4 h-4 text-red-500" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Categorias de Despesa */}
          {(!filtroTipo || filtroTipo === 'despesa') && (
            <div className="card">
              <div className="flex items-center gap-2 mb-4">
                <div className="w-8 h-8 bg-red-100 rounded-lg flex items-center justify-center">
                  <TrendingDown className="w-5 h-5 text-red-600" />
                </div>
                <h2 className="text-lg font-semibold">Despesas</h2>
                <span className="badge badge-danger">{categoriasDespesa.length}</span>
              </div>

              {categoriasDespesa.length === 0 ? (
                <p className="text-gray-500 text-center py-8">
                  Nenhuma categoria de despesa
                </p>
              ) : (
                <div className="space-y-2">
                  {categoriasDespesa.map((cat) => (
                    <div
                      key={cat.id}
                      className="flex items-center justify-between p-3 rounded-lg hover:bg-gray-50 group"
                    >
                      <div className="flex items-center gap-3">
                        <div
                          className="w-10 h-10 rounded-lg flex items-center justify-center"
                          style={{ backgroundColor: `${cat.cor}20` }}
                        >
                          <Tag className="w-5 h-5" style={{ color: cat.cor }} />
                        </div>
                        <span className="font-medium">{cat.nome}</span>
                      </div>
                      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button
                          onClick={() => handleOpenModal(cat)}
                          className="p-1.5 hover:bg-gray-200 rounded"
                        >
                          <Edit2 className="w-4 h-4 text-gray-500" />
                        </button>
                        <button
                          onClick={() => handleExcluir(cat.id)}
                          className="p-1.5 hover:bg-red-100 rounded"
                        >
                          <Trash2 className="w-4 h-4 text-red-500" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Modal */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div 
            className="fixed inset-0 bg-black/50"
            onClick={handleCloseModal}
          />
          <div className="relative bg-white rounded-xl shadow-xl w-full max-w-md">
            <div className="border-b px-6 py-4 flex items-center justify-between">
              <h2 className="text-lg font-semibold">
                {editando ? 'Editar Categoria' : 'Nova Categoria'}
              </h2>
              <button onClick={handleCloseModal} className="p-1 hover:bg-gray-100 rounded">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              {/* Nome */}
              <div>
                <label className="label">Nome *</label>
                <input
                  type="text"
                  value={formData.nome}
                  onChange={(e) => setFormData({ ...formData, nome: e.target.value })}
                  className="input"
                  placeholder="Ex: Vendas"
                  required
                />
              </div>

              {/* Tipo */}
              {!editando && (
                <div>
                  <label className="label">Tipo *</label>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setFormData({ ...formData, tipo: 'receita' })}
                      className={`p-3 rounded-lg border-2 flex items-center justify-center gap-2 ${
                        formData.tipo === 'receita'
                          ? 'border-green-500 bg-green-50 text-green-700'
                          : 'border-gray-200'
                      }`}
                    >
                      <TrendingUp className="w-5 h-5" />
                      Receita
                    </button>
                    <button
                      type="button"
                      onClick={() => setFormData({ ...formData, tipo: 'despesa' })}
                      className={`p-3 rounded-lg border-2 flex items-center justify-center gap-2 ${
                        formData.tipo === 'despesa'
                          ? 'border-red-500 bg-red-50 text-red-700'
                          : 'border-gray-200'
                      }`}
                    >
                      <TrendingDown className="w-5 h-5" />
                      Despesa
                    </button>
                  </div>
                </div>
              )}

              {/* Cor */}
              <div>
                <label className="label">Cor</label>
                <div className="flex flex-wrap gap-2">
                  {cores.map((cor) => (
                    <button
                      key={cor}
                      type="button"
                      onClick={() => setFormData({ ...formData, cor })}
                      className={`w-8 h-8 rounded-lg transition-transform ${
                        formData.cor === cor ? 'ring-2 ring-offset-2 ring-gray-400 scale-110' : ''
                      }`}
                      style={{ backgroundColor: cor }}
                    />
                  ))}
                </div>
              </div>

              {/* Preview */}
              <div className="p-4 bg-gray-50 rounded-lg">
                <p className="text-xs text-gray-500 mb-2">Preview:</p>
                <div className="flex items-center gap-3">
                  <div
                    className="w-10 h-10 rounded-lg flex items-center justify-center"
                    style={{ backgroundColor: `${formData.cor}20` }}
                  >
                    <Tag className="w-5 h-5" style={{ color: formData.cor }} />
                  </div>
                  <span className="font-medium">{formData.nome || 'Nome da categoria'}</span>
                </div>
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
                  ) : editando ? 'Salvar' : 'Criar'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
