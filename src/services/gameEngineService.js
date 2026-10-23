const { badRequest, forbidden, notFound, conflict } = require('../utils/errors');

const FLEET_COMPOSITION = {
  CARRIER: 5,
  BATTLESHIP: 4,
  CRUISER: 3,
  SUBMARINE: 3,
  DESTROYER: 2,
};
const BOARD_SIZE = 10;
const MAX_TURNS = Number(process.env.MAX_TURNS) || 300;

// Estado das partidas ativas em memória (reconstruível a partir do banco).
const states = new Map();

const cellKey = (x, y) => `${x},${y}`;

function isParticipant(state, userId) {
  return userId === state.player1Id || userId === state.player2Id;
}

function opponentOf(state, userId) {
  return userId === state.player1Id ? state.player2Id : state.player1Id;
}

function isContiguousLine(positions) {
  if (positions.length <= 1) return true;
  const sameRow = positions.every((p) => p.y === positions[0].y);
  const sameCol = positions.every((p) => p.x === positions[0].x);
  if (!sameRow && !sameCol) return false;

  const coords = positions
    .map((p) => (sameRow ? p.x : p.y))
    .sort((a, b) => a - b);

  for (let i = 1; i < coords.length; i += 1) {
    if (coords[i] - coords[i - 1] !== 1) return false;
  }
  return true;
}

function validateFleet(ships) {
  const expectedTypes = Object.keys(FLEET_COMPOSITION);

  if (!Array.isArray(ships) || ships.length !== expectedTypes.length) {
    throw badRequest('Frota inválida: número de embarcações incorreto.', 'INVALID_MOVE');
  }

  const seenTypes = new Set();
  const occupied = new Set();
  const normalized = [];

  for (const ship of ships) {
    const size = FLEET_COMPOSITION[ship?.type];

    if (!size) {
      throw badRequest(`Tipo de embarcação inválido: ${ship?.type}.`, 'INVALID_MOVE');
    }
    if (seenTypes.has(ship.type)) {
      throw badRequest(`Embarcação duplicada: ${ship.type}.`, 'INVALID_MOVE');
    }
    seenTypes.add(ship.type);

    if (!Array.isArray(ship.positions) || ship.positions.length !== size) {
      throw badRequest(`Posições inválidas para ${ship.type}.`, 'INVALID_MOVE');
    }

    const positions = ship.positions.map(({ x, y }) => {
      if (
        !Number.isInteger(x) || !Number.isInteger(y) ||
        x < 0 || x >= BOARD_SIZE || y < 0 || y >= BOARD_SIZE
      ) {
        throw badRequest('Coordenada fora do tabuleiro.', 'INVALID_MOVE');
      }

      const key = cellKey(x, y);
      if (occupied.has(key)) {
        throw badRequest('Embarcações sobrepostas.', 'INVALID_MOVE');
      }
      occupied.add(key);

      return { x, y };
    });

    if (!isContiguousLine(positions)) {
      throw badRequest(
        `Posições de ${ship.type} devem ser contíguas e alinhadas horizontal ou verticalmente.`,
        'INVALID_MOVE'
      );
    }

    normalized.push({ type: ship.type, size, positions, sunk: false });
  }

  return normalized;
}

function emptyState(game) {
  const state = {
    gameId: game.id,
    player1Id: game.player1Id,
    player2Id: game.player2Id,
    status: 'SETUP',
    fleets: {},
    ready: {},
    shotsReceived: {},
    turnUserId: null,
    totalTurns: 0,
    startedAt: null,
    maxTurns: MAX_TURNS,
  };

  for (const playerId of [game.player1Id, game.player2Id]) {
    state.fleets[playerId] = null;
    state.ready[playerId] = false;
    state.shotsReceived[playerId] = new Map();
  }

  return state;
}

function createState(game) {
  const state = emptyState(game);
  states.set(game.id, state);
  return state;
}

function getState(gameId) {
  return states.get(gameId) || null;
}

function hasState(gameId) {
  return states.has(gameId);
}

function dropState(gameId) {
  states.delete(gameId);
}

function buildFromDb(game, ships, shots) {
  const state = emptyState(game);
  state.status = game.status;
  state.totalTurns = game.totalTurns || 0;
  state.startedAt = game.startedAt || null;

  for (const ship of ships) {
    if (!state.fleets[ship.userId]) {
      state.fleets[ship.userId] = { ships: [] };
    }
    state.fleets[ship.userId].ships.push({
      type: ship.type,
      size: ship.size,
      positions: ship.positions,
      sunk: ship.sunk,
    });
  }

  for (const playerId of [game.player1Id, game.player2Id]) {
    state.ready[playerId] = Boolean(state.fleets[playerId]?.ships.length);
  }

  for (const shot of shots) {
    state.shotsReceived[shot.targetUserId].set(cellKey(shot.x, shot.y), {
      result: shot.result,
      sunkShip: shot.sunkShip ?? null,
      shooterId: shot.shooterId,
      turnNumber: shot.turnNumber ?? null,
    });
  }

  if (game.status === 'IN_PROGRESS') {
    state.turnUserId = state.totalTurns % 2 === 0 ? game.player1Id : game.player2Id;
  }

  states.set(game.id, state);
  return state;
}

