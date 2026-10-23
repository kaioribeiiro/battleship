const authService = require('../services/authService');
const { unauthorized } = require('../utils/errors');

function authMiddleware(req, res, next) {
  const header = req.headers.authorization || '';
  const [scheme, token] = header.split(' ');

  if (scheme !== 'Bearer' || !token) {
    return next(unauthorized('Token de autenticação ausente.'));
  }

  try {
    req.user = authService.verifyToken(token);
    return next();
  } catch (err) {
    return next(err);
  }
}

module.exports = authMiddleware;
