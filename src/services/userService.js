const userRepository = require('../repositories/userRepository');
const presence = require('../socket/presence');
const { notFound } = require('../utils/errors');

async function getById(id) {
  const user = await userRepository.findById(id);
  if (!user) {
    throw notFound('Usuário não encontrado.');
  }
  return user;
}

async function getPublicById(id) {
  const user = await getById(id);
  return {
    id: user.id,
    username: user.username,
    isBot: Boolean(user.isBot),
    wins: user.wins,
    losses: user.losses,
    draws: user.draws,
  };
}

function listOnline() {
  return presence.listUsers();
}

function isOnline(userId) {
  return presence.isOnline(userId);
}

async function getScoreboard(limit = 20) {
  const users = await userRepository.getRanking(limit);
  return users.map((user, index) => ({
    rank: index + 1,
    userId: user.id,
    username: user.username,
    wins: user.wins,
    losses: user.losses,
    draws: user.draws,
  }));
}

module.exports = {
  getById,
  getPublicById,
  listOnline,
  isOnline,
  getScoreboard,
};
