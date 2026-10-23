import { countHits, shipSize } from './board.js';

export const PHASE = Object.freeze({
  LOADING: 'LOADING',
  PLACEMENT: 'PLACEMENT',
  WAITING: 'WAITING',
  PLAYER_TURN: 'PLAYER_TURN',
  ENEMY_TURN: 'ENEMY_TURN',
  GAME_OVER: 'GAME_OVER',
});

export const initialGameState = (gameId, meId) => ({
  gameId,
  meId,
  phase: PHASE.LOADING,
  opponentId: null,
  opponentReady: false,
  opponentLeft: false,
  turnUserId: null,
  totalTurns: 0,
  myShips: [],
  shotsOnMe: [],
  myShots: [],
  enemyShips: [],
  over: null,
  log: [],
  seq: 0,
});

const phaseForTurn = (state, turnUserId) =>
  turnUserId === state.meId ? PHASE.PLAYER_TURN : PHASE.ENEMY_TURN;

function pushLog(state, entry) {
  const seq = state.seq + 1;
  return { ...state, seq, log: [...state.log, { id: seq, ...entry }] };
}

const hasShot = (shots, x, y) => shots.some((s) => s.x === x && s.y === y);

const shotLogKey = (e) => `${e.kind}:${e.x}:${e.y}`;

// Reconstrói entradas de log a partir dos disparos do servidor, ignorando os
// que já foram registrados ao vivo (o HYDRATE é idempotente).
function buildShotEntries(existing, shots, kind) {
  const seen = new Set(
    existing.filter((e) => e.kind !== 'SYS').map((e) => shotLogKey(e)),
  );
  const out = [];
  for (const shot of shots || []) {
    if (seen.has(shotLogKey({ kind, x: shot.x, y: shot.y }))) continue;
    seen.add(shotLogKey({ kind, x: shot.x, y: shot.y }));
    out.push({
      kind,
      turn: shot.turnNumber ?? shot.turn ?? null,
      x: shot.x,
      y: shot.y,
      result: shot.result,
      sunkShip: shot.sunkShip ?? null,
    });
  }
  out.sort((a, b) => {
    const ta = a.turn ?? Number.MAX_SAFE_INTEGER;
    const tb = b.turn ?? Number.MAX_SAFE_INTEGER;
    return ta - tb || a.y - b.y || a.x - b.x;
  });
  return out;
}

function buildOver(state, { result, winnerId, loserId, game }) {
  const outcome = result === 'DRAW' ? 'DRAW' : winnerId === state.meId ? 'WIN' : 'LOSS';
  return {
    outcome,
    result,
    winnerId: winnerId ?? null,
    loserId: loserId ?? null,
    status: game?.status ?? null,
    totalTurns: game?.totalTurns ?? state.totalTurns,
    abandoned: game?.status === 'ABANDONED' || Boolean(state.opponentLeft),
  };
}

