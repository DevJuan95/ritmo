import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { AGENT_CANCELLED, runAgentCli, type AgentCliOptions } from '../../src/main/study/agent-cli';
import { PublicError } from '../../src/shared/ipc';
import { fakeCli, isAlive, waitUntil } from '../helpers/fake-cli';

const options = (patch: Partial<AgentCliOptions> = {}): AgentCliOptions => ({ name: 'Claude Code', timeoutMs: 5000, ...patch });

/** Script que lanza un hijo de larga duración, deja su pid en `child.pid` y no termina. */
const HANG_WITH_CHILD = `
const child = childProcess.spawn('/bin/sleep', ['30'], { stdio: 'ignore' });
fs.writeFileSync(path.join(dir, 'child.pid'), String(child.pid));
setInterval(() => {}, 1000);
`;

function childPid(dir: string): number {
  return Number(fs.readFileSync(path.join(dir, 'child.pid'), 'utf8'));
}

test('devuelve la salida y el código del CLI, ejecutado en un directorio temporal que después se borra', async (t) => {
  const cli = fakeCli(t, `process.stdout.write('hola ' + process.argv[2]); process.exitCode = 0;`);
  const result = await runAgentCli(cli.command, ['mundo', ''], options());
  assert.deepEqual(result, { stdout: 'hola mundo', exitCode: 0 });
  const [call] = cli.calls();
  assert.deepEqual(call.args, ['mundo', '']);
  assert.ok(call.cwd.startsWith(fs.realpathSync(os.tmpdir())));
  assert.match(path.basename(call.cwd), /^ritmo-agent-/);
  assert.equal(fs.existsSync(call.cwd), false);
});

test('resuelve también cuando el CLI sale con error, con su código', async (t) => {
  const cli = fakeCli(t, `process.stdout.write('{}'); process.exit(3);`);
  assert.deepEqual(await runAgentCli(cli.command, [], options()), { stdout: '{}', exitCode: 3 });
});

test('un CLI terminado por una señal externa sale con código -1', async (t) => {
  const cli = fakeCli(t, `process.kill(process.pid, 'SIGKILL');`);
  assert.deepEqual(await runAgentCli(cli.command, [], options()), { stdout: '', exitCode: -1 });
});

test('un CLI que no existe da un error público que dice qué falta', async () => {
  const missing = path.join(os.tmpdir(), 'ritmo-no-existe', 'claude');
  await assert.rejects(runAgentCli(missing, [], options()), (error: Error) =>
    error instanceof PublicError && error.message === 'No se encontró Claude Code. Instálalo o revisa su ruta.');
});

test('un CLI que no se puede ejecutar da un error público', async (t) => {
  const cli = fakeCli(t, '');
  fs.chmodSync(cli.command, 0o644);
  await assert.rejects(runAgentCli(cli.command, [], options()), (error: Error) =>
    error instanceof PublicError && error.message === 'No se pudo iniciar Claude Code.');
});

test('un argumento que spawn rechaza da un error público y no deja el directorio temporal', async (t) => {
  const cli = fakeCli(t, '');
  const before = new Set(fs.readdirSync(os.tmpdir()).filter((name) => name.startsWith('ritmo-agent-')));
  await assert.rejects(runAgentCli(cli.command, ['a\u0000b'], options()), (error: Error) =>
    error instanceof PublicError && error.message === 'No se pudo iniciar Claude Code.');
  const after = fs.readdirSync(os.tmpdir()).filter((name) => name.startsWith('ritmo-agent-') && !before.has(name));
  assert.deepEqual(after, []);
  assert.deepEqual(cli.calls(), []);
});

test('con la señal ya cancelada no lanza el CLI', async (t) => {
  const cli = fakeCli(t, '');
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(runAgentCli(cli.command, [], options({ signal: controller.signal })), { message: AGENT_CANCELLED });
  assert.deepEqual(cli.calls(), []);
});

test('al cancelar termina el CLI y sus hijos y rechaza', async (t) => {
  const cli = fakeCli(t, HANG_WITH_CHILD);
  const controller = new AbortController();
  const running = runAgentCli(cli.command, [], options({ signal: controller.signal }));
  await waitUntil(() => fs.existsSync(path.join(cli.dir, 'child.pid')));
  controller.abort();
  await assert.rejects(running, (error: Error) => error instanceof PublicError && error.message === AGENT_CANCELLED);
  await waitUntil(() => !isAlive(childPid(cli.dir)));
  assert.equal(fs.existsSync(cli.calls()[0].cwd), false);
});

test('al agotar el tiempo termina el CLI y sus hijos y lo dice', async (t) => {
  const cli = fakeCli(t, HANG_WITH_CHILD);
  await assert.rejects(runAgentCli(cli.command, [], options({ timeoutMs: 300 })), (error: Error) =>
    error instanceof PublicError && error.message === 'Claude Code tardó demasiado en responder. Inténtalo de nuevo.');
  await waitUntil(() => !isAlive(childPid(cli.dir)));
});

test('si el CLI ignora SIGTERM, lo termina con SIGKILL tras la espera', async (t) => {
  const cli = fakeCli(t, `process.on('SIGTERM', () => {}); fs.writeFileSync(path.join(dir, 'ready'), ''); setInterval(() => {}, 1000);`);
  const controller = new AbortController();
  const running = runAgentCli(cli.command, [], options({ signal: controller.signal, killGraceMs: 100 }));
  await waitUntil(() => fs.existsSync(path.join(cli.dir, 'ready')));
  const started = Date.now();
  controller.abort();
  await assert.rejects(running, { message: AGENT_CANCELLED });
  assert.ok(Date.now() - started >= 100);
});

test('rechaza una salida mayor que el límite y termina el CLI', async (t) => {
  // Ignora SIGTERM y sigue escribiendo tras pasar el límite: cada trozo extra no vuelve a terminarlo.
  const cli = fakeCli(t, `process.on('SIGTERM', () => {}); setInterval(() => process.stdout.write('x'.repeat(600)), 5);`);
  await assert.rejects(runAgentCli(cli.command, [], options({ maxOutputBytes: 1000, killGraceMs: 100 })), (error: Error) =>
    error instanceof PublicError && error.message === 'Claude Code devolvió una respuesta demasiado larga.');
});
