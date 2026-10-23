const { sequelize } = require('../config/database');

const UserModel = require('./User');
const GameModel = require('./Game');
const InvitationModel = require('./Invitation');
const ShipModel = require('./Ship');
const ShotModel = require('./Shot');
const AuditLogModel = require('./AuditLog');

const User = UserModel(sequelize);
const Game = GameModel(sequelize);
const Invitation = InvitationModel(sequelize);
const Ship = ShipModel(sequelize);
const Shot = ShotModel(sequelize);
const AuditLog = AuditLogModel(sequelize);

// --- Definição das Associações / Relacionamentos ---

// Um utilizador pode ser o Player 1 em várias partidas
User.hasMany(Game, { as: 'player1Games', foreignKey: 'player1Id' });
Game.belongsTo(User, { as: 'player1', foreignKey: 'player1Id' });

// Um utilizador pode ser o Player 2 em várias partidas
User.hasMany(Game, { as: 'player2Games', foreignKey: 'player2Id' });
Game.belongsTo(User, { as: 'player2', foreignKey: 'player2Id' });

// Relacionamento opcional com o vencedor
User.hasMany(Game, { as: 'wonGames', foreignKey: 'winnerId' });
Game.belongsTo(User, { as: 'winner', foreignKey: 'winnerId' });

// Relacionamento opcional com quem abandonou
User.hasMany(Game, { as: 'abandonedGames', foreignKey: 'abandonedById' });
Game.belongsTo(User, { as: 'abandonedBy', foreignKey: 'abandonedById' });

// Convites enviados / recebidos
Game.hasMany(Invitation, { as: 'invitations', foreignKey: 'gameId' });
Invitation.belongsTo(Game, { as: 'game', foreignKey: 'gameId' });

User.hasMany(Invitation, { as: 'sentInvitations', foreignKey: 'inviterId' });
Invitation.belongsTo(User, { as: 'inviter', foreignKey: 'inviterId' });

User.hasMany(Invitation, { as: 'receivedInvitations', foreignKey: 'inviteeId' });
Invitation.belongsTo(User, { as: 'invitee', foreignKey: 'inviteeId' });

// Frotas por partida/jogador
Game.hasMany(Ship, { as: 'ships', foreignKey: 'gameId' });
Ship.belongsTo(Game, { as: 'game', foreignKey: 'gameId' });

User.hasMany(Ship, { as: 'ships', foreignKey: 'userId' });
Ship.belongsTo(User, { as: 'owner', foreignKey: 'userId' });

// Disparos por partida
Game.hasMany(Shot, { as: 'shots', foreignKey: 'gameId' });
Shot.belongsTo(Game, { as: 'game', foreignKey: 'gameId' });

User.hasMany(Shot, { as: 'shotsFired', foreignKey: 'shooterId' });
Shot.belongsTo(User, { as: 'shooter', foreignKey: 'shooterId' });

User.hasMany(Shot, { as: 'shotsReceived', foreignKey: 'targetUserId' });
Shot.belongsTo(User, { as: 'target', foreignKey: 'targetUserId' });

// Relacionamento com os Logs de Auditoria
User.hasMany(AuditLog, { as: 'auditLogs', foreignKey: 'userId' });
AuditLog.belongsTo(User, { as: 'user', foreignKey: 'userId' });

// Relacionamento opcional do log com a partida
Game.hasMany(AuditLog, { as: 'auditLogs', foreignKey: 'gameId' });
AuditLog.belongsTo(Game, { as: 'game', foreignKey: 'gameId' });

module.exports = {
  sequelize,
  User,
  Game,
  Invitation,
  Ship,
  Shot,
  AuditLog,
};
