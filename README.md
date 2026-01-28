# 💰 Sistema de Gestão Financeira - SaaS Multi-tenant

Sistema completo de gestão financeira para pequenos negócios (confeitarias, barbearias, lanchonetes, clínicas).

## 📋 Funcionalidades

### ✅ Implementadas
- **Autenticação** - Login, cadastro self-service, sessões seguras
- **Multi-tenant** - Isolamento completo de dados por empresa (RLS)
- **Lançamentos** - CRUD completo de receitas e despesas
- **Categorias** - Gestão personalizada de categorias
- **Dashboard** - Cards de resumo, gráficos interativos
- **DRE Simplificada** - Demonstração de resultado
- **Ponto de Equilíbrio** - Cálculo automático com visual didático
- **Relatórios** - Exportação em PDF
- **Mobile-first** - Interface 100% responsiva

### 📊 Relatórios
- Receita vs Despesa (gráfico de linha)
- Despesas por categoria (gráfico donut)
- Custos Fixos vs Variáveis (gráfico de barras)
- Resultado mensal histórico
- DRE simplificada

## 🛠️ Stack Tecnológica

| Camada | Tecnologia |
|--------|------------|
| Frontend | React 18 + Vite |
| Estilização | Tailwind CSS |
| Gráficos | Recharts |
| Ícones | Lucide React |
| Backend | Node.js + Express |
| Banco de Dados | Supabase (PostgreSQL) |
| Autenticação | Supabase Auth |
| PDF | PDFKit |

## 📁 Estrutura do Projeto

```
financeiro-saas/
├── database/
│   └── supabase-schema.sql    # Schema SQL + RLS
├── backend/
│   ├── package.json
│   ├── .env.example
│   └── src/
│       ├── server.js          # Servidor Express
│       ├── config/
│       │   └── supabase.js    # Cliente Supabase
│       ├── middlewares/
│       │   ├── auth.js        # Autenticação
│       │   └── errorHandler.js
│       ├── routes/
│       │   ├── auth.js        # Login/Cadastro
│       │   ├── lancamentos.js # CRUD lançamentos
│       │   ├── categorias.js  # CRUD categorias
│       │   ├── relatorios.js  # Dashboard/DRE/PDF
│       │   ├── empresas.js    # Dados da empresa
│       │   ├── configuracoes.js
│       │   └── admin.js       # API administrativa
│       └── seeds/
│           └── demo-data.js   # Dados de demonstração
└── frontend/
    ├── package.json
    ├── .env.example
    ├── index.html
    ├── vite.config.js
    ├── tailwind.config.js
    └── src/
        ├── main.jsx
        ├── App.jsx
        ├── index.css
        ├── lib/
        │   └── supabase.js
        ├── services/
        │   └── api.js
        ├── contexts/
        │   └── AuthContext.jsx
        ├── components/
        │   └── Layout.jsx
        └── pages/
            ├── Login.jsx
            ├── Cadastro.jsx
            ├── Dashboard.jsx
            ├── Lancamentos.jsx
            ├── Categorias.jsx
            ├── Relatorios.jsx
            ├── PontoEquilibrio.jsx
            └── Configuracoes.jsx
```

## 🚀 Setup Rápido

### 1. Configurar Supabase

