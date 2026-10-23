import { describe, it, expect } from 'vitest';
import {
  PHASE,
  canFire,
  enemySunkTypes,
  gameReducer,
  initialGameState,
  myHitsTaken,
  bestHitStreak,
  ownSunkCount,
} from './gameReducer.js';

const ME = 'me';
const FOE = 'foe';
const fresh = () => initialGameState('g1', ME);
const run = (state, ...actions) => actions.reduce(gameReducer, state);

const view = (status, extra = {}) => ({
  game: { id: 'g1', status, turnUserId: null, totalTurns: 0, result: null, winnerId: null, ...extra.game },
  you: { id: ME, ships: [], shotsReceived: [], shotsFired: [], ...extra.you },
  opponent: { id: FOE, ships: [], shotsReceived: [], shotsFired: [], ...extra.opponent },
});

describe('reidratação (game:state)', () => {
  it('SETUP sem frota → PLACEMENT; com frota → WAITING', () => {
    expect(gameReducer(fresh(), { type: 'HYDRATE', view: view('SETUP') }).phase).toBe(PHASE.PLACEMENT);
    const ships = [{ type: 'DESTROYER', positions: [{ x: 0, y: 0 }, { x: 1, y: 0 }] }];
    expect(
      gameReducer(fresh(), { type: 'HYDRATE', view: view('SETUP', { you: { ships } }) }).phase,
    ).toBe(PHASE.WAITING);
  });

  it('IN_PROGRESS deriva o turno a partir de turnUserId', () => {
    const mine = gameReducer(fresh(), { type: 'HYDRATE', view: view('IN_PROGRESS', { game: { turnUserId: ME } }) });
    const theirs = gameReducer(fresh(), { type: 'HYDRATE', view: view('IN_PROGRESS', { game: { turnUserId: FOE } }) });
    expect(mine.phase).toBe(PHASE.PLAYER_TURN);
    expect(theirs.phase).toBe(PHASE.ENEMY_TURN);
  });

  it('partida encerrada → GAME_OVER com desfecho', () => {
    const won = gameReducer(fresh(), {
      type: 'HYDRATE',
      view: view('ABANDONED', { game: { result: 'WIN', winnerId: ME } }),
    });
    expect(won.phase).toBe(PHASE.GAME_OVER);
    expect(won.over).toMatchObject({ outcome: 'WIN', abandoned: true });
  });

  it('HYDRATE reconstrói o log dos disparos com o tipo dos navios afundados', () => {
    const fired = [
      { x: 1, y: 0, result: 'SUNK', sunkShip: 'DESTROYER', shooterId: ME, turnNumber: 3 },
      { x: 5, y: 5, result: 'SUNK', sunkShip: 'CRUISER', shooterId: ME, turnNumber: 7 },
      { x: 0, y: 9, result: 'MISS', sunkShip: null, shooterId: ME, turnNumber: 1 },
    ];
    const received = [
      { x: 4, y: 4, result: 'SUNK', sunkShip: 'SUBMARINE', shooterId: FOE, turnNumber: 2 },
    ];
    const data = view('IN_PROGRESS', {
      game: { turnUserId: ME, totalTurns: 7 },
      you: { shotsFired: fired, shotsReceived: received },
    });

    let state = gameReducer(fresh(), { type: 'HYDRATE', view: data });

    const own = state.log.filter((e) => e.kind === 'OWN_SHOT');
    const enemy = state.log.filter((e) => e.kind === 'ENEMY_SHOT');
    expect(own).toHaveLength(3);
    expect(own.find((e) => e.result === 'SUNK' && e.x === 1).sunkShip).toBe('DESTROYER');
    expect(own.find((e) => e.result === 'SUNK' && e.x === 5).sunkShip).toBe('CRUISER');
    expect(enemy).toHaveLength(1);
    expect(enemy[0].sunkShip).toBe('SUBMARINE');
    expect(enemySunkTypes(state)).toEqual(['DESTROYER', 'CRUISER']);
    // Ordena os disparos por turno dentro do diário.
    expect(own.map((e) => e.turn)).toEqual([1, 3, 7]);

    // Reidratar de novo não duplica entradas.
    const again = gameReducer(state, { type: 'HYDRATE', view: data });
    expect(again.log.filter((e) => e.kind === 'OWN_SHOT')).toHaveLength(3);
    expect(again.log.filter((e) => e.kind === 'ENEMY_SHOT')).toHaveLength(1);
  });
});

