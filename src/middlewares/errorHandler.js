function notFound(req, res) {
  res.status(404).json({
    error: 'NotFoundError',
    message: `Rota não encontrada: ${req.method} ${req.originalUrl}`,
  });
}

// eslint-disable-next-line no-unused-vars
async function errorHandler(err, req, res, next) {
  const status = err.status || err.statusCode || 500;

  // Persiste erros inesperados no audit log (não bloqueia a resposta)
  if (status >= 500) {
    try {
      const auditService = require('../services/auditService');
      await auditService.record('ERROR', err.message || 'Internal Server Error', {
        userId: req.user?.id || null,
        metadata: {
          method: req.method,
          path: req.originalUrl,
          stack: err.stack,
        },
      });
    } catch (_) {
      // audit nunca deve impedir a resposta
    }
  }

  const payload = {
    error: (err.name && err.name !== 'Error') ? err.name : 'InternalServerError',
    message: err.message || 'Internal Server Error',
  };

  if (process.env.NODE_ENV !== 'production') {
    payload.stack = err.stack;
  }

  res.status(status).json(payload);
}

module.exports = { notFound, errorHandler };
