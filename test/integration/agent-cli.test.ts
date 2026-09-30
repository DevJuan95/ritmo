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

test('escribe los archivos de la petición en el directorio temporal y lee el de la respuesta', async (t) => {
  const cli = fakeCli(t, `
fs.writeFileSync('respuesta.json', fs.readFileSync(process.argv[2], 'utf8').toUpperCase());
fs.writeFileSync(path.join(dir, 'mode'), String(fs.statSync(process.argv[2]).mode & 0o777));
`);
  const result = await runAgentCli(cli.command, ['esquema.json'], options({ files: { 'esquema.json': 'hola' }, outputFile: 'respuesta.json' }));
  assert.deepEqual(result, { stdout: '', exitCode: 0, output: 'HOLA' });
  assert.equal(fs.readFileSync(path.join(cli.dir, 'mode'), 'utf8'), String(0o600));
  assert.equal(fs.existsSync(cli.calls()[0].cwd), false);
});

test('sin el archivo de respuesta devuelve output indefinido, también si es un enlace o una carpeta', async (t) => {
  for (const body of ['', `fs.symlinkSync('/etc/hosts', 'respuesta.json');`, `fs.mkdirSync('respuesta.json');`]) {
    const cli = fakeCli(t, body);
    const result = await runAgentCli(cli.command, [], options({ outputFile: 'respuesta.json' }));
    assert.equal('output' in result, true);
    assert.equal(result.output, undefined);
  }
});

test('rechaza un archivo de respuesta mayor que el límite', async (t) => {
  const cli = fakeCli(t, `fs.writeFileSync('respuesta.json', 'x'.repeat(2000));`);
  await assert.rejects(runAgentCli(cli.command, [], options({ outputFile: 'respuesta.json', maxOutputBytes: 1000 })), (error: Error) =>
    error instanceof PublicError && error.message === 'Claude Code devolvió una respuesta demasiado larga.');
});

test('un archivo de respuesta que no se puede leer da un error público y se borra el directorio', async (t) => {
  const cli = fakeCli(t, `fs.writeFileSync('respuesta.json', '{}', { mode: 0 });`);
  await assert.rejects(runAgentCli(cli.command, [], options({ outputFile: 'respuesta.json' })), (error: Error) =>
    error instanceof PublicError && error.message === 'No se pudo leer la respuesta de Claude Code.');
  assert.equal(fs.existsSync(cli.calls()[0].cwd), false);
});

test('no admite nombres de archivo con carpetas', async (t) => {
  const cli = fakeCli(t, '');
  await assert.rejects(runAgentCli(cli.command, [], options({ files: { '../fuera.json': '{}' } })), (error: Error) =>
    error instanceof PublicError && error.message === 'No se pudo iniciar Claude Code.');
  assert.deepEqual(cli.calls(), []);
  for (const outputFile of ['../fuera.json', '.', '']) {
    await assert.rejects(runAgentCli(cli.command, [], options({ outputFile })), (error: Error) =>
      error instanceof PublicError && error.message === 'No se pudo leer la respuesta de Claude Code.');
  }
});

test('lanza el CLI sin claves de API en el entorno y con el resto de variables', async (t) => {
  const saved = Object.fromEntries(['ANTHROPIC_API_KEY', 'OPENAI_API_KEY', 'RITMO_PRUEBA'].map((name) => [name, process.env[name]]));
  process.env.ANTHROPIC_API_KEY = 'sk-ant-prueba';
  process.env.OPENAI_API_KEY = 'sk-prueba';
  process.env.RITMO_PRUEBA = 'sigue';
  t.after(() => {
    for (const [name, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  });
  const cli = fakeCli(t, `process.stdout.write(JSON.stringify([process.env.ANTHROPIC_API_KEY ?? null, process.env.OPENAI_API_KEY ?? null, process.env.RITMO_PRUEBA]));`);
  const { stdout } = await runAgentCli(cli.command, [], options());
  assert.deepEqual(JSON.parse(stdout), [null, null, 'sigue']);
});

test('con mergeStderr devuelve también la salida de error; sin él, la ignora', async (t) => {
  const cli = fakeCli(t, `process.stderr.write('Not logged in'); process.exit(1);`);
  assert.deepEqual(await runAgentCli(cli.command, [], options({ mergeStderr: true })), { stdout: 'Not logged in', exitCode: 1 });
  assert.deepEqual(await runAgentCli(cli.command, [], options()), { stdout: '', exitCode: 1 });
});

test('con mergeStderr la salida de error también cuenta para el límite', async (t) => {
  const cli = fakeCli(t, `process.on('SIGTERM', () => {}); setInterval(() => process.stderr.write('x'.repeat(600)), 5);`);
  await assert.rejects(runAgentCli(cli.command, [], options({ mergeStderr: true, maxOutputBytes: 1000, killGraceMs: 100 })), (error: Error) =>
    error instanceof PublicError && error.message === 'Claude Code devolvió una respuesta demasiado larga.');
});
