import test from 'node:test';
import assert from 'node:assert/strict';
import type { StudyRoute } from '../../../../src/shared/study/contract';
import { createHandle } from '../../../../src/main/ipc/handle';
import { registerStudyIpc } from '../../../../src/main/study/ipc';
import { FakeIpc } from '../../../helpers/fakes';
import { createHarness } from '../../../helpers/harness';

test('los canales de rutas de estudio validan y reenvían al servicio', async t => {
  const ipc = new FakeIpc();
  const { study } = createHarness(t);
  registerStudyIpc(createHandle(ipc), study);
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
