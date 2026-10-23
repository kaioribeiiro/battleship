export const BOARD_SIZE = 10;
export const COLUMNS = 'ABCDEFGHIJ';

export const FLEET = Object.freeze([
  { type: 'CARRIER', size: 5, label: 'PORTA-AVIÕES' },
  { type: 'BATTLESHIP', size: 4, label: 'ENCOURAÇADO' },
  { type: 'CRUISER', size: 3, label: 'CRUZADOR' },
  { type: 'SUBMARINE', size: 3, label: 'SUBMARINO' },
  { type: 'DESTROYER', size: 2, label: 'CONTRATORPEDEIRO' },
]);

export const FLEET_CELLS = FLEET.reduce((sum, ship) => sum + ship.size, 0);

export const CELL = Object.freeze({
  EMPTY: 'EMPTY',
  SHIP_HIDDEN: 'SHIP_HIDDEN',
  MISS: 'MISS',
  HIT: 'HIT',
  SUNK: 'SUNK',
});

const SIZE_BY_TYPE = Object.fromEntries(FLEET.map((s) => [s.type, s.size]));
const LABEL_BY_TYPE = Object.fromEntries(FLEET.map((s) => [s.type, s.label]));

export const shipSize = (type) => SIZE_BY_TYPE[type] ?? null;
export const shipLabel = (type) => LABEL_BY_TYPE[type] ?? type;

// Coordenadas
export const cellKey = (x, y) => `${x},${y}`;
export const cellIndex = (x, y) => y * BOARD_SIZE + x;
export const inBounds = (x, y) => x >= 0 && x < BOARD_SIZE && y >= 0 && y < BOARD_SIZE;
export const colLabel = (x) => COLUMNS[x] ?? '?';
export const rowLabel = (y) => String(y + 1);
export const coordLabel = (x, y) => `${colLabel(x)}-${String(y + 1).padStart(2, '0')}`;

// Posicionamento
export function shipCells(x, y, size, vertical) {
  return Array.from({ length: size }, (_, i) => ({
    x: vertical ? x : x + i,
    y: vertical ? y + i : y,
  }));
}

/** Avalia se `cells` cabe no tabuleiro sem colidir com `ships` (ignorando `ignoreType`). */
export function evaluatePlacement(ships, cells, ignoreType = null) {
  if (cells.some((c) => !inBounds(c.x, c.y))) {
    return { valid: false, reason: 'OUT_OF_BOUNDS' };
  }
  const occupied = new Set();
  for (const ship of ships) {
    if (ship.type === ignoreType) continue;
    for (const p of ship.positions) occupied.add(cellKey(p.x, p.y));
  }
  if (cells.some((c) => occupied.has(cellKey(c.x, c.y)))) {
    return { valid: false, reason: 'COLLISION' };
  }
  return { valid: true, reason: null };
}

/** Retorna nova lista de navios com `def` posicionado, ou `null` se inválido. */
export function placeShip(ships, def, x, y, vertical) {
  const positions = shipCells(x, y, def.size, vertical);
  if (!evaluatePlacement(ships, positions, def.type).valid) return null;
  const next = ships.filter((s) => s.type !== def.type);
  next.push({ type: def.type, size: def.size, vertical, positions });
  return next;
}

export const removeShip = (ships, type) => ships.filter((s) => s.type !== type);

export function shipAt(ships, x, y) {
  return ships.find((s) => s.positions.some((p) => p.x === x && p.y === y)) ?? null;
}

export const isFleetComplete = (ships) =>
  FLEET.every((def) => ships.some((s) => s.type === def.type));

/** Frota aleatória sem colisões (maiores navios primeiro). */
export function randomFleet(rng = Math.random) {
  for (let attempt = 0; attempt < 50; attempt++) {
    let ships = [];
    let failed = false;
    for (const def of FLEET) {
      let placed = null;
      for (let i = 0; i < 200 && !placed; i++) {
        const vertical = rng() < 0.5;
        const x = Math.floor(rng() * (vertical ? BOARD_SIZE : BOARD_SIZE - def.size + 1));
        const y = Math.floor(rng() * (vertical ? BOARD_SIZE - def.size + 1 : BOARD_SIZE));
        placed = placeShip(ships, def, x, y, vertical);
      }
      if (!placed) {
        failed = true;
        break;
      }
      ships = placed;
    }
    if (!failed) return ships;
  }
  throw new Error('Não foi possível gerar uma frota aleatória.');
}

/** Formato esperado por `POST /games/:id/fleet` e `game:placeFleet`. */
export const toFleetPayload = (ships) =>
  ships.map((s) => ({ type: s.type, positions: s.positions.map(({ x, y }) => ({ x, y })) }));

// Estado das células
const isHitState = (state) => state === CELL.HIT || state === CELL.SUNK;

export function deriveOwnCells(ships, shotsReceived) {
  const cells = Array(BOARD_SIZE * BOARD_SIZE).fill(CELL.EMPTY);
  for (const ship of ships) {
    for (const p of ship.positions) cells[cellIndex(p.x, p.y)] = CELL.SHIP_HIDDEN;
  }
  for (const shot of shotsReceived) {
    cells[cellIndex(shot.x, shot.y)] = shot.result === 'MISS' ? CELL.MISS : CELL.HIT;
  }
  for (const ship of ships) {
    if (ship.positions.every((p) => isHitState(cells[cellIndex(p.x, p.y)]))) {
      for (const p of ship.positions) cells[cellIndex(p.x, p.y)] = CELL.SUNK;
    }
  }
  return cells;
}

