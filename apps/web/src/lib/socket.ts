import { io, Socket } from 'socket.io-client';

const sockets = new Map<string, Socket>();

export function getCrashSocket(gameId: string): Socket {
  const ns = `/crash/${gameId}`;
  const existing = sockets.get(ns);
  if (existing) return existing;
  const url = window.location.origin;
  const socket = io(`${url}${ns}`, {
    transports: ['websocket', 'polling'],
    reconnection: true,
    reconnectionAttempts: 5,
  });
  sockets.set(ns, socket);
  return socket;
}

export function disconnectCrashSocket(gameId: string): void {
  const ns = `/crash/${gameId}`;
  const sock = sockets.get(ns);
  if (sock) {
    sock.disconnect();
    sockets.delete(ns);
  }
}
