const { Sequelize } = require('sequelize');
const path = require('path');

const isTest = process.env.NODE_ENV === 'test';
const storage = isTest
  ? ':memory:'
  : path.resolve(process.cwd(), process.env.DB_STORAGE || 'database.sqlite');

const sequelize = new Sequelize({
  dialect: 'sqlite',
  storage,
  logging: process.env.DB_LOGGING === 'true' ? console.log : false,
});

module.exports = { sequelize };
