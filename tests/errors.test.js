const {
  AppError,
  badRequest,
  unauthorized,
  forbidden,
  notFound,
  conflict,
  gone,
} = require('../src/utils/errors');

describe('AppError', () => {
  it('carrega status, name, code e message', () => {
    const err = new AppError(418, 'TeapotError', 'mensagem', 'TEAPOT');
    expect(err.status).toBe(418);
    expect(err.name).toBe('TeapotError');
    expect(err.code).toBe('TEAPOT');
    expect(err.message).toBe('mensagem');
    expect(err).toBeInstanceOf(Error);
  });

  it('usa o name como code quando não há código explícito', () => {
    const err = badRequest('ops');
    expect(err.code).toBe('BadRequestError');
  });
});

describe('helpers de erro', () => {
  it.each([
    [badRequest, 400, 'BadRequestError'],
    [unauthorized, 401, 'UnauthorizedError'],
    [forbidden, 403, 'ForbiddenError'],
    [notFound, 404, 'NotFoundError'],
    [conflict, 409, 'ConflictError'],
    [gone, 410, 'GoneError'],
  ])('cria o status HTTP correto', (factory, status, name) => {
    const err = factory('mensagem');
    expect(err.status).toBe(status);
    expect(err.name).toBe(name);
    expect(err.message).toBe('mensagem');
  });

  it('aceita sobrescrever o code', () => {
    expect(notFound('x', 'USER_NOT_FOUND').code).toBe('USER_NOT_FOUND');
    expect(conflict('x', 'NOT_YOUR_TURN').code).toBe('NOT_YOUR_TURN');
  });
});