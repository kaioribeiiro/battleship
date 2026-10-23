const gameService = require('../services/gameService');
const botService = require('../services/botService');

async function create(req, res, next) {
  try {
    const result = await gameService.createGame(req.user.id, req.body || {});
    res.status(201).json(result);
  } catch (err) {
    next(err);
  }
}

async function createVsBot(req, res, next) {
  try {
    const { difficulty } = req.body || {};
    const result = await botService.createBotGame(req.user.id, difficulty);
    res.status(201).json(result);
  } catch (err) {
    next(err);
  }
}

async function list(req, res, next) {
  try {
    const { status, limit, offset } = req.query;
    const games = await gameService.listGames(req.user.id, {
      status,
      limit: limit ? Number(limit) : undefined,
      offset: offset ? Number(offset) : undefined,
    });
    res.json(games);
  } catch (err) {
    next(err);
  }
}

async function getById(req, res, next) {
  try {
    res.json(await gameService.getGameState(req.params.id, req.user.id));
  } catch (err) {
    next(err);
  }
}

async function getResult(req, res, next) {
  try {
    res.json(await gameService.getResult(req.params.id, req.user.id));
  } catch (err) {
    next(err);
  }
}

async function placeFleet(req, res, next) {
  try {
    const { ships } = req.body || {};
    res.json(await gameService.placeFleet(req.params.id, req.user.id, ships));
  } catch (err) {
    next(err);
  }
}

async function fire(req, res, next) {
  try {
    const { x, y } = req.body || {};
    res.json(await gameService.fireShot(req.params.id, req.user.id, x, y));
  } catch (err) {
    next(err);
  }
}

async function abandon(req, res, next) {
  try {
    res.json(await gameService.abandonGame(req.params.id, req.user.id));
  } catch (err) {
    next(err);
  }
}

module.exports = {
  create,
  createVsBot,
  list,
  getById,
  getResult,
  placeFleet,
  fire,
  abandon,
};
