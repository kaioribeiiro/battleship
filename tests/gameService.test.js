process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'game-test-secret';
process.env.JWT_EXPIRES_IN = '1h';

const { sequelize, Game, Shot } = require('../src/models');
const authService = require('../src/services/authService');
const gameService = require('../src/services/gameService');
const userRepository = require('../src/repositories/userRepository');
const presence = require('../src/socket/presence');

const FLEET = [
  { type: 'CARRIER', positions: [0, 1, 2, 3, 4].map((x) => ({ x, y: 0 })) },
  { type: 'BATTLESHIP', positions: [0, 1, 2, 3].map((x) => ({ x, y: 1 })) },
  { type: 'CRUISER', positions: [0, 1, 2].map((x) => ({ x, y: 2 })) },
  { type: 'SUBMARINE', positions: [0, 1, 2].map((x) => ({ x, y: 3 })) },
  { type: 'DESTROYER', positions: [0, 1].map((x) => ({ x, y: 4 })) },
];

const TARGET_CELLS = FLEET.flatMap((s) => s.positions);

function waterCells() {
  const cells = [];
  for (let y = 5; y <= 9; y += 1) {
    for (let x = 9; x >= 0; x -= 1) {
      cells.push({ x, y });
    }
  }
  return cells;
}

const registered = [];

async function registerUser(username) {
  const { user } = await authService.register({ username, password: 'supersecret' });
  registered.push(user.id);
  presence.add(user.id, `sock-${username}`, { username });
  return user;
}

async function startMatch(a, b) {
  const created = await gameService.createGame(a.id, { inviteeId: b.id });
  await gameService.acceptInvitation(created.invitation.id, b.id);
  return { gameId: created.game.id, invitationId: created.invitation.id };
}

async function playUntilEnd(gameId, p1, p2) {
  const water = waterCells();
  let turn = p1;
  let ai = 0;
  let bi = 0;
  let out;

  for (let guard = 0; guard < 500; guard += 1) {
    if (turn === p1) {
      const t = TARGET_CELLS[ai];
      ai += 1;
      out = await gameService.fireShot(gameId, p1, t.x, t.y);
    } else {
      const t = water[bi];
      bi += 1;
      out = await gameService.fireShot(gameId, p2, t.x, t.y);
    }
    if (out.gameOver) {
      return out;
    }
    turn = out.turnUserId;
  }

  throw new Error('partida não terminou em 500 turnos');
}

beforeEach(async () => {
  await sequelize.sync({ force: true });
});

afterEach(() => {
  registered.splice(0).forEach((id) => presence.remove(id, `user-${id}`));
});

afterAll(async () => {
  await sequelize.close();
});

describe('gameService: criação de partida e convites', () => {
  it('cria partida WAITING com convite PENDING e TTL futuro', async () => {
    const a = await registerUser('pedro');
    const b = await registerUser('maria');

    const created = await gameService.createGame(a.id, { inviteeId: b.id });

    expect(created.game.status).toBe('WAITING');
    expect(created.game.player1Id).toBe(a.id);
    expect(created.game.player2Id).toBeNull();
    expect(created.invitation.status).toBe('PENDING');
    expect(created.invitation.inviteeId).toBe(b.id);
    expect(new Date(created.invitation.expiresAt).getTime()).toBeGreaterThan(Date.now());
  });

  it('rejeita convite para si mesmo, usuário inexistente e usuário offline', async () => {
    const a = await registerUser('pedro');
    const b = await registerUser('maria');
    presence.remove(b.id, `sock-maria`);

    await expect(gameService.createGame(a.id, { inviteeId: a.id })).rejects.toMatchObject({ status: 400 });
    await expect(gameService.createGame(a.id, { inviteeId: 'uuid-inexistente' })).rejects.toMatchObject({
      status: 404,
      code: 'USER_NOT_FOUND',
    });
    await expect(gameService.createGame(a.id, { inviteeId: b.id })).rejects.toMatchObject({
      status: 403,
      code: 'USER_OFFLINE',
    });
  });

  it('impede convite duplicado pendente', async () => {
    const a = await registerUser('pedro');
    const b = await registerUser('maria');

    await gameService.createGame(a.id, { inviteeId: b.id });
    await expect(gameService.createGame(a.id, { inviteeId: b.id })).rejects.toMatchObject({ status: 409 });
  });

  it('só o convidado pode aceitar o convite', async () => {
    const a = await registerUser('pedro');
    const b = await registerUser('maria');
    const c = await registerUser('carla');

    const { invitationId } = await startMatch(a, b);
    await expect(gameService.acceptInvitation(invitationId, c.id)).rejects.toMatchObject({
      status: 403,
      code: 'NOT_PARTICIPANT',
    });
  });

  it('aceitar o convite move a partida para SETUP; aceitar de novo gera 409', async () => {
    const a = await registerUser('pedro');
    const b = await registerUser('maria');

    const { gameId, invitationId } = await startMatch(a, b);

    const game = await Game.findByPk(gameId);
    expect(game.status).toBe('SETUP');
    expect(game.player2Id).toBe(b.id);

    await expect(gameService.acceptInvitation(invitationId, b.id)).rejects.toMatchObject({ status: 409 });
  });

  it('rejeitar o convite encerra a partida como ABANDONED', async () => {
    const a = await registerUser('pedro');
    const b = await registerUser('maria');

    const created = await gameService.createGame(a.id, { inviteeId: b.id });
    const res = await gameService.rejectInvitation(created.invitation.id, b.id);

    expect(res.status).toBe('REJECTED');
    const game = await Game.findByPk(created.game.id);
    expect(game.status).toBe('ABANDONED');

    await expect(
      gameService.rejectInvitation(created.invitation.id, b.id)
    ).rejects.toMatchObject({ status: 409 });
  });
});

