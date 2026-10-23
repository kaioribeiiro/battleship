const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const AuditLog = sequelize.define('AuditLog', {
    id: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true,
    },
    eventType: {
      type: DataTypes.ENUM(
        'USER_REGISTER',
        'USER_LOGIN',
        'USER_LOGOUT',
        'USER_CONNECTED',
        'USER_DISCONNECTED',
        'GAME_CREATED',
        'INVITATION_SENT',
        'INVITATION_ACCEPTED',
        'INVITATION_REJECTED',
        'GAME_START',
        'MOVE_MADE',
        'GAME_END',
        'GAME_ABANDONED',
        'ERROR'
      ),
      allowNull: false,
    },
    description: {
      type: DataTypes.TEXT,
      allowNull: false,
    },
    userId: {
      type: DataTypes.UUID,
      allowNull: true,
    },
    gameId: {
      type: DataTypes.UUID,
      allowNull: true,
    },
    metadata: {
      type: DataTypes.JSON,
      allowNull: true,
    },
  }, {
    timestamps: true,
  });

  return AuditLog;
};
