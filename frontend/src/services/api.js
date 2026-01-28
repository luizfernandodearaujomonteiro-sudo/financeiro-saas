const API_URL = import.meta.env.VITE_API_URL || '/api'

class ApiService {
  constructor() {
    this.baseUrl = API_URL
    this.token = localStorage.getItem('access_token')
  }

  setToken(token) {
    this.token = token
    if (token) {
      localStorage.setItem('access_token', token)
    } else {
      localStorage.removeItem('access_token')
    }
  }

  getToken() {
    return this.token || localStorage.getItem('access_token')
  }

  async request(endpoint, options = {}) {
    const url = `${this.baseUrl}${endpoint}`
    const token = this.getToken()

    const config = {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...(token && { Authorization: `Bearer ${token}` }),
        ...options.headers,
      },
    }

    try {
      const response = await fetch(url, config)
      
      // Handle PDF/blob responses
      if (response.headers.get('content-type')?.includes('application/pdf')) {
        return response.blob()
      }

      // Handle CSV responses
      if (response.headers.get('content-type')?.includes('text/csv')) {
        return response.blob()
      }

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Erro na requisição')
      }

      return data
    } catch (error) {
      console.error('API Error:', error)
      throw error
    }
  }

  // Auth
  async login(email, senha) {
    return this.request('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, senha }),
    })
  }

  async cadastro(dados) {
    return this.request('/auth/cadastro', {
      method: 'POST',
      body: JSON.stringify(dados),
    })
  }

  async logout() {
    const response = await this.request('/auth/logout', { method: 'POST' })
    this.setToken(null)
    return response
  }

  async getMe() {
    return this.request('/auth/me')
  }

  // Lançamentos
  async getLancamentos(params = {}) {
    const query = new URLSearchParams(params).toString()
    return this.request(`/lancamentos${query ? `?${query}` : ''}`)
  }

  async getLancamento(id) {
    return this.request(`/lancamentos/${id}`)
  }

  async criarLancamento(dados) {
    return this.request('/lancamentos', {
      method: 'POST',
      body: JSON.stringify(dados),
    })
  }

  async atualizarLancamento(id, dados) {
    return this.request(`/lancamentos/${id}`, {
      method: 'PUT',
      body: JSON.stringify(dados),
    })
  }

  async duplicarLancamento(id, nova_data) {
    return this.request(`/lancamentos/${id}/duplicar`, {
      method: 'POST',
      body: JSON.stringify({ nova_data }),
    })
  }

  async excluirLancamento(id) {
    return this.request(`/lancamentos/${id}`, {
      method: 'DELETE',
    })
  }

  async excluirLancamentos(ids) {
    return this.request('/lancamentos', {
      method: 'DELETE',
      body: JSON.stringify({ ids }),
    })
  }

  // Categorias
  async getCategorias(params = {}) {
    const query = new URLSearchParams(params).toString()
    return this.request(`/categorias${query ? `?${query}` : ''}`)
  }

  async criarCategoria(dados) {
    return this.request('/categorias', {
      method: 'POST',
      body: JSON.stringify(dados),
    })
  }

  async atualizarCategoria(id, dados) {
    return this.request(`/categorias/${id}`, {
      method: 'PUT',
      body: JSON.stringify(dados),
    })
  }

  async excluirCategoria(id) {
    return this.request(`/categorias/${id}`, {
      method: 'DELETE',
    })
  }

  async getResumoCustos(mes, ano) {
    const params = new URLSearchParams()
    if (mes) params.append('mes', mes)
    if (ano) params.append('ano', ano)
    return this.request(`/categorias/resumo/custos?${params}`)
  }

  // Relatórios
  async getDashboard(params = {}) {
    const query = new URLSearchParams(params).toString()
    return this.request(`/relatorios/dashboard?${query}`)
  }

  async getDRE(params = {}) {
    const query = new URLSearchParams(params).toString()
    return this.request(`/relatorios/dre?${query}`)
  }

  async getRelatorioMensal(meses = 6) {
    return this.request(`/relatorios/mensal?meses=${meses}`)
  }

  async getPontoEquilibrio(params = {}) {
    const query = new URLSearchParams(params).toString()
    return this.request(`/relatorios/ponto-equilibrio?${query}`)
  }

  async downloadPDF(params = {}) {
    const query = new URLSearchParams(params).toString()
    return this.request(`/relatorios/pdf?${query}`)
  }

  // Configurações
  async getConfiguracoes() {
    return this.request('/configuracoes')
  }

  async atualizarConfiguracoes(dados) {
    return this.request('/configuracoes', {
      method: 'PUT',
      body: JSON.stringify(dados),
    })
  }

  async downloadBackup() {
    return this.request('/configuracoes/backup')
  }

  async downloadCSV(params = {}) {
    const query = new URLSearchParams(params).toString()
    return this.request(`/configuracoes/export/csv?${query}`)
  }

  // Empresa
  async getEmpresa() {
    return this.request('/empresas/minha')
  }

  async atualizarEmpresa(dados) {
    return this.request('/empresas/minha', {
      method: 'PUT',
      body: JSON.stringify(dados),
    })
  }
}

export const api = new ApiService()
export default api
