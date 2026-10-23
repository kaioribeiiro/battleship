const presence = require('../src/socket/presence');

describe('presence', () => {
  it('marca usuário como online ao adicionar a primeira conexão', () => {
    expect(presence.add('u1', 's1', { username: 'ana' })).toBe(true);
    expect(presence.isOnline('u1')).toBe(true);
    expect(presence.count()).toBe(1);
  });

  it('não duplica usuário ao adicionar múltiplos sockets', () => {
    presence.add('u2', 's1', { username: 'bia' });
    expect(presence.add('u2', 's2', { username: 'bia' })).toBe(false);
    expect(presence.count()).toBe(2);
    expect(presence.getSockets('u2').size).toBe(2);
  });

  it('só remove o usuário quando a última conexão sai', () => {
    presence.add('u3', 's1', { username: 'caio' });
    presence.add('u3', 's2', { username: 'caio' });

    expect(presence.remove('u3', 's1')).toBe(false);
    expect(presence.isOnline('u3')).toBe(true);

    expect(presence.remove('u3', 's2')).toBe(true);
    expect(presence.isOnline('u3')).toBe(false);
  });

  it('listUsers expõe id e username', () => {
    presence.add('u4', 's1', { username: 'duda' });
    const users = presence.listUsers();
    expect(users).toContainEqual({ id: 'u4', username: 'duda' });
  });

  it('remove de usuário inexistente retorna false', () => {
    expect(presence.remove('nope', 's1')).toBe(false);
  });
});