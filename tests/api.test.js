/**
 * Testes de integração REST via Supertest
 *
 * Cobre os principais fluxos da API HTTP:
 *  - Registro, login, /auth/me, logout
 *  - /users/online, /users/:id
 *  - GET /scoreboard
 *  - POST /games/vs-bot + fleet + shots
 *  - POST /games, convites (accept/reject)
 *  - GET /games, GET /games/:id, GET /games/:id/result
 *  - POST /games/:id/abandon
 *  - Erros 401, 403, 404, 409
 */
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'api-test-secret';
process.env.JWT_EXPIRES_IN = '1h';

const request = require('supertest');

const { app } = require('../src/app');
const { sequelize } = require('../src/models');
const presence = require('../src/socket/presence');

const FLEET = [
  { type: 'CARRIER',    positions: [0,1,2,3,4].map((x) => ({ x, y: 0 })) },
  { type: 'BATTLESHIP', positions: [0,1,2,3].map((x) => ({ x, y: 1 })) },
  { type: 'CRUISER',    positions: [0,1,2].map((x) => ({ x, y: 2 })) },
  { type: 'SUBMARINE',  positions: [0,1,2].map((x) => ({ x, y: 3 })) },
  { type: 'DESTROYER',  positions: [0,1].map((x) => ({ x, y: 4 })) },
];

async function register(username, password = 'senha123') {
  return request(app).post('/api/auth/register').send({ username, password });
}

beforeEach(async () => {
  await sequelize.sync({ force: true });
});

afterAll(async () => {
  await sequelize.close();
});

// ── Auth ──────────────────────────────────────────────────────────────────

describe('POST /api/auth/register', () => {
  it('201 + token + user sem passwordHash', async () => {
    const res = await register('alice');
    expect(res.status).toBe(201);
    expect(res.body.token).toBeTruthy();
    expect(res.body.user.username).toBe('alice');
    expect(res.body.user).not.toHaveProperty('passwordHash');
  });

  it('409 para username duplicado', async () => {
    await register('alice');
    const res = await register('alice');
    expect(res.status).toBe(409);
    expect(res.body.error).toBe('ConflictError');
  });

  it('400 para payload inválido (username curto demais)', async () => {
    const res = await request(app).post('/api/auth/register').send({ username: 'ab', password: 'senha123' });
    expect(res.status).toBe(400);
  });
});

describe('POST /api/auth/login', () => {
  it('200 + token para credenciais válidas', async () => {
    await register('bob');
    const res = await request(app).post('/api/auth/login').send({ username: 'bob', password: 'senha123' });
    expect(res.status).toBe(200);
    expect(res.body.token).toBeTruthy();
  });

  it('401 para senha errada', async () => {
    await register('bob');
    const res = await request(app).post('/api/auth/login').send({ username: 'bob', password: 'errada' });
    expect(res.status).toBe(401);
  });
});

describe('GET /api/auth/me', () => {
  it('200 com usuário autenticado', async () => {
    const { body } = await register('carol');
    const res = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${body.token}`);
    expect(res.status).toBe(200);
    expect(res.body.username).toBe('carol');
  });

  it('401 sem token', async () => {
    const res = await request(app).get('/api/auth/me');
    expect(res.status).toBe(401);
  });
});

describe('POST /api/auth/logout', () => {
  it('204 para usuário autenticado', async () => {
    const { body } = await register('dave');
    const res = await request(app)
      .post('/api/auth/logout')
      .set('Authorization', `Bearer ${body.token}`);
    expect(res.status).toBe(204);
  });
});

// ── Users ─────────────────────────────────────────────────────────────────

describe('GET /api/users/online', () => {
  it('200 retorna lista (array)', async () => {
    const { body } = await register('eve');
    const res = await request(app)
      .get('/api/users/online')
      .set('Authorization', `Bearer ${body.token}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });
});

