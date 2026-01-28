import { createContext, useContext, useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import api from '../services/api'

const AuthContext = createContext({})

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [empresa, setEmpresa] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    // Verificar sessão existente
    checkSession()

    // Listener para mudanças de autenticação
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        if (session) {
          api.setToken(session.access_token)
          await loadUserData()
        } else {
          setUser(null)
          setEmpresa(null)
          api.setToken(null)
        }
      }
    )

    return () => subscription.unsubscribe()
  }, [])

  async function checkSession() {
    try {
      const { data: { session } } = await supabase.auth.getSession()
      
      if (session) {
        api.setToken(session.access_token)
        await loadUserData()
      }
    } catch (error) {
      console.error('Error checking session:', error)
    } finally {
      setLoading(false)
    }
  }

  async function loadUserData() {
    try {
      const data = await api.getMe()
      setUser(data.user)
      setEmpresa(data.empresa)
    } catch (error) {
      console.error('Error loading user data:', error)
      await logout()
    }
  }

  async function login(email, senha) {
    const response = await api.login(email, senha)
    api.setToken(response.session.access_token)
    
    // Salvar refresh token
    localStorage.setItem('refresh_token', response.session.refresh_token)
    
    setUser(response.user)
    setEmpresa(response.empresa)
    
    return response
  }

  async function cadastro(dados) {
    const response = await api.cadastro(dados)
    return response
  }

  async function logout() {
    try {
      await supabase.auth.signOut()
    } catch (error) {
      console.error('Error logging out:', error)
    }
    
    setUser(null)
    setEmpresa(null)
    api.setToken(null)
    localStorage.removeItem('access_token')
    localStorage.removeItem('refresh_token')
  }

  const value = {
    user,
    empresa,
    loading,
    isAuthenticated: !!user,
    login,
    cadastro,
    logout,
    refreshUserData: loadUserData
  }

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}

export default AuthContext