function setFleet(gameId, userId, ships) {
  const state = getState(gameId);
  if (!state) {
    throw notFound('Partida não encontrada.');
  }
  if (!isParticipant(state, userId)) {
    throw forbidden('Você não participa desta partida.', 'NOT_PARTICIPANT');
  }
  if (state.ready[userId]) {
    throw conflict('Frota já enviada.', 'INVALID_MOVE');
  }

  const normalized = validateFleet(ships);
  state.fleets[userId] = { ships: normalized };
  state.ready[userId] = true;

  const bothReady = state.ready[state.player1Id] && state.ready[state.player2Id];
  if (bothReady) {
    state.status = 'IN_PROGRESS';
    state.turnUserId = state.player1Id;
    state.startedAt = new Date();
  }

  return { bothReady, turnUserId: state.turnUserId, ships: normalized };
}

function fire(gameId, userId, x, y) {
  const state = getState(gameId);
  if (!state) {
    throw notFound('Partida não encontrada.');
  }
  if (!isParticipant(state, userId)) {
    throw forbidden('Você não participa desta partida.', 'NOT_PARTICIPANT');
  }
  if (state.status !== 'IN_PROGRESS') {
    throw conflict('Partida não está em andamento.', 'GAME_ALREADY_OVER');
  }
  if (state.turnUserId !== userId) {
    throw conflict('Não é o seu turno.', 'NOT_YOUR_TURN');
  }
  if (
    !Number.isInteger(x) || !Number.isInteger(y) ||
    x < 0 || x >= BOARD_SIZE || y < 0 || y >= BOARD_SIZE
  ) {
    throw badRequest('Coordenada inválida.', 'INVALID_MOVE');
  }

  const target = opponentOf(state, userId);
  const key = cellKey(x, y);

  if (state.shotsReceived[target].has(key)) {
    throw conflict('Célula já atingida.', 'INVALID_MOVE');
  }

  const fleet = state.fleets[target];
  const hitShip = fleet
    ? fleet.ships.find((ship) => ship.positions.some((p) => cellKey(p.x, p.y) === key))
    : null;

  let result = hitShip ? 'HIT' : 'MISS';
  let sunkShip = null;
  state.shotsReceived[target].set(key, { result, sunkShip, shooterId: userId, turnNumber: state.totalTurns + 1 });
  state.totalTurns += 1;

  if (hitShip) {
    const allSunk = hitShip.positions.every((p) => state.shotsReceived[target].has(cellKey(p.x, p.y)));
    if (allSunk) {
      hitShip.sunk = true;
      result = 'SUNK';
      sunkShip = hitShip.type;
      state.shotsReceived[target].set(key, { result, sunkShip, shooterId: userId, turnNumber: state.totalTurns });
    }
  }

  const fleetSunk = Boolean(fleet) && fleet.ships.every((ship) => ship.sunk);
  let gameOver = false;
  let winnerId = null;
  let draw = false;

  if (fleetSunk) {
    gameOver = true;
    winnerId = userId;
    state.status = 'FINISHED';
    state.turnUserId = null;
  } else if (state.totalTurns >= state.maxTurns) {
    gameOver = true;
    draw = true;
    state.status = 'FINISHED';
    state.turnUserId = null;
  } else {
    state.turnUserId = target;
  }

  return {
    result,
    sunkShip,
    gameOver,
    winnerId,
    draw,
    turnUserId: state.turnUserId,
    turnNumber: state.totalTurns,
    targetUserId: target,
  };
}

function abandon(gameId, userId) {
  const state = getState(gameId);
  if (!state) {
    throw notFound('Partida não encontrada.');
  }
  if (!isParticipant(state, userId)) {
    throw forbidden('Você não participa desta partida.', 'NOT_PARTICIPANT');
  }
  if (state.status === 'FINISHED' || state.status === 'ABANDONED') {
    throw conflict('Partida já encerrada.', 'GAME_ALREADY_OVER');
  }

  const winnerId = opponentOf(state, userId);
  state.status = 'ABANDONED';
  state.turnUserId = null;
  return { winnerId };
}

module.exports = {
  FLEET_COMPOSITION,
  BOARD_SIZE,
  createState,
  getState,
  hasState,
  dropState,
  buildFromDb,
  setFleet,
  fire,
  abandon,
  isParticipant,
  opponentOf,
};
