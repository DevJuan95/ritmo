import test, { type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import {
  APP_CLOSED, APP_INVALID_RESPONSE, APP_TIMEOUT, APP_UNREACHABLE, BRIDGE_TIMEOUT_MS, callBridge, defaultSocketPath
} from '../../../src/mcp/bridge-client';
import { MAX_BRIDGE_RESPONSE } from '../../../src/shared/bridge/contract';
import { staleSocket } from '../../helpers/sockets';
import { tempDir } from '../../helpers/temp';

/** Servidor que responde con `reply(petición)` tal cual; `null` no responde nada. */
async function fakeApp(t: TestContext, reply: (request: string) => string | null): Promise<{ socketPath: string; requests: string[] }> {
  const socketPath = path.join(tempDir(t), 'ritmo.sock');
  const requests: string[] = [];
  const sockets = new Set<net.Socket>();
  const server = net.createServer(socket => {
    sockets.add(socket);
    let received = '';
    socket.on('data', chunk => {
      received += chunk;
      if (!received.includes('\n')) return;
      requests.push(received);
      const answer = reply(received);
      if (answer !== null) socket.end(answer);
    });
  });
  await new Promise<void>(resolve => server.listen(socketPath, resolve));
  t.after(() => new Promise<void>(resolve => { for (const socket of sockets) socket.destroy(); server.close(() => resolve()); }));
  return { socketPath, requests };
}

test('el socket por defecto está en los datos de la app, salvo con RITMO_SOCKET', () => {
  assert.equal(defaultSocketPath({}, '/Users/ana'), '/Users/ana/Library/Application Support/ritmo/ritmo.sock');
  assert.equal(defaultSocketPath({ RITMO_SOCKET: '/tmp/otro.sock' }, '/Users/ana'), '/tmp/otro.sock');
  assert.equal(BRIDGE_TIMEOUT_MS, 10000);
});

test('envía la petición en una línea y devuelve la respuesta de la app', async t => {
  const { socketPath, requests } = await fakeApp(t, () => '{"ok":true,"value":[1]}\n');
  assert.deepEqual(await callBridge(socketPath, { op: 'list-routes' }), { ok: true, value: [1] });
  assert.deepEqual(requests, ['{"op":"list-routes"}\n']);
});

test('acepta un error de la app y una respuesta que termina al cerrar', async t => {
  const { socketPath } = await fakeApp(t, () => '{"ok":false,"error":"La ruta no existe."}');
  assert.deepEqual(await callBridge(socketPath, {}), { ok: false, error: 'La ruta no existe.' });
});

test('una respuesta sin forma o demasiado grande no se usa', async t => {
  for (const answer of ['no es json\n', '{"ok":true}\n', '{"ok":false,"error":3}\n', 'null\n', '']) {
    const { socketPath } = await fakeApp(t, () => answer);
    assert.deepEqual(await callBridge(socketPath, {}), { ok: false, error: APP_INVALID_RESPONSE }, answer);
  }
  const { socketPath } = await fakeApp(t, () => 'x'.repeat(MAX_BRIDGE_RESPONSE + 10));
  assert.deepEqual(await callBridge(socketPath, {}), { ok: false, error: APP_INVALID_RESPONSE });
});

test('dice que Ritmo no está abierto si no hay socket o nadie escucha', async t => {
  const directory = tempDir(t);
  assert.deepEqual(await callBridge(path.join(directory, 'ritmo.sock'), {}), { ok: false, error: APP_CLOSED });
  assert.deepEqual(await callBridge(await staleSocket(t), {}), { ok: false, error: APP_CLOSED });
});

test('otros errores de conexión dicen que no se pudo conectar', async t => {
  const socketPath = path.join(tempDir(t), 'no-es-socket');
  fs.mkdirSync(socketPath);
  assert.deepEqual(await callBridge(socketPath, {}), { ok: false, error: APP_UNREACHABLE });
});

test('deja de esperar si la app no responde a tiempo', async t => {
  const { socketPath } = await fakeApp(t, () => null);
  assert.deepEqual(await callBridge(socketPath, {}, { timeoutMs: 30 }), { ok: false, error: APP_TIMEOUT });
});
