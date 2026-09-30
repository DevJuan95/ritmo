import type { TestContext } from 'node:test';
import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import { tempDir } from './temp';

/**
 * Socket Unix sin nadie escuchando, como el que deja un cierre inesperado: un enlace al socket de un
 * servidor que después se cierra (al cerrarse, Node solo borra su propia ruta).
 */
export async function staleSocket(t: TestContext): Promise<string> {
  const directory = tempDir(t);
  const socketPath = path.join(directory, 'vivo.sock');
  const stale = path.join(directory, 'abandonado.sock');
  const server = net.createServer();
  await new Promise<void>(resolve => server.listen(socketPath, resolve));
  fs.linkSync(socketPath, stale);
  await new Promise<void>(resolve => server.close(() => resolve()));
  return stale;
}

/** Envía `payload` tal cual por el socket y devuelve todo lo que responde el servidor hasta cerrar la conexión. */
export function exchange(socketPath: string, payload: string | Buffer): Promise<string> {
  return new Promise((resolve, reject) => {
    const socket = net.connect(socketPath, () => socket.write(payload));
    let received = '';
    socket.on('data', chunk => { received += chunk.toString('utf8'); });
    socket.on('close', () => resolve(received));
    socket.on('error', reject);
  });
}
