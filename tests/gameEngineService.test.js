const engine = require('../src/services/gameEngineService');

function ship(type, ...cells) {
  return { type, positions: cells.map(([x, y]) => ({ x, y })) };
}

const DEFAULT_FLEET = [
  ship('CARRIER', [0, 0], [1, 0], [2, 0], [3, 0], [4, 0]),
  ship('BATTLESHIP', [0, 1], [1, 1], [2, 1], [3, 1]),
  ship('CRUISER', [0, 2], [1, 2], [2, 2]),
  ship('SUBMARINE', [0, 3], [1, 3], [2, 3]),
  ship('DESTROYER', [0, 4], [1, 4]),
];

const TARGET_CELLS = DEFAULT_FLEET.flatMap((s) => s.positions);

function waterCells() {
  const cells = [];
  for (let y = 5; y <= 9; y += 1) {
    for (let x = 9; x >= 0; x -= 1) {
      cells.push({ x, y });
    }
  }
  return cells;
}

function capture(fn) {
  try {
    fn();
    return null;
  } catch (err) {
    return err;
  }
}

function readyGame() {
  const game = { id: 'g1', player1Id: 'p1', player2Id: 'p2' };
  engine.createState(game);
  engine.setFleet('g1', 'p1', DEFAULT_FLEET);
  engine.setFleet('g1', 'p2', DEFAULT_FLEET);
  return engine.getState('g1');
}

function playUntilEnd(state) {
  const water = waterCells();
  let turn = state.player1Id;
  let ai = 0;
  let bi = 0;
  let out;

  for (let guard = 0; guard < 500; guard += 1) {
    if (turn === state.player1Id) {
      const t = TARGET_CELLS[ai];
      ai += 1;
      out = engine.fire(state.gameId, state.player1Id, t.x, t.y);
    } else {
      const t = water[bi];
      bi += 1;
      out = engine.fire(state.gameId, state.player2Id, t.x, t.y);
    }
    if (out.gameOver) {
      return out;
    }
    turn = out.turnUserId;
  }

  throw new Error('partida não terminou em 500 turnos');
}

describe('engine: criação de estado', () => {
  it('cria estado inicial em SETUP sem frota nem turno', () => {
    const state = engine.createState({ id: 'g', player1Id: 'p1', player2Id: 'p2' });

    expect(state.status).toBe('SETUP');
    expect(state.turnUserId).toBeNull();
    expect(state.totalTurns).toBe(0);
    expect(state.fleets.p1).toBeNull();
    expect(state.fleets.p2).toBeNull();
    expect(state.shotsReceived.p1.size).toBe(0);
    expect(engine.hasState('g')).toBe(true);
  });
});

describe('engine: validação e posicionamento de frota', () => {
  it('aceita frota válida e mantém waitingFor o segundo jogador', () => {
    const game = { id: 'g', player1Id: 'p1', player2Id: 'p2' };
    engine.createState(game);
    const res = engine.setFleet('g', 'p1', DEFAULT_FLEET);

    expect(res.bothReady).toBe(false);
    expect(res.turnUserId).toBeNull();
    expect(res.ships).toHaveLength(5);
    expect(res.ships.every((s) => s.positions.length === s.size)).toBe(true);
  });

  it('inicia a partida (IN_PROGRESS) quando ambos posicionam, com turno de p1', () => {
    const state = engine.createState({ id: 'g', player1Id: 'p1', player2Id: 'p2' });
    engine.setFleet('g', 'p1', DEFAULT_FLEET);
    const res = engine.setFleet('g', 'p2', DEFAULT_FLEET);

    expect(res.bothReady).toBe(true);
    expect(res.turnUserId).toBe('p1');
    expect(state.status).toBe('IN_PROGRESS');
    expect(state.startedAt).toBeInstanceOf(Date);
  });

  it.each([
    ['quantidade de embarcações', [ship('CARRIER', [0, 0], [1, 0], [2, 0], [3, 0], [4, 0])]],
    ['tipo desconhecido', [...DEFAULT_FLEET.slice(1), ship('BANANA', [0, 4], [1, 4], [2, 4])]],
    ['tipo duplicado', [...DEFAULT_FLEET.slice(1), ship('CARRIER', [0, 4], [1, 4], [2, 4], [3, 4], [4, 4])]],
    ['posições com tamanho errado', [...DEFAULT_FLEET.slice(0, 4), ship('DESTROYER', [0, 4])]],
    ['coordenada fora do tabuleiro', [...DEFAULT_FLEET.slice(0, 4), ship('DESTROYER', [9, 10], [1, 4])]],
    ['embarcações sobrepostas', [...DEFAULT_FLEET.slice(0, 4), ship('DESTROYER', [0, 0], [1, 0])]],
    ['posições não contíguas (com buraco)', [...DEFAULT_FLEET.slice(0, 4), ship('DESTROYER', [0, 4], [2, 4])]],
    ['posições diagonais / desalinhadas', [...DEFAULT_FLEET.slice(0, 4), ship('DESTROYER', [0, 4], [1, 5])]],
  ])('rejeita frota inválida: %s', (_name, fleet) => {
    const game = { id: 'g', player1Id: 'p1', player2Id: 'p2' };
    engine.createState(game);
    const err = capture(() => engine.setFleet('g', 'p1', fleet));
    expect(err).not.toBeNull();
    expect(err.status).toBe(400);
    expect(err.code).toBe('INVALID_MOVE');
  });

  it('rejeita não participante e reenvio de frota', () => {
    const state = engine.createState({ id: 'g', player1Id: 'p1', player2Id: 'p2' });
    const outsider = capture(() => engine.setFleet('g', 'p3', DEFAULT_FLEET));
    expect(outsider.code).toBe('NOT_PARTICIPANT');

    engine.setFleet('g', 'p1', DEFAULT_FLEET);
    const resend = capture(() => engine.setFleet('g', 'p1', DEFAULT_FLEET));
    expect(resend.code).toBe('INVALID_MOVE');
    expect(state.ready.p1).toBe(true);
  });
});

