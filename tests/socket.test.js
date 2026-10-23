/**
 * Testes de integração Socket.IO
 *
 * Cobre:
 *  - Handshake JWT (conexão válida / token ausente / token inválido)
 *  - lobby:listOnline
 *  - invitation:send + invitation:received + invitation:respond
 *  - game:placeFleet + game:start
 *  - game:fire + game:shotResult + game:turn
 *  - game:reconnect + game:state
 *  - game:abandon + game:over
 *  - timeout de reconexão (grace period)
 */
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'socket-test-secret';
process.env.JWT_EXPIRES_IN = '1h';
process.env.RECONNECT_GRACE_MS = '500';

const { createServer } = require('http');
const { Server } = require('socket.io');
const { io: ioc } = require('socket.io-client');

const { sequelize } = require('../src/models');
const { initSocket } = require('../src/socket');
const authService = require('../src/services/authService');

const FLEET = [
  { type: 'CARRIER',    positions: [0,1,2,3,4].map((x) => ({ x, y: 0 })) },
  { type: 'BATTLESHIP', positions: [0,1,2,3].map((x) => ({ x, y: 1 })) },
  { type: 'CRUISER',    positions: [0,1,2].map((x) => ({ x, y: 2 })) },
  { type: 'SUBMARINE',  positions: [0,1,2].map((x) => ({ x, y: 3 })) },
  { type: 'DESTROYER',  positions: [0,1].map((x) => ({ x, y: 4 })) },
];

let httpServer, ioServer, port;

beforeAll((done) => {
  httpServer = createServer();
  ioServer = new Server(httpServer, { cors: { origin: '*' } });
  initSocket(ioServer);
  httpServer.listen(0, () => {
    port = httpServer.address().port;
    done();
  });
});

afterAll((done) => {
  ioServer.close();
  httpServer.close(done);
});

beforeEach(async () => {
  await sequelize.sync({ force: true });
});

function connect(token) {
  return ioc(`http://localhost:${port}`, {
    auth: { token },
    forceNew: true,
    transports: ['websocket'],
  });
}

async function registerUser(username) {
  const { user, token } = await authService.register({ username, password: 'senha123' });
  return { user, token };
}

describe('Handshake JWT', () => {
  it('aceita conexão com token válido', (done) => {
    registerUser('u_auth').then(({ token }) => {
      const sock = connect(token);
      sock.on('connect', () => {
        expect(sock.connected).toBe(true);
        sock.disconnect();
        done();
      });
      sock.on('connect_error', (err) => done(err));
    });
  });

  it('recusa conexão sem token', (done) => {
    const sock = ioc(`http://localhost:${port}`, { forceNew: true, transports: ['websocket'] });
    sock.on('connect_error', (err) => {
      expect(err.message).toBe('UNAUTHORIZED');
      sock.disconnect();
      done();
    });
  });

  it('recusa conexão com token inválido', (done) => {
    const sock = connect('token-invalido');
    sock.on('connect_error', (err) => {
      expect(err.message).toBe('UNAUTHORIZED');
      sock.disconnect();
      done();
    });
  });
});

describe('lobby:listOnline', () => {
  it('retorna lista com o próprio usuário após conectar', (done) => {
    registerUser('u_lobby').then(({ user, token }) => {
      const sock = connect(token);
      sock.on('connect', () => {
        sock.emit('lobby:listOnline', (res) => {
          expect(res.ok).toBe(true);
          expect(res.data.some((u) => u.id === user.id)).toBe(true);
          sock.disconnect();
          done();
        });
      });
    });
  });
});

