import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_AGENT_SETTINGS, type StudyRoute } from '../../../../src/shared/study/contract';
import { createHandle } from '../../../../src/main/ipc/handle';
import { registerStudyIpc } from '../../../../src/main/study/ipc';
import { FakeIpc } from '../../../helpers/fakes';
import { createHarness } from '../../../helpers/harness';
import { sampleRoadmap, stage } from '../../../helpers/study';

test('los canales de rutas de estudio validan y reenvían al servicio', async t => {
  const ipc = new FakeIpc();
  const { study, agents, proposals } = createHarness(t);
  registerStudyIpc(createHandle(ipc), { study, agents, proposals });
  const input = { topic: 'Rust', goal: '', level: 'beginner', dailyPomodoros: 2, stages: [stage({ title: 'Ownership', topics: [] })], instructions: '' };
  const created = await ipc.invoke('create-study-route', input) as StudyRoute;
  assert.equal(created.id, 'study-1');
  const updated = await ipc.invoke('update-study-route', created.id, { ...input, topic: 'Rust avanzado', stages: created.stages }) as StudyRoute;
  assert.equal(updated.topic, 'Rust avanzado');
  assert.deepEqual(await ipc.invoke('list-study-routes'), [updated]);
  await assert.rejects(ipc.invoke('create-study-route', { ...input, stages: [] }), /de 1 a 30 etapas/);
  await assert.rejects(ipc.invoke('update-study-route', 42, input), /La ruta no es válida/);
  assert.deepEqual(await ipc.invoke('get-study-progress'), {});
  await ipc.invoke('delete-study-route', created.id);
  assert.deepEqual(await ipc.invoke('list-study-routes'), []);
});

test('los canales del agente validan la configuración y comprueban los CLI', async t => {
  const ipc = new FakeIpc();
  const { study, agents, proposals } = createHarness(t);
  registerStudyIpc(createHandle(ipc), { study, agents, proposals });
  assert.deepEqual(await ipc.invoke('get-agent-settings'), DEFAULT_AGENT_SETTINGS);
  const settings = { ...DEFAULT_AGENT_SETTINGS, provider: 'codex' };
  assert.deepEqual(await ipc.invoke('save-agent-settings', settings), settings);
  assert.deepEqual(await ipc.invoke('get-agent-settings'), settings);
  await assert.rejects(ipc.invoke('save-agent-settings', { ...settings, provider: 'gemini' }), /Elige Claude Code o Codex/);
  assert.deepEqual(await ipc.invoke('check-study-agents'), [
    { provider: 'claude', availability: 'ready', path: '/usr/local/bin/claude', configured: false },
    { provider: 'codex', availability: 'missing', path: null, configured: false },
  ]);
});

test('los canales de propuestas exigen el aviso, piden al agente y cancelan', async t => {
  const ipc = new FakeIpc();
  const harness = createHarness(t);
  registerStudyIpc(createHandle(ipc), harness);
  const route = harness.study.create({ topic: 'Rust', goal: '', level: 'beginner', dailyPomodoros: 2, stages: [stage({ title: 'Ownership', topics: [] })], instructions: '' });
  const stageId = route.stages[0].id;
  harness.agent.respondWith({ proposals: [{ title: 'Leer el capítulo 4', stageId, pomodoros: 2, doneWhen: 'Resumen escrito', reason: 'Empieza la etapa' }] });

  assert.deepEqual(await ipc.invoke('get-agent-notices'), []);
  await assert.rejects(ipc.invoke('propose-study-tasks', route.id), /Acepta el aviso de privacidad antes de enviar la ruta a Claude Code/);
  await assert.rejects(ipc.invoke('accept-agent-notice', 'gemini'), /Elige Claude Code o Codex/);
  assert.deepEqual(await ipc.invoke('accept-agent-notice', 'claude'), ['claude']);
  assert.deepEqual(await ipc.invoke('propose-study-tasks', route.id), [{ title: 'Leer el capítulo 4', stageId, pomodoros: 2, doneWhen: 'Resumen escrito', reason: 'Empieza la etapa' }]);
  await assert.rejects(ipc.invoke('propose-study-tasks', 7), /La ruta no es válida/);

  harness.agent.hang();
  const running = ipc.invoke('propose-study-tasks', route.id);
  await new Promise(resolve => setImmediate(resolve));
  await ipc.invoke('cancel-study-proposals');
  await assert.rejects(running, /Se canceló la petición al agente/);
});

test('el canal del roadmap exige el aviso, valida el brief, pide al agente y se cancela', async t => {
  const ipc = new FakeIpc();
  const harness = createHarness(t);
  registerStudyIpc(createHandle(ipc), harness);
  harness.agent.respondWith(sampleRoadmap());
  const brief = 'Rust para escribir CLIs, 1 h al día';

  await assert.rejects(ipc.invoke('draft-study-route', brief), /Acepta el aviso de privacidad/);
  await ipc.invoke('accept-agent-notice', 'claude');
  await assert.rejects(ipc.invoke('draft-study-route', ''), /Describe qué quieres estudiar/);
  assert.deepEqual(await ipc.invoke('draft-study-route', brief), sampleRoadmap());
  assert.deepEqual(await ipc.invoke('list-study-routes'), [], 'el roadmap no se guarda');

  harness.agent.hang();
  const running = ipc.invoke('draft-study-route', brief);
  await new Promise(resolve => setImmediate(resolve));
  await ipc.invoke('cancel-study-proposals');
  await assert.rejects(running, /Se canceló la petición al agente/);
});
