import test from 'node:test';
import assert from 'node:assert/strict';
import type { PublicState, Task } from '../../../../src/shared/contracts';
import { registerHandlers } from '../../../../src/main/ipc/handlers';
import { FakeIpc } from '../../../helpers/fakes';
import { createHarness } from '../../../helpers/harness';

function setup(t: Parameters<typeof createHarness>[0], options: Parameters<typeof createHarness>[1] = {}) {
  const ipc = new FakeIpc();
  const harness = createHarness(t, options);
  registerHandlers(ipc, harness);
  return { ipc, ...harness };
}

test('get-state avanza de día antes de devolver el estado público', async t => {
  const { ipc, clock } = setup(t, { saved: { focusCount: 2 } });
  clock.nextDay();
  const state = await ipc.invoke('get-state') as PublicState;
  assert.equal(state.day, '2026-09-30');
  assert.equal(state.focusCount, 0);
  assert.equal(state.busy, false);
  assert.equal(state.now, clock.now());
});

test('los canales de foco y descanso llegan a FocusService', async t => {
  const { ipc, store, blocker } = setup(t);
  const session = () => store.state.session?.kind ?? null;
  await ipc.invoke('start-focus');
  assert.equal(session(), 'focus');
  await ipc.invoke('finish-focus');
  assert.equal(session(), null);
  assert.deepEqual(blocker.calls.map(call => call.action), ['block', 'unblock']);

  await ipc.invoke('start-break', 'longBreak');
  assert.equal(session(), 'longBreak');
  await ipc.invoke('finish-break');
  assert.equal(session(), null);
  await assert.rejects(ipc.invoke('start-break', 'siesta'), /inválido/);
});

test('retry-unblock quita un bloqueo pendiente', async t => {
  const { ipc, store, blocker } = setup(t, { saved: { blockError: 'pendiente' } });
  await ipc.invoke('retry-unblock');
  assert.equal(store.state.blockError, null);
  assert.deepEqual(blocker.calls.map(call => call.action), ['unblock']);
});

test('los canales de tareas reenvían identificadores, fechas y cambios', async t => {
  const { ipc, store } = setup(t);
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

test('los canales de dominios validan en el proceso principal', async t => {
  const { ipc, store } = setup(t, { saved: { domains: ['x.com'] } });
  await ipc.invoke('add-domain', 'https://Instagram.com/');
  await ipc.invoke('remove-domain', 'x.com');
  assert.deepEqual(store.state.domains, ['instagram.com']);
  await assert.rejects(ipc.invoke('add-domain', 'no es dominio'), /dominio válido/);
});