1. Acesse seu projeto no [Supabase](https://supabase.com)
2. Vá em **SQL Editor**
3. Cole e execute o conteúdo de `database/supabase-schema.sql`
4. Copie as credenciais em **Settings > API**:
   - Project URL
   - anon/public key
   - service_role key

### 2. Configurar Backend

```bash
cd backend

# Instalar dependências
npm install

# Configurar variáveis de ambiente
cp .env.example .env
```

Edite o arquivo `.env`:
```env
SUPABASE_URL=https://seu-projeto.supabase.co
SUPABASE_ANON_KEY=sua-anon-key
SUPABASE_SERVICE_ROLE_KEY=sua-service-role-key
PORT=3001
FRONTEND_URL=http://localhost:5173
```

```bash
# Criar dados de demonstração (opcional)
npm run seed

# Iniciar servidor
npm run dev
```

### 3. Configurar Frontend

```bash
cd frontend

# Instalar dependências
npm install

# Configurar variáveis de ambiente
cp .env.example .env
```

Edite o arquivo `.env`:
```env
VITE_SUPABASE_URL=https://seu-projeto.supabase.co
VITE_SUPABASE_ANON_KEY=sua-anon-key
VITE_API_URL=http://localhost:3001/api
```

```bash
# Iniciar frontend
npm run dev
```

### 4. Acessar o Sistema

- Frontend: http://localhost:5173
- Backend: http://localhost:3001

**Conta de demonstração** (após rodar `npm run seed`):
- Email: `demo@confeitariadoce.com.br`
- Senha: `demo123456`

## 🔐 Segurança (RLS)

O sistema usa Row Level Security do Supabase para garantir isolamento total entre empresas:

```sql
-- Exemplo: usuários só veem lançamentos da sua empresa
CREATE POLICY "Usuarios podem ver lancamentos da sua empresa"
    ON lancamentos FOR SELECT
    USING (empresa_id = get_user_empresa_id());
```

A função `get_user_empresa_id()` retorna automaticamente o `empresa_id` do usuário logado.

## 📱 Responsividade

- **Mobile**: Menu bottom navigation, sidebar retrátil
- **Tablet**: Layout adaptativo
- **Desktop**: Sidebar fixa, mais informações visíveis

## 🎨 Paleta de Cores

| Uso | Cor | Hex |
|-----|-----|-----|
| Primária | Índigo | #6366f1 |
| Positivo | Verde | #22c55e |
| Negativo | Vermelho | #ef4444 |
| Alerta | Âmbar | #f59e0b |

## 📊 Cálculos Financeiros

### DRE Simplificada
```
(+) Receita Total
(-) Custos Variáveis
(=) Margem de Contribuição
(-) Custos Fixos
(=) Resultado Final
```

### Ponto de Equilíbrio
```
Ponto de Equilíbrio = Custos Fixos / (Margem de Contribuição %)
```

### Margem de Contribuição
```
MC = Receita - Custos Variáveis
MC% = (MC / Receita) × 100
```

## 🚀 Deploy

### Frontend (Vercel)
1. Conecte o repositório ao Vercel
2. Configure as variáveis de ambiente
3. Deploy automático!

### Backend (Railway/Render/Heroku)
1. Configure as variáveis de ambiente
2. Comando de start: `npm start`

## 📝 API Endpoints

### Autenticação
| Método | Rota | Descrição |
|--------|------|-----------|
| POST | `/api/auth/cadastro` | Cadastrar empresa + usuário |
| POST | `/api/auth/login` | Login |
| POST | `/api/auth/logout` | Logout |
| GET | `/api/auth/me` | Dados do usuário logado |

### Lançamentos
| Método | Rota | Descrição |
|--------|------|-----------|
| GET | `/api/lancamentos` | Listar (com filtros) |
| POST | `/api/lancamentos` | Criar |
| PUT | `/api/lancamentos/:id` | Atualizar |
| DELETE | `/api/lancamentos/:id` | Excluir |

### Categorias
| Método | Rota | Descrição |
|--------|------|-----------|
| GET | `/api/categorias` | Listar |
| POST | `/api/categorias` | Criar |
| PUT | `/api/categorias/:id` | Atualizar |
| DELETE | `/api/categorias/:id` | Excluir |

### Relatórios
| Método | Rota | Descrição |
|--------|------|-----------|
| GET | `/api/relatorios/dashboard` | Dados do dashboard |
| GET | `/api/relatorios/dre` | DRE simplificada |
| GET | `/api/relatorios/mensal` | Resultado por mês |
| GET | `/api/relatorios/ponto-equilibrio` | Cálculo PE |
| GET | `/api/relatorios/pdf` | Download PDF |

### Admin (requer autenticação especial)
| Método | Rota | Descrição |
|--------|------|-----------|
| GET | `/api/admin/empresas` | Listar todas empresas |
| GET | `/api/admin/stats` | Estatísticas do sistema |

## 🤝 Contribuição

1. Fork o projeto
2. Crie uma branch (`git checkout -b feature/nova-funcionalidade`)
3. Commit suas mudanças (`git commit -m 'Adiciona nova funcionalidade'`)
4. Push para a branch (`git push origin feature/nova-funcionalidade`)
5. Abra um Pull Request

## 📄 Licença

Este projeto está sob a licença MIT.

---

Desenvolvido com ❤️ para pequenos empreendedores brasileiros.
