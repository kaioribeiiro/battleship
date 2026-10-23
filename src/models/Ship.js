const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const Ship = sequelize.define('Ship', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    gameId: {
      type: DataTypes.UUID,
      allowNull: false,
    },
    userId: {
      type: DataTypes.UUID,
      allowNull: false,
    },
    type: {
      type: DataTypes.ENUM('CARRIER', 'BATTLESHIP', 'CRUISER', 'SUBMARINE', 'DESTROYER'),
      allowNull: false,
    },
    size: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    positions: {
      type: DataTypes.JSON,
      allowNull: false,
    },
    sunk: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    },
  }, {
    timestamps: true,
  });

  return Ship;
};
