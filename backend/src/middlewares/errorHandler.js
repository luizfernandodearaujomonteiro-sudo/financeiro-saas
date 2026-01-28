const errorHandler = (err, req, res, next) => {
  console.error('Erro:', err);

  // Erros de validação do express-validator
  if (err.array && typeof err.array === 'function') {
    return res.status(400).json({
      error: 'Dados inválidos',
      details: err.array()
    });
  }

  // Erros do Supabase
  if (err.code && err.code.startsWith('PGRST')) {
    return res.status(400).json({
      error: 'Erro no banco de dados',
      code: err.code,
      message: err.message
    });
  }

  // Erro genérico
  const statusCode = err.statusCode || 500;
  const message = err.message || 'Erro interno do servidor';

  res.status(statusCode).json({
    error: message,
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
  });
};

module.exports = errorHandler;
