import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { 
  BarChart3, 
  Building2, 
  User, 
  Mail, 
  Lock, 
  Eye, 
  EyeOff, 
  AlertCircle,
  CheckCircle,
  ArrowRight
} from 'lucide-react'

const segmentos = [
  'Confeitaria',
  'Barbearia',
  'Lanchonete',
  'Restaurante',
  'Clínica',
  'Salão de Beleza',
  'Pet Shop',
  'Mercado',
  'Outro'
]

export default function Cadastro() {
  const [step, setStep] = useState(1)
  const [formData, setFormData] = useState({
    empresa_nome: '',
    segmento: '',
    usuario_nome: '',
    email: '',
    senha: '',
    confirmarSenha: ''
  })
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)
  
  const { cadastro } = useAuth()
  const navigate = useNavigate()

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value })
  }

  const validateStep1 = () => {
    if (!formData.empresa_nome.trim()) {
      setError('Nome da empresa é obrigatório')
      return false
    }
    return true
  }

  const validateStep2 = () => {
    if (!formData.usuario_nome.trim()) {
      setError('Seu nome é obrigatório')
      return false
    }
    if (!formData.email.trim()) {
      setError('E-mail é obrigatório')
      return false
    }
    if (formData.senha.length < 6) {
      setError('Senha deve ter no mínimo 6 caracteres')
      return false
    }
    if (formData.senha !== formData.confirmarSenha) {
      setError('As senhas não coincidem')
      return false
    }
    return true
  }

  const handleNext = () => {
    setError('')
    if (validateStep1()) {
      setStep(2)
    }
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')

    if (!validateStep2()) return

    setLoading(true)

    try {
      await cadastro({
        empresa_nome: formData.empresa_nome,
        segmento: formData.segmento || null,
        usuario_nome: formData.usuario_nome,
        email: formData.email,
        senha: formData.senha
      })
      setSuccess(true)
    } catch (err) {
      setError(err.message || 'Erro ao criar conta. Tente novamente.')
    } finally {
      setLoading(false)
    }
  }

  if (success) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-primary-600 to-primary-800 flex items-center justify-center p-4">
        <div className="w-full max-w-md">
          <div className="bg-white rounded-2xl shadow-xl p-8 text-center">
            <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <CheckCircle className="w-8 h-8 text-green-600" />
            </div>
            <h2 className="text-xl font-semibold text-gray-900 mb-2">Cadastro realizado!</h2>
            <p className="text-gray-600 mb-6">
              Sua conta foi criada com sucesso. Você já pode acessar o sistema.
            </p>
            <button
              onClick={() => navigate('/login')}
              className="btn btn-primary w-full py-3"
            >
              Fazer Login
              <ArrowRight className="w-5 h-5" />
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary-600 to-primary-800 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-white rounded-2xl shadow-lg mb-4">
            <BarChart3 className="w-8 h-8 text-primary-600" />
          </div>
          <h1 className="text-2xl font-bold text-white">Crie sua conta grátis</h1>
          <p className="text-primary-200 mt-1">Comece a controlar suas finanças hoje</p>
        </div>

        {/* Progresso */}
        <div className="flex items-center justify-center gap-3 mb-6">
          <div className={`w-3 h-3 rounded-full ${step >= 1 ? 'bg-white' : 'bg-primary-400'}`} />
          <div className={`w-12 h-1 rounded ${step >= 2 ? 'bg-white' : 'bg-primary-400'}`} />
          <div className={`w-3 h-3 rounded-full ${step >= 2 ? 'bg-white' : 'bg-primary-400'}`} />
        </div>

        {/* Card */}
        <div className="bg-white rounded-2xl shadow-xl p-8">
          {error && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg flex items-start gap-2">
              <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
              <p className="text-sm text-red-700">{error}</p>
            </div>
          )}

          {step === 1 ? (
            // Step 1: Dados da empresa
            <div className="space-y-5">
              <h2 className="text-xl font-semibold text-gray-900 mb-2">Sobre seu negócio</h2>
              <p className="text-gray-600 text-sm mb-6">
                Conte-nos um pouco sobre sua empresa para personalizarmos sua experiência.
              </p>

              <div>
                <label className="label">Nome da empresa *</label>
                <div className="relative">
                  <Building2 className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                  <input
                    type="text"
                    name="empresa_nome"
                    value={formData.empresa_nome}
                    onChange={handleChange}
                    className="input pl-10"
                    placeholder="Ex: Confeitaria da Maria"
                  />
                </div>
              </div>

              <div>
                <label className="label">Segmento (opcional)</label>
                <select
                  name="segmento"
                  value={formData.segmento}
                  onChange={handleChange}
                  className="select"
                >
                  <option value="">Selecione o segmento</option>
                  {segmentos.map((seg) => (
                    <option key={seg} value={seg}>{seg}</option>
                  ))}
                </select>
              </div>

              <button
                type="button"
                onClick={handleNext}
                className="btn btn-primary w-full py-3"
              >
                Continuar
                <ArrowRight className="w-5 h-5" />
              </button>
            </div>
          ) : (
            // Step 2: Dados do usuário
            <form onSubmit={handleSubmit} className="space-y-5">
              <div className="flex items-center justify-between mb-2">
                <h2 className="text-xl font-semibold text-gray-900">Seus dados</h2>
                <button
                  type="button"
                  onClick={() => setStep(1)}
                  className="text-sm text-primary-600 hover:text-primary-700"
                >
                  Voltar
                </button>
              </div>
              <p className="text-gray-600 text-sm mb-6">
                Agora, crie seu acesso ao sistema.
              </p>

              <div>
                <label className="label">Seu nome *</label>
                <div className="relative">
                  <User className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                  <input
                    type="text"
                    name="usuario_nome"
                    value={formData.usuario_nome}
                    onChange={handleChange}
                    className="input pl-10"
                    placeholder="Seu nome completo"
                  />
                </div>
              </div>

              <div>
                <label className="label">E-mail *</label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                  <input
                    type="email"
                    name="email"
                    value={formData.email}
                    onChange={handleChange}
                    className="input pl-10"
                    placeholder="seu@email.com"
                  />
                </div>
              </div>

              <div>
                <label className="label">Senha *</label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                  <input
                    type={showPassword ? 'text' : 'password'}
                    name="senha"
                    value={formData.senha}
                    onChange={handleChange}
                    className="input pl-10 pr-10"
                    placeholder="Mínimo 6 caracteres"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                  >
                    {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                  </button>
                </div>
              </div>

              <div>
                <label className="label">Confirmar senha *</label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                  <input
                    type={showPassword ? 'text' : 'password'}
                    name="confirmarSenha"
                    value={formData.confirmarSenha}
                    onChange={handleChange}
                    className="input pl-10"
                    placeholder="Repita a senha"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="btn btn-primary w-full py-3"
              >
                {loading ? (
                  <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                ) : (
                  <>
                    Criar minha conta
                    <ArrowRight className="w-5 h-5" />
                  </>
                )}
              </button>
            </form>
          )}

          <div className="mt-6 text-center">
            <p className="text-gray-600">
              Já tem uma conta?{' '}
              <Link to="/login" className="text-primary-600 font-medium hover:text-primary-700">
                Fazer login
              </Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
