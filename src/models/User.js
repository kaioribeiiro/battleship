const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const User = sequelize.define('User', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    username: {
      type: DataTypes.STRING,
      allowNull: false,
      unique: true,
      validate: {
        len: [3, 20],
      },
    },
    passwordHash: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    wins: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    },
    losses: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    },
    draws: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    },
    isBot: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    },
  }, {
    timestamps: true,
  });

  return User;
};
