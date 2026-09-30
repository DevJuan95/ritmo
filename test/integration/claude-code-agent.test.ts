import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { AGENT_CANCELLED } from '../../src/main/study/agent-cli';
import { buildAgentRequest, buildRoadmapRequest } from '../../src/main/study/agent-prompt';
import { CLAUDE_CODE_API_KEY, CLAUDE_CODE_FAILED, CLAUDE_CODE_LOGIN, CLAUDE_CODE_STATUS_ARGS, ClaudeCodeAgent } from '../../src/main/study/claude-code-agent';
import type { StudyAgentContext } from '../../src/main/study/ports';
import { PublicError } from '../../src/shared/ipc';
import { INVALID_AGENT_RESPONSE, type StudyRoute } from '../../src/shared/study/contract';
import { fakeCli, isAlive, waitUntil } from '../helpers/fake-cli';
import { emptyRouteRoadmap, sampleRoadmap, stage } from '../helpers/study';

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

const LOGGED_IN = { loggedIn: true, authMethod: 'claude.ai', subscriptionType: 'max' };

/**
 * Código del ejecutable falso que responde a `claude auth status` con ese estado, y ese código de
 * salida, y termina; el resto del script solo atiende a la petición.
 */
function authStatus(status: unknown = LOGGED_IN, exitCode = 0): string {
  const stdout = typeof status === 'string' ? status : JSON.stringify(status);
  return `if (process.argv[2] === 'auth') { process.stdout.write(${JSON.stringify(stdout)}); process.exit(${exitCode}); }`;
}

/**
 * Ejecutable falso de `claude` que, con sesión, imprime ese JSON final y sale con ese código. Deja
 * en `env.json` de su carpeta las claves de API que ve en su entorno.
 */
function fakeClaude(t: test.TestContext, envelope: unknown, exitCode = 0, status = authStatus()) {
  const stdout = typeof envelope === 'string' ? envelope : JSON.stringify(envelope);
  return fakeCli(t, `${status}
const keys = Object.keys(process.env).filter((name) => /API_KEY|AUTH_TOKEN/.test(name));
fs.writeFileSync(path.join(dir, 'env.json'), JSON.stringify(keys));
process.stdout.write(${JSON.stringify(stdout)}); process.exitCode = ${exitCode};`);
}

const success = (fields: Record<string, unknown>) => ({ type: 'result', subtype: 'success', is_error: false, ...fields });

const publicError = (message: string) => (error: Error) => error instanceof PublicError && error.message === message;

test('comprueba la sesión y lanza claude -p con el prompt, salida JSON, el esquema y sin herramientas', async (t) => {
  const cli = fakeClaude(t, success({ structured_output: { proposals: [proposal] } }));
  const proposals = await new ClaudeCodeAgent({ command: cli.command }).propose(context);
  assert.deepEqual(proposals, [proposal]);
  const { prompt, schema } = buildAgentRequest(context);
  assert.equal(cli.calls().length, 2);
  assert.deepEqual(cli.calls()[0].args, CLAUDE_CODE_STATUS_ARGS);
  assert.deepEqual(cli.calls()[1].args, ['-p', prompt, '--output-format', 'json', '--json-schema', JSON.stringify(schema), '--tools', '', '--strict-mcp-config', '--safe-mode', '--no-session-persistence']);
});

