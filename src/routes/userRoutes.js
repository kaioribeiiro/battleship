const { Router } = require('express');

const userController = require('../controllers/userController');
const authMiddleware = require('../middlewares/authMiddleware');

const router = Router();

router.get('/online', authMiddleware, userController.online);
router.get('/:id', authMiddleware, userController.getById);

module.exports = router;
