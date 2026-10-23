const { Op } = require('sequelize');
const { Game, Invitation, Ship, Shot, User } = require('../models');

const PLAYERS_INCLUDE = [
  { model: User, as: 'player1', attributes: ['id', 'username', 'wins', 'isBot'] },
  { model: User, as: 'player2', attributes: ['id', 'username', 'wins', 'isBot'] },
];

function createGame(data) {
  return Game.create(data);
}

function findGameById(id) {
  return Game.findByPk(id, { include: PLAYERS_INCLUDE });
}

function listGamesForUser(userId, { status, limit = 20, offset = 0 } = {}) {
  const where = { [Op.or]: [{ player1Id: userId }, { player2Id: userId }] };
  if (status) {
    where.status = status;
  }

  return Game.findAll({
    where,
    include: PLAYERS_INCLUDE,
    order: [['createdAt', 'DESC']],
    limit,
    offset,
  });
}

function createInvitation(data) {
  return Invitation.create(data);
}

function findInvitationById(id) {
  return Invitation.findByPk(id);
}

function findPendingInvitationBetween(userA, userB) {
  return Invitation.findOne({
    where: {
      status: 'PENDING',
      [Op.or]: [
        { inviterId: userA, inviteeId: userB },
        { inviterId: userB, inviteeId: userA },
      ],
    },
  });
}

function replaceFleet(gameId, userId, ships) {
  return Ship.sequelize.transaction(async (transaction) => {
    await Ship.destroy({ where: { gameId, userId }, transaction });
    return Ship.bulkCreate(
      ships.map((ship) => ({ ...ship, gameId, userId })),
      { transaction }
    );
  });
}

function findShipsByGame(gameId) {
  return Ship.findAll({ where: { gameId }, order: [['createdAt', 'ASC']] });
}

function createShot(data) {
  return Shot.create(data);
}

function findShotsByGame(gameId) {
  return Shot.findAll({ where: { gameId }, order: [['turnNumber', 'ASC']] });
}

module.exports = {
  createGame,
  findGameById,
  listGamesForUser,
  createInvitation,
  findInvitationById,
  findPendingInvitationBetween,
  replaceFleet,
  findShipsByGame,
  createShot,
  findShotsByGame,
};