describe('engine: disparos e turnos', () => {
  it('rejeita disparo fora de partida em andamento', () => {
    engine.createState({ id: 'g', player1Id: 'p1', player2Id: 'p2' });
    const err = capture(() => engine.fire('g', 'p1', 0, 0));
    expect(err.code).toBe('GAME_ALREADY_OVER');
  });

  it('rejeita não participante, fora do turno, coordenada inválida e célula repetida', () => {
    readyGame();
    expect(capture(() => engine.fire('g1', 'p3', 0, 0)).code).toBe('NOT_PARTICIPANT');
    expect(capture(() => engine.fire('g1', 'p2', 0, 0)).code).toBe('NOT_YOUR_TURN');
    expect(capture(() => engine.fire('g1', 'p1', 10, 0)).code).toBe('INVALID_MOVE');
    expect(capture(() => engine.fire('g1', 'p1', 1.5, 0)).code).toBe('INVALID_MOVE');

    engine.fire('g1', 'p1', 0, 4); // HIT no DESTROYER
    engine.fire('g1', 'p2', 9, 5); // MISS de p2
    const repeat = capture(() => engine.fire('g1', 'p1', 0, 4));
    expect(repeat.code).toBe('INVALID_MOVE');
  });

  it('alterna o turno após cada jogada', () => {
    readyGame();
    const first = engine.fire('g1', 'p1', 9, 9);
    expect(first.turnUserId).toBe('p2');
    expect(first.turnNumber).toBe(1);

    const second = engine.fire('g1', 'p2', 9, 8);
    expect(second.turnUserId).toBe('p1');
    expect(second.turnNumber).toBe(2);
  });

  it('detecta HIT, MISS e SUNK com naufrágio', () => {
    readyGame();
    const hit = engine.fire('g1', 'p1', 0, 4);
    expect(hit.result).toBe('HIT');
    expect(hit.sunkShip).toBeNull();

    engine.fire('g1', 'p2', 9, 5);
    const sunk = engine.fire('g1', 'p1', 1, 4);
    expect(sunk.result).toBe('SUNK');
    expect(sunk.sunkShip).toBe('DESTROYER');
    expect(sunk.gameOver).toBe(false);
  });

  it('registra o tipo e o turno de cada navio afundado no estado', () => {
    const state = readyGame();
    const sunk = [];
    const water = waterCells();
    let ai = 0;
    let bi = 0;

    const collect = () => {
      for (let guard = 0; guard < 20; guard += 1) {
        const t = TARGET_CELLS[ai];
        ai += 1;
        const out = engine.fire('g1', 'p1', t.x, t.y);
        if (out.result === 'SUNK') sunk.push(out.sunkShip);
        engine.fire('g1', 'p2', water[bi].x, water[bi].y);
        bi += 1;
        if (sunk.length === 2) return;
      }
      throw new Error('não afundou dois navios a tempo');
    };
    collect();

    expect(sunk).toEqual(['CARRIER', 'BATTLESHIP']);

    const stored = [...state.shotsReceived.p2.entries()]
      .filter(([, v]) => v.result === 'SUNK')
      .map(([, v]) => ({ sunkShip: v.sunkShip, turnNumber: v.turnNumber }));
    expect(stored).toHaveLength(2);
    expect(stored.every((s) => s.sunkShip && Number.isInteger(s.turnNumber))).toBe(true);
  });

  it('encerra com vitória ao destruir toda a frota adversária', () => {
    const state = readyGame();
    const out = playUntilEnd(state);

    expect(out.gameOver).toBe(true);
    expect(out.draw).toBe(false);
    expect(out.winnerId).toBe('p1');
    expect(out.turnUserId).toBeNull();
    expect(state.status).toBe('FINISHED');

    const sunkOf = (userId) => state.fleets[userId].ships.filter((s) => s.sunk).length;
    expect(sunkOf('p2')).toBe(5);
    expect(sunkOf('p1')).toBe(0);
  });

  it('empata quando o limite de turnos é atingido sem frota destruída', () => {
    const state = readyGame();
    state.maxTurns = 4;

    let out;
    for (const [player, coord] of [
      ['p1', { x: 9, y: 9 }],
      ['p2', { x: 9, y: 8 }],
      ['p1', { x: 8, y: 9 }],
      ['p2', { x: 8, y: 8 }],
    ]) {
      out = engine.fire('g1', player, coord.x, coord.y);
    }

    expect(out.gameOver).toBe(true);
    expect(out.draw).toBe(true);
    expect(out.winnerId).toBeNull();
    expect(out.turnUserId).toBeNull();
    expect(state.status).toBe('FINISHED');
  });
});

