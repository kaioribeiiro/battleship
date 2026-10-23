const { Router } = require('express');

const authRoutes = require('./authRoutes');
const userRoutes = require('./userRoutes');
const gameRoutes = require('./gameRoutes');
const invitationRoutes = require('./invitationRoutes');
const userController = require('../controllers/userController');

const router = Router();

router.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
  });
});

// Scoreboard público (sem autenticação obrigatória, conforme docs)
router.get('/scoreboard', userController.scoreboard);

router.use('/auth', authRoutes);
router.use('/users', userRoutes);
router.use('/games', gameRoutes);
router.use('/invitations', invitationRoutes);

module.exports = router;
