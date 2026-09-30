import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { AGENT_CANCELLED } from '../../src/main/study/agent-cli';
import { buildAgentRequest } from '../../src/main/study/agent-prompt';
import { CLAUDE_CODE_FAILED, ClaudeCodeAgent } from '../../src/main/study/claude-code-agent';
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

/** Ejecutable falso de `claude` que imprime ese JSON final y sale con ese código. */
function fakeClaude(t: test.TestContext, envelope: unknown, exitCode = 0) {
  const stdout = typeof envelope === 'string' ? envelope : JSON.stringify(envelope);
  return fakeCli(t, `process.stdout.write(${JSON.stringify(stdout)}); process.exitCode = ${exitCode};`);
}

const success = (fields: Record<string, unknown>) => ({ type: 'result', subtype: 'success', is_error: false, ...fields });

const publicError = (message: string) => (error: Error) => error instanceof PublicError && error.message === message;

test('lanza claude -p con el prompt, salida JSON, el esquema y sin herramientas', async (t) => {
  const cli = fakeClaude(t, success({ structured_output: { proposals: [proposal] } }));
  const proposals = await new ClaudeCodeAgent({ command: cli.command }).propose(context);
  assert.deepEqual(proposals, [proposal]);
  const { prompt, schema } = buildAgentRequest(context);
  assert.deepEqual(cli.calls()[0].args, ['-p', prompt, '--output-format', 'json', '--json-schema', JSON.stringify(schema), '--tools', '', '--strict-mcp-config', '--safe-mode', '--no-session-persistence']);
});

test('pasa el modelo elegido con --model', async (t) => {
  const cli = fakeClaude(t, success({ structured_output: { proposals: [proposal] } }));
  await new ClaudeCodeAgent({ command: cli.command, model: 'claude-haiku-4-5' }).propose(context);
  assert.deepEqual(cli.calls()[0].args.slice(-2), ['--model', 'claude-haiku-4-5']);
});

test('sin salida estructurada lee el texto de result, también dentro de un bloque de código', async (t) => {
  const text = '```json\n' + JSON.stringify({ proposals: [proposal] }) + '\n```';
  const cli = fakeClaude(t, success({ result: text }));
  assert.deepEqual(await new ClaudeCodeAgent({ command: cli.command }).propose(context), [proposal]);
});

test('una respuesta que no cumple el esquema da el error público de respuesta inválida', async (t) => {
  const outside = { ...proposal, stageId: 'otra' };
  for (const envelope of [success({ structured_output: { proposals: [outside] } }), success({ result: 'No puedo.' }), success({}), 'no es JSON', '[]']) {
    const cli = fakeClaude(t, envelope);
    await assert.rejects(new ClaudeCodeAgent({ command: cli.command }).propose(context), publicError(INVALID_AGENT_RESPONSE));
  }
});

test('is_error o un código de salida distinto de 0 dan un error público sin detalles', async (t) => {
  const cases: Array<[unknown, number]> = [
    [{ type: 'result', subtype: 'success', is_error: true, result: 'Invalid API key · detalles internos' }, 0],
    [success({ structured_output: { proposals: [proposal] } }), 1],
    ['Error: algo interno', 1],
    ['null', 2],
  ];
  for (const [envelope, exitCode] of cases) {
    const cli = fakeClaude(t, envelope, exitCode);
    await assert.rejects(new ClaudeCodeAgent({ command: cli.command }).propose(context), publicError(CLAUDE_CODE_FAILED));
  }
});

test('se puede cancelar mientras claude responde y no deja el proceso vivo', async (t) => {
  const cli = fakeCli(t, `fs.writeFileSync(path.join(dir, 'ready'), String(process.pid)); setInterval(() => {}, 1000);`);
  const ready = path.join(cli.dir, 'ready');
  const controller = new AbortController();
  const running = new ClaudeCodeAgent({ command: cli.command, killGraceMs: 100 }).propose(context, { signal: controller.signal });
  await waitUntil(() => fs.existsSync(ready));
  controller.abort();
  await assert.rejects(running, publicError(AGENT_CANCELLED));
  assert.equal(isAlive(Number(fs.readFileSync(ready, 'utf8'))), false);
});

test('respeta el tiempo máximo configurado', async (t) => {
  const cli = fakeCli(t, `setInterval(() => {}, 1000);`);
  await assert.rejects(new ClaudeCodeAgent({ command: cli.command, timeoutMs: 200 }).propose(context),
    publicError('Claude Code tardó demasiado en responder. Inténtalo de nuevo.'));
});

test('por defecto lanza el ejecutable claude del PATH', async (t) => {
  const cli = fakeClaude(t, success({ structured_output: { proposals: [proposal] } }));
  fs.symlinkSync(cli.command, path.join(cli.dir, 'claude'));
  const previous = process.env.PATH;
  process.env.PATH = `${cli.dir}${path.delimiter}${previous}`;
  t.after(() => { process.env.PATH = previous; });
  assert.deepEqual(await new ClaudeCodeAgent().propose(context), [proposal]);
  assert.equal(cli.calls().length, 1);
});
