const { supabase, supabaseAdmin } = require('../config/supabase');

const authMiddleware = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ 
        error: 'Token de autenticação não fornecido',
        code: 'AUTH_TOKEN_MISSING'
      });
    }

    const token = authHeader.split(' ')[1];

    // Verificar token com Supabase
    const { data: { user }, error } = await supabase.auth.getUser(token);

    if (error || !user) {
      return res.status(401).json({ 
        error: 'Token inválido ou expirado',
        code: 'AUTH_TOKEN_INVALID'
      });
    }

    // Buscar dados do usuário e empresa
    const { data: userData, error: userError } = await supabaseAdmin
      .from('usuarios')
      .select('*, empresas(*)')
      .eq('id', user.id)
      .single();

    if (userError || !userData) {
      return res.status(401).json({ 
        error: 'Usuário não encontrado no sistema',
        code: 'USER_NOT_FOUND'
      });
    }

    // Adicionar dados do usuário à requisição
    req.user = {
      id: user.id,
      email: user.email,
      nome: userData.nome,
      role: userData.role,
      empresa_id: userData.empresa_id,
      empresa: userData.empresas
    };

    req.accessToken = token;

    next();
  } catch (error) {
    console.error('Erro no middleware de autenticação:', error);
    return res.status(500).json({ 
      error: 'Erro interno de autenticação',
      code: 'AUTH_INTERNAL_ERROR'
    });
  }
};

// Middleware para verificar se é admin
const adminMiddleware = (req, res, next) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ 
      error: 'Acesso negado. Apenas administradores.',
      code: 'ADMIN_REQUIRED'
    });
  }
  next();
};

module.exports = {
  authMiddleware,
  adminMiddleware
};
