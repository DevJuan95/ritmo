import test, { type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { PublicError } from '../../../../src/shared/ipc';
import { AGENT_CANCELLED, DEFAULT_AGENT_SETTINGS, type TaskProposal } from '../../../../src/shared/study/contract';
import { AGENT_BUSY, agentMissing, agentNoticeRequired } from '../../../../src/main/study/proposal-service';
import { createHarness } from '../../../helpers/harness';

const rustRoute = {
  topic: 'Rust', goal: 'Escribir una CLI.', level: 'beginner', dailyPomodoros: 3,
  stages: [{ title: 'Ownership', topics: ['Borrowing'] }, { title: 'Traits', topics: [] }], instructions: 'En español.'
};

function setup(t: TestContext) {
  const harness = createHarness(t);
  const route = harness.study.create(rustRoute);
  const proposal: TaskProposal = { title: 'Leer el capítulo 4', stageId: route.stages[0].id, pomodoros: 2, doneWhen: 'Resumen escrito', reason: 'Empieza la etapa' };
  harness.agent.respondWith({ proposals: [proposal] });
  return { ...harness, route, proposal };
}

/** Deja correr las promesas pendientes, como la búsqueda del CLI. */
const settle = () => new Promise(resolve => setImmediate(resolve));

test('acepta el aviso de privacidad de cada proveedor una sola vez y lo guarda', t => {
  const { proposals, studyRepository } = setup(t);
  assert.deepEqual(proposals.notices(), []);
  assert.deepEqual(proposals.acceptNotice('codex'), ['codex']);
  assert.deepEqual(proposals.acceptNotice('claude'), ['claude', 'codex']);
  assert.deepEqual(proposals.acceptNotice('codex'), ['claude', 'codex']);
  assert.deepEqual(studyRepository.loadAgentNotices(), ['claude', 'codex']);
  assert.throws(() => proposals.acceptNotice('gemini'), /Elige Claude Code o Codex/);
});

test('no envía nada sin el aviso aceptado del proveedor elegido', async t => {
  const { proposals, agents, agent, detector, route } = setup(t);
  await assert.rejects(proposals.propose(route.id), new PublicError(agentNoticeRequired('claude')));
  proposals.acceptNotice('claude');
  agents.saveSettings({ ...DEFAULT_AGENT_SETTINGS, provider: 'codex' });
  await assert.rejects(proposals.propose(route.id), new PublicError(agentNoticeRequired('codex')));
  assert.equal(agent.requests.length, 0);
  assert.deepEqual(detector.calls, [], 'ni siquiera busca el CLI');
});

test('pide propuestas al CLI configurado con la ruta guardada, su historial y el día de hoy', async t => {
  const { proposals, agents, agent, agentFactory, detector, tasks, store, route, proposal } = setup(t);
  proposals.acceptNotice('codex');
  detector.executables.add('~/bin/codex');
  agents.saveSettings({ ...DEFAULT_AGENT_SETTINGS, provider: 'codex', codex: { path: '~/bin/codex', model: '' } });
  tasks.add('Hecha', undefined, { routeId: route.id, stageId: route.stages[0].id });
  tasks.toggle(store.state.tasks[0].id);

  assert.deepEqual(await proposals.propose(route.id), [proposal]);
  assert.deepEqual(agentFactory.created, [{ provider: 'codex', command: '~/bin/codex', model: '' }]);
  const [request] = agent.requests;
  assert.deepEqual(request.context, {
    route, today: store.today(),
    tasks: [{ title: 'Hecha', stageId: route.stages[0].id, done: true, plannedDate: store.today() }]
  });
  assert.equal(store.state.tasks.length, 1, 'las propuestas no crean tareas');
});

test('valida la ruta y falla con un mensaje claro si no existe o si falta el CLI', async t => {
  const { proposals, detector, agent, route } = setup(t);
  proposals.acceptNotice('claude');
  await assert.rejects(proposals.propose(''), /La ruta no es válida/);
  await assert.rejects(proposals.propose('otra'), /La ruta no existe/);
  detector.detected.claude = null;
  await assert.rejects(proposals.propose(route.id), new PublicError(agentMissing('claude')));
  assert.equal(agent.requests.length, 0);
});

test('los errores del agente llegan tal cual y la siguiente petición vuelve a funcionar', async t => {
  const { proposals, agent, route, proposal } = setup(t);
  proposals.acceptNotice('claude');
  agent.failNext(new PublicError('Inicia sesión en Claude Code.'));
  await assert.rejects(proposals.propose(route.id), /Inicia sesión en Claude Code/);
  assert.deepEqual(await proposals.propose(route.id), [proposal]);
});

test('hace una petición a la vez y la cancela a pedido', async t => {
  const { proposals, agent, route, proposal } = setup(t);
  proposals.acceptNotice('claude');
  proposals.cancel();
  agent.hang();
  const running = proposals.propose(route.id);
  await assert.rejects(proposals.propose(route.id), new PublicError(AGENT_BUSY));
  await settle();
  proposals.cancel();
  await assert.rejects(running, new PublicError(AGENT_CANCELLED));
  assert.deepEqual(await proposals.propose(route.id), [proposal], 'al cancelar queda libre para otra petición');
});

test('una cancelación mientras busca el CLI no llega a lanzar el agente', async t => {
  const { proposals, agent, route } = setup(t);
  proposals.acceptNotice('claude');
  const running = proposals.propose(route.id);
  proposals.cancel();
  await assert.rejects(running, new PublicError(AGENT_CANCELLED));
  assert.equal(agent.requests.length, 0);
});
