/**
 * Bot Service
 *
 * Lógica do jogador virtual (CPU) com suporte a 3 níveis de dificuldade:
 *  - EASY (Cadete): Disparos aleatórios em células ainda não tentadas.
 *  - MEDIUM (Comandante): Estratégia Hunt (paridade xadrez) + Target (vizinhos ortogonais).
 *  - HARD (Almirante): Estratégia Target com inferência de linha colinear, descarte de
 *    navios já afundados e Mapa de Densidade Probabilística para os navios restantes.
 */

const FLEET_COMPOSITION = {
  CARRIER: 5,
  BATTLESHIP: 4,
  CRUISER: 3,
  SUBMARINE: 3,
  DESTROYER: 2,
};

const BOARD_SIZE = 10;
const VALID_DIFFICULTIES = new Set(['easy', 'medium', 'hard']);
const gameDifficulties = new Map();

function normalizeDifficulty(difficulty) {
  const norm = String(difficulty || 'hard').toLowerCase();
  return VALID_DIFFICULTIES.has(norm) ? norm : 'hard';
}

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function cellKey(x, y) {
  return `${x},${y}`;
}

function inBounds(x, y) {
  return x >= 0 && x < BOARD_SIZE && y >= 0 && y < BOARD_SIZE;
}

/**
 * Tenta posicionar um navio de `size` células a partir de (x, y) na direção dada.
 * Retorna as posições ou null se inválido/ocupado.
 */
function tryPlace(x, y, size, horizontal, occupied) {
  const positions = [];
  for (let i = 0; i < size; i++) {
    const cx = horizontal ? x + i : x;
    const cy = horizontal ? y : y + i;
    if (cx >= BOARD_SIZE || cy >= BOARD_SIZE) return null;
    const key = cellKey(cx, cy);
    if (occupied.has(key)) return null;
    positions.push({ x: cx, y: cy });
  }
  return positions;
}

/**
 * Gera um posicionamento aleatório completo da frota.
 * Retorna um array no mesmo formato aceito por gameService.placeFleet.
 */
function generateFleet() {
  const occupied = new Set();
  const ships = [];

  for (const [type, size] of Object.entries(FLEET_COMPOSITION)) {
    let placed = false;
    const attempts = shuffle(
      Array.from({ length: BOARD_SIZE * BOARD_SIZE * 2 }, (_, i) => ({
        x: Math.floor(Math.random() * BOARD_SIZE),
        y: Math.floor(Math.random() * BOARD_SIZE),
        horizontal: i % 2 === 0,
      })),
    );

    for (const { x, y, horizontal } of attempts) {
      const positions = tryPlace(x, y, size, horizontal, occupied);
      if (positions) {
        positions.forEach(({ x: cx, y: cy }) => occupied.add(cellKey(cx, cy)));
        ships.push({ type, positions });
        placed = true;
        break;
      }
    }

    if (!placed) {
      return generateFleet();
    }
  }

  return ships;
}

/**
 * Identifica células de HIT que já foram resolvidas por um naufrágio (SUNK).
 */
function resolveSunkHits(shotHistory) {
  const hitSet = new Set(
    shotHistory.filter((s) => s.result === 'HIT' || s.result === 'SUNK').map((s) => cellKey(s.x, s.y)),
  );
  const resolved = new Set();

  for (const shot of shotHistory) {
    if (shot.result !== 'SUNK') continue;
    resolved.add(cellKey(shot.x, shot.y));
    const maxLen = (shot.sunkShip && FLEET_COMPOSITION[shot.sunkShip]) || 5;

    const collectLine = (dx, dy) => {
      const cells = [];
      for (let step = 1; step < maxLen; step++) {
        const nx = shot.x + dx * step;
        const ny = shot.y + dy * step;
        const k = cellKey(nx, ny);
        if (hitSet.has(k) && !resolved.has(k)) {
          cells.push(k);
        } else {
          break;
        }
      }
      return cells;
    };

    const horiz = [...collectLine(-1, 0), ...collectLine(1, 0)];
    const vert = [...collectLine(0, -1), ...collectLine(0, 1)];
    const chosen = horiz.length >= vert.length ? horiz : vert;
    chosen.slice(0, maxLen - 1).forEach((k) => resolved.add(k));
  }

  return resolved;
}

/**
 * Calcula mapa de densidade probabilística para os navios restantes (modo HARD).
 */