describe('invitation:send + invitation:respond', () => {
  it('envia convite e convidado recebe invitation:received', (done) => {
    Promise.all([registerUser('inv_a'), registerUser('inv_b')]).then(([a, b]) => {
      const sockA = connect(a.token);
      const sockB = connect(b.token);

      let connected = 0;
      const onConnect = () => {
        connected++;
        if (connected < 2) return;

        sockB.once('invitation:received', (data) => {
          expect(data.invitation.status).toBe('PENDING');
          expect(data.inviter.username).toBe('inv_a');
          sockA.disconnect();
          sockB.disconnect();
          done();
        });

        sockA.emit('invitation:send', { inviteeId: b.user.id }, (res) => {
          if (!res.ok) done(new Error(res.error.message));
        });
      };

      sockA.on('connect', onConnect);
      sockB.on('connect', onConnect);
    });
  });

  it('aceitar convite emite invitation:accepted para ambos', (done) => {
    Promise.all([registerUser('acc_a'), registerUser('acc_b')]).then(([a, b]) => {
      const sockA = connect(a.token);
      const sockB = connect(b.token);
      let invitationId;
      let connected = 0;

      const onConnect = () => {
        connected++;
        if (connected < 2) return;

        sockB.once('invitation:received', (data) => {
          invitationId = data.invitation.id;
          sockA.once('invitation:accepted', (res) => {
            expect(res.game.status).toBe('SETUP');
            sockA.disconnect();
            sockB.disconnect();
            done();
          });
          sockB.emit('invitation:respond', { invitationId, accept: true }, () => {});
        });

        sockA.emit('invitation:send', { inviteeId: b.user.id }, () => {});
      };

      sockA.on('connect', onConnect);
      sockB.on('connect', onConnect);
    });
  });
});

describe('game:placeFleet + game:start', () => {
  it('emite game:start quando ambos posicionam a frota', (done) => {
    Promise.all([registerUser('fleet_a'), registerUser('fleet_b')]).then(([a, b]) => {
      const sockA = connect(a.token);
      const sockB = connect(b.token);
      let gameId;
      let connected = 0;

      const onConnect = () => {
        connected++;
        if (connected < 2) return;

        sockB.once('invitation:received', (data) => {
          gameId = data.game.id;
          sockB.emit('invitation:respond', { invitationId: data.invitation.id, accept: true }, () => {
            sockA.emit('game:placeFleet', { gameId, ships: FLEET }, () => {});
            sockB.once('game:opponentReady', () => {
              sockA.once('game:start', (res) => {
                expect(res.game.status).toBe('IN_PROGRESS');
                expect(res.turnUserId).toBeTruthy();
                sockA.disconnect();
                sockB.disconnect();
                done();
              });
              sockB.emit('game:placeFleet', { gameId, ships: FLEET }, () => {});
            });
          });
        });

        sockA.emit('invitation:send', { inviteeId: b.user.id }, () => {});
      };

      sockA.on('connect', onConnect);
      sockB.on('connect', onConnect);
    });
  });
});

describe('game:fire + game:shotResult + game:turn', () => {
  it('ambos recebem game:shotResult após um disparo válido', (done) => {
    Promise.all([registerUser('fire_a'), registerUser('fire_b')]).then(([a, b]) => {
      const sockA = connect(a.token);
      const sockB = connect(b.token);
      let gameId, turnUserId;
      let connected = 0;

      const onConnect = () => {
        connected++;
        if (connected < 2) return;

        sockB.once('invitation:received', (data) => {
          gameId = data.game.id;
          sockB.emit('invitation:respond', { invitationId: data.invitation.id, accept: true }, () => {
            sockA.emit('game:placeFleet', { gameId, ships: FLEET }, () => {});
            sockB.once('game:opponentReady', () => {
              sockA.once('game:start', (res) => {
                turnUserId = res.turnUserId;
                const fireSocket = turnUserId === a.user.id ? sockA : sockB;

                let got = 0;
                const onResult = (data) => {
                  expect(['MISS', 'HIT', 'SUNK']).toContain(data.result);
                  got++;
                  if (got === 2) {
                    sockA.disconnect();
                    sockB.disconnect();
                    done();
                  }
                };
                sockA.once('game:shotResult', onResult);
                sockB.once('game:shotResult', onResult);

                fireSocket.emit('game:fire', { gameId, x: 9, y: 9 }, () => {});
              });
              sockB.emit('game:placeFleet', { gameId, ships: FLEET }, () => {});
            });
          });
        });

        sockA.emit('invitation:send', { inviteeId: b.user.id }, () => {});
      };

      sockA.on('connect', onConnect);
      sockB.on('connect', onConnect);
    });
  });
});

