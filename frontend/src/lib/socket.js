import { io } from 'socket.io-client';
import { apiUrl } from './api.js';

export function createSocket(token) {
  return io(apiUrl() || undefined, {
    auth: { token },
    reconnectionDelay: 500,
    reconnectionDelayMax: 3000,
  });
}

export class SocketError extends Error {
  constructor(error) {
    super(error?.message || 'Erro de comunicação com o servidor.');
    this.name = 'SocketError';
    this.code = error?.code || 'ERROR';
  }
}

export function emitAck(socket, event, payload, timeoutMs = 8000) {
  return new Promise((resolve, reject) => {
    if (!socket || !socket.connected) {
      reject(new SocketError({ code: 'DISCONNECTED', message: 'Sem conexão com o servidor.' }));
      return;
    }
    const args = payload === undefined ? [] : [payload];
    socket.timeout(timeoutMs).emit(event, ...args, (timeoutErr, response) => {
      if (timeoutErr) {
        reject(new SocketError({ code: 'TIMEOUT', message: 'O servidor não respondeu a tempo.' }));
      } else if (response?.ok) {
        resolve(response.data);
      } else {
        reject(new SocketError(response?.error));
      }
    });
  });
}
