const gameService = require('../services/gameService');

async function accept(req, res, next) {
  try {
    res.json(await gameService.acceptInvitation(req.params.id, req.user.id));
  } catch (err) {
    next(err);
  }
}

async function reject(req, res, next) {
  try {
    res.json(await gameService.rejectInvitation(req.params.id, req.user.id));
  } catch (err) {
    next(err);
  }
}

module.exports = {
  accept,
  reject,
};