function chooseByProbabilityDensity(shotHistory, fired, resolved) {
  const sunkTypes = new Set(
    shotHistory.filter((s) => s.result === 'SUNK' && s.sunkShip).map((s) => s.sunkShip),
  );
  const remainingSizes = Object.entries(FLEET_COMPOSITION)
    .filter(([type]) => !sunkTypes.has(type))
    .map(([, size]) => size);

  const sizes = remainingSizes.length > 0 ? remainingSizes : [2, 3, 4];
  const blocked = new Set([
    ...shotHistory.filter((s) => s.result === 'MISS').map((s) => cellKey(s.x, s.y)),
    ...resolved,
  ]);

  const weights = Array.from({ length: BOARD_SIZE }, () => Array(BOARD_SIZE).fill(0));

  for (const size of sizes) {
    // Horizontal placements
    for (let y = 0; y < BOARD_SIZE; y++) {
      for (let x = 0; x <= BOARD_SIZE - size; x++) {
        let valid = true;
        for (let i = 0; i < size; i++) {
          if (blocked.has(cellKey(x + i, y))) {
            valid = false;
            break;
          }
        }
        if (valid) {
          for (let i = 0; i < size; i++) weights[y][x + i] += 1;
        }
      }
    }
    // Vertical placements
    for (let x = 0; x < BOARD_SIZE; x++) {
      for (let y = 0; y <= BOARD_SIZE - size; y++) {
        let valid = true;
        for (let i = 0; i < size; i++) {
          if (blocked.has(cellKey(x, y + i))) {
            valid = false;
            break;
          }
        }
        if (valid) {
          for (let i = 0; i < size; i++) weights[y + i][x] += 1;
        }
      }
    }
  }

  let maxWeight = -1;
  let bestCells = [];

  for (let y = 0; y < BOARD_SIZE; y++) {
    for (let x = 0; x < BOARD_SIZE; x++) {
      if (fired.has(cellKey(x, y))) continue;
      const w = weights[y][x];
      if (w > maxWeight) {
        maxWeight = w;
        bestCells = [{ x, y }];
      } else if (w === maxWeight) {
        bestCells.push({ x, y });
      }
    }
  }

  if (bestCells.length > 0) {
    return bestCells[Math.floor(Math.random() * bestCells.length)];
  }
  return { x: 0, y: 0 };
}

/**
 * Escolhe a próxima célula a atirar dado o histórico de tiros já realizados e a dificuldade.
 *
 * @param {Array<{x: number, y: number, result: string, sunkShip?: string}>} shotHistory
 * @param {'easy' | 'medium' | 'hard'} [difficulty='hard']
 * @returns {{ x: number, y: number }}
 */
function chooseShot(shotHistory, difficulty = 'hard') {
  const mode = normalizeDifficulty(difficulty);
  const fired = new Set(shotHistory.map(({ x, y }) => cellKey(x, y)));

  // Modo EASY: disparo puramente aleatório entre células livres
  if (mode === 'easy') {
    const available = [];
    for (let y = 0; y < BOARD_SIZE; y++) {
      for (let x = 0; x < BOARD_SIZE; x++) {
        if (!fired.has(cellKey(x, y))) available.push({ x, y });
      }
    }
    return available[Math.floor(Math.random() * available.length)] || { x: 0, y: 0 };
  }

  const resolved = mode === 'hard' ? resolveSunkHits(shotHistory) : new Set();

  // Células que foram HIT e não pertencem a um navio já afundado (modo TARGET)
  const activeHits = shotHistory.filter(
    (s) => s.result === 'HIT' && !resolved.has(cellKey(s.x, s.y)),
  );

  if (activeHits.length > 0) {
    const activeSet = new Set(activeHits.map((h) => cellKey(h.x, h.y)));

    // 1. No modo HARD, se houver múltiplos HITs alinhados, prioriza as extremidades da linha
    if (mode === 'hard' && activeHits.length >= 2) {
      const lineCandidates = [];
      for (const hit of [...activeHits].reverse()) {
        const hasHorizNeighbor =
          activeSet.has(cellKey(hit.x - 1, hit.y)) || activeSet.has(cellKey(hit.x + 1, hit.y));
        const hasVertNeighbor =
          activeSet.has(cellKey(hit.x, hit.y - 1)) || activeSet.has(cellKey(hit.x, hit.y + 1));

        if (hasHorizNeighbor) {
          for (const dx of [-1, 1]) {
            const nx = hit.x + dx;
            const ny = hit.y;
            if (inBounds(nx, ny) && !fired.has(cellKey(nx, ny))) {
              lineCandidates.push({ x: nx, y: ny });
            }
          }
        }
        if (hasVertNeighbor) {
          for (const dy of [-1, 1]) {
            const nx = hit.x;
            const ny = hit.y + dy;
            if (inBounds(nx, ny) && !fired.has(cellKey(nx, ny))) {
              lineCandidates.push({ x: nx, y: ny });
            }
          }
        }
      }

      if (lineCandidates.length > 0) {
        return lineCandidates[Math.floor(Math.random() * lineCandidates.length)];
      }
    }

    // 2. Pega o HIT mais recente e tenta vizinhos ortogonais
    for (const hit of [...activeHits].reverse()) {
      const neighbors = [
        { x: hit.x + 1, y: hit.y },
        { x: hit.x - 1, y: hit.y },
        { x: hit.x, y: hit.y + 1 },
        { x: hit.x, y: hit.y - 1 },
      ].filter(({ x, y }) => inBounds(x, y) && !fired.has(cellKey(x, y)));

      if (neighbors.length > 0) {
        return neighbors[Math.floor(Math.random() * neighbors.length)];
      }
    }
  }

  // Modo HUNT no nível HARD usa Mapa de Densidade Probabilística
  if (mode === 'hard' && shotHistory.length > 0) {
    return chooseByProbabilityDensity(shotHistory, fired, resolved);
  }

  // Modo HUNT padrão (paridade xadrez)
  const parity = shotHistory.length % 2;
  const candidates = [];
  const fallback = [];

  for (let y = 0; y < BOARD_SIZE; y++) {
    for (let x = 0; x < BOARD_SIZE; x++) {
      if (!fired.has(cellKey(x, y))) {
        if ((x + y) % 2 === parity) {
          candidates.push({ x, y });
        } else {
          fallback.push({ x, y });
        }
      }
    }
  }

  const pool = candidates.length > 0 ? candidates : fallback;
  return pool[Math.floor(Math.random() * pool.length)];
}

/**
 * Garante que existe um usuário bot no banco.
 * Reutiliza se já existir (evita duplicação).
 */
async function ensureBotUser(username = 'CPU') {
  const userRepository = require('../repositories/userRepository');
  const bcrypt = require('bcrypt');

  const baseUsername = username;
  let suffix = '';
  let bot;

  while (true) {
    bot = await userRepository.findByUsername(baseUsername + suffix);
    if (!bot) break;
    if (bot.isBot) return bot;
    suffix = suffix === '' ? '_bot' : `_bot_${Math.floor(Math.random() * 10000)}`;
  }

  const finalUsername = baseUsername + suffix;
  const passwordHash = await bcrypt.hash(`bot-${Date.now()}`, 10);
  return userRepository.create({ username: finalUsername, passwordHash, isBot: true });
}

/**
 * Executa o turno do bot em uma partida.
 * Deve ser chamado quando `game.turnUserId === bot.id`.
 */
async function playBotTurn(gameId, botId) {
  const gameService = require('./gameService');
  const gameRepository = require('../repositories/gameRepository');

  const allShots = await gameRepository.findShotsByGame(gameId);
  const botShots = allShots
    .filter((s) => s.shooterId === botId)
    .map((s) => ({ x: s.x, y: s.y, result: s.result, sunkShip: s.sunkShip ?? null }));

  const difficulty = gameDifficulties.get(gameId) || 'hard';
  const { x, y } = chooseShot(botShots, difficulty);
  return gameService.fireShot(gameId, botId, x, y);
}

/**
 * Cria uma partida humano vs. bot.
 * O bot aceita automaticamente o convite e posiciona a frota.
 */
async function createBotGame(humanId, difficulty = 'hard') {
  const gameService = require('./gameService');
  const presence = require('../socket/presence');

  const normDiff = normalizeDifficulty(difficulty);
  const bot = await ensureBotUser();

  const BOT_SOCKET = `bot-socket-${bot.id}`;
  const wasAdded = presence.add(bot.id, BOT_SOCKET, { username: bot.username });

  try {
    const { game, invitation } = await gameService.createGame(humanId, {
      inviteeId: bot.id,
    });

    gameDifficulties.set(game.id, normDiff);

    await gameService.acceptInvitation(invitation.id, bot.id);

    const fleet = generateFleet();
    await gameService.placeFleet(game.id, bot.id, fleet);

    return { gameId: game.id, botId: bot.id, difficulty: normDiff };
  } finally {
    if (wasAdded) {
      presence.remove(bot.id, BOT_SOCKET);
    }
  }
}

module.exports = {
  generateFleet,
  chooseShot,
  ensureBotUser,
  playBotTurn,
  createBotGame,
};
