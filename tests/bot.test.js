/**
 * Testes do Bot Player (CPU)
 *
 * Cobre:
 *  - generateFleet: gera frota válida (5 navios, composição correta, sem sobreposição)
 *  - chooseShot: modo HUNT (xadrez) e modo TARGET (vizinhos de HIT, alinhamento e filtro de SUNK)
 *  - createBotGame + partida completa humano vs. bot
 */
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'bot-test-secret';
process.env.JWT_EXPIRES_IN = '1h';

const { sequelize, Game } = require('../src/models');
const authService = require('../src/services/authService');
const botService = require('../src/services/botService');
const presence = require('../src/socket/presence');

const FLEET_COMPOSITION = { CARRIER: 5, BATTLESHIP: 4, CRUISER: 3, SUBMARINE: 3, DESTROYER: 2 };
const BOARD_SIZE = 10;

beforeEach(async () => {
  await sequelize.sync({ force: true });
});

afterAll(async () => {
  await sequelize.close();
});

// ── generateFleet ─────────────────────────────────────────────────────────

describe('botService.generateFleet', () => {
  it('gera exatamente 5 navios com os tipos corretos', () => {
    const fleet = botService.generateFleet();
    expect(fleet).toHaveLength(5);
    const types = fleet.map((s) => s.type).sort();
    expect(types).toEqual(Object.keys(FLEET_COMPOSITION).sort());
  });

  it('cada navio tem o tamanho correto de posições', () => {
    const fleet = botService.generateFleet();
    for (const ship of fleet) {
      expect(ship.positions).toHaveLength(FLEET_COMPOSITION[ship.type]);
    }
  });

  it('todas as posições estão dentro do tabuleiro 10x10', () => {
    const fleet = botService.generateFleet();
    for (const ship of fleet) {
      for (const { x, y } of ship.positions) {
        expect(x).toBeGreaterThanOrEqual(0);
        expect(x).toBeLessThan(BOARD_SIZE);
        expect(y).toBeGreaterThanOrEqual(0);
        expect(y).toBeLessThan(BOARD_SIZE);
      }
    }
  });

  it('nenhum navio se sobrepõe a outro', () => {
    const fleet = botService.generateFleet();
    const occupied = new Set();
    for (const ship of fleet) {
      for (const { x, y } of ship.positions) {
        const key = `${x},${y}`;
        expect(occupied.has(key)).toBe(false);
        occupied.add(key);
      }
    }
  });

  it('gera frotas diferentes em chamadas consecutivas (aleatoriedade)', () => {
    const a = JSON.stringify(botService.generateFleet());
    const b = JSON.stringify(botService.generateFleet());
    const c = JSON.stringify(botService.generateFleet());
    expect(a === b && b === c).toBe(false);
  });
});

// ── chooseShot ────────────────────────────────────────────────────────────

describe('botService.chooseShot', () => {
  it('retorna uma célula válida quando não há histórico', () => {
    const shot = botService.chooseShot([]);
    expect(shot.x).toBeGreaterThanOrEqual(0);
    expect(shot.x).toBeLessThan(BOARD_SIZE);
    expect(shot.y).toBeGreaterThanOrEqual(0);
    expect(shot.y).toBeLessThan(BOARD_SIZE);
  });

  it('nunca repete uma célula já atirada', () => {
    const history = [];
    for (let y = 0; y < BOARD_SIZE; y++) {
      for (let x = 0; x < BOARD_SIZE; x++) {
        if (x === 5 && y === 5) continue;
        history.push({ x, y, result: 'MISS' });
      }
    }
    const shot = botService.chooseShot(history);
    expect(shot).toEqual({ x: 5, y: 5 });
  });

  it('entra em modo TARGET após um HIT: escolhe vizinho da célula atingida', () => {
    const history = [{ x: 4, y: 4, result: 'HIT' }];
    const validNeighbors = [
      { x: 5, y: 4 }, { x: 3, y: 4 },
      { x: 4, y: 5 }, { x: 4, y: 3 },
    ];

    for (let i = 0; i < 20; i++) {
      const shot = botService.chooseShot(history);
      const isNeighbor = validNeighbors.some((n) => n.x === shot.x && n.y === shot.y);
      expect(isNeighbor).toBe(true);
    }
  });

  it('retorna vizinho não tentado mesmo com alguns já atirados', () => {
    const history = [
      { x: 4, y: 4, result: 'HIT' },
      { x: 5, y: 4, result: 'MISS' },
      { x: 3, y: 4, result: 'MISS' },
    ];
    for (let i = 0; i < 20; i++) {
      const shot = botService.chooseShot(history);
      expect([{ x: 4, y: 5 }, { x: 4, y: 3 }]).toContainEqual(shot);
    }
  });

  it('prioriza extremidades da linha quando há múltiplos HITs colineares', () => {
    const history = [
      { x: 4, y: 4, result: 'HIT' },
      { x: 5, y: 4, result: 'HIT' },
    ];
    for (let i = 0; i < 20; i++) {
      const shot = botService.chooseShot(history);
      expect([{ x: 3, y: 4 }, { x: 6, y: 4 }]).toContainEqual(shot);
    }
  });

  it('ignora HITs que pertencem a um navio já afundado (SUNK)', () => {
    // DESTROYER em (0,0)-(1,0) já foi afundado; novo HIT em (7,7)
    const history = [
      { x: 0, y: 0, result: 'HIT' },
      { x: 1, y: 0, result: 'SUNK', sunkShip: 'DESTROYER' },
      { x: 7, y: 7, result: 'HIT' },
    ];
    const validNeighbors = [
      { x: 8, y: 7 }, { x: 6, y: 7 },
      { x: 7, y: 8 }, { x: 7, y: 6 },
    ];
    for (let i = 0; i < 20; i++) {
      const shot = botService.chooseShot(history);
      expect(validNeighbors).toContainEqual(shot);
    }
  });
});

