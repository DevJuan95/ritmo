import test, { type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import path from 'node:path';
import readline from 'node:readline';
import { BridgeService } from '../../src/main/bridge/bridge-service';
import { SocketBridgeServer } from '../../src/main/bridge/socket-server';
import { APP_CLOSED } from '../../src/mcp/bridge-client';
import { createHarness } from '../helpers/harness';

/** El servidor MCP compilado por `tsc`, que se ejecuta con `node` como lo harían Claude Code o Codex. */
const MCP_ENTRY = path.join(__dirname, '..', '..', 'src', 'mcp', 'index.js');

/** Lanza el servidor MCP apuntando a `socketPath` y devuelve una función que envía un mensaje y espera su respuesta. */
function startMcp(t: TestContext, socketPath: string) {
  const child = spawn(process.execPath, [MCP_ENTRY], { env: { ...process.env, RITMO_SOCKET: socketPath }, stdio: ['pipe', 'pipe', 'inherit'] });
  t.after(() => { child.kill(); });
  const answers = new Map<number, (answer: any) => void>();
  readline.createInterface({ input: child.stdout }).on('line', line => {
    const answer = JSON.parse(line);
    answers.get(answer.id)?.(answer);
  });
  let next = 0;
  const send = (method: string, params: unknown = {}): Promise<any> => {
    const id = ++next;
    const answered = new Promise(resolve => answers.set(id, resolve));
    child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id, method, params })}\n`);
    return answered;
  };
  const exited = new Promise<number | null>(resolve => child.once('exit', resolve));
  return { send, child, exited };
}

test('Claude Code o Codex leen una ruta y crean una tarea en la app abierta por MCP', async t => {
  const harness = createHarness(t);
  const route = harness.study.create({
    topic: 'Rust', goal: 'Escribir una CLI.', level: 'beginner', dailyPomodoros: 2,
    stages: [{ title: 'Ownership', topics: ['Borrowing'] }], instructions: 'En español.'
  });
  const socketPath = path.join(harness.directory, 'ritmo.sock');
  const bridge = new BridgeService({
    server: new SocketBridgeServer(), socketPath, routes: harness.studyRepository, tasks: harness.tasks, day: harness.store
  });
  await bridge.start();
  t.after(() => bridge.stop());

  const { send, child, exited } = startMcp(t, socketPath);
  const init = await send('initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'prueba', version: '1' } });
  assert.equal(init.result.serverInfo.name, 'ritmo');
  const tools = await send('tools/list');
  assert.deepEqual(tools.result.tools.map((tool: { name: string }) => tool.name), ['list_study_routes', 'get_study_route', 'add_study_task']);

  const listed = await send('tools/call', { name: 'list_study_routes', arguments: {} });
  assert.equal(JSON.parse(listed.result.content[0].text)[0].id, route.id);
  const read = await send('tools/call', { name: 'get_study_route', arguments: { routeId: route.id } });
  const detail = JSON.parse(read.result.content[0].text);
  assert.equal(detail.stages[0].title, 'Ownership');

  const added = await send('tools/call', { name: 'add_study_task', arguments: { routeId: route.id, stageId: detail.stages[0].id, title: 'Leer el capítulo 4' } });
  assert.equal(added.result.isError, undefined);
  assert.deepEqual(harness.store.state.tasks.map(task => [task.title, task.stageId]), [['Leer el capítulo 4', route.stages[0].id]]);

  const rejected = await send('tools/call', { name: 'add_study_task', arguments: { routeId: route.id, stageId: 'otra', title: 'Leer' } });
  assert.deepEqual(rejected.result, { content: [{ type: 'text', text: 'La etapa ya no existe. Elige otra.' }], isError: true });
  assert.equal(harness.store.state.tasks.length, 1);

  await bridge.stop();
  const closed = await send('tools/call', { name: 'list_study_routes' });
  assert.deepEqual(closed.result, { content: [{ type: 'text', text: APP_CLOSED }], isError: true });

  child.stdin.end();
  assert.equal(await exited, 0);
});
