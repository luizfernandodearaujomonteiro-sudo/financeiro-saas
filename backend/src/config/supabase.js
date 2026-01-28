const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Variáveis de ambiente SUPABASE_URL e SUPABASE_ANON_KEY são obrigatórias');
}

// Cliente público (respeita RLS)
const supabase = createClient(supabaseUrl, supabaseAnonKey);

// Cliente admin (bypassa RLS) - usar com cuidado!
const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

// Criar cliente com token do usuário (para operações autenticadas)
const createUserClient = (accessToken) => {
  return createClient(supabaseUrl, supabaseAnonKey, {
    global: {
      headers: {
        Authorization: `Bearer ${accessToken}`
      }
    }
  });
};

module.exports = {
  supabase,
  supabaseAdmin,
  createUserClient
};