describe('engine: abandono', () => {
  it('concede vitória ao oponente e encerra a partida', () => {
    const state = readyGame();
    const res = engine.abandon('g1', 'p1');

    expect(res.winnerId).toBe('p2');
    expect(state.status).toBe('ABANDONED');
    expect(state.turnUserId).toBeNull();
  });

  it('rejeita abandono de partida já encerrada ou de não participante', () => {
    readyGame();
    engine.abandon('g1', 'p1');
    expect(capture(() => engine.abandon('g1', 'p1')).code).toBe('GAME_ALREADY_OVER');

    engine.createState({ id: 'g2', player1Id: 'p1', player2Id: 'p2' });
    expect(capture(() => engine.abandon('g2', 'p3')).code).toBe('NOT_PARTICIPANT');
  });
});

describe('engine: reidratação (buildFromDb)', () => {
  it('reconstrói turno, frota e tiros a partir do banco', () => {
    const game = {
      id: 'g2',
      player1Id: 'p1',
      player2Id: 'p2',
      status: 'IN_PROGRESS',
      totalTurns: 1,
      startedAt: new Date('2026-01-01T00:00:00Z'),
    };
    const ships = [
      {
        userId: 'p1',
        type: 'CARRIER',
        size: 5,
        positions: [0, 1, 2, 3, 4].map((x) => ({ x, y: 0 })),
        sunk: false,
      },
    ];
    const shots = [
      { targetUserId: 'p2', shooterId: 'p1', x: 0, y: 0, result: 'HIT' },
    ];

    const state = engine.buildFromDb(game, ships, shots);

    expect(state.status).toBe('IN_PROGRESS');
    expect(state.totalTurns).toBe(1);
    expect(state.ready.p1).toBe(true);
    expect(state.ready.p2).toBe(false);
    expect(state.turnUserId).toBe('p2');
    expect(state.shotsReceived.p2.get('0,0')).toEqual({
      result: 'HIT',
      sunkShip: null,
      shooterId: 'p1',
      turnNumber: null,
    });
    expect(engine.hasState('g2')).toBe(true);
  });

  it('turno par pertence ao player1', () => {
    const game = {
      id: 'g3',
      player1Id: 'p1',
      player2Id: 'p2',
      status: 'IN_PROGRESS',
      totalTurns: 0,
      startedAt: null,
    };
    const state = engine.buildFromDb(game, [], []);
    expect(state.turnUserId).toBe('p1');
  });
});