// ── ensureBotUser ─────────────────────────────────────────────────────────

describe('botService.ensureBotUser', () => {
  it('cria o usuário bot com isBot=true', async () => {
    const bot = await botService.ensureBotUser('TestBot');
    expect(bot.isBot).toBe(true);
    expect(bot.username).toBe('TestBot');
  });

  it('reutiliza bot existente sem criar duplicata', async () => {
    const b1 = await botService.ensureBotUser('TestBot');
    const b2 = await botService.ensureBotUser('TestBot');
    expect(b1.id).toBe(b2.id);
  });
});

// ── playBotTurn — partida PvC completa ───────────────────────────────────

describe('botService.playBotTurn + partida PvC completa', () => {
  it('humano vence ou perde o bot sem travamento (partida vai até game:over)', async () => {
    const { user: human } = await authService.register({
      username: 'human_full',
      password: 'senha123',
    });
    presence.add(human.id, 'sock-hf', { username: 'human_full' });

    const { gameId, botId } = await botService.createBotGame(human.id);

    const gameService = require('../src/services/gameService');
    const humanFleet = botService.generateFleet();
    const startResult = await gameService.placeFleet(gameId, human.id, humanFleet);
    expect(startResult.status).toBe('IN_PROGRESS');

    let over = null;
    for (let guard = 0; guard < 300 && !over; guard++) {
      const state = await gameService.getGameState(gameId, human.id);
      if (state.game.status === 'FINISHED' || state.game.status === 'ABANDONED') {
        over = state.game;
        break;
      }
      if (state.game.turnUserId !== human.id) {
        try {
          await botService.playBotTurn(gameId, botId);
        } catch (err) {
          if (err.name !== 'ConflictError') throw err;
        }
        await new Promise((r) => setTimeout(r, 10));
        continue;
      }
      const fired = new Set(state.you.shotsFired.map((s) => `${s.x},${s.y}`));
      let shot = null;
      outer: for (let y = 0; y < 10; y++) {
        for (let x = 0; x < 10; x++) {
          if (!fired.has(`${x},${y}`)) { shot = { x, y }; break outer; }
        }
      }
      if (!shot) break;
      const res = await gameService.fireShot(gameId, human.id, shot.x, shot.y);
      if (res.gameOver) {
        const finalState = await gameService.getGameState(gameId, human.id);
        over = finalState.game;
        break;
      }
    }

    expect(over).not.toBeNull();
    expect(over.status).toBe('FINISHED');
    expect(['WIN', 'DRAW']).toContain(over.result);
  }, 20000);
});

describe('botService.createBotGame', () => {
  it('cria partida SETUP com frota do bot já posicionada', async () => {
    const { user: human } = await authService.register({
      username: 'human1',
      password: 'senha123',
    });
    presence.add(human.id, 'sock-human1', { username: 'human1' });

    const { gameId, botId } = await botService.createBotGame(human.id);

    const game = await Game.findByPk(gameId);
    expect(game).not.toBeNull();
    expect(game.status).toBe('SETUP');
    expect([game.player1Id, game.player2Id]).toContain(human.id);
    expect([game.player1Id, game.player2Id]).toContain(botId);
  });

  it('a frota do bot já está no banco após createBotGame', async () => {
    const { user: human } = await authService.register({
      username: 'human2',
      password: 'senha123',
    });
    presence.add(human.id, 'sock-human2', { username: 'human2' });

    const { gameId, botId } = await botService.createBotGame(human.id);

    const { findShipsByGame } = require('../src/repositories/gameRepository');
    const ships = await findShipsByGame(gameId);
    const botShips = ships.filter((s) => s.userId === botId);

    expect(botShips).toHaveLength(5);
    const types = botShips.map((s) => s.type).sort();
    expect(types).toEqual(Object.keys(FLEET_COMPOSITION).sort());
  });

  it('partida inicia (IN_PROGRESS) quando humano posiciona frota', async () => {
    const { user: human } = await authService.register({
      username: 'human3',
      password: 'senha123',
    });
    presence.add(human.id, 'sock-human3', { username: 'human3' });

    const { gameId } = await botService.createBotGame(human.id);

    const gameService = require('../src/services/gameService');
    const humanFleet = botService.generateFleet();
    const result = await gameService.placeFleet(gameId, human.id, humanFleet);

    expect(result.status).toBe('IN_PROGRESS');
    expect(result.turnUserId).toBeTruthy();

    const game = await Game.findByPk(gameId);
    expect(game.status).toBe('IN_PROGRESS');
  });

  it('suporta níveis de dificuldade easy, medium e hard', async () => {
    const { user: human } = await authService.register({
      username: 'human_diff',
      password: 'senha123',
    });
    presence.add(human.id, 'sock-hd', { username: 'human_diff' });

    const resEasy = await botService.createBotGame(human.id, 'easy');
    expect(resEasy.difficulty).toBe('easy');

    const shotEasy = botService.chooseShot([{ x: 4, y: 4, result: 'HIT' }], 'easy');
    expect(shotEasy).not.toEqual({ x: 4, y: 4 });

    const shotMed = botService.chooseShot([{ x: 4, y: 4, result: 'HIT' }], 'medium');
    expect([
      { x: 5, y: 4 },
      { x: 3, y: 4 },
      { x: 4, y: 5 },
      { x: 4, y: 3 },
    ]).toContainEqual(shotMed);
  });
});
