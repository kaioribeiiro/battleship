import { describe, it, expect } from 'vitest';
import {
  BOARD_SIZE,
  CELL,
  FLEET,
  FLEET_CELLS,
  cellIndex,
  coordLabel,
  deriveOwnCells,
  deriveRadarCells,
  evaluatePlacement,
  fleetIntegrity,
  hullPoints,
  inferSunkCells,
  isFleetComplete,
  placeShip,
  randomFleet,
  shipAt,
  shipCells,
  toFleetPayload,
} from './board.js';

const def = (type) => FLEET.find((s) => s.type === type);

describe('coordenadas', () => {
  it('mapeia x→letra e y→número', () => {
    expect(coordLabel(0, 0)).toBe('A-01');
    expect(coordLabel(9, 9)).toBe('J-10');
    expect(coordLabel(2, 6)).toBe('C-07');
  });

  it('gera células horizontais e verticais a partir da origem', () => {
    expect(shipCells(1, 2, 3, false)).toEqual([{ x: 1, y: 2 }, { x: 2, y: 2 }, { x: 3, y: 2 }]);
    expect(shipCells(1, 2, 3, true)).toEqual([{ x: 1, y: 2 }, { x: 1, y: 3 }, { x: 1, y: 4 }]);
  });
});

describe('colocação e colisão', () => {
  it('rejeita navio fora do tabuleiro', () => {
    expect(evaluatePlacement([], shipCells(8, 0, 5, false))).toEqual({ valid: false, reason: 'OUT_OF_BOUNDS' });
    expect(evaluatePlacement([], shipCells(0, 7, 5, true))).toEqual({ valid: false, reason: 'OUT_OF_BOUNDS' });
  });

  it('rejeita colisão e aceita reposicionar o próprio navio', () => {
    const ships = placeShip([], def('CARRIER'), 0, 0, false);
    expect(placeShip(ships, def('DESTROYER'), 2, 0, true)).toBeNull();
    // Mover o mesmo navio para cima de si mesmo não é colisão.
    expect(placeShip(ships, def('CARRIER'), 1, 0, false)).not.toBeNull();
    expect(placeShip(ships, def('DESTROYER'), 0, 1, false)).not.toBeNull();
  });

  it('substitui o navio do mesmo tipo em vez de duplicar', () => {
    let ships = placeShip([], def('CRUISER'), 0, 0, false);
    ships = placeShip(ships, def('CRUISER'), 5, 5, true);
    expect(ships).toHaveLength(1);
    expect(ships[0].positions[0]).toEqual({ x: 5, y: 5 });
  });

  it('encontra o navio em uma célula', () => {
    const ships = placeShip([], def('DESTROYER'), 4, 4, true);
    expect(shipAt(ships, 4, 5)?.type).toBe('DESTROYER');
    expect(shipAt(ships, 5, 5)).toBeNull();
  });

  it('frota aleatória é válida: 5 navios, tamanhos corretos, sem sobreposição', () => {
    for (let i = 0; i < 50; i++) {
      const ships = randomFleet();
      expect(isFleetComplete(ships)).toBe(true);
      const cells = ships.flatMap((s) => s.positions.map((p) => `${p.x},${p.y}`));
      expect(new Set(cells).size).toBe(FLEET_CELLS);
      for (const s of ships) {
        expect(s.positions).toHaveLength(FLEET.find((f) => f.type === s.type).size);
        expect(s.positions.every((p) => p.x >= 0 && p.x < BOARD_SIZE && p.y >= 0 && p.y < BOARD_SIZE)).toBe(true);
      }
    }
  });

  it('serializa a frota no formato do backend (sem campos extras)', () => {
    const payload = toFleetPayload(randomFleet());
    expect(payload).toHaveLength(5);
    for (const ship of payload) {
      expect(Object.keys(ship).sort()).toEqual(['positions', 'type']);
    }
  });
});

