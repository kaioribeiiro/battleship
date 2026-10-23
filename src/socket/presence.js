// Registro de presença em memória: userId -> { username, sockets, connectedAt }
const connections = new Map();

function add(userId, socketId, { username }) {
  let entry = connections.get(userId);

  if (!entry) {
    entry = { username, sockets: new Set(), connectedAt: new Date() };
    connections.set(userId, entry);
  }

  entry.sockets.add(socketId);
  return entry.sockets.size === 1; // true quando o usuário acabou de ficar online
}

function remove(userId, socketId) {
  const entry = connections.get(userId);
  if (!entry) {
    return false;
  }

  entry.sockets.delete(socketId);

  if (entry.sockets.size === 0) {
    connections.delete(userId);
    return true; // true quando o usuário ficou totalmente offline
  }

  return false;
}

function isOnline(userId) {
  return connections.has(userId);
}

function getSockets(userId) {
  return connections.get(userId)?.sockets || new Set();
}

function listUsers() {
  return [...connections.entries()].map(([id, entry]) => ({
    id,
    username: entry.username,
  }));
}

function count() {
  return connections.size;
}

module.exports = {
  add,
  remove,
  isOnline,
  getSockets,
  listUsers,
  count,
};
