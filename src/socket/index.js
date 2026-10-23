const authService = require('../services/authService');
const auditService = require('../services/auditService');
const gameService = require('../services/gameService');
const userRepository = require('../repositories/userRepository');
const { badRequest } = require('../utils/errors');
const presence = require('./presence');
const emitter = require('./emitter');

const MAX_LOBBY_MESSAGES = 40;
const MAX_GAME_MESSAGES = 60;
const MAX_TEXT_LENGTH = 240;

const BOT_REPLIES = [
  'Sistemas de mira calibrados. Boa sorte, comandante!',
  'Radar travado na sua posição. Prepare-se para o impacto.',
  'Cálculo probabilístico atualizado. Vamos ver quem afunda primeiro!',
  'Bela manobra tática, mas meus sensores já detectaram sua frota.',
  'Transmissão recebida no canal tático. Continuando operação!',
];

let msgSeq = 0;

function sanitizeText(raw) {
  const clean = String(raw ?? '').trim().slice(0, MAX_TEXT_LENGTH);
  if (!clean) {
    throw badRequest('A mensagem não pode estar vazia.', 'EMPTY_MESSAGE');
  }
  return clean;
}

function broadcastPresence(io) {
  io.emit('presence:online', { users: presence.listUsers() });
}

function reply(socket, ack, promise) {
  promise
    .then((data) => {
      if (typeof ack === 'function') {
        ack({ ok: true, data });
      }
    })
    .catch((err) => {
      const error = { code: err.code || 'ERROR', message: err.message };
      socket.emit('error', error);
      if (typeof ack === 'function') {
        ack({ ok: false, error });
      }
    });
}

