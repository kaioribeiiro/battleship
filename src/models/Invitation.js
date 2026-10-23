const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const Invitation = sequelize.define('Invitation', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    gameId: {
      type: DataTypes.UUID,
      allowNull: false,
    },
    inviterId: {
      type: DataTypes.UUID,
      allowNull: false,
    },
    inviteeId: {
      type: DataTypes.UUID,
      allowNull: false,
    },
    status: {
      type: DataTypes.ENUM('PENDING', 'ACCEPTED', 'REJECTED', 'EXPIRED'),
      allowNull: false,
      defaultValue: 'PENDING',
    },
    expiresAt: {
      type: DataTypes.DATE,
      allowNull: true,
    },
  }, {
    timestamps: true,
  });

  return Invitation;
};
