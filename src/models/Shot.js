const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const Shot = sequelize.define('Shot', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    gameId: {
      type: DataTypes.UUID,
      allowNull: false,
    },
    shooterId: {
      type: DataTypes.UUID,
      allowNull: false,
    },
    targetUserId: {
      type: DataTypes.UUID,
      allowNull: false,
    },
    turnNumber: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    x: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    y: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    result: {
      type: DataTypes.ENUM('MISS', 'HIT', 'SUNK'),
      allowNull: false,
    },
    sunkShip: {
      type: DataTypes.ENUM('CARRIER', 'BATTLESHIP', 'CRUISER', 'SUBMARINE', 'DESTROYER'),
      allowNull: true,
    },
  }, {
    timestamps: true,
  });

  return Shot;
};