function initSocket(io) {
  emitter.setIo(io);

  // Timers de grace period por userId (cancelados se o jogador reconectar)
  const gracePending = new Map();
  // Histórico em memória do Chat Global (Lobby) e Chat por Partida
  const lobbyHistory = [];
  const gameChats = new Map();

  io.use((socket, next) => {
    const token = socket.handshake.auth?.token;

    if (!token) {
      return next(new Error('UNAUTHORIZED'));
    }

    try {
      socket.user = authService.verifyToken(token);
      return next();
    } catch (err) {
      return next(new Error('UNAUTHORIZED'));
    }
  });

  io.on('connection', (socket) => {
    const { id: userId, username } = socket.user;

    socket.join(`user:${userId}`);

    const justOnline = presence.add(userId, socket.id, { username });
    if (justOnline && presence.count() <= 1) {
      lobbyHistory.length = 0;
    }
    broadcastPresence(io);
    if (justOnline) {
      io.emit('presence:updated', { userId, status: 'ONLINE' });
    }

    // Cancela o timer de grace period se houver (reconexão antes do timeout)
    if (gracePending.has(userId)) {
      clearTimeout(gracePending.get(userId));
      gracePending.delete(userId);
    }

    socket.on('lobby:listOnline', (ack) => {
      const users = presence.listUsers();
      if (typeof ack === 'function') {
        ack({ ok: true, data: users });
      } else {
        socket.emit('presence:online', { users });
      }
    });

    // ── Chat Global do Lobby ────────────────────────────────────────────────
    socket.on('lobby:chatHistory', (ack) => {
      if (typeof ack === 'function') {
        ack({ ok: true, data: lobbyHistory });
      }
    });

    socket.on('lobby:chatSend', (payload, ack) => {
      reply(
        socket,
        ack,
        Promise.resolve().then(() => {
          const text = sanitizeText(payload?.text);
          const msg = {
            id: `lmsg-${++msgSeq}`,
            userId,
            username,
            text,
            sentAt: new Date().toISOString(),
          };
          lobbyHistory.push(msg);
          if (lobbyHistory.length > MAX_LOBBY_MESSAGES) {
            lobbyHistory.shift();
          }
          io.emit('lobby:chatMessage', msg);
          return msg;
        }),
      );
    });

    socket.on('invitation:send', (payload, ack) => {
      reply(socket, ack, gameService.createGame(userId, payload || {}));
    });

    socket.on('invitation:respond', (payload, ack) => {
      const { invitationId, accept } = payload || {};
      const promise = accept
        ? gameService.acceptInvitation(invitationId, userId)
        : gameService.rejectInvitation(invitationId, userId);
      reply(socket, ack, promise);
    });

    socket.on('game:placeFleet', (payload, ack) => {
      const { gameId, ships } = payload || {};
      reply(socket, ack, gameService.placeFleet(gameId, userId, ships));
    });

    socket.on('game:fire', (payload, ack) => {
      const { gameId, x, y } = payload || {};
      reply(socket, ack, gameService.fireShot(gameId, userId, x, y));
    });

    socket.on('game:abandon', (payload, ack) => {
      const { gameId } = payload || {};
      reply(socket, ack, gameService.abandonGame(gameId, userId));
    });

    socket.on('game:signal', (payload, ack) => {
      const { gameId, code } = payload || {};
      reply(
        socket,
        ack,
        gameService.getGameState(gameId, userId).then((state) => {
          const signalPayload = {
            gameId,
            senderId: userId,
            senderName: username,
            code: String(code || 'PING').slice(0, 24),
            sentAt: new Date().toISOString(),
          };
          emitter.toUsers([state.you.id, state.opponent.id], 'game:signal', signalPayload);
          return signalPayload;
        }),
      );
    });

    // ── Chat da Partida (In-Game Chat) ──────────────────────────────────────
    socket.on('game:chatHistory', (payload, ack) => {
      const { gameId } = payload || {};
      reply(
        socket,
        ack,
        gameService.getGameState(gameId, userId).then(() => gameChats.get(gameId) || []),
      );
    });

    socket.on('game:chatSend', (payload, ack) => {
      const { gameId, text: rawText } = payload || {};
      reply(
        socket,
        ack,
        Promise.resolve()
          .then(() => {
            const text = sanitizeText(rawText);
            return gameService.getGameState(gameId, userId).then((state) => ({ text, state }));
          })
          .then(async ({ text, state }) => {
            const list = gameChats.get(gameId) || [];
            const msg = {
              id: `gmsg-${++msgSeq}`,
              gameId,
              senderId: userId,
              senderName: username,
              text,
              sentAt: new Date().toISOString(),
            };
            list.push(msg);
            if (list.length > MAX_GAME_MESSAGES) list.shift();
            gameChats.set(gameId, list);

            const recipients = [state.you.id, state.opponent.id];
            emitter.toUsers(recipients, 'game:chatMessage', msg);

            // Se o oponente for a CPU (isBot), responde automaticamente no chat da partida
            const oppUser = await userRepository.findById(state.opponent.id);
            if (oppUser && oppUser.isBot) {
              const timer = setTimeout(() => {
                const botText = BOT_REPLIES[Math.floor(Math.random() * BOT_REPLIES.length)];
                const botMsg = {
                  id: `gmsg-${++msgSeq}`,
                  gameId,
                  senderId: oppUser.id,
                  senderName: oppUser.username,
                  text: botText,
                  sentAt: new Date().toISOString(),
                };
                const curList = gameChats.get(gameId) || [];
                curList.push(botMsg);
                if (curList.length > MAX_GAME_MESSAGES) curList.shift();
                gameChats.set(gameId, curList);
                emitter.toUsers(recipients, 'game:chatMessage', botMsg);
              }, 450);
              if (typeof timer.unref === 'function') timer.unref();
            }

            return msg;
          }),
      );
    });

    socket.on('game:reconnect', (payload, ack) => {
      const { gameId } = payload || {};
      gameService
        .getGameState(gameId, userId)
        .then((state) => {
          socket.emit('game:state', state);
          if (typeof ack === 'function') {
            ack({ ok: true, data: state });
          }
        })
        .catch((err) => {
          const error = { code: err.code || 'ERROR', message: err.message };
          socket.emit('error', error);
          if (typeof ack === 'function') {
            ack({ ok: false, error });
          }
        });
    });

    socket.on('disconnect', (reason) => {
      const wentOffline = presence.remove(userId, socket.id);
      if (presence.count() === 0 || (wentOffline && presence.count() <= 1)) {
        lobbyHistory.length = 0;
        io.emit('lobby:chatCleared');
      }
      broadcastPresence(io);

      if (wentOffline) {
        io.emit('presence:updated', { userId, status: 'OFFLINE' });
        auditService.record('USER_DISCONNECTED', `Usuário "${username}" desconectado.`, {
          userId,
          metadata: { reason },
        });

        const GRACE_MS = Number(process.env.RECONNECT_GRACE_MS) || 30_000;

        const timer = setTimeout(async () => {
          gracePending.delete(userId);
          if (presence.isOnline(userId)) return;

          try {
            const activeGame = await gameService.findActiveGameForUser(userId);
            if (activeGame) {
              await gameService.abandonGame(activeGame.id, userId);
              console.log(`[socket] partida ${activeGame.id} abandonada por timeout de reconexão (user ${userId})`);
            }
          } catch (err) {
            console.error('[socket] erro ao abandonar por timeout:', err.message);
          }
        }, GRACE_MS);

        gracePending.set(userId, timer);
      }
    });

    auditService.record('USER_CONNECTED', `Usuário "${username}" conectado.`, {
      userId,
      metadata: { socketId: socket.id },
    });
  });
}

module.exports = { initSocket };
