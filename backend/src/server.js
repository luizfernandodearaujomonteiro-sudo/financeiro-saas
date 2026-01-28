require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');

// Importar rotas
const authRoutes = require('./routes/auth');
const empresasRoutes = require('./routes/empresas');
const categoriasRoutes = require('./routes/categorias');
const lancamentosRoutes = require('./routes/lancamentos');
const relatoriosRoutes = require('./routes/relatorios');
const configuracoesRoutes = require('./routes/configuracoes');
const adminRoutes = require('./routes/admin');

// Importar middlewares
const { authMiddleware } = require('./middlewares/auth');
const errorHandler = require('./middlewares/errorHandler');

const app = express();
const PORT = process.env.PORT || 3001;

// Middlewares globais
app.use(helmet());
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:5173',
  credentials: true
}));
app.use(morgan('dev'));
app.use(express.json());

// Rota de health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Rotas públicas (sem autenticação)
app.use('/api/auth', authRoutes);

// Rotas administrativas (autenticação especial)
app.use('/api/admin', adminRoutes);

// Rotas protegidas (requerem autenticação)
app.use('/api/empresas', authMiddleware, empresasRoutes);
app.use('/api/categorias', authMiddleware, categoriasRoutes);
app.use('/api/lancamentos', authMiddleware, lancamentosRoutes);
app.use('/api/relatorios', authMiddleware, relatoriosRoutes);
app.use('/api/configuracoes', authMiddleware, configuracoesRoutes);

// Handler de erros
app.use(errorHandler);

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Rota não encontrada' });
});

app.listen(PORT, () => {
  console.log(`🚀 Servidor rodando na porta ${PORT}`);
  console.log(`📊 API de Gestão Financeira Multi-tenant`);
  console.log(`🔗 Health check: http://localhost:${PORT}/health`);
});

module.exports = app;