export function gameReducer(state, action) {
  switch (action.type) {
    case 'HYDRATE': {
      const { game, you, opponent } = action.view;
      let phase;
      let over = state.over;
      if (game.status === 'FINISHED' || game.status === 'ABANDONED') {
        phase = PHASE.GAME_OVER;
        over = buildOver(state, {
          result: game.result,
          winnerId: game.winnerId,
          loserId: null,
          game,
        });
        over.abandoned = game.status === 'ABANDONED';
      } else if (game.status === 'IN_PROGRESS') {
        phase = phaseForTurn(state, game.turnUserId);
      } else {
        phase = you.ships.length > 0 ? PHASE.WAITING : PHASE.PLACEMENT;
      }
      const next = {
        ...state,
        phase,
        over,
        opponentId: opponent.id,
        turnUserId: game.turnUserId ?? null,
        totalTurns: game.totalTurns ?? 0,
        myShips: you.ships,
        shotsOnMe: you.shotsReceived,
        myShots: you.shotsFired,
        enemyShips: opponent.ships ?? [],
      };

      const additions = [
        ...buildShotEntries(state.log, you.shotsFired, 'OWN_SHOT'),
        ...buildShotEntries(state.log, you.shotsReceived, 'ENEMY_SHOT'),
      ];
      additions.sort((a, b) => {
        const ta = a.turn ?? Number.MAX_SAFE_INTEGER;
        const tb = b.turn ?? Number.MAX_SAFE_INTEGER;
        return ta - tb || a.y - b.y || a.x - b.x;
      });

      let seq = state.seq;
      const log = [...state.log, ...additions.map((entry) => ({ id: ++seq, ...entry }))];

      return pushLog(
        { ...next, seq, log },
        {
          kind: 'SYS',
          text: `ESTADO SINCRONIZADO · ${you.shotsFired.length} DISPARO(S) SEUS · ${you.shotsReceived.length} RECEBIDO(S)`,
        },
      );
    }

    case 'START': {
      // Idempotente: o mesmo início chega pelo ack do placeFleet e pelo broadcast.
      if (
        state.phase === PHASE.GAME_OVER ||
        state.phase === PHASE.PLAYER_TURN ||
        state.phase === PHASE.ENEMY_TURN
      ) {
        return state;
      }
      return pushLog(
        { ...state, phase: phaseForTurn(state, action.turnUserId), turnUserId: action.turnUserId },
        { kind: 'SYS', text: 'FROTAS EM POSIÇÃO · PARTIDA INICIADA' },
      );
    }

    case 'OPPONENT_READY': {
      if (state.opponentReady) return state;
      return pushLog({ ...state, opponentReady: true }, { kind: 'SYS', text: 'ADVERSÁRIO POSICIONOU A FROTA' });
    }

    case 'FLEET_SUBMITTED': {
      const next = { ...state, myShips: action.ships };
      if (state.phase === PHASE.PLACEMENT) next.phase = PHASE.WAITING;
      return pushLog(next, { kind: 'SYS', text: 'FROTA TRANSMITIDA AO COMANDO' });
    }

    case 'SHOT_RESULT': {
      const { shooterId, x, y, result, sunkShip = null, turnNumber } = action.payload;
      const mine = shooterId === state.meId;
      const list = mine ? state.myShots : state.shotsOnMe;
      if (hasShot(list, x, y)) return state; // evento duplicado (ack + broadcast)
      const shot = { x, y, result, sunkShip, shooterId, turn: turnNumber };
      const next = {
        ...state,
        totalTurns: Math.max(state.totalTurns, turnNumber ?? 0),
        [mine ? 'myShots' : 'shotsOnMe']: [...list, shot],
      };
      return pushLog(next, {
        kind: mine ? 'OWN_SHOT' : 'ENEMY_SHOT',
        turn: turnNumber,
        x,
        y,
        result,
        sunkShip,
      });
    }

    case 'TURN': {
      if (state.phase !== PHASE.PLAYER_TURN && state.phase !== PHASE.ENEMY_TURN) return state;
      if (!action.turnUserId) return state;
      return {
        ...state,
        turnUserId: action.turnUserId,
        phase: phaseForTurn(state, action.turnUserId),
      };
    }

    case 'OPPONENT_LEFT': {
      return pushLog({ ...state, opponentLeft: true }, { kind: 'SYS', text: 'ADVERSÁRIO ABANDONOU A PARTIDA' });
    }

    case 'OVER': {
      if (state.phase === PHASE.GAME_OVER && state.over) return state;
      const over = buildOver(state, action.payload);
      const labels = { WIN: 'VITÓRIA', LOSS: 'DERROTA', DRAW: 'EMPATE' };
      return pushLog(
        { ...state, phase: PHASE.GAME_OVER, turnUserId: null, over, enemyShips: (action.payload?.fleets && state.opponentId && action.payload.fleets[state.opponentId]) || state.enemyShips },
        { kind: 'SYS', text: `FIM DE OPERAÇÃO · ${labels[over.outcome]}` },
      );
    }

    case 'REVEAL': {
      return { ...state, enemyShips: action.ships };
    }

    case 'LOG': {
      return pushLog(state, { kind: action.kind ?? 'SYS', text: action.text });
    }

    default:
      return state;
  }
}

// Seletores
export const enemySunk = (state) => state.myShots.filter((s) => s.result === 'SUNK');

export const enemySunkTypes = (state) =>
  enemySunk(state)
    .map((s) => s.sunkShip)
    .filter((type) => shipSize(type));

export const myHitsTaken = (state) => countHits(state.shotsOnMe);
export const enemyHitsTaken = (state) => countHits(state.myShots);
export const canFire = (state) => state.phase === PHASE.PLAYER_TURN;

export function bestHitStreak(shots = []) {
  let max = 0;
  let cur = 0;
  for (const s of shots) {
    if (s.result === 'HIT' || s.result === 'SUNK') {
      cur += 1;
      if (cur > max) max = cur;
    } else {
      cur = 0;
    }
  }
  return max;
}

export function ownSunkCount(state) {
  const hitSet = new Set(
    (state.shotsOnMe || []).filter((s) => s.result !== 'MISS').map((s) => `${s.x},${s.y}`),
  );
  return (state.myShips || []).filter(
    (ship) => ship.positions && ship.positions.length > 0 && ship.positions.every((p) => hitSet.has(`${p.x},${p.y}`)),
  ).length;
}
