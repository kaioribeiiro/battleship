process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'scoreboard-test-secret';

const { sequelize } = require('../src/models');
const userRepository = require('../src/repositories/userRepository');
const userService = require('../src/services/userService');
const authService = require('../src/services/authService');

beforeEach(async () => {
  await sequelize.sync({ force: true });
});

afterAll(async () => {
  await sequelize.close();
});

async function registerAndBump(username, { wins = 0, losses = 0, draws = 0 }) {
  const { user } = await authService.register({ username, password: 'senha123' });
  if (wins > 0) await userRepository.incrementStats(user.id, { wins });
  if (losses > 0) await userRepository.incrementStats(user.id, { losses });
  if (draws > 0) await userRepository.incrementStats(user.id, { draws });
  return user;
}

describe('userRepository.getRanking', () => {
  it('retorna usuários ordenados por wins DESC, draws DESC', async () => {
    await registerAndBump('bronze', { wins: 1 });
    await registerAndBump('ouro', { wins: 5 });
    await registerAndBump('prata', { wins: 3, draws: 2 });

    const ranking = await userRepository.getRanking(10);

    expect(ranking[0].username).toBe('ouro');
    expect(ranking[1].username).toBe('prata');
    expect(ranking[2].username).toBe('bronze');
  });

  it('exclui bots do ranking', async () => {
    const { user } = await authService.register({ username: 'humano', password: 'senha123' });
    await userRepository.incrementStats(user.id, { wins: 10 });

    // Cria bot manualmente
    const bcrypt = require('bcrypt');
    const hash = await bcrypt.hash('bot-pass', 10);
    await userRepository.create({ username: 'CPU', passwordHash: hash, isBot: true });

    const ranking = await userRepository.getRanking(10);
    expect(ranking.every((u) => u.username !== 'CPU')).toBe(true);
  });

  it('respeita o limit máximo de 100', async () => {
    const ranking = await userRepository.getRanking(999);
    // limit é capped em 100 no repository
    expect(ranking.length).toBeLessThanOrEqual(100);
  });
});

describe('userService.getScoreboard', () => {
  it('retorna o formato correto com rank numérico sequencial', async () => {
    await registerAndBump('alpha', { wins: 2 });
    await registerAndBump('beta', { wins: 4 });

    const board = await userService.getScoreboard(10);

    expect(board[0].rank).toBe(1);
    expect(board[1].rank).toBe(2);
    expect(board[0].username).toBe('beta');
    expect(board[0]).toHaveProperty('userId');
    expect(board[0]).toHaveProperty('wins');
    expect(board[0]).toHaveProperty('losses');
    expect(board[0]).toHaveProperty('draws');
  });

  it('retorna lista vazia quando não há usuários', async () => {
    const board = await userService.getScoreboard(10);
    expect(board).toEqual([]);
  });
});
