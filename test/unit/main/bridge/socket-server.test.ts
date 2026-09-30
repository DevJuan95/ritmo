import test, { type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import { INVALID_BRIDGE_REQUEST, MAX_BRIDGE_MESSAGE } from '../../../../src/shared/bridge/contract';
import { GENERIC_ERROR_MESSAGE, PublicError } from '../../../../src/shared/ipc';
import { BRIDGE_IDLE_TIMEOUT_MS, BRIDGE_MAX_CONNECTIONS, SocketBridgeServer, bridgeResponse } from '../../../../src/main/bridge/socket-server';
import type { BridgeHandler } from '../../../../src/main/bridge/ports';
import { exchange, staleSocket } from '../../../helpers/sockets';
import { tempDir } from '../../../helpers/temp';

async function setup(t: TestContext, handler: BridgeHandler = request => ({ echo: request }), options: ConstructorParameters<typeof SocketBridgeServer>[0] = {}) {
  const directory = tempDir(t);
  const socketPath = path.join(directory, 'datos', 'ritmo.sock');
  const logged: unknown[] = [];
  const server = new SocketBridgeServer({ log: (_message, error) => logged.push(error), ...options });
  t.after(() => server.close());
  await server.listen(socketPath, handler);
  return { server, socketPath, logged, directory };
}

test('responde una petición por conexión, en una línea de JSON', async t => {
  const { socketPath } = await setup(t);
  assert.equal(await exchange(socketPath, '{"op":"list-routes"}\n'), '{"ok":true,"value":{"echo":{"op":"list-routes"}}}\n');
  const response = await exchange(socketPath, Buffer.concat([Buffer.from('{"title":"'), Buffer.from('Canción', 'utf8'), Buffer.from('"}\nsobra')]));
  assert.deepEqual(JSON.parse(response), { ok: true, value: { echo: { title: 'Canción' } } });
});

test('reúne una petición que llega en varios trozos', async t => {
  const { socketPath } = await setup(t);
  const response = await new Promise<string>((resolve, reject) => {
    const socket = net.connect(socketPath, () => {
      socket.write('{"op":');
      setTimeout(() => socket.write('"list-routes"}\n'), 20);
    });
    let received = '';
    socket.on('data', chunk => { received += chunk; });
    socket.on('close', () => resolve(received));
    socket.on('error', reject);
  });
  assert.deepEqual(JSON.parse(response), { ok: true, value: { echo: { op: 'list-routes' } } });
});

test('crea el socket solo para el usuario, en una carpeta 0700', async t => {
  const { socketPath } = await setup(t);
  assert.equal(fs.statSync(socketPath).mode & 0o777, 0o600);
  assert.equal(fs.statSync(path.dirname(socketPath)).mode & 0o777, 0o700);
  assert.ok(fs.statSync(socketPath).isSocket());
});

test('envía el mensaje de un PublicError y oculta los errores inesperados', async t => {
  const failure = new Error('detalle interno');
  const { socketPath, logged } = await setup(t, request => {
    if ((request as { op: string }).op === 'publico') throw new PublicError('La ruta no existe.');
    throw failure;
  });
  assert.deepEqual(JSON.parse(await exchange(socketPath, '{"op":"publico"}\n')), { ok: false, error: 'La ruta no existe.' });
  assert.deepEqual(JSON.parse(await exchange(socketPath, '{"op":"otro"}\n')), { ok: false, error: GENERIC_ERROR_MESSAGE });
  assert.deepEqual(logged, [failure]);
});

test('rechaza JSON inválido y peticiones demasiado grandes sin llamar al manejador', async t => {
  let calls = 0;
  const { socketPath } = await setup(t, () => { calls++; return null; });
  assert.deepEqual(JSON.parse(await exchange(socketPath, 'no es json\n')), { ok: false, error: INVALID_BRIDGE_REQUEST });
  assert.deepEqual(JSON.parse(await exchange(socketPath, `${'x'.repeat(MAX_BRIDGE_MESSAGE + 1)}\n`)), { ok: false, error: INVALID_BRIDGE_REQUEST });
  assert.equal(calls, 0);
});

test('bridgeResponse convierte el resultado del manejador en la respuesta', () => {
  const log = () => { throw new Error('no debería registrar'); };
  assert.deepEqual(bridgeResponse(() => 1, '{}', log), { ok: true, value: 1 });
  assert.deepEqual(bridgeResponse(() => 1, '', log), { ok: false, error: INVALID_BRIDGE_REQUEST });
});

test('corta una conexión que no envía la petición a tiempo', async t => {
  assert.equal(BRIDGE_IDLE_TIMEOUT_MS, 5000);
  const { socketPath } = await setup(t, undefined, { idleTimeoutMs: 30 });
  assert.equal(await exchange(socketPath, '{"op":'), '');
});

test('limita las conexiones simultáneas', async t => {
  assert.equal(BRIDGE_MAX_CONNECTIONS, 4);
  const { socketPath } = await setup(t, undefined, { maxConnections: 1 });
  const open = net.connect(socketPath);
  t.after(() => open.destroy());
  await new Promise(resolve => open.once('connect', resolve));
  await new Promise(resolve => setTimeout(resolve, 20));
  assert.equal(await exchange(socketPath, '{}\n').catch(() => ''), '');
});

test('reemplaza un socket abandonado por un cierre inesperado, o un archivo con su nombre', async t => {
  const regular = path.join(tempDir(t), 'ritmo.sock');
  fs.writeFileSync(regular, '');
  for (const socketPath of [await staleSocket(t), regular]) {
    const server = new SocketBridgeServer({ log: () => {} });
    t.after(() => server.close());
    await server.listen(socketPath, () => 'ok');
    assert.deepEqual(JSON.parse(await exchange(socketPath, '{}\n')), { ok: true, value: 'ok' });
  }
});

test('no quita el socket de otra app abierta', async t => {
  const { socketPath } = await setup(t, () => 'primera');
  const second = new SocketBridgeServer({ log: () => {} });
  await assert.rejects(second.listen(socketPath, () => 'segunda'), { code: 'EADDRINUSE' });
  await second.close();
  assert.deepEqual(JSON.parse(await exchange(socketPath, '{}\n')), { ok: true, value: 'primera' });
});

test('falla si ya escucha y propaga otros errores al abrir', async t => {
  const { server, socketPath, directory } = await setup(t);
  await assert.rejects(server.listen(socketPath, () => null), /ya está escuchando/);
  const other = new SocketBridgeServer();
  await assert.rejects(other.listen(path.join(directory, 'x'.repeat(120), 'ritmo.sock'), () => null));
});

test('close corta las conexiones abiertas, borra el socket y es idempotente', async t => {
  const { server, socketPath } = await setup(t);
  const open = net.connect(socketPath);
  await new Promise(resolve => open.once('connect', resolve));
  const closed = new Promise(resolve => open.once('close', resolve));
  await server.close();
  await closed;
  assert.equal(fs.existsSync(socketPath), false);
  await server.close();
  await assert.rejects(exchange(socketPath, '{}\n'), { code: 'ENOENT' });
});

test('registra los errores del servidor sin tumbar la app', async t => {
  const { server, logged } = await setup(t);
  const failure = new Error('fallo del socket');
  (server as unknown as { server: net.Server }).server.emit('error', failure);
  assert.deepEqual(logged, [failure]);
});

test('usa console.error por defecto', async t => {
  const error = t.mock.method(console, 'error', () => {});
  const directory = tempDir(t);
  const server = new SocketBridgeServer();
  t.after(() => server.close());
  const socketPath = path.join(directory, 'ritmo.sock');
  await server.listen(socketPath, () => { throw new Error('inesperado'); });
  await exchange(socketPath, '{}\n');
  assert.equal(error.mock.callCount(), 1);
});
