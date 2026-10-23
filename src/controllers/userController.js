const userService = require('../services/userService');

function online(req, res, next) {
  try {
    res.json(userService.listOnline());
  } catch (err) {
    next(err);
  }
}

async function getById(req, res, next) {
  try {
    const user = await userService.getPublicById(req.params.id);
    res.json(user);
  } catch (err) {
    next(err);
  }
}

async function scoreboard(req, res, next) {
  try {
    const limit = req.query.limit ? Number(req.query.limit) : 20;
    const result = await userService.getScoreboard(limit);
    res.json(result);
  } catch (err) {
    next(err);
  }
}

module.exports = {
  online,
  getById,
  scoreboard,
};
