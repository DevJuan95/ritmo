import test from 'node:test';
import assert from 'node:assert/strict';
import { createHarness } from '../../helpers/harness';

test('añade tareas para hoy por defecto y publica la lista del día', t => {
  const { tasks, store, published } = createHarness(t);
  tasks.add('  Revisar   correo ', undefined);
  assert.deepEqual(store.state.tasks.map(task => task.title), ['Revisar correo']);
  assert.deepEqual(published.at(-1)?.tasks.map(task => task.title), ['Revisar correo']);
});

test('una tarea planeada para otro día no aparece en la lista de hoy', t => {
  const { tasks, store, repository } = createHarness(t);
  tasks.add('Más tarde', '2026-10-05');
  assert.equal(store.state.tasks.length, 0);
  assert.equal(repository.listByDay('2026-10-05').length, 1);
});

test('rechaza títulos y fechas inválidos sin crear nada', t => {
  const { tasks, repository } = createHarness(t);
  assert.throws(() => tasks.add('   ', undefined));
  assert.throws(() => tasks.add('Tarea', '2026-02-30'));
  assert.throws(() => tasks.add('Tarea', null));
  assert.equal(repository.listByDay('2026-09-29').length, 0);
});

test('alterna tareas de hoy e ignora ids desconocidos', t => {
  const { tasks, store } = createHarness(t);
  tasks.add('Tarea', undefined);
  const [task] = store.state.tasks;
  tasks.toggle(task.id);
  assert.equal(store.state.tasks[0].done, true);
  tasks.toggle(task.id);
  assert.equal(store.state.tasks[0].done, false);
  tasks.toggle('no-existe');
  assert.equal(store.state.tasks.length, 1);
  assert.throws(() => tasks.toggle(7), /Identificador/);
});

test('elimina tareas y valida el identificador', t => {
  const { tasks, store } = createHarness(t);
  tasks.add('Tarea', undefined);
  tasks.remove(store.state.tasks[0].id);
  assert.equal(store.state.tasks.length, 0);
  assert.throws(() => tasks.remove({ id: 'x' }), /Identificador/);
});

test('actualizar desde el planner refresca la lista de hoy', t => {
  const { tasks, store } = createHarness(t);
  tasks.add('Mover', undefined);
  const [task] = store.state.tasks;
  tasks.update(task.id, { plannedDate: '2026-09-30' });
  assert.equal(store.state.tasks.length, 0);
  assert.deepEqual(tasks.listByDay('2026-09-30').map(item => item.id), [task.id]);
  for (const patch of [null, 'done', ['done']]) assert.throws(() => tasks.update(task.id, patch), /inválido/);
  assert.throws(() => tasks.update(1, { done: true }), /inválido/);
  assert.throws(() => tasks.listByDay('mañana'), /Fecha inválida/);
});

test('las operaciones de tareas avanzan de día antes de actuar', t => {
  const { tasks, store, clock } = createHarness(t, { saved: { focusCount: 4 } });
  clock.nextDay();
  tasks.add('Nueva', undefined);
  assert.equal(store.state.day, '2026-09-30');
  assert.equal(store.state.focusCount, 0);
  assert.deepEqual(store.state.tasks.map(task => [task.title, task.plannedDate]), [['Nueva', '2026-09-30']]);
});
