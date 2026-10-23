process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'auth-test-secret';
process.env.JWT_EXPIRES_IN = '1h';

const { sequelize, User } = require('../src/models');
const authService = require('../src/services/authService');

beforeEach(async () => {
  await sequelize.sync({ force: true });
});

afterAll(async () => {
  await sequelize.close();
});

describe('authService', () => {
  it('registra usuário e devolve token + dados públicos (sem passwordHash)', async () => {
    const result = await authService.register({ username: 'gabriel', password: 'supersecret' });

    expect(result.user.username).toBe('gabriel');
    expect(result.user).not.toHaveProperty('passwordHash');
    expect(result.token).toBeTruthy();

    const saved = await User.findByPk(result.user.id);
    expect(saved.passwordHash).not.toBe('supersecret');
    expect(saved.passwordHash).toMatch(/^\$2[aby]\$/);

    const decoded = authService.verifyToken(result.token);
    expect(decoded.id).toBe(result.user.id);
    expect(decoded.username).toBe('gabriel');
  });

  it('rejeita registro de username duplicado', async () => {
    await authService.register({ username: 'gabriel', password: 'supersecret' });

    await expect(
      authService.register({ username: 'gabriel', password: 'outra123' })
    ).rejects.toMatchObject({ status: 409, name: 'ConflictError' });
  });

  it('rejeita registro duplicado com maiúsculas/minúsculas diferentes', async () => {
    await authService.register({ username: 'Gabriel', password: 'supersecret' });

    await expect(
      authService.register({ username: 'gabriel', password: 'outra123' })
    ).rejects.toMatchObject({ status: 409, name: 'ConflictError' });
  });

  it('permite login case-insensitive mantendo o username original', async () => {
    await authService.register({ username: 'AlmiranteNave', password: 'supersecret' });

    const loginLower = await authService.login({ username: 'almirantenave', password: 'supersecret' });
    expect(loginLower.user.username).toBe('AlmiranteNave');

    const loginUpper = await authService.login({ username: 'ALMIRANTENAVE', password: 'supersecret' });
    expect(loginUpper.user.username).toBe('AlmiranteNave');
  });

  it.each([
    [{ password: 'supersecret' }, 'username'],
    [{ username: 'ga', password: 'supersecret' }, 'username'],
    [{ username: 'gabriel', password: '123' }, 'password'],
  ])('rejeita credenciais inválidas (%o)', async (payload) => {
    await expect(authService.register(payload)).rejects.toMatchObject({ status: 400 });
  });

  it('faz login e valida password errado / usuário inexistente', async () => {
    await authService.register({ username: 'gabriel', password: 'supersecret' });

    const ok = await authService.login({ username: 'gabriel', password: 'supersecret' });
    expect(ok.user.username).toBe('gabriel');
    expect(authService.verifyToken(ok.token).id).toBe(ok.user.id);

    await expect(
      authService.login({ username: 'gabriel', password: 'errada' })
    ).rejects.toMatchObject({ status: 401 });

    await expect(
      authService.login({ username: 'ninguem', password: 'supersecret' })
    ).rejects.toMatchObject({ status: 401 });
  });

  it('rejeita token inválido', () => {
    expect(() => authService.verifyToken('token-invalido')).toThrow();
    expect(() => authService.verifyToken('')).toThrow();
  });

  it('toPublicUser remove passwordHash e campos sensíveis', () => {
    const user = { id: 'x', username: 'ana', wins: 1, losses: 2, draws: 0, isBot: false, passwordHash: 'abc' };
    const pub = authService.toPublicUser(user);

    expect(pub).toEqual({ id: 'x', username: 'ana', wins: 1, losses: 2, draws: 0, isBot: false });
    expect(pub).not.toHaveProperty('passwordHash');
  });

  it('issueToken gera JWT com sub e username', () => {
    const user = { id: 'x', username: 'ana' };
    const payload = authService.verifyToken(authService.issueToken(user));
    expect(payload).toEqual({ id: 'x', username: 'ana' });
  });
});