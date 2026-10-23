const gameRepository = require('../repositories/gameRepository');
const userRepository = require('../repositories/userRepository');
const auditService = require('./auditService');
const engine = require('./gameEngineService');
const emitter = require('../socket/emitter');
const presence = require('../socket/presence');
const { badRequest, forbidden, notFound, conflict, gone } = require('../utils/errors');

const INVITATION_TTL_MS = Number(process.env.INVITATION_TTL_MS) || 5 * 60 * 1000;

function serializeGame(game) {
  return {
    id: game.id,
    player1Id: game.player1Id,
    player2Id: game.player2Id,
    status: game.status,
    result: game.result,
    winnerId: game.winnerId,
    abandonedById: game.abandonedById,
    totalTurns: game.totalTurns,
    startedAt: game.startedAt,
    endedAt: game.endedAt,
  };
}

function serializeInvitation(invitation) {
  return {
    id: invitation.id,
    gameId: invitation.gameId,
    inviterId: invitation.inviterId,
    inviteeId: invitation.inviteeId,
    status: invitation.status,
    expiresAt: invitation.expiresAt,
  };
}

function opponentIdOf(game, userId) {
  return userId === game.player1Id ? game.player2Id : game.player1Id;
}

function loserIdOf(game) {
  if (!game.winnerId) {
    return null;
  }
  return game.winnerId === game.player1Id ? game.player2Id : game.player1Id;
}

function buildGameOverPayload(game) {
  const state = engine.hasState(game.id) ? engine.getState(game.id) : null;
  const extractFleet = (pid) =>
    (state?.fleets?.[pid]?.ships || []).map((ship) => ({
      type: ship.type,
      size: ship.size,
      positions: ship.positions,
      sunk: ship.sunk,
    }));
  const fleets = state
    ? {
        [game.player1Id]: extractFleet(game.player1Id),
        [game.player2Id]: extractFleet(game.player2Id),
      }
    : undefined;

  return {
    result: game.result,
    winnerId: game.winnerId,
    loserId: loserIdOf(game),
    game: serializeGame(game),
    ...(fleets ? { fleets } : {}),
  };

  return {
    result: game.result,
    winnerId: game.winnerId,
    loserId: loserIdOf(game),

    game: serializeGame(game),

  };
}

async function ensureState(game) {
  if (engine.hasState(game.id)) {
    return engine.getState(game.id);
  }

  const [ships, shots] = await Promise.all([
    gameRepository.findShipsByGame(game.id),
    gameRepository.findShotsByGame(game.id),
  ]);

  return engine.buildFromDb(game, ships, shots);
}

function buildStateView(game, state, viewerId) {
  const opponentId = state.player1Id === viewerId ? state.player2Id : state.player1Id;
  const revealOpponent = state.status === 'FINISHED' || state.status === 'ABANDONED';

  const shotsToArray = (targetId) => [...state.shotsReceived[targetId].entries()].map(([cell, value]) => {
    const [x, y] = cell.split(',').map(Number);
    return {
      x,
      y,
      result: value.result,
      sunkShip: value.sunkShip ?? null,
      shooterId: value.shooterId,
      turnNumber: value.turnNumber ?? null,
    };
  });

  const fleetToArray = (playerId) => (state.fleets[playerId]?.ships || []).map((ship) => ({
    type: ship.type,
    size: ship.size,
    positions: ship.positions,
    sunk: ship.sunk,
  }));

  return {
    game: {
      id: game.id,
      status: state.status,
      player1Id: state.player1Id,
      player2Id: state.player2Id,
      turnUserId: state.turnUserId,
      totalTurns: state.totalTurns,
      result: game.result,
      winnerId: game.winnerId,
    },
    you: {
      id: viewerId,
      ships: fleetToArray(viewerId),
      shotsReceived: shotsToArray(viewerId),
      shotsFired: shotsToArray(opponentId),
    },
    opponent: {
      id: opponentId,
      shotsReceived: shotsToArray(opponentId),
      shotsFired: shotsToArray(viewerId),
      ships: revealOpponent ? fleetToArray(opponentId) : [],
    },
  };
}

async function createGame(inviterId, payload = {}) {
  const { inviteeId } = payload;

  if (!inviteeId) {
    throw badRequest('inviteeId é obrigatório.');
  }
  if (inviteeId === inviterId) {
    throw badRequest('Não é possível convidar a si mesmo.');
  }

  const invitee = await userRepository.findById(inviteeId);
  if (!invitee) {
    throw notFound('Usuário não encontrado.', 'USER_NOT_FOUND');
  }
  if (!presence.isOnline(inviteeId)) {
    throw forbidden('Usuário não está online.', 'USER_OFFLINE');
  }

  const pending = await gameRepository.findPendingInvitationBetween(inviterId, inviteeId);
  if (pending) {
    if (pending.expiresAt && pending.expiresAt.getTime() < Date.now()) {
      pending.status = 'EXPIRED';
      await pending.save();
    } else {
      throw conflict('Já existe um convite pendente entre os jogadores.');
    }
  }

  const game = await gameRepository.createGame({
    player1Id: inviterId,
    player2Id: null,
    status: 'WAITING',
  });

  const invitation = await gameRepository.createInvitation({
    gameId: game.id,
    inviterId,
    inviteeId,
    status: 'PENDING',
    expiresAt: new Date(Date.now() + INVITATION_TTL_MS),
  });

  const inviter = await userRepository.findById(inviterId);

  await auditService.record('GAME_CREATED', `Partida ${game.id} criada por "${inviter.username}".`, {
    userId: inviterId,
    gameId: game.id,
  });
  await auditService.record('INVITATION_SENT', `Convite de "${inviter.username}" para "${invitee.username}".`, {
    userId: inviterId,
    gameId: game.id,
    metadata: { inviteeId },
  });

  emitter.toUser(inviteeId, 'invitation:received', {
    invitation: serializeInvitation(invitation),
    game: serializeGame(game),

    inviter: { id: inviter.id, username: inviter.username },
  });

  return {
    game: serializeGame(game),

    invitation: serializeInvitation(invitation),
  };
}

async function acceptInvitation(invitationId, userId) {
  const invitation = await gameRepository.findInvitationById(invitationId);
  if (!invitation) {
    throw notFound('Convite não encontrado.');
  }
  if (invitation.inviteeId !== userId) {
    throw forbidden('Este convite não pertence a você.', 'NOT_PARTICIPANT');
  }

  if (invitation.status === 'PENDING' && invitation.expiresAt && invitation.expiresAt.getTime() < Date.now()) {
    invitation.status = 'EXPIRED';
    await invitation.save();
  }
  if (invitation.status === 'EXPIRED') {
    throw gone('Convite expirado.', 'INVITATION_EXPIRED');
  }
  if (invitation.status !== 'PENDING') {
    throw conflict('Convite já respondido.');
  }

  const game = await gameRepository.findGameById(invitation.gameId);
  if (!game) {
    throw notFound('Partida não encontrada.');
  }
  if (game.status !== 'WAITING') {
    throw conflict('Partida não está aguardando convite.');
  }

  invitation.status = 'ACCEPTED';
  await invitation.save();

  game.player2Id = invitation.inviteeId;
  game.status = 'SETUP';
  await game.save();

  engine.createState(game);
  emitter.joinGame(game.id, [game.player1Id, game.player2Id]);

  await auditService.record('INVITATION_ACCEPTED', `Convite ${invitation.id} aceito.`, {
    userId,
    gameId: game.id,
  });

  const payload = { game: serializeGame(game) };
  emitter.toUser(game.player1Id, 'invitation:accepted', payload);
  emitter.toUser(game.player2Id, 'invitation:accepted', payload);

  return { gameId: game.id, status: game.status };
}

async function rejectInvitation(invitationId, userId) {
  const invitation = await gameRepository.findInvitationById(invitationId);
  if (!invitation) {
    throw notFound('Convite não encontrado.');
  }
  if (invitation.inviteeId !== userId) {
    throw forbidden('Este convite não pertence a você.', 'NOT_PARTICIPANT');
  }
  if (invitation.status !== 'PENDING') {
    throw conflict('Convite já respondido.');
  }

  invitation.status = 'REJECTED';
  await invitation.save();

  const game = await gameRepository.findGameById(invitation.gameId);
  if (game && game.status === 'WAITING') {
    game.status = 'ABANDONED';
    game.endedAt = new Date();
    await game.save();
  }

  await auditService.record('INVITATION_REJECTED', `Convite ${invitation.id} rejeitado.`, {
    userId,
    gameId: invitation.gameId,
  });

  emitter.toUser(invitation.inviterId, 'invitation:rejected', { invitationId: invitation.id });

  return { invitationId: invitation.id, status: 'REJECTED' };
}

async function placeFleet(gameId, userId, ships) {
  const game = await gameRepository.findGameById(gameId);
  if (!game) {
    throw notFound('Partida não encontrada.');
  }
  if (userId !== game.player1Id && userId !== game.player2Id) {
    throw forbidden('Você não participa desta partida.', 'NOT_PARTICIPANT');
  }
  if (game.status !== 'SETUP') {
    throw conflict('A partida não está na fase de posicionamento.', 'INVALID_MOVE');
  }

  await ensureState(game);

  const { bothReady, turnUserId, ships: normalized } = engine.setFleet(gameId, userId, ships);

  await gameRepository.replaceFleet(
    gameId,
    userId,
    normalized.map((ship) => ({ type: ship.type, size: ship.size, positions: ship.positions }))
  );

  if (bothReady) {
    game.status = 'IN_PROGRESS';
    game.startedAt = new Date();
    await game.save();

    await auditService.record('GAME_START', `Partida ${game.id} iniciada.`, { gameId: game.id });

    emitter.toGame(gameId, 'game:start', { game: serializeGame(game), turnUserId });

    return { gameId, status: game.status, turnUserId };
  }

  emitter.toUser(opponentIdOf(game, userId), 'game:opponentReady', { userId });
  return { gameId, status: game.status, waitingFor: 'opponent', turnUserId: null };
}

async function finalizeGame(game, { winnerId, draw = false, status }) {
  game.status = status;
  game.result = draw ? 'DRAW' : 'WIN';
  game.winnerId = draw ? null : winnerId;
  game.endedAt = new Date();
  await game.save();

  if (draw) {
    await Promise.all([
      userRepository.incrementStats(game.player1Id, { draws: 1 }),
      userRepository.incrementStats(game.player2Id, { draws: 1 }),
    ]);
  } else {
    await userRepository.incrementStats(winnerId, { wins: 1 });
    await userRepository.incrementStats(loserIdOf(game), { losses: 1 });
  }

  await auditService.record('GAME_END', `Partida ${game.id} encerrada (${game.result}).`, {
    gameId: game.id,
    metadata: { result: game.result, winnerId: game.winnerId },
  });

  return buildGameOverPayload(game);
}

async function fireShot(gameId, userId, x, y) {
  const game = await gameRepository.findGameById(gameId);
  if (!game) {
    throw notFound('Partida não encontrada.');
  }
  if (userId !== game.player1Id && userId !== game.player2Id) {
    throw forbidden('Você não participa desta partida.', 'NOT_PARTICIPANT');
  }
  if (game.status !== 'IN_PROGRESS') {
    throw conflict('Partida não está em andamento.', 'GAME_ALREADY_OVER');
  }

  await ensureState(game);
  const outcome = engine.fire(gameId, userId, x, y);

  await gameRepository.createShot({
    gameId,
    shooterId: userId,
    targetUserId: outcome.targetUserId,
    turnNumber: outcome.turnNumber,
    x,
    y,
    result: outcome.result,
    sunkShip: outcome.sunkShip,
  });

  game.totalTurns = outcome.turnNumber;
  await game.save();

  await auditService.record('MOVE_MADE', `Disparo em (${x}, ${y}) => ${outcome.result}.`, {
    userId,
    gameId,
    metadata: { x, y, result: outcome.result },
  });

  const payload = {
    shooterId: userId,
    targetUserId: outcome.targetUserId,
    x,
    y,
    result: outcome.result,
    sunkShip: outcome.sunkShip,
    turnNumber: outcome.turnNumber,
  };
  emitter.toGame(gameId, 'game:shotResult', payload);

  if (outcome.gameOver) {
    const over = await finalizeGame(game, {
      winnerId: outcome.winnerId,
      draw: outcome.draw,
      status: 'FINISHED',
    });
    emitter.toGame(gameId, 'game:over', over);
    return {
      ...payload,
      turnUserId: null,
      gameOver: true,
      winnerId: outcome.winnerId || null,
    };
  }

  emitter.toGame(gameId, 'game:turn', {
    turnUserId: outcome.turnUserId,
    turnNumber: outcome.turnNumber,
  });

  // Se o próximo turno é do bot, dispara automaticamente após um breve delay
  if (outcome.turnUserId) {
    const nextTurnUser = await userRepository.findById(outcome.turnUserId);
    if (nextTurnUser && nextTurnUser.isBot) {
      setImmediate(async () => {
        try {
          const botService = require('./botService');
          await botService.playBotTurn(gameId, outcome.turnUserId);
        } catch (err) {
          console.error('[bot] erro no turno automático:', err.message);
          await auditService.record('ERROR', `Bot falhou no turno: ${err.message}`, {
            gameId,
            metadata: { botId: outcome.turnUserId },
          });
          try {
            await abandonGame(gameId, outcome.turnUserId);
          } catch (abandonErr) {
            console.error('[bot] erro ao abandonar partida:', abandonErr.message);
          }
        }
      });
    }
  }

  return { ...payload, turnUserId: outcome.turnUserId, gameOver: false };
}

async function abandonGame(gameId, userId) {
  const game = await gameRepository.findGameById(gameId);
  if (!game) {
    throw notFound('Partida não encontrada.');
  }
  if (userId !== game.player1Id && userId !== game.player2Id) {
    throw forbidden('Você não participa desta partida.', 'NOT_PARTICIPANT');
  }
  if (game.status === 'FINISHED' || game.status === 'ABANDONED') {
    throw conflict('Partida já encerrada.', 'GAME_ALREADY_OVER');
  }

  await ensureState(game);
  const { winnerId } = engine.abandon(gameId, userId);

  game.abandonedById = userId;
  await game.save();

  await auditService.record('GAME_ABANDONED', `Jogador "${userId}" abandonou a partida ${game.id}.`, {
    userId,
    gameId,
    metadata: { winnerId },
  });

  emitter.toGame(gameId, 'game:opponentLeft', { userId, reason: 'ABANDONED' });
  const over = await finalizeGame(game, { winnerId, status: 'ABANDONED' });
  emitter.toGame(gameId, 'game:over', over);

  return { gameId, status: game.status, winnerId };
}

async function getGameState(gameId, userId) {
  const game = await gameRepository.findGameById(gameId);
  if (!game) {
    throw notFound('Partida não encontrada.');
  }
  if (userId !== game.player1Id && userId !== game.player2Id) {
    throw forbidden('Você não participa desta partida.', 'NOT_PARTICIPANT');
  }
  if (game.status === 'WAITING') {
    throw conflict('Partida ainda não iniciada.');
  }

  const state = await ensureState(game);
  emitter.joinGame(gameId, [userId]);
  return buildStateView(game, state, userId);
}

async function getResult(gameId, userId) {
  const game = await gameRepository.findGameById(gameId);
  if (!game) {
    throw notFound('Partida não encontrada.');
  }
  if (userId !== game.player1Id && userId !== game.player2Id) {
    throw forbidden('Você não participa desta partida.', 'NOT_PARTICIPANT');
  }
  if (game.status !== 'FINISHED' && game.status !== 'ABANDONED') {
    throw conflict('Partida ainda em andamento.', 'INVALID_MOVE');
  }

  return {
    gameId: game.id,
    status: game.status,
    result: game.result,
    winnerId: game.winnerId,
    loserId: loserIdOf(game),

    totalTurns: game.totalTurns,
    endedAt: game.endedAt,
  };
}

async function listGames(userId, options = {}) {
  const games = await gameRepository.listGamesForUser(userId, options);

  return games.map((game) => {
    const opponent = game.player1Id === userId ? game.player2 : game.player1;
    return {
      ...serializeGame(game),
      opponent: opponent ? { id: opponent.id, username: opponent.username, wins: opponent.wins ?? 0, isBot: Boolean(opponent.isBot) } : null,
    };
  });
}

async function findActiveGameForUser(userId) {
  const games = await gameRepository.listGamesForUser(userId, { limit: 10 });
  return games.find(
    (g) => g.status === 'IN_PROGRESS' || g.status === 'SETUP'
  ) || null;
}

module.exports = {
  createGame,
  acceptInvitation,
  rejectInvitation,
  placeFleet,
  fireShot,
  abandonGame,
  getGameState,
  getResult,
  listGames,
  findActiveGameForUser,
};
