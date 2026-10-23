const { Router } = require('express');

const gameController = require('../controllers/gameController');
const authMiddleware = require('../middlewares/authMiddleware');

const router = Router();

router.use(authMiddleware);

router.post('/vs-bot', gameController.createVsBot);
router.post('/', gameController.create);
router.get('/', gameController.list);
router.get('/:id/result', gameController.getResult);
router.get('/:id', gameController.getById);
router.post('/:id/fleet', gameController.placeFleet);
router.post('/:id/shots', gameController.fire);
router.post('/:id/abandon', gameController.abandon);

module.exports = router;
