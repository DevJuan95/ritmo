import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_AGENT_SETTINGS, type StudyRoute } from '../../../../src/shared/study/contract';
import { createHandle } from '../../../../src/main/ipc/handle';
import { registerStudyIpc } from '../../../../src/main/study/ipc';
import { FakeIpc } from '../../../helpers/fakes';
import { createHarness } from '../../../helpers/harness';

test('los canales de rutas de estudio validan y reenvían al servicio', async t => {
  const ipc = new FakeIpc();
  const { study, agents } = createHarness(t);
  registerStudyIpc(createHandle(ipc), { study, agents });
  const input = { topic: 'Rust', goal: '', level: 'beginner', dailyPomodoros: 2, stages: [{ title: 'Ownership', topics: [] }], instructions: '' };
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
  const { study, agents } = createHarness(t);
  registerStudyIpc(createHandle(ipc), { study, agents });
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