describe('fluxo da partida', () => {
  it('START define o turno e libera o disparo só para quem tem a vez', () => {
    const s1 = run(fresh(), { type: 'START', turnUserId: ME });
    expect(s1.phase).toBe(PHASE.PLAYER_TURN);
    expect(canFire(s1)).toBe(true);

    const s2 = run(fresh(), { type: 'START', turnUserId: FOE });
    expect(s2.phase).toBe(PHASE.ENEMY_TURN);
    expect(canFire(s2)).toBe(false);
  });

  it('TURN alterna as fases e é ignorado fora de jogo', () => {
    const playing = run(fresh(), { type: 'START', turnUserId: ME }, { type: 'TURN', turnUserId: FOE });
    expect(playing.phase).toBe(PHASE.ENEMY_TURN);
    expect(run(playing, { type: 'TURN', turnUserId: ME }).phase).toBe(PHASE.PLAYER_TURN);

    const placing = run(fresh(), { type: 'HYDRATE', view: view('SETUP') }, { type: 'TURN', turnUserId: ME });
    expect(placing.phase).toBe(PHASE.PLACEMENT);
  });

  it('FLEET_SUBMITTED leva de PLACEMENT para WAITING, sem rebaixar uma partida já iniciada', () => {
    const ships = [{ type: 'DESTROYER', positions: [{ x: 0, y: 0 }, { x: 1, y: 0 }] }];
    const placing = run(fresh(), { type: 'HYDRATE', view: view('SETUP') }, { type: 'FLEET_SUBMITTED', ships });
    expect(placing.phase).toBe(PHASE.WAITING);

    const started = run(fresh(), { type: 'START', turnUserId: ME }, { type: 'FLEET_SUBMITTED', ships });
    expect(started.phase).toBe(PHASE.PLAYER_TURN);
  });

  it('SHOT_RESULT separa disparos meus dos recebidos e ignora duplicados', () => {
    const mine = { shooterId: ME, targetUserId: FOE, x: 1, y: 1, result: 'HIT', sunkShip: null, turnNumber: 1 };
    const theirs = { shooterId: FOE, targetUserId: ME, x: 2, y: 2, result: 'MISS', sunkShip: null, turnNumber: 2 };
    let state = run(fresh(), { type: 'START', turnUserId: ME });
    state = run(state, { type: 'SHOT_RESULT', payload: mine }, { type: 'SHOT_RESULT', payload: mine });
    state = run(state, { type: 'SHOT_RESULT', payload: theirs });

    expect(state.myShots).toHaveLength(1);
    expect(state.shotsOnMe).toHaveLength(1);
    expect(state.totalTurns).toBe(2);
    expect(state.log.filter((e) => e.kind === 'OWN_SHOT')).toHaveLength(1);
    expect(myHitsTaken(state)).toBe(0);
  });

  it('guarda o tipo do navio inimigo afundado', () => {
    const state = run(
      fresh(),
      { type: 'START', turnUserId: ME },
      {
        type: 'SHOT_RESULT',
        payload: { shooterId: ME, targetUserId: FOE, x: 0, y: 0, result: 'SUNK', sunkShip: 'DESTROYER', turnNumber: 1 },
      },
    );
    expect(enemySunkTypes(state)).toEqual(['DESTROYER']);
  });

  it('OVER encerra a partida e identifica vitória, derrota e empate', () => {
    const base = run(fresh(), { type: 'START', turnUserId: ME });
    const game = { id: 'g1', status: 'FINISHED', totalTurns: 24 };

    const win = run(base, { type: 'OVER', payload: { result: 'WIN', winnerId: ME, loserId: FOE, game } });
    expect(win.phase).toBe(PHASE.GAME_OVER);
    expect(win.over.outcome).toBe('WIN');
    expect(canFire(win)).toBe(false);

    const loss = run(base, { type: 'OVER', payload: { result: 'WIN', winnerId: FOE, loserId: ME, game } });
    expect(loss.over.outcome).toBe('LOSS');

    const draw = run(base, { type: 'OVER', payload: { result: 'DRAW', winnerId: null, loserId: null, game } });
    expect(draw.over.outcome).toBe('DRAW');
  });

  it('abandono do adversário marca o desfecho como abandono', () => {
    const state = run(
      fresh(),
      { type: 'START', turnUserId: ME },
      { type: 'OPPONENT_LEFT', userId: FOE },
      {
        type: 'OVER',
        payload: { result: 'WIN', winnerId: ME, loserId: FOE, game: { id: 'g1', status: 'ABANDONED' } },
      },
    );
    expect(state.over).toMatchObject({ outcome: 'WIN', abandoned: true });
  });

  it('eventos após o fim não reabrem a partida', () => {
    const over = run(
      fresh(),
      { type: 'START', turnUserId: ME },
      { type: 'OVER', payload: { result: 'DRAW', game: { status: 'FINISHED' } } },
    );
    expect(run(over, { type: 'START', turnUserId: ME }).phase).toBe(PHASE.GAME_OVER);
    expect(run(over, { type: 'TURN', turnUserId: ME }).phase).toBe(PHASE.GAME_OVER);
    expect(bestHitStreak([{ result: 'HIT' }, { result: 'SUNK' }, { result: 'MISS' }, { result: 'HIT' }])).toBe(2);
    expect(ownSunkCount({ myShips: [{ positions: [{ x: 0, y: 0 }] }], shotsOnMe: [{ x: 0, y: 0, result: 'SUNK' }] })).toBe(1);
  });
});