describe('GET /api/users/:id', () => {
  it('200 para usuário existente', async () => {
    const { body } = await register('frank');
    const res = await request(app)
      .get(`/api/users/${body.user.id}`)
      .set('Authorization', `Bearer ${body.token}`);
    expect(res.status).toBe(200);
    expect(res.body.username).toBe('frank');
  });

  it('404 para usuário inexistente', async () => {
    const { body } = await register('grace');
    const res = await request(app)
      .get('/api/users/00000000-0000-0000-0000-000000000000')
      .set('Authorization', `Bearer ${body.token}`);
    expect(res.status).toBe(404);
  });
});

// ── Scoreboard ────────────────────────────────────────────────────────────

describe('GET /api/scoreboard', () => {
  it('200 retorna array público sem autenticação', async () => {
    await register('hero1');
    const res = await request(app).get('/api/scoreboard');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    if (res.body.length > 0) {
      expect(res.body[0]).toHaveProperty('rank');
      expect(res.body[0]).toHaveProperty('userId');
      expect(res.body[0]).toHaveProperty('wins');
    }
  });

  it('respeita query param limit', async () => {
    for (let i = 0; i < 5; i++) await register(`player${i}`);
    const res = await request(app).get('/api/scoreboard?limit=3');
    expect(res.status).toBe(200);
    expect(res.body.length).toBeLessThanOrEqual(3);
  });
});

// ── Games vs-bot ──────────────────────────────────────────────────────────

describe('POST /api/games/vs-bot', () => {
  it('201 cria partida em SETUP com bot já pronto', async () => {
    const { body: auth } = await register('human');
    presence.add(auth.user.id, 'sock-human', { username: 'human' });

    const res = await request(app)
      .post('/api/games/vs-bot')
      .set('Authorization', `Bearer ${auth.token}`);

    expect(res.status).toBe(201);
    expect(res.body.gameId).toBeTruthy();
    expect(res.body.botId).toBeTruthy();

    const state = await request(app)
      .get(`/api/games/${res.body.gameId}`)
      .set('Authorization', `Bearer ${auth.token}`);
    expect(state.body.game.status).toBe('SETUP');

    presence.remove(auth.user.id, 'sock-human');
  });
});

// ── Games CRUD ────────────────────────────────────────────────────────────

