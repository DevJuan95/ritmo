import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { AGENT_CANCELLED } from '../../src/main/study/agent-cli';
import { buildAgentRequest } from '../../src/main/study/agent-prompt';
import { CODEX_API_KEY, CODEX_FAILED, CODEX_LOGIN, CODEX_STATUS_ARGS, CodexAgent, codexArgs } from '../../src/main/study/codex-agent';
import type { StudyAgentContext } from '../../src/main/study/ports';
import { PublicError } from '../../src/shared/ipc';
import { INVALID_AGENT_RESPONSE, type StudyRoute } from '../../src/shared/study/contract';
import { fakeCli, isAlive, waitUntil } from '../helpers/fake-cli';
import { emptyRouteRoadmap, stage } from '../helpers/study';

const route: StudyRoute = {
  id: 'r1',
  topic: 'Rust',
  goal: 'Escribir un servidor HTTP.',
  level: 'intermediate',
  dailyPomodoros: 4, ...emptyRouteRoadmap(),
  stages: [
    stage({ id: 'e1', title: 'Propiedad', topics: ['Préstamos'] }),
    stage({ id: 'e2', title: 'Concurrencia', topics: ['Hilos'] }),
  ],
  instructions: '',
  createdAt: '2026-09-01T09:00:00.000Z',
  updatedAt: '2026-09-01T09:00:00.000Z',
};

const context: StudyAgentContext = {
  route,
  tasks: [{ title: 'Leer el capítulo 4', stageId: 'e1', done: true, plannedDate: '2026-09-28' }],
  today: '2026-09-29',
};

const proposal = { title: 'Implementar un pool de hilos', stageId: 'e2', pomodoros: 3, doneWhen: 'Pasa las pruebas.', reason: 'Sigue a los hilos.' };

/**
 * Código del ejecutable falso que responde a `codex login status` con ese texto, en la salida de
 * error como hace Codex, y ese código de salida, y termina; el resto del script atiende a la petición.
 */
function loginStatus(text = 'Logged in using ChatGPT', exitCode = 0): string {
  return `if (process.argv[2] === 'login') { process.stderr.write(${JSON.stringify(text + '\n')}); process.exit(${exitCode}); }`;
}

/**
 * Ejecutable falso de `codex`: con sesión, en `exec` copia el esquema que recibe a `schema.json` de
 * su carpeta, deja en `env.json` las claves de API que ve en su entorno, escribe `message` (si hay)
 * en el archivo de `-o`, imprime su progreso y sale con ese código.
 */
function fakeCodex(t: test.TestContext, message: string | undefined, exitCode = 0, status = loginStatus()) {
  return fakeCli(t, `${status}
const args = process.argv.slice(2);
fs.copyFileSync(args[args.indexOf('--output-schema') + 1], path.join(dir, 'schema.json'));
const keys = Object.keys(process.env).filter((name) => /API_KEY|AUTH_TOKEN/.test(name));
fs.writeFileSync(path.join(dir, 'env.json'), JSON.stringify(keys));
const message = ${JSON.stringify(message ?? null)};
if (message !== null) fs.writeFileSync(args[args.indexOf('-o') + 1], message);
process.stdout.write('progreso de codex');
process.exitCode = ${exitCode};
`);
}

const publicError = (message: string) => (error: Error) => error instanceof PublicError && error.message === message;

test('comprueba la sesión y lanza codex exec con el prompt y le pasa el esquema en un archivo', async (t) => {
  const cli = fakeCodex(t, JSON.stringify({ proposals: [proposal] }));
  const proposals = await new CodexAgent({ command: cli.command }).propose(context);
  assert.deepEqual(proposals, [proposal]);
  const { prompt, schema } = buildAgentRequest(context);
  const [status, call] = cli.calls();
  assert.equal(cli.calls().length, 2);
  assert.deepEqual(status.args, CODEX_STATUS_ARGS);
  assert.deepEqual(call.args, codexArgs(prompt));
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(cli.dir, 'schema.json'), 'utf8')), schema);
  assert.equal(fs.existsSync(call.cwd), false);
});

test('pasa el modelo elegido con -m', async (t) => {
  const cli = fakeCodex(t, JSON.stringify({ proposals: [proposal] }));
  await new CodexAgent({ command: cli.command, model: 'gpt-5.1-codex-mini' }).propose(context);
  assert.deepEqual(cli.calls()[1].args.slice(-4), ['-m', 'gpt-5.1-codex-mini', '--', buildAgentRequest(context).prompt]);
});

test('lee la respuesta también dentro de un bloque de código', async (t) => {
  const cli = fakeCodex(t, '```json\n' + JSON.stringify({ proposals: [proposal] }) + '\n```');
  assert.deepEqual(await new CodexAgent({ command: cli.command }).propose(context), [proposal]);
});

