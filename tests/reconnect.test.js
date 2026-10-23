/**
 * Testes de reconexão e reconstrução de estado
 *
 * Verifica que um jogador pode obter o estado da partida após reconectar
 * (sem estado em memória), reconstruindo-o fielmente a partir do banco.
 */
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'reconnect-test-secret';
process.env.JWT_EXPIRES_IN = '1h';

const { sequelize } = require('../src/models');
const authService = require('../src/services/authService');
const gameService = require('../src/services/gameService');
const gameEngineService = require('../src/services/gameEngineService');
const presence = require('../src/socket/presence');

const FLEET = [
  { type: 'CARRIER',    positions: [0,1,2,3,4].map((x) => ({ x, y: 0 })) },
  { type: 'BATTLESHIP', positions: [0,1,2,3].map((x) => ({ x, y: 1 })) },
  { type: 'CRUISER',    positions: [0,1,2].map((x) => ({ x, y: 2 })) },
  { type: 'SUBMARINE',  positions: [0,1,2].map((x) => ({ x, y: 3 })) },
  { type: 'DESTROYER',  positions: [0,1].map((x) => ({ x, y: 4 })) },
];

async function registerUser(username) {
  const { user } = await authService.register({ username, password: 'senha123' });
  presence.add(user.id, `sock-${username}`, { username });
  return user;
}

async function startMatch(a, b) {
  const { game, invitation } = await gameService.createGame(a.id, { inviteeId: b.id });
  await gameService.acceptInvitation(invitation.id, b.id);
  return game.id;
}

beforeEach(async () => {
  await sequelize.sync({ force: true });
});

afterAll(async () => {
  await sequelize.close();
});

describe('Reconexão e reidratação de estado', () => {
  it('reconstrói o estado a partir do banco quando não há estado em memória (SETUP)', async () => {
    const a = await registerUser('alpha');
    const b = await registerUser('beta');
    const gameId = await startMatch(a, b);

    await gameService.placeFleet(gameId, a.id, FLEET);

    gameEngineService.dropState(gameId);
    expect(gameEngineService.hasState(gameId)).toBe(false);

    const state = await gameService.getGameState(gameId, a.id);
    expect(state.game.status).toBe('SETUP');
    expect(state.you.ships).toHaveLength(5);
    expect(state.opponent.ships).toEqual([]);
  });

  it('reconstrói o estado em IN_PROGRESS com turno correto', async () => {
    const a = await registerUser('alpha2');
    const b = await registerUser('beta2');
    const gameId = await startMatch(a, b);

    await gameService.placeFleet(gameId, a.id, FLEET);
    await gameService.placeFleet(gameId, b.id, FLEET);

    await gameService.fireShot(gameId, a.id, 9, 9);
    await gameService.fireShot(gameId, b.id, 9, 8);

    gameEngineService.dropState(gameId);
    expect(gameEngineService.hasState(gameId)).toBe(false);

    const state = await gameService.getGameState(gameId, a.id);
    expect(state.game.status).toBe('IN_PROGRESS');
    expect(state.game.totalTurns).toBe(2);
    expect(state.game.turnUserId).toBe(a.id);
    expect(state.opponent.shotsReceived).toHaveLength(1);
    expect(state.you.shotsReceived).toHaveLength(1);
  });

  it('não permite reconectar em partida que o usuário não participa', async () => {
    const a = await registerUser('alpha3');
    const b = await registerUser('beta3');
    const c = await registerUser('gama3');
    const gameId = await startMatch(a, b);

    await expect(gameService.getGameState(gameId, c.id)).rejects.toMatchObject({
      status: 403,
      code: 'NOT_PARTICIPANT',
    });
  });

  it('reconstrói frota afundada corretamente', async () => {
    const a = await registerUser('alpha4');
    const b = await registerUser('beta4');
    const gameId = await startMatch(a, b);

    await gameService.placeFleet(gameId, a.id, FLEET);
    await gameService.placeFleet(gameId, b.id, FLEET);

    await gameService.fireShot(gameId, a.id, 0, 4); // HIT
    await gameService.fireShot(gameId, b.id, 9, 9); // MISS
    await gameService.fireShot(gameId, a.id, 1, 4); // SUNK

    gameEngineService.dropState(gameId);

    const state = await gameService.getGameState(gameId, a.id);
    expect(state.you.shotsFired).toHaveLength(2);
    const sunk = state.you.shotsFired.find((s) => s.result === 'SUNK');
    expect(sunk).toBeTruthy();
    expect(sunk.sunkShip).toBe('DESTROYER');
    expect(sunk.turnNumber).toBe(3);
  });
});
