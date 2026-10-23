require('dotenv').config();

const http = require('http');
const { Server } = require('socket.io');
const { DataTypes } = require('sequelize');

const { app } = require('./src/app');
const { sequelize } = require('./src/models');
const { initSocket } = require('./src/socket');

const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: process.env.CORS_ORIGIN || '*' },
});

app.set('io', io);
initSocket(io);

const PORT = process.env.PORT || 3000;

// Garante retrocompatibilidade de schema em bancos SQLite já existentes.
async function ensureShotSunkShipColumn() {
  const qi = sequelize.getQueryInterface();
  try {
    const columns = await qi.describeTable('Shots');
    if (!columns.sunkShip) {
      await qi.addColumn('Shots', 'sunkShip', { type: DataTypes.STRING, allowNull: true });
      console.log('[db] Coluna Shots.sunkShip adicionada.');
    }
  } catch (err) {
    console.error('[db] Falha ao verificar/migrar coluna Shots.sunkShip:', err.message);
  }
}

async function startServer(port = PORT) {
  try {
    await sequelize.sync();
    await ensureShotSunkShipColumn();
    console.log('[db] Database synchronized successfully.');

    return await new Promise((resolve) => {
      server.listen(port, () => {
        console.log(`[http] Server listening on port ${port}`);
        resolve(server);
      });
    });
  } catch (err) {
    console.error('[db] Error synchronizing the database:', err);
    process.exit(1);
  }
}

if (require.main === module) {
  startServer();

  const shutdown = () => {
    console.log('[http] Encerrando servidor...');
    io.close();
    server.close(async () => {
      await sequelize.close();
      process.exit(0);
    });
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

module.exports = { app, server, io, startServer };
