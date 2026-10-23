const { AuditLog, User } = require('../models');

function create(entry) {
  return AuditLog.create(entry);
}

function findAll({ limit = 100, offset = 0, eventType, userId, gameId } = {}) {
  const where = {};
  if (eventType) where.eventType = eventType;
  if (userId) where.userId = userId;
  if (gameId) where.gameId = gameId;

  return AuditLog.findAll({
    where,
    order: [['createdAt', 'DESC']],
    limit,
    offset,
    include: [
      { model: User, as: 'user', attributes: ['id', 'username'], required: false },
    ],
  });
}

function countAll({ eventType, userId, gameId } = {}) {
  const where = {};
  if (eventType) where.eventType = eventType;
  if (userId) where.userId = userId;
  if (gameId) where.gameId = gameId;
  return AuditLog.count({ where });
}

module.exports = {
  create,
  findAll,
  countAll,
};
