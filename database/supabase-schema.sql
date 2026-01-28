-- ============================================
-- SISTEMA DE GESTÃO FINANCEIRA - MULTI-TENANT
-- Schema do Banco de Dados Supabase
-- ============================================

-- Habilitar extensão UUID
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================
-- TABELA: EMPRESAS
-- ============================================
CREATE TABLE empresas (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    nome VARCHAR(255) NOT NULL,
    segmento VARCHAR(100),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ============================================
-- TABELA: PERFIS DE USUÁRIO
-- Vinculada ao auth.users do Supabase
-- ============================================
CREATE TABLE usuarios (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    empresa_id UUID NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
    nome VARCHAR(255) NOT NULL,
    email VARCHAR(255) NOT NULL UNIQUE,
    role VARCHAR(50) DEFAULT 'user', -- 'admin', 'user'
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ============================================
-- TABELA: CATEGORIAS
-- ============================================
CREATE TABLE categorias (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    empresa_id UUID NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
    nome VARCHAR(100) NOT NULL,
    tipo VARCHAR(20) NOT NULL CHECK (tipo IN ('receita', 'despesa')),
    cor VARCHAR(7) DEFAULT '#6366f1', -- Cor hexadecimal para gráficos
    icone VARCHAR(50) DEFAULT 'tag',
    ativo BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ============================================
-- TABELA: LANÇAMENTOS
-- ============================================
CREATE TABLE lancamentos (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    empresa_id UUID NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
    tipo VARCHAR(20) NOT NULL CHECK (tipo IN ('receita', 'despesa')),
    descricao VARCHAR(255) NOT NULL,
    valor DECIMAL(15, 2) NOT NULL CHECK (valor > 0),
    data DATE NOT NULL,
    categoria_id UUID REFERENCES categorias(id) ON DELETE SET NULL,
    centro_custo VARCHAR(50), -- 'producao', 'atendimento', 'administracao'
    forma_pagamento VARCHAR(50), -- 'pix', 'dinheiro', 'cartao', 'boleto'
    fixo_variavel VARCHAR(20) CHECK (fixo_variavel IN ('fixo', 'variavel')),
    observacoes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ============================================
-- TABELA: CONFIGURAÇÕES DA EMPRESA
-- ============================================
CREATE TABLE configuracoes (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    empresa_id UUID NOT NULL UNIQUE REFERENCES empresas(id) ON DELETE CASCADE,
    moeda VARCHAR(10) DEFAULT 'BRL',
    dia_inicio_mes INTEGER DEFAULT 1 CHECK (dia_inicio_mes >= 1 AND dia_inicio_mes <= 28),
    periodo_padrao VARCHAR(20) DEFAULT 'mes_atual', -- 'mes_atual', 'ultimo_mes', '3_meses'
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ============================================
-- ÍNDICES PARA PERFORMANCE
-- ============================================
CREATE INDEX idx_usuarios_empresa ON usuarios(empresa_id);
CREATE INDEX idx_categorias_empresa ON categorias(empresa_id);
CREATE INDEX idx_categorias_tipo ON categorias(tipo);
CREATE INDEX idx_lancamentos_empresa ON lancamentos(empresa_id);
CREATE INDEX idx_lancamentos_data ON lancamentos(data);
CREATE INDEX idx_lancamentos_tipo ON lancamentos(tipo);
CREATE INDEX idx_lancamentos_categoria ON lancamentos(categoria_id);
CREATE INDEX idx_lancamentos_empresa_data ON lancamentos(empresa_id, data);

-- ============================================
-- ROW LEVEL SECURITY (RLS)
-- Isolamento de dados por empresa
-- ============================================

-- Habilitar RLS em todas as tabelas
ALTER TABLE empresas ENABLE ROW LEVEL SECURITY;
ALTER TABLE usuarios ENABLE ROW LEVEL SECURITY;
ALTER TABLE categorias ENABLE ROW LEVEL SECURITY;
ALTER TABLE lancamentos ENABLE ROW LEVEL SECURITY;
ALTER TABLE configuracoes ENABLE ROW LEVEL SECURITY;

-- ============================================
-- FUNÇÃO: Obter empresa_id do usuário atual
-- ============================================
CREATE OR REPLACE FUNCTION get_user_empresa_id()
RETURNS UUID AS $$
BEGIN
    RETURN (
        SELECT empresa_id 
        FROM usuarios 
        WHERE id = auth.uid()
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- POLÍTICAS RLS: EMPRESAS
-- ============================================
CREATE POLICY "Usuarios podem ver sua propria empresa"
    ON empresas FOR SELECT
    USING (id = get_user_empresa_id());

CREATE POLICY "Permitir inserção durante cadastro"
    ON empresas FOR INSERT
    WITH CHECK (true);

-- ============================================
-- POLÍTICAS RLS: USUARIOS
-- ============================================
CREATE POLICY "Usuarios podem ver usuarios da mesma empresa"
    ON usuarios FOR SELECT
    USING (empresa_id = get_user_empresa_id());

CREATE POLICY "Permitir inserção de usuario durante cadastro"
    ON usuarios FOR INSERT
    WITH CHECK (true);

CREATE POLICY "Usuarios podem atualizar seu proprio perfil"
    ON usuarios FOR UPDATE
    USING (id = auth.uid());

-- ============================================
-- POLÍTICAS RLS: CATEGORIAS
-- ============================================
CREATE POLICY "Usuarios podem ver categorias da sua empresa"
    ON categorias FOR SELECT
    USING (empresa_id = get_user_empresa_id());

CREATE POLICY "Usuarios podem criar categorias para sua empresa"
    ON categorias FOR INSERT
    WITH CHECK (empresa_id = get_user_empresa_id());

CREATE POLICY "Usuarios podem atualizar categorias da sua empresa"
    ON categorias FOR UPDATE
    USING (empresa_id = get_user_empresa_id());

CREATE POLICY "Usuarios podem deletar categorias da sua empresa"
    ON categorias FOR DELETE
    USING (empresa_id = get_user_empresa_id());

-- ============================================
-- POLÍTICAS RLS: LANÇAMENTOS
-- ============================================
CREATE POLICY "Usuarios podem ver lancamentos da sua empresa"
    ON lancamentos FOR SELECT
    USING (empresa_id = get_user_empresa_id());

CREATE POLICY "Usuarios podem criar lancamentos para sua empresa"
    ON lancamentos FOR INSERT
    WITH CHECK (empresa_id = get_user_empresa_id());

CREATE POLICY "Usuarios podem atualizar lancamentos da sua empresa"
    ON lancamentos FOR UPDATE
    USING (empresa_id = get_user_empresa_id());

CREATE POLICY "Usuarios podem deletar lancamentos da sua empresa"
    ON lancamentos FOR DELETE
    USING (empresa_id = get_user_empresa_id());

-- ============================================
-- POLÍTICAS RLS: CONFIGURAÇÕES
-- ============================================
CREATE POLICY "Usuarios podem ver configuracoes da sua empresa"
    ON configuracoes FOR SELECT
    USING (empresa_id = get_user_empresa_id());

CREATE POLICY "Usuarios podem criar configuracoes para sua empresa"
    ON configuracoes FOR INSERT
    WITH CHECK (empresa_id = get_user_empresa_id());

CREATE POLICY "Usuarios podem atualizar configuracoes da sua empresa"
    ON configuracoes FOR UPDATE
    USING (empresa_id = get_user_empresa_id());

-- ============================================
-- FUNÇÃO: Criar categorias padrão para nova empresa
-- ============================================
CREATE OR REPLACE FUNCTION criar_categorias_padrao(p_empresa_id UUID)
RETURNS VOID AS $$
BEGIN
    -- Categorias de Receita
    INSERT INTO categorias (empresa_id, nome, tipo, cor, icone) VALUES
        (p_empresa_id, 'Vendas', 'receita', '#22c55e', 'shopping-cart'),
        (p_empresa_id, 'Serviços', 'receita', '#10b981', 'briefcase'),
        (p_empresa_id, 'Outros Recebimentos', 'receita', '#14b8a6', 'plus-circle');
    
    -- Categorias de Despesa
    INSERT INTO categorias (empresa_id, nome, tipo, cor, icone) VALUES
        (p_empresa_id, 'Aluguel', 'despesa', '#ef4444', 'home'),
        (p_empresa_id, 'Salários', 'despesa', '#f97316', 'users'),
        (p_empresa_id, 'Insumos', 'despesa', '#f59e0b', 'package'),
        (p_empresa_id, 'Marketing', 'despesa', '#eab308', 'megaphone'),
        (p_empresa_id, 'Energia', 'despesa', '#84cc16', 'zap'),
        (p_empresa_id, 'Internet/Telefone', 'despesa', '#22c55e', 'wifi'),
        (p_empresa_id, 'Contador', 'despesa', '#14b8a6', 'calculator'),
        (p_empresa_id, 'Manutenção', 'despesa', '#06b6d4', 'tool'),
        (p_empresa_id, 'Impostos', 'despesa', '#8b5cf6', 'file-text'),
        (p_empresa_id, 'Outras Despesas', 'despesa', '#6366f1', 'minus-circle');
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- FUNÇÃO: Criar configurações padrão para nova empresa
-- ============================================
CREATE OR REPLACE FUNCTION criar_configuracoes_padrao(p_empresa_id UUID)
RETURNS VOID AS $$
BEGIN
    INSERT INTO configuracoes (empresa_id, moeda, dia_inicio_mes, periodo_padrao)
    VALUES (p_empresa_id, 'BRL', 1, 'mes_atual');
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- VIEWS PARA RELATÓRIOS
-- ============================================

-- View: Resumo mensal por empresa
CREATE OR REPLACE VIEW vw_resumo_mensal AS
SELECT 
    empresa_id,
    DATE_TRUNC('month', data) AS mes,
    SUM(CASE WHEN tipo = 'receita' THEN valor ELSE 0 END) AS total_receitas,
    SUM(CASE WHEN tipo = 'despesa' THEN valor ELSE 0 END) AS total_despesas,
    SUM(CASE WHEN tipo = 'despesa' AND fixo_variavel = 'fixo' THEN valor ELSE 0 END) AS custos_fixos,
    SUM(CASE WHEN tipo = 'despesa' AND fixo_variavel = 'variavel' THEN valor ELSE 0 END) AS custos_variaveis,
    SUM(CASE WHEN tipo = 'receita' THEN valor ELSE 0 END) - 
    SUM(CASE WHEN tipo = 'despesa' THEN valor ELSE 0 END) AS resultado
FROM lancamentos
GROUP BY empresa_id, DATE_TRUNC('month', data);

-- View: Despesas por categoria
CREATE OR REPLACE VIEW vw_despesas_por_categoria AS
SELECT 
    l.empresa_id,
    l.categoria_id,
    c.nome AS categoria_nome,
    c.cor AS categoria_cor,
    DATE_TRUNC('month', l.data) AS mes,
    SUM(l.valor) AS total
FROM lancamentos l
LEFT JOIN categorias c ON l.categoria_id = c.id
WHERE l.tipo = 'despesa'
GROUP BY l.empresa_id, l.categoria_id, c.nome, c.cor, DATE_TRUNC('month', l.data);

-- ============================================
-- DADOS DE DEMONSTRAÇÃO
-- (Serão inseridos via seed no backend)
-- ============================================

COMMENT ON TABLE empresas IS 'Tabela principal de empresas/tenants do sistema';
COMMENT ON TABLE usuarios IS 'Usuários do sistema vinculados às empresas';
COMMENT ON TABLE categorias IS 'Categorias de receitas e despesas por empresa';
COMMENT ON TABLE lancamentos IS 'Lançamentos financeiros (receitas e despesas)';
COMMENT ON TABLE configuracoes IS 'Configurações personalizadas por empresa';