/**
 * Descobre quais células pertencem ao navio afundado pelo tiro em (x, y).
 * O servidor só informa a última célula (`SUNK`) e o tipo do navio; as demais
 * continuam `HIT`. Se o tamanho é conhecido, procuramos janelas retas de
 * células `HIT` que o contenham; havendo ambiguidade, usamos a interseção.
 * Sem tamanho (ex.: estado reidratado), usamos a maior sequência reta.
 */
export function inferSunkCells(states, x, y, size = null) {
  const at = (cx, cy) => (inBounds(cx, cy) ? states.get(cellKey(cx, cy)) : undefined);
  const isOpen = (cx, cy) => (cx === x && cy === y) || at(cx, cy) === CELL.HIT;
  const origin = [{ x, y }];

  if (size && size > 1) {
    const windows = [];
    for (const vertical of [false, true]) {
      for (let offset = -(size - 1); offset <= 0; offset++) {
        const cells = Array.from({ length: size }, (_, i) => ({
          x: vertical ? x : x + offset + i,
          y: vertical ? y + offset + i : y,
        }));
        if (cells.every((c) => isOpen(c.x, c.y))) windows.push(cells);
      }
    }
    if (windows.length === 0) return origin;
    if (windows.length === 1) return windows[0];
    return windows[0].filter((c) => windows.every((w) => w.some((o) => o.x === c.x && o.y === c.y)));
  }

  const run = (dx, dy) => {
    const cells = [{ x, y }];
    for (const dir of [-1, 1]) {
      let cx = x + dx * dir;
      let cy = y + dy * dir;
      while (inBounds(cx, cy) && at(cx, cy) === CELL.HIT) {
        cells.push({ x: cx, y: cy });
        cx += dx * dir;
        cy += dy * dir;
      }
    }
    return cells;
  };
  const horizontal = run(1, 0);
  const vertical = run(0, 1);
  if (horizontal.length > 1 && horizontal.length > vertical.length) return horizontal;
  if (vertical.length > 1 && vertical.length > horizontal.length) return vertical;
  return origin;
}

/**
 * Células do radar (tabuleiro inimigo): só vemos nossos disparos.
 * Após o fim da partida o servidor revela a frota inimiga (`revealedShips`).
 */
export function deriveRadarCells(shots, revealedShips = []) {
  const cells = Array(BOARD_SIZE * BOARD_SIZE).fill(CELL.EMPTY);
  for (const ship of revealedShips) {
    for (const p of ship.positions) cells[cellIndex(p.x, p.y)] = CELL.SHIP_HIDDEN;
  }

  const states = new Map();
  for (const shot of shots) {
    const state = shot.result === 'MISS' ? CELL.MISS : shot.result === 'SUNK' ? CELL.SUNK : CELL.HIT;
    states.set(cellKey(shot.x, shot.y), state);
  }
  for (const shot of shots) {
    if (shot.result !== 'SUNK') continue;
    // Marca a janela como SUNK antes de processar o próximo naufrágio.
    const sizeKnown = shipSize(shot.sunkShip);
    const probe = new Map(states);
    probe.set(cellKey(shot.x, shot.y), CELL.HIT);
    for (const c of inferSunkCells(probe, shot.x, shot.y, sizeKnown)) {
      states.set(cellKey(c.x, c.y), CELL.SUNK);
    }
  }
  for (const [key, state] of states) {
    const [cx, cy] = key.split(',').map(Number);
    cells[cellIndex(cx, cy)] = state;
  }
  return cells;
}

// Silhueta do casco
export function hullPoints(ship) {
  const xs = ship.positions.map((p) => p.x);
  const ys = ship.positions.map((p) => p.y);
  const x = Math.min(...xs);
  const y = Math.min(...ys);
  const size = ship.positions.length;
  const vertical = Math.max(...ys) > Math.min(...ys);
  const edge = 0.1;
  const bow = 0.5;

  if (!vertical) {
    const x0 = x + edge;
    const x1 = x + size - edge;
    const top = y + 0.22;
    const bottom = y + 0.78;
    return [
      [x0, top],
      [x1 - bow, top],
      [x1, y + 0.5],
      [x1 - bow, bottom],
      [x0, bottom],
    ];
  }
  const y0 = y + edge;
  const y1 = y + size - edge;
  const left = x + 0.22;
  const right = x + 0.78;
  return [
    [left, y0],
    [left, y1 - bow],
    [x + 0.5, y1],
    [right, y1 - bow],
    [right, y0],
  ];
}

export const hullPointsAttr = (ship) => hullPoints(ship).map(([px, py]) => `${px},${py}`).join(' ');

// ── Métricas ───────────────────────────────────────────────────────────────

/** Integridade restante da frota (0-1) dado o número de células atingidas. */
export const fleetIntegrity = (hitCount) =>
  Math.max(0, Math.min(1, (FLEET_CELLS - hitCount) / FLEET_CELLS));

export const countHits = (shots) => shots.filter((s) => s.result === 'HIT' || s.result === 'SUNK').length;
