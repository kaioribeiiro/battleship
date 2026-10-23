const { Op, fn, col, where } = require('sequelize');
const { User } = require('../models');

function findById(id) {
  return User.findByPk(id);
}

function findByUsername(username) {
  if (!username || typeof username !== 'string') return Promise.resolve(null);
  const clean = username.trim().toLowerCase();
  return User.findOne({
    where: where(fn('LOWER', col('username')), clean),
  });
}

function create(data) {
  return User.create(data);
}

function incrementStats(id, { wins = 0, losses = 0, draws = 0 }) {
  return User.increment({ wins, losses, draws }, { where: { id } });
}

function listPublicByIds(ids) {
  return User.findAll({
    where: { id: ids },
    attributes: ['id', 'username'],
  });
}

function getRanking(limit = 20) {
  const safeLimit = Math.min(Math.max(Number(limit) || 20, 1), 100);
  return User.findAll({
    where: { isBot: false },
    attributes: ['id', 'username', 'wins', 'losses', 'draws'],
    order: [
      ['wins', 'DESC'],
      ['draws', 'DESC'],
      ['losses', 'ASC'],
      ['username', 'ASC'],
    ],
    limit: safeLimit,
  });
}

module.exports = {
  findById,
  findByUsername,
  create,
  incrementStats,
  listPublicByIds,
  getRanking,
};
