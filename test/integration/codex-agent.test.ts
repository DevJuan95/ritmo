import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { AGENT_CANCELLED } from '../../src/main/study/agent-cli';
import { buildAgentRequest } from '../../src/main/study/agent-prompt';
import { CODEX_FAILED, CodexAgent, codexArgs } from '../../src/main/study/codex-agent';
import type { StudyAgentContext } from '../../src/main/study/ports';
import { PublicError } from '../../src/shared/ipc';
import { INVALID_AGENT_RESPONSE, type StudyRoute } from '../../src/shared/study/contract';
import { fakeCli, isAlive, waitUntil } from '../helpers/fake-cli';

const route: StudyRoute = {
  id: 'r1',
  topic: 'Rust',
  goal: 'Escribir un servidor HTTP.',
  level: 'intermediate',
  dailyPomodoros: 4,
  stages: [
    { id: 'e1', title: 'Propiedad', topics: ['Préstamos'] },
    { id: 'e2', title: 'Concurrencia', topics: ['Hilos'] },
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
 * Ejecutable falso de `codex exec`: copia el esquema que recibe a `schema.json` de su carpeta,
 * escribe `message` (si hay) en el archivo de `-o`, imprime su progreso y sale con ese código.
 */
function fakeCodex(t: test.TestContext, message: string | undefined, exitCode = 0) {
  return fakeCli(t, `
const args = process.argv.slice(2);
fs.copyFileSync(args[args.indexOf('--output-schema') + 1], path.join(dir, 'schema.json'));
const message = ${JSON.stringify(message ?? null)};
if (message !== null) fs.writeFileSync(args[args.indexOf('-o') + 1], message);
process.stdout.write('progreso de codex');
process.exitCode = ${exitCode};
`);
}

const publicError = (message: string) => (error: Error) => error instanceof PublicError && error.message === message;

test('lanza codex exec con el prompt y le pasa el esquema en un archivo', async (t) => {
  const cli = fakeCodex(t, JSON.stringify({ proposals: [proposal] }));
  const proposals = await new CodexAgent({ command: cli.command }).propose(context);
  assert.deepEqual(proposals, [proposal]);
  const { prompt, schema } = buildAgentRequest(context);
  const [call] = cli.calls();
  assert.deepEqual(call.args, codexArgs(prompt));
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(cli.dir, 'schema.json'), 'utf8')), schema);
  assert.equal(fs.existsSync(call.cwd), false);
});

test('pasa el modelo elegido con -m', async (t) => {
  const cli = fakeCodex(t, JSON.stringify({ proposals: [proposal] }));
  await new CodexAgent({ command: cli.command, model: 'gpt-5.1-codex-mini' }).propose(context);
  assert.deepEqual(cli.calls()[0].args.slice(-4), ['-m', 'gpt-5.1-codex-mini', '--', buildAgentRequest(context).prompt]);
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

test('se puede cancelar mientras codex responde y no deja el proceso vivo', async (t) => {
  const cli = fakeCli(t, `fs.writeFileSync(path.join(dir, 'ready'), String(process.pid)); setInterval(() => {}, 1000);`);
  const ready = path.join(cli.dir, 'ready');
  const controller = new AbortController();
  const running = new CodexAgent({ command: cli.command, killGraceMs: 100 }).propose(context, { signal: controller.signal });
  await waitUntil(() => fs.existsSync(ready));
  controller.abort();
  await assert.rejects(running, publicError(AGENT_CANCELLED));
  assert.equal(isAlive(Number(fs.readFileSync(ready, 'utf8'))), false);
});

test('respeta el tiempo máximo configurado', async (t) => {
  const cli = fakeCli(t, `setInterval(() => {}, 1000);`);
  await assert.rejects(new CodexAgent({ command: cli.command, timeoutMs: 200 }).propose(context),
    publicError('Codex tardó demasiado en responder. Inténtalo de nuevo.'));
});

test('por defecto lanza el ejecutable codex del PATH', async (t) => {
  const cli = fakeCodex(t, JSON.stringify({ proposals: [proposal] }));
  fs.symlinkSync(cli.command, path.join(cli.dir, 'codex'));
  const previous = process.env.PATH;
  process.env.PATH = `${cli.dir}${path.delimiter}${previous}`;
  t.after(() => { process.env.PATH = previous; });
  assert.deepEqual(await new CodexAgent().propose(context), [proposal]);
  assert.equal(cli.calls().length, 1);
});