describe('gameService: posicionamento de frota', () => {
  it('valida participante, fase e frota antes de iniciar', async () => {
    const a = await registerUser('pedro');
    const b = await registerUser('maria');
    const c = await registerUser('carla');
    const { gameId } = await startMatch(a, b);

    await expect(gameService.placeFleet(gameId, c.id, FLEET)).rejects.toMatchObject({ code: 'NOT_PARTICIPANT' });
    await expect(
      gameService.placeFleet(gameId, a.id, [FLEET[0]])
    ).rejects.toMatchObject({ status: 400, code: 'INVALID_MOVE' });
    await expect(gameService.fireShot(gameId, a.id, 0, 0)).rejects.toMatchObject({ code: 'GAME_ALREADY_OVER' });
  });

  it('inicia a partida quando ambas as frotas são posicionadas', async () => {
    const a = await registerUser('pedro');
    const b = await registerUser('maria');
    const { gameId } = await startMatch(a, b);

    const first = await gameService.placeFleet(gameId, a.id, FLEET);
    expect(first.waitingFor).toBe('opponent');
    expect(first.turnUserId).toBeNull();

    const second = await gameService.placeFleet(gameId, b.id, FLEET);
    expect(second.status).toBe('IN_PROGRESS');
    expect(second.turnUserId).toBe(a.id);
  });

  it('oculta a frota do oponente enquanto a partida está em andamento', async () => {
    const a = await registerUser('pedro');
    const b = await registerUser('maria');
    const { gameId } = await startMatch(a, b);

    await gameService.placeFleet(gameId, a.id, FLEET);
    await gameService.placeFleet(gameId, b.id, FLEET);

    const view = await gameService.getGameState(gameId, a.id);
    expect(view.you.ships).toHaveLength(5);
    expect(view.opponent.ships).toEqual([]);
  });
});

describe('gameService: jogadas, resultado e estatísticas', () => {
  it('rejeita tiro fora do turno durante a partida', async () => {
    const a = await registerUser('pedro');
    const b = await registerUser('maria');
    const { gameId } = await startMatch(a, b);

    await gameService.placeFleet(gameId, a.id, FLEET);
    await gameService.placeFleet(gameId, b.id, FLEET);

    await expect(gameService.fireShot(gameId, b.id, 0, 9)).rejects.toMatchObject({
      status: 409,
      code: 'NOT_YOUR_TURN',
    });
  });

  it('joga até o fim, persiste tiros, registra resultado e atualiza stats', async () => {
    const a = await registerUser('pedro');
    const b = await registerUser('maria');
    const { gameId } = await startMatch(a, b);

    await gameService.placeFleet(gameId, a.id, FLEET);
    await gameService.placeFleet(gameId, b.id, FLEET);

    const out = await playUntilEnd(gameId, a.id, b.id);

    expect(out.gameOver).toBe(true);
    expect(out.winnerId).toBe(a.id);
    expect(out.result).toBe('SUNK');

    const game = await Game.findByPk(gameId);
    expect(game.status).toBe('FINISHED');
    expect(game.result).toBe('WIN');
    expect(game.winnerId).toBe(a.id);
    expect(game.totalTurns).toBe(out.turnNumber);

    const shots = await Shot.count({ where: { gameId } });
    expect(shots).toBe(out.turnNumber);

    const winner = await userRepository.findById(a.id);
    const loser = await userRepository.findById(b.id);
    expect(winner.wins).toBe(1);
    expect(winner.losses).toBe(0);
    expect(loser.losses).toBe(1);
    expect(loser.wins).toBe(0);

    const result = await gameService.getResult(gameId, b.id);
    expect(result.winnerId).toBe(a.id);
    expect(result.loserId).toBe(b.id);

    const view = await gameService.getGameState(gameId, a.id);
    expect(view.opponent.ships).toHaveLength(5); // revelado após o fim
  });

  it('resultado indisponível enquanto a partida ainda não acabou', async () => {
    const a = await registerUser('pedro');
    const b = await registerUser('maria');
    const { gameId } = await startMatch(a, b);

    await gameService.placeFleet(gameId, a.id, FLEET);
    await gameService.placeFleet(gameId, b.id, FLEET);

    await expect(gameService.getResult(gameId, a.id)).rejects.toMatchObject({ code: 'INVALID_MOVE' });
  });

  it('abandono concede vitória ao oponente e atualiza stats', async () => {
    const a = await registerUser('pedro');
    const b = await registerUser('maria');
    const { gameId } = await startMatch(a, b);

    await gameService.placeFleet(gameId, a.id, FLEET);
    await gameService.placeFleet(gameId, b.id, FLEET);

    const res = await gameService.abandonGame(gameId, b.id);

    expect(res.winnerId).toBe(a.id);

    const game = await Game.findByPk(gameId);
    expect(game.status).toBe('ABANDONED');
    expect(game.result).toBe('WIN');
    expect(game.winnerId).toBe(a.id);
    expect(game.abandonedById).toBe(b.id);

    const winner = await userRepository.findById(a.id);
    expect(winner.wins).toBe(1);
    expect((await userRepository.findById(b.id)).losses).toBe(1);

    await expect(gameService.abandonGame(gameId, b.id)).rejects.toMatchObject({ code: 'GAME_ALREADY_OVER' });
  });
});