process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'audit-test-secret';

const { sequelize } = require('../src/models');
const auditService = require('../src/services/auditService');
const auditLogRepository = require('../src/repositories/auditLogRepository');
const authService = require('../src/services/authService');

beforeEach(async () => {
  await sequelize.sync({ force: true });
});

afterAll(async () => {
  await sequelize.close();
});

describe('auditService.record', () => {
  it('persiste um evento de auditoria com todos os campos', async () => {
    const { user } = await authService.register({ username: 'auditor', password: 'secret123' });

    const log = await auditService.record('USER_LOGIN', 'Login realizado.', {
      userId: user.id,
      metadata: { ip: '127.0.0.1' },
    });

    expect(log).not.toBeNull();
    expect(log.eventType).toBe('USER_LOGIN');
    expect(log.description).toBe('Login realizado.');
    expect(log.userId).toBe(user.id);
    expect(log.metadata).toEqual({ ip: '127.0.0.1' });
  });

  it('persiste sem userId e sem gameId (evento anônimo)', async () => {
    const log = await auditService.record('ERROR', 'Erro interno.', {});
    expect(log).not.toBeNull();
    expect(log.userId).toBeNull();
    expect(log.gameId).toBeNull();
  });

  it('nunca lança exceção, mesmo com erro interno no repositório', async () => {
    // Força erro substituindo temporariamente o repositório
    const repo = require('../src/repositories/auditLogRepository');
    const original = repo.create;
    repo.create = () => Promise.reject(new Error('db offline simulado'));

    const result = await auditService.record('USER_LOGIN', 'desc', {});
    expect(result).toBeNull();

    repo.create = original; // restaura
  });
});

describe('auditLogRepository.findAll', () => {
  it('retorna logs em ordem decrescente de criação', async () => {
    await auditService.record('USER_REGISTER', 'primeiro', {});
    await auditService.record('USER_LOGIN', 'segundo', {});

    const logs = await auditLogRepository.findAll();
    expect(logs.length).toBeGreaterThanOrEqual(2);
    // Ordem DESC: o mais recente primeiro
    expect(logs[0].description).toBe('segundo');
    expect(logs[1].description).toBe('primeiro');
  });

  it('aplica filtro de eventType', async () => {
    await auditService.record('USER_REGISTER', 'reg', {});
    await auditService.record('USER_LOGIN', 'login', {});

    const logs = await auditLogRepository.findAll({ eventType: 'USER_LOGIN' });
    expect(logs.every((l) => l.eventType === 'USER_LOGIN')).toBe(true);
  });

  it('aplica limit e offset para paginação', async () => {
    await auditService.record('USER_LOGIN', 'a', {});
    await auditService.record('USER_LOGIN', 'b', {});
    await auditService.record('USER_LOGIN', 'c', {});

    const page1 = await auditLogRepository.findAll({ limit: 2, offset: 0 });
    const page2 = await auditLogRepository.findAll({ limit: 2, offset: 2 });

    expect(page1).toHaveLength(2);
    expect(page2).toHaveLength(1);
  });
});

describe('auditLogRepository.countAll', () => {
  it('conta o total de registros', async () => {
    await auditService.record('USER_REGISTER', 'u1', {});
    await auditService.record('USER_LOGIN', 'u2', {});

    const total = await auditLogRepository.countAll();
    expect(total).toBeGreaterThanOrEqual(2);
  });
});