test('pasa el modelo elegido con --model', async (t) => {
  const cli = fakeClaude(t, success({ structured_output: { proposals: [proposal] } }));
  await new ClaudeCodeAgent({ command: cli.command, model: 'claude-haiku-4-5' }).propose(context);
  assert.deepEqual(cli.calls()[1].args.slice(-2), ['--model', 'claude-haiku-4-5']);
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

test('lanza claude sin las claves de API del entorno, para usar la suscripción', async (t) => {
  const cli = fakeClaude(t, success({ structured_output: { proposals: [proposal] } }));
  const saved = { ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY, ANTHROPIC_AUTH_TOKEN: process.env.ANTHROPIC_AUTH_TOKEN };
  process.env.ANTHROPIC_API_KEY = 'sk-ant-prueba';
  process.env.ANTHROPIC_AUTH_TOKEN = 'token-prueba';
  t.after(() => {
    for (const [name, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  });
  assert.deepEqual(await new ClaudeCodeAgent({ command: cli.command }).propose(context), [proposal]);
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(cli.dir, 'env.json'), 'utf8')), []);
  assert.equal(process.env.ANTHROPIC_API_KEY, 'sk-ant-prueba');
});

test('sin sesión pide iniciarla y no envía la petición', async (t) => {
  const statuses = [
    authStatus({ loggedIn: false, authMethod: 'none' }, 1),
    authStatus({ loggedIn: false, authMethod: 'none' }, 0),
  ];
  for (const status of statuses) {
    const cli = fakeClaude(t, success({ structured_output: { proposals: [proposal] } }), 0, status);
    await assert.rejects(new ClaudeCodeAgent({ command: cli.command }).propose(context), publicError(CLAUDE_CODE_LOGIN));
    assert.deepEqual(cli.calls().map((call) => call.args), [CLAUDE_CODE_STATUS_ARGS]);
  }
});

test('con una clave de API en la configuración pide usar la suscripción y no envía la petición', async (t) => {
  const status = authStatus({ loggedIn: true, authMethod: 'api_key', apiKeySource: 'apiKeyHelper' });
  const cli = fakeClaude(t, success({ structured_output: { proposals: [proposal] } }), 0, status);
  await assert.rejects(new ClaudeCodeAgent({ command: cli.command }).propose(context), publicError(CLAUDE_CODE_API_KEY));
  assert.equal(cli.calls().length, 1);
});

test('un estado de sesión que no reconoce no bloquea la petición, sea cual sea el código', async (t) => {
  for (const status of [authStatus('Logged in', 0), authStatus('Error: algo interno', 1)]) {
    const cli = fakeClaude(t, success({ structured_output: { proposals: [proposal] } }), 0, status);
    assert.deepEqual(await new ClaudeCodeAgent({ command: cli.command }).propose(context), [proposal]);
  }
});

test('se puede cancelar mientras comprueba la sesión y no lanza la petición', async (t) => {
  const cli = fakeCli(t, `fs.writeFileSync(path.join(dir, 'ready'), String(process.pid)); setInterval(() => {}, 1000);`);
  const ready = path.join(cli.dir, 'ready');
  const controller = new AbortController();
  const running = new ClaudeCodeAgent({ command: cli.command, killGraceMs: 100 }).propose(context, { signal: controller.signal });
  await waitUntil(() => fs.existsSync(ready));
  controller.abort();
  await assert.rejects(running, publicError(AGENT_CANCELLED));
  assert.deepEqual(cli.calls().map((call) => call.args), [CLAUDE_CODE_STATUS_ARGS]);
});

test('se puede cancelar mientras claude responde y no deja el proceso vivo', async (t) => {
  const cli = fakeCli(t, `${authStatus()} fs.writeFileSync(path.join(dir, 'ready'), String(process.pid)); setInterval(() => {}, 1000);`);
  const ready = path.join(cli.dir, 'ready');
  const controller = new AbortController();
  const running = new ClaudeCodeAgent({ command: cli.command, killGraceMs: 100 }).propose(context, { signal: controller.signal });
  await waitUntil(() => fs.existsSync(ready));
  controller.abort();
  await assert.rejects(running, publicError(AGENT_CANCELLED));
  assert.equal(cli.calls().length, 2);
  assert.equal(isAlive(Number(fs.readFileSync(ready, 'utf8'))), false);
});

test('respeta el tiempo máximo configurado, al comprobar la sesión y al responder', async (t) => {
  for (const body of ['setInterval(() => {}, 1000);', `${authStatus()} setInterval(() => {}, 1000);`]) {
    const cli = fakeCli(t, body);
    await assert.rejects(new ClaudeCodeAgent({ command: cli.command, timeoutMs: 200 }).propose(context),
      publicError('Claude Code tardó demasiado en responder. Inténtalo de nuevo.'));
  }
});

test('por defecto lanza el ejecutable claude del PATH', async (t) => {
  const cli = fakeClaude(t, success({ structured_output: { proposals: [proposal] } }));
  fs.symlinkSync(cli.command, path.join(cli.dir, 'claude'));
  const previous = process.env.PATH;
  process.env.PATH = `${cli.dir}${path.delimiter}${previous}`;
  t.after(() => { process.env.PATH = previous; });
  assert.deepEqual(await new ClaudeCodeAgent().propose(context), [proposal]);
  assert.equal(cli.calls().length, 2);
});

const brief = 'Senior Backend → Tech Lead, con Java como vehículo, 2 h al día.';

test('pide el roadmap con claude -p, su prompt y su esquema, tras comprobar la sesión', async (t) => {
  const cli = fakeClaude(t, success({ structured_output: sampleRoadmap() }));
  const roadmap = await new ClaudeCodeAgent({ command: cli.command, model: 'sonnet' }).draftRoadmap(brief);
  assert.deepEqual(roadmap, sampleRoadmap());
  const { prompt, schema } = buildRoadmapRequest(brief);
  assert.deepEqual(cli.calls().map((call) => call.args), [
    CLAUDE_CODE_STATUS_ARGS,
    ['-p', prompt, '--output-format', 'json', '--json-schema', JSON.stringify(schema), '--tools', '', '--strict-mcp-config', '--safe-mode', '--no-session-persistence', '--model', 'sonnet'],
  ]);
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(cli.dir, 'env.json'), 'utf8')), []);
});

