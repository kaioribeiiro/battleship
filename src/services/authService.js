const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');

const userRepository = require('../repositories/userRepository');
const auditService = require('./auditService');
const { badRequest, unauthorized, conflict } = require('../utils/errors');

const SALT_ROUNDS = 10;
const JWT_SECRET = process.env.JWT_SECRET || 'dev-insecure-secret';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '1d';

if (!process.env.JWT_SECRET && process.env.NODE_ENV !== 'test') {
  console.warn('[auth] JWT_SECRET não definido; usando segredo de desenvolvimento.');
}

function validateCredentials({ username, password }) {
  if (!username || typeof username !== 'string') {
    throw badRequest('username é obrigatório.');
  }
  if (username.length < 3 || username.length > 20) {
    throw badRequest('username deve ter entre 3 e 20 caracteres.');
  }
  if (!password || typeof password !== 'string' || password.length < 6) {
    throw badRequest('password deve ter no mínimo 6 caracteres.');
  }
}

function toPublicUser(user) {
  return {
    id: user.id,
    username: user.username,
    wins: user.wins,
    losses: user.losses,
    draws: user.draws,
    isBot: user.isBot,
  };
}

function issueToken(user) {
  return jwt.sign({ sub: user.id, username: user.username }, JWT_SECRET, {
    expiresIn: JWT_EXPIRES_IN,
  });
}

function verifyToken(token) {
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    return { id: payload.sub, username: payload.username };
  } catch (err) {
    throw unauthorized('Token inválido ou expirado.');
  }
}

async function register({ username, password }) {
  validateCredentials({ username, password });

  const existing = await userRepository.findByUsername(username);
  if (existing) {
    throw conflict('username já está em uso.');
  }

  const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
  const user = await userRepository.create({ username, passwordHash });

  await auditService.record('USER_REGISTER', `Usuário "${username}" registrado.`, {
    userId: user.id,
  });

  return { token: issueToken(user), user: toPublicUser(user) };
}

async function login({ username, password }) {
  validateCredentials({ username, password });

  const user = await userRepository.findByUsername(username);
  if (!user) {
    throw unauthorized('Credenciais inválidas.');
  }

  const match = await bcrypt.compare(password, user.passwordHash);
  if (!match) {
    throw unauthorized('Credenciais inválidas.');
  }

  await auditService.record('USER_LOGIN', `Usuário "${username}" autenticado.`, {
    userId: user.id,
  });

  return { token: issueToken(user), user: toPublicUser(user) };
}

async function logout(userId, username) {
  await auditService.record('USER_LOGOUT', `Usuário "${username}" encerrou a sessão.`, {
    userId,
  });
}

module.exports = {
  register,
  login,
  logout,
  verifyToken,
  issueToken,
  toPublicUser,
};
