import test from 'node:test';
import assert from 'node:assert/strict';
import type { Task } from '../../../../src/shared/tasks/contract';
import { createHandle } from '../../../../src/main/ipc/handle';
import { registerTasksIpc } from '../../../../src/main/tasks/ipc';
import { FakeIpc } from '../../../helpers/fakes';
import { createHarness } from '../../../helpers/harness';

test('los canales de tareas reenvían identificadores, fechas y cambios', async t => {
  const ipc = new FakeIpc();
  const { store, tasks } = createHarness(t);
  registerTasksIpc(createHandle(ipc), tasks);
  await ipc.invoke('add-task', 'Hoy');
  await ipc.invoke('add-task', 'Mañana', '2026-09-30');
  const [today] = store.state.tasks;
  await ipc.invoke('toggle-task', today.id);
  assert.equal(store.state.tasks[0].done, true);

  const [tomorrow] = await ipc.invoke('get-tasks-for-day', '2026-09-30') as Task[];
  assert.equal(tomorrow.title, 'Mañana');
  await ipc.invoke('update-task', tomorrow.id, { plannedDate: '2026-09-29', title: 'Adelantada' });
  assert.deepEqual(store.state.tasks.map(task => task.title), ['Hoy', 'Adelantada']);

  await ipc.invoke('delete-task', today.id);
  assert.deepEqual(store.state.tasks.map(task => task.title), ['Adelantada']);
  assert.deepEqual(await ipc.invoke('get-task-summary', '2026-09-28', '2026-11-08'), { '2026-09-29': { total: 1, done: 0 } });
  await assert.rejects(ipc.invoke('get-tasks-for-day', 'mañana'), /Fecha inválida/);
  await assert.rejects(ipc.invoke('get-task-summary', '2026-09-28', null), /Fecha inválida/);
});
