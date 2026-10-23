/**
 * Testes de middlewares HTTP
 *
 * Cobre:
 *  - authMiddleware: token ausente, inválido, válido
 *  - errorHandler: formato da resposta, status HTTP, audit de 5xx
 */
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'middleware-test-secret';

const express = require('express');
const request = require('supertest');
const authService = require('../src/services/authService');
const { notFound, errorHandler } = require('../src/middlewares/errorHandler');
const authMiddleware = require('../src/middlewares/authMiddleware');
const { badRequest, unauthorized, conflict } = require('../src/utils/errors');

function protectedApp(handler) {
  const app = express();
  app.use(express.json());
  app.get('/protected', authMiddleware, handler);
  app.use(notFound);
  app.use(errorHandler);
  return app;
}

describe('authMiddleware', () => {
  it('rejeita requisição sem header Authorization (401)', async () => {
    const app = protectedApp((req, res) => res.json({ ok: true }));
    const res = await request(app).get('/protected');
    expect(res.status).toBe(401);
    expect(res.body).toHaveProperty('error');
    expect(res.body).toHaveProperty('message');
  });

  it('rejeita token com schema errado (sem "Bearer ")', async () => {
    const app = protectedApp((req, res) => res.json({ ok: true }));
    const res = await request(app)
      .get('/protected')
      .set('Authorization', 'Token abc');
    expect(res.status).toBe(401);
  });

  it('rejeita token inválido/expirado', async () => {
    const app = protectedApp((req, res) => res.json({ ok: true }));
    const res = await request(app)
      .get('/protected')
      .set('Authorization', 'Bearer token-invalido');
    expect(res.status).toBe(401);
  });

  it('aceita token válido e popula req.user', async () => {
    const user = { id: 'test-uuid', username: 'joao' };
    const token = authService.issueToken(user);

    const app = protectedApp((req, res) => {
      res.json({ id: req.user.id, username: req.user.username });
    });

    const res = await request(app)
      .get('/protected')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.id).toBe('test-uuid');
    expect(res.body.username).toBe('joao');
  });
});

describe('errorHandler — formato de resposta', () => {
  it('retorna { error, message } para AppError 400', async () => {
    const app = express();
    app.use(express.json());
    app.get('/fail', (_req, _res, next) => next(badRequest('payload inválido', 'INVALID')));
    app.use(errorHandler);

    const res = await request(app).get('/fail');
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('BadRequestError');
    expect(res.body.message).toBe('payload inválido');
  });

  it('retorna 401 para UnauthorizedError', async () => {
    const app = express();
    app.use(express.json());
    app.get('/fail', (_req, _res, next) => next(unauthorized('não autenticado')));
    app.use(errorHandler);

    const res = await request(app).get('/fail');
    expect(res.status).toBe(401);
    expect(res.body.error).toBe('UnauthorizedError');
  });

  it('retorna 409 para ConflictError', async () => {
    const app = express();
    app.use(express.json());
    app.get('/fail', (_req, _res, next) => next(conflict('já existe', 'CONFLICT_CODE')));
    app.use(errorHandler);

    const res = await request(app).get('/fail');
    expect(res.status).toBe(409);
    expect(res.body.error).toBe('ConflictError');
  });

  it('retorna 500 para erro genérico sem status', async () => {
    const app = express();
    app.use(express.json());
    app.get('/fail', (_req, _res, next) => next(new Error('crash inesperado')));
    app.use(errorHandler);

    const res = await request(app).get('/fail');
    expect(res.status).toBe(500);
    expect(res.body.error).toBe('InternalServerError');
  });

  it('inclui stack trace em NODE_ENV=test', async () => {
    const app = express();
    app.use(express.json());
    app.get('/fail', (_req, _res, next) => next(new Error('com stack')));
    app.use(errorHandler);

    const res = await request(app).get('/fail');
    expect(res.body).toHaveProperty('stack');
  });
});

describe('notFound handler', () => {
  it('retorna 404 com error e message para rotas inexistentes', async () => {
    const app = express();
    app.use(notFound);

    const res = await request(app).get('/rota-que-nao-existe');
    expect(res.status).toBe(404);
    expect(res.body.error).toBe('NotFoundError');
    expect(res.body.message).toContain('/rota-que-nao-existe');
  });
});

describe('securityHeaders & createRateLimiter', () => {
  const { securityHeaders, createRateLimiter } = require('../src/middlewares/security');

  it('adiciona headers HTTP de segurança', async () => {
    const app = express();
    app.use(securityHeaders);
    app.get('/ping', (_req, res) => res.json({ ok: true }));

    const res = await request(app).get('/ping');
    expect(res.status).toBe(200);
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['x-frame-options']).toBe('SAMEORIGIN');
    expect(res.headers['referrer-policy']).toBe('strict-origin-when-cross-origin');
  });

  it('bloqueia excesso de requisições com 429 quando enforceInTest=true', async () => {
    const app = express();
    app.use(createRateLimiter({ windowMs: 10_000, max: 2, enforceInTest: true }));
    app.get('/limited', (_req, res) => res.json({ ok: true }));

    expect((await request(app).get('/limited')).status).toBe(200);
    expect((await request(app).get('/limited')).status).toBe(200);
    const blocked = await request(app).get('/limited');
    expect(blocked.status).toBe(429);
    expect(blocked.body.error).toBe('RATE_LIMITED');
  });
});