describe('GET /api/games', () => {
  it('200 retorna histórico do usuário (array)', async () => {
    const { body: auth } = await register('gamer');
    const res = await request(app)
      .get('/api/games')
      .set('Authorization', `Bearer ${auth.token}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });
});

describe('POST /api/games + invitations', () => {
  it('201 cria convite; 200 aceita; 409 tenta aceitar de novo', async () => {
    const { body: a } = await register('player1');
    const { body: b } = await register('player2');

    presence.add(a.user.id, 'sa', { username: 'player1' });
    presence.add(b.user.id, 'sb', { username: 'player2' });

    const create = await request(app)
      .post('/api/games')
      .set('Authorization', `Bearer ${a.token}`)
      .send({ inviteeId: b.user.id });

    expect(create.status).toBe(201);
    expect(create.body.game.status).toBe('WAITING');
    expect(create.body.invitation.status).toBe('PENDING');

    const invitationId = create.body.invitation.id;

    const accept = await request(app)
      .post(`/api/invitations/${invitationId}/accept`)
      .set('Authorization', `Bearer ${b.token}`);
    expect(accept.status).toBe(200);
    expect(accept.body.status).toBe('SETUP');

    const again = await request(app)
      .post(`/api/invitations/${invitationId}/accept`)
      .set('Authorization', `Bearer ${b.token}`);
    expect(again.status).toBe(409);

    presence.remove(a.user.id, 'sa');
    presence.remove(b.user.id, 'sb');
  });

  it('rejeitar convite retorna 200 e status REJECTED', async () => {
    const { body: a } = await register('playerA');
    const { body: b } = await register('playerB');
    presence.add(a.user.id, 'sa2', { username: 'playerA' });
    presence.add(b.user.id, 'sb2', { username: 'playerB' });

    const create = await request(app)
      .post('/api/games')
      .set('Authorization', `Bearer ${a.token}`)
      .send({ inviteeId: b.user.id });

    const reject = await request(app)
      .post(`/api/invitations/${create.body.invitation.id}/reject`)
      .set('Authorization', `Bearer ${b.token}`);
    expect(reject.status).toBe(200);
    expect(reject.body.status).toBe('REJECTED');

    presence.remove(a.user.id, 'sa2');
    presence.remove(b.user.id, 'sb2');
  });
});

describe('POST /api/games/:id/fleet + shots + abandon', () => {
  let tokenA, tokenB, gameId, userAId, userBId;

  beforeEach(async () => {
    const ra = await register('aliceA');
    const rb = await register('bobB');
    tokenA = ra.body.token;
    tokenB = rb.body.token;
    userAId = ra.body.user.id;
    userBId = rb.body.user.id;

    presence.add(userAId, 'sA', { username: 'aliceA' });
    presence.add(userBId, 'sB', { username: 'bobB' });

    const create = await request(app)
      .post('/api/games')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ inviteeId: userBId });

    const inv = create.body.invitation.id;
    await request(app)
      .post(`/api/invitations/${inv}/accept`)
      .set('Authorization', `Bearer ${tokenB}`);

    gameId = create.body.game.id;
  });

  afterEach(() => {
    presence.remove(userAId, 'sA');
    presence.remove(userBId, 'sB');
  });

  it('400 para frota inválida (apenas 1 navio)', async () => {
    const res = await request(app)
      .post(`/api/games/${gameId}/fleet`)
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ ships: [FLEET[0]] });
    expect(res.status).toBe(400);
  });

  it('200 após posicionar frota válida (SETUP → aguardando adversário)', async () => {
    const res = await request(app)
      .post(`/api/games/${gameId}/fleet`)
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ ships: FLEET });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('SETUP');
    expect(res.body.waitingFor).toBe('opponent');
  });

  it('200 IN_PROGRESS quando ambos posicionam; 409 tiro fora do turno', async () => {
    await request(app).post(`/api/games/${gameId}/fleet`).set('Authorization', `Bearer ${tokenA}`).send({ ships: FLEET });
    const both = await request(app).post(`/api/games/${gameId}/fleet`).set('Authorization', `Bearer ${tokenB}`).send({ ships: FLEET });
    expect(both.body.status).toBe('IN_PROGRESS');

    // tokenB tenta atirar mas a vez é do tokenA
    const wrong = await request(app)
      .post(`/api/games/${gameId}/shots`)
      .set('Authorization', `Bearer ${tokenB}`)
      .send({ x: 0, y: 0 });
    expect(wrong.status).toBe(409);
  });

  it('200 para disparo válido de quem é o turno', async () => {
    await request(app).post(`/api/games/${gameId}/fleet`).set('Authorization', `Bearer ${tokenA}`).send({ ships: FLEET });
    await request(app).post(`/api/games/${gameId}/fleet`).set('Authorization', `Bearer ${tokenB}`).send({ ships: FLEET });

    const shot = await request(app)
      .post(`/api/games/${gameId}/shots`)
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ x: 9, y: 9 });
    expect(shot.status).toBe(200);
    expect(['MISS', 'HIT', 'SUNK']).toContain(shot.body.result);
  });

  it('200 para abandono; 409 para abandonar de novo', async () => {
    const ab = await request(app)
      .post(`/api/games/${gameId}/abandon`)
      .set('Authorization', `Bearer ${tokenA}`);
    expect(ab.status).toBe(200);
    expect(ab.body.status).toBe('ABANDONED');

    const again = await request(app)
      .post(`/api/games/${gameId}/abandon`)
      .set('Authorization', `Bearer ${tokenA}`);
    expect(again.status).toBe(409);
  });

  it('409 para result de partida ainda em andamento', async () => {
    await request(app).post(`/api/games/${gameId}/fleet`).set('Authorization', `Bearer ${tokenA}`).send({ ships: FLEET });
    await request(app).post(`/api/games/${gameId}/fleet`).set('Authorization', `Bearer ${tokenB}`).send({ ships: FLEET });

    const res = await request(app)
      .get(`/api/games/${gameId}/result`)
      .set('Authorization', `Bearer ${tokenA}`);
    expect(res.status).toBe(409);
  });
});
