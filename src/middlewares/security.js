/**
 * Middlewares de Segurança HTTP (Headers & Rate Limiting em memória).
 */

function securityHeaders(req, res, next) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('X-XSS-Protection', '0');
  next();
}

function createRateLimiter({ windowMs = 60_000, max = 40, enforceInTest = false } = {}) {
  const hits = new Map();

  return function rateLimiter(req, res, next) {
    if (process.env.NODE_ENV === 'test' && !enforceInTest) {
      return next();
    }

    const now = Date.now();
    const key = req.ip || req.socket?.remoteAddress || 'unknown';
    const entry = hits.get(key);

    if (!entry || now > entry.resetAt) {
      hits.set(key, { count: 1, resetAt: now + windowMs });
      return next();
    }

    entry.count += 1;
    if (entry.count > max) {
      const retryAfter = Math.ceil((entry.resetAt - now) / 1000);
      res.setHeader('Retry-After', String(retryAfter));
      return res.status(429).json({
        error: 'RATE_LIMITED',
        message: 'Muitas requisições deste endereço. Tente novamente em instantes.',
      });
    }

    return next();
  };
}

module.exports = {
  securityHeaders,
  createRateLimiter,
};