test('el roadmap se lee también del texto de result y se valida', async (t) => {
  const cli = fakeClaude(t, success({ result: '```json\n' + JSON.stringify(sampleRoadmap()) + '\n```' }));
  assert.deepEqual(await new ClaudeCodeAgent({ command: cli.command }).draftRoadmap(brief), sampleRoadmap());
  const invalid = { ...sampleRoadmap(), stages: [] };
  for (const envelope of [success({ structured_output: invalid }), success({ structured_output: { proposals: [proposal] } }), success({ result: 'No puedo.' })]) {
    const bad = fakeClaude(t, envelope);
    await assert.rejects(new ClaudeCodeAgent({ command: bad.command }).draftRoadmap(brief), publicError(INVALID_AGENT_RESPONSE));
  }
  const failed = fakeClaude(t, success({ structured_output: sampleRoadmap() }), 1);
  await assert.rejects(new ClaudeCodeAgent({ command: failed.command }).draftRoadmap(brief), publicError(CLAUDE_CODE_FAILED));
});

test('sin sesión no envía el brief', async (t) => {
  const cli = fakeClaude(t, success({ structured_output: sampleRoadmap() }), 0, authStatus({ loggedIn: false }, 1));
  await assert.rejects(new ClaudeCodeAgent({ command: cli.command }).draftRoadmap(brief), publicError(CLAUDE_CODE_LOGIN));
  assert.deepEqual(cli.calls().map((call) => call.args), [CLAUDE_CODE_STATUS_ARGS]);
});

test('el roadmap tiene su propio tiempo máximo y se puede cancelar sin dejar el proceso vivo', async (t) => {
  const slow = fakeCli(t, `${authStatus()} setTimeout(() => { process.stdout.write(${JSON.stringify(JSON.stringify(success({ structured_output: sampleRoadmap() })))}); }, 400);`);
  const agent = new ClaudeCodeAgent({ command: slow.command, timeoutMs: 100, roadmapTimeoutMs: 5_000 });
  assert.deepEqual(await agent.draftRoadmap(brief), sampleRoadmap(), 'no usa el tiempo de las propuestas');
  await assert.rejects(new ClaudeCodeAgent({ command: slow.command, timeoutMs: 5_000, roadmapTimeoutMs: 100 }).draftRoadmap(brief),
    publicError('Claude Code tardó demasiado en responder. Inténtalo de nuevo.'));

  const cli = fakeCli(t, `${authStatus()} fs.writeFileSync(path.join(dir, 'ready'), String(process.pid)); setInterval(() => {}, 1000);`);
  const ready = path.join(cli.dir, 'ready');
  const controller = new AbortController();
  const running = new ClaudeCodeAgent({ command: cli.command, killGraceMs: 100 }).draftRoadmap(brief, { signal: controller.signal });
  await waitUntil(() => fs.existsSync(ready));
  controller.abort();
  await assert.rejects(running, publicError(AGENT_CANCELLED));
  assert.equal(isAlive(Number(fs.readFileSync(ready, 'utf8'))), false);
});
