const authService = require('../services/authService');
const userService = require('../services/userService');

async function register(req, res, next) {
  try {
    const result = await authService.register(req.body || {});
    res.status(201).json(result);
  } catch (err) {
    next(err);
  }
}

async function login(req, res, next) {
  try {
    const result = await authService.login(req.body || {});
    res.json(result);
  } catch (err) {
    next(err);
  }
}

async function me(req, res, next) {
  try {
    const user = await userService.getById(req.user.id);
    res.json(authService.toPublicUser(user));
  } catch (err) {
    next(err);
  }
}

async function logout(req, res, next) {
  try {
    await authService.logout(req.user.id, req.user.username);
    res.status(204).end();
  } catch (err) {
    next(err);
  }
}

module.exports = {
  register,
  login,
  me,
  logout,
};