describe('estado das células', () => {
  it('tabuleiro próprio: navio, água, acerto e naufrágio completo', () => {
    const ships = [
      { type: 'DESTROYER', positions: [{ x: 0, y: 0 }, { x: 1, y: 0 }] },
      { type: 'CRUISER', positions: [{ x: 0, y: 2 }, { x: 1, y: 2 }, { x: 2, y: 2 }] },
    ];
    const cells = deriveOwnCells(ships, [
      { x: 0, y: 0, result: 'HIT' },
      { x: 1, y: 0, result: 'SUNK' },
      { x: 5, y: 5, result: 'MISS' },
      { x: 0, y: 2, result: 'HIT' },
    ]);
    expect(cells[cellIndex(0, 0)]).toBe(CELL.SUNK);
    expect(cells[cellIndex(1, 0)]).toBe(CELL.SUNK);
    expect(cells[cellIndex(5, 5)]).toBe(CELL.MISS);
    expect(cells[cellIndex(0, 2)]).toBe(CELL.HIT);
    expect(cells[cellIndex(1, 2)]).toBe(CELL.SHIP_HIDDEN);
    expect(cells[cellIndex(9, 9)]).toBe(CELL.EMPTY);
  });

  it('radar: só mostra nossos disparos (neblina de guerra)', () => {
    const cells = deriveRadarCells([
      { x: 3, y: 3, result: 'MISS' },
      { x: 4, y: 3, result: 'HIT' },
    ]);
    expect(cells[cellIndex(3, 3)]).toBe(CELL.MISS);
    expect(cells[cellIndex(4, 3)]).toBe(CELL.HIT);
    expect(cells.filter((c) => c === CELL.EMPTY)).toHaveLength(98);
  });

  it('radar: marca o navio inteiro como SUNK quando o tipo é conhecido', () => {
    const cells = deriveRadarCells([
      { x: 2, y: 4, result: 'HIT' },
      { x: 3, y: 4, result: 'HIT' },
      { x: 4, y: 4, result: 'SUNK', sunkShip: 'CRUISER' },
    ]);
    for (const x of [2, 3, 4]) expect(cells[cellIndex(x, 4)]).toBe(CELL.SUNK);
  });

  it('radar: não "engole" acertos de outro navio adjacente', () => {
    // CRUISER (3) em x=2..4 afundado; HIT solto em x=1 pertence a outro navio.
    const cells = deriveRadarCells([
      { x: 1, y: 4, result: 'HIT' },
      { x: 2, y: 4, result: 'HIT' },
      { x: 3, y: 4, result: 'HIT' },
      { x: 4, y: 4, result: 'SUNK', sunkShip: 'CRUISER' },
    ]);
    expect(cells[cellIndex(2, 4)]).toBe(CELL.SUNK);
    expect(cells[cellIndex(4, 4)]).toBe(CELL.SUNK);
    expect(cells[cellIndex(1, 4)]).toBe(CELL.HIT);
  });

  it('radar: sem tipo conhecido usa a maior sequência reta de acertos', () => {
    const cells = deriveRadarCells([
      { x: 6, y: 1, result: 'HIT' },
      { x: 6, y: 2, result: 'SUNK' },
    ]);
    expect(cells[cellIndex(6, 1)]).toBe(CELL.SUNK);
    expect(cells[cellIndex(6, 2)]).toBe(CELL.SUNK);
  });

  it('radar revela a frota inimiga ao final da partida', () => {
    const enemy = [{ type: 'DESTROYER', positions: [{ x: 7, y: 7 }, { x: 8, y: 7 }] }];
    const cells = deriveRadarCells([{ x: 7, y: 7, result: 'HIT' }], enemy);
    expect(cells[cellIndex(7, 7)]).toBe(CELL.HIT);
    expect(cells[cellIndex(8, 7)]).toBe(CELL.SHIP_HIDDEN);
  });

  it('inferSunkCells usa a interseção quando há janelas ambíguas', () => {
    const states = new Map([
      ['1,0', CELL.HIT],
      ['2,0', CELL.HIT],
      ['3,0', CELL.HIT],
    ]);
    // DESTROYER (2) afundado em (2,0): janelas {1,2} e {2,3} → interseção = só (2,0).
    expect(inferSunkCells(states, 2, 0, 2)).toEqual([{ x: 2, y: 0 }]);
  });
});

describe('casco e métricas', () => {
  it('casco horizontal e vertical têm a proa afilada', () => {
    const h = hullPoints({ positions: shipCells(0, 0, 3, false) });
    const v = hullPoints({ positions: shipCells(0, 0, 3, true) });
    expect(h).toHaveLength(5);
    expect(h[2][1]).toBe(0.5); // ponta da proa no meio da altura
    expect(v[2][0]).toBe(0.5); // ponta da proa no meio da largura
  });

  it('integridade da frota', () => {
    expect(fleetIntegrity(0)).toBe(1);
    expect(fleetIntegrity(FLEET_CELLS)).toBe(0);
    expect(fleetIntegrity(999)).toBe(0);
  });
});