describe('game:reconnect + game:state', () => {
  it('game:reconnect devolve game:state com status da partida', (done) => {
    Promise.all([registerUser('rec_a'), registerUser('rec_b')]).then(([a, b]) => {
      const sockA = connect(a.token);
      const sockB = connect(b.token);
      let gameId;
      let connected = 0;

      const onConnect = () => {
        connected++;
        if (connected < 2) return;

        sockB.once('invitation:received', (data) => {
          gameId = data.game.id;
          sockB.emit('invitation:respond', { invitationId: data.invitation.id, accept: true }, () => {
            sockA.emit('game:placeFleet', { gameId, ships: FLEET }, () => {});
            sockB.once('game:opponentReady', () => {
              sockB.emit('game:placeFleet', { gameId, ships: FLEET }, () => {});

              sockA.once('game:start', () => {
                sockA.once('game:state', (state) => {
                  expect(state.game.status).toBe('IN_PROGRESS');
                  expect(state.you.ships).toHaveLength(5);
                  sockA.disconnect();
                  sockB.disconnect();
                  done();
                });
                sockA.emit('game:reconnect', { gameId });
              });
            });
          });
        });

        sockA.emit('invitation:send', { inviteeId: b.user.id }, () => {});
      };

      sockA.on('connect', onConnect);
      sockB.on('connect', onConnect);
    });
  });
});

describe('game:abandon + game:over', () => {
  it('ambos recebem game:over após abandono', (done) => {
    Promise.all([registerUser('ab_a'), registerUser('ab_b')]).then(([a, b]) => {
      const sockA = connect(a.token);
      const sockB = connect(b.token);
      let gameId, turnUserId;
      let connected = 0;

      const onConnect = () => {
        connected++;
        if (connected < 2) return;

        sockB.once('invitation:received', (data) => {
          gameId = data.game.id;
          sockB.emit('invitation:respond', { invitationId: data.invitation.id, accept: true }, () => {
            sockA.emit('game:placeFleet', { gameId, ships: FLEET }, () => {});
            sockB.once('game:opponentReady', () => {
              sockA.once('game:start', (res) => {
                turnUserId = res.turnUserId;
                const abandonSocket = turnUserId === a.user.id ? sockA : sockB;

                let got = 0;
                const onOver = (data) => {
                  expect(data.result).toBe('WIN');
                  got++;
                  if (got === 2) {
                    sockA.disconnect();
                    sockB.disconnect();
                    done();
                  }
                };
                sockA.once('game:over', onOver);
                sockB.once('game:over', onOver);

                abandonSocket.emit('game:abandon', { gameId }, () => {});
              });
              sockB.emit('game:placeFleet', { gameId, ships: FLEET }, () => {});
            });
          });
        });

        sockA.emit('invitation:send', { inviteeId: b.user.id }, () => {});
      };

      sockA.on('connect', onConnect);
      sockB.on('connect', onConnect);
    });
  });
});

describe('reconnect grace period timeout', () => {
  it('abandona partida automaticamente após RECONNECT_GRACE_MS se não reconectar', (done) => {
    Promise.all([registerUser('grace_a'), registerUser('grace_b')]).then(([a, b]) => {
      const sockA = connect(a.token);
      const sockB = connect(b.token);
      let gameId;
      let connected = 0;

      const onConnect = () => {
        connected++;
        if (connected < 2) return;

        sockB.once('invitation:received', (data) => {
          gameId = data.game.id;
          sockB.emit('invitation:respond', { invitationId: data.invitation.id, accept: true }, () => {
            sockA.emit('game:placeFleet', { gameId, ships: FLEET }, () => {});
            sockB.once('game:opponentReady', () => {
              sockB.once('game:start', () => {
                sockA.disconnect();

                sockB.once('game:over', (payload) => {
                  expect(payload.game.id).toBe(gameId);
                  expect(payload.game.status).toBe('ABANDONED');
                  sockB.disconnect();
                  done();
                });
              });
              sockB.emit('game:placeFleet', { gameId, ships: FLEET }, () => {});
            });
          });
        });

        sockA.emit('invitation:send', { inviteeId: b.user.id }, () => {});
      };

      sockA.on('connect', onConnect);
      sockB.on('connect', onConnect);
    });
  });
});