test('una respuesta ausente o que no cumple el esquema da el error público de respuesta inválida', async (t) => {
  const outside = JSON.stringify({ proposals: [{ ...proposal, stageId: 'otra' }] });
  for (const message of [outside, 'No puedo.', '', undefined]) {
    const cli = fakeCodex(t, message);
    await assert.rejects(new CodexAgent({ command: cli.command }).propose(context), publicError(INVALID_AGENT_RESPONSE));
  }
});

test('un código de salida distinto de 0 da un error público sin detalles', async (t) => {
  for (const message of [JSON.stringify({ proposals: [proposal] }), undefined]) {
    const cli = fakeCodex(t, message, 1);
    await assert.rejects(new CodexAgent({ command: cli.command }).propose(context), publicError(CODEX_FAILED));
  }
});

test('lanza codex sin las claves de API del entorno, para usar la suscripción', async (t) => {
  const cli = fakeCodex(t, JSON.stringify({ proposals: [proposal] }));
  const saved = { OPENAI_API_KEY: process.env.OPENAI_API_KEY, CODEX_API_KEY: process.env.CODEX_API_KEY };
  process.env.OPENAI_API_KEY = 'sk-prueba';
  process.env.CODEX_API_KEY = 'sk-prueba';
  t.after(() => {
    for (const [name, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  });
  assert.deepEqual(await new CodexAgent({ command: cli.command }).propose(context), [proposal]);
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(cli.dir, 'env.json'), 'utf8')), []);
  assert.equal(process.env.OPENAI_API_KEY, 'sk-prueba');
});

test('sin sesión pide iniciarla y no envía la petición', async (t) => {
  for (const status of [loginStatus('Not logged in', 1), loginStatus('Not logged in', 0)]) {
    const cli = fakeCodex(t, JSON.stringify({ proposals: [proposal] }), 0, status);
    await assert.rejects(new CodexAgent({ command: cli.command }).propose(context), publicError(CODEX_LOGIN));
    assert.deepEqual(cli.calls().map((call) => call.args), [CODEX_STATUS_ARGS]);
  }
});

test('un error al comprobar la sesión que no dice que falte no bloquea la petición', async (t) => {
  const cli = fakeCodex(t, JSON.stringify({ proposals: [proposal] }), 0, loginStatus('Error: algo interno', 2));
  assert.deepEqual(await new CodexAgent({ command: cli.command }).propose(context), [proposal]);
});

test('con una clave de API guardada pide usar la suscripción y no envía la petición', async (t) => {
  const cli = fakeCodex(t, JSON.stringify({ proposals: [proposal] }), 0, loginStatus('Logged in using an API key - sk-proj-***ABCDE'));
  await assert.rejects(new CodexAgent({ command: cli.command }).propose(context), publicError(CODEX_API_KEY));
  assert.equal(cli.calls().length, 1);
});

test('se puede cancelar mientras codex responde y no deja el proceso vivo', async (t) => {
  const cli = fakeCli(t, `${loginStatus()} fs.writeFileSync(path.join(dir, 'ready'), String(process.pid)); setInterval(() => {}, 1000);`);
  const ready = path.join(cli.dir, 'ready');
  const controller = new AbortController();
  const running = new CodexAgent({ command: cli.command, killGraceMs: 100 }).propose(context, { signal: controller.signal });
  await waitUntil(() => fs.existsSync(ready));
  controller.abort();
  await assert.rejects(running, publicError(AGENT_CANCELLED));
  assert.equal(cli.calls().length, 2);
  assert.equal(isAlive(Number(fs.readFileSync(ready, 'utf8'))), false);
});

test('respeta el tiempo máximo configurado, al comprobar la sesión y al responder', async (t) => {
  for (const body of ['setInterval(() => {}, 1000);', `${loginStatus()} setInterval(() => {}, 1000);`]) {
    const cli = fakeCli(t, body);
    await assert.rejects(new CodexAgent({ command: cli.command, timeoutMs: 200 }).propose(context),
      publicError('Codex tardó demasiado en responder. Inténtalo de nuevo.'));
  }
});

test('por defecto lanza el ejecutable codex del PATH', async (t) => {
  const cli = fakeCodex(t, JSON.stringify({ proposals: [proposal] }));
  fs.symlinkSync(cli.command, path.join(cli.dir, 'codex'));
  const previous = process.env.PATH;
  process.env.PATH = `${cli.dir}${path.delimiter}${previous}`;
  t.after(() => { process.env.PATH = previous; });
  assert.deepEqual(await new CodexAgent().propose(context), [proposal]);
  assert.equal(cli.calls().length, 2);
});
