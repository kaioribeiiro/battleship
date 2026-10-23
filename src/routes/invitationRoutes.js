const { Router } = require('express');

const invitationController = require('../controllers/invitationController');
const authMiddleware = require('../middlewares/authMiddleware');

const router = Router();

router.use(authMiddleware);

router.post('/:id/accept', invitationController.accept);
router.post('/:id/reject', invitationController.reject);

module.exports = router;
