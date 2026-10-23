const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const Game = sequelize.define('Game', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    player1Id: {
      type: DataTypes.UUID,
      allowNull: false,
    },
    player2Id: {
      type: DataTypes.UUID,
      allowNull: true,
    },
    status: {
      type: DataTypes.ENUM('WAITING', 'SETUP', 'IN_PROGRESS', 'FINISHED', 'ABANDONED'),
      allowNull: false,
      defaultValue: 'WAITING',
    },
    result: {
      type: DataTypes.ENUM('WIN', 'DRAW'),
      allowNull: true,
    },
    winnerId: {
      type: DataTypes.UUID,
      allowNull: true,
    },
    abandonedById: {
      type: DataTypes.UUID,
      allowNull: true,
    },
    totalTurns: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    },
    startedAt: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    endedAt: {
      type: DataTypes.DATE,
      allowNull: true,
    },
  }, {
    timestamps: true,
  });

  return Game;
};
