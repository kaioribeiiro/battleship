const presence = require('./presence');

let io = null;

function setIo(instance) {
  io = instance;
}

function toUser(userId, event, payload) {
  if (io) {
    io.to(`user:${userId}`).emit(event, payload);
  }
}

function toGame(gameId, event, payload) {
  if (io) {
    io.to(`game:${gameId}`).emit(event, payload);
  }
}

function joinGame(gameId, userIds) {
  if (!io) {
    return;
  }

  userIds.filter(Boolean).forEach((userId) => {
    presence.getSockets(userId).forEach((socketId) => {
      io.in(socketId).socketsJoin(`game:${gameId}`);
    });
  });
}

module.exports = {
  setIo,
  toUser,
  toGame,
  joinGame,
};
