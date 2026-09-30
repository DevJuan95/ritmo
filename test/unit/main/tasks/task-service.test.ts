import test from 'node:test';
import assert from 'node:assert/strict';
import { createHarness } from '../../../helpers/harness';

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

test('resume un rango de días y valida sus límites', t => {
  const { tasks, store } = createHarness(t);
  tasks.add('Hoy', undefined);
  tasks.add('Mañana', '2026-09-30');
  tasks.toggle(store.state.tasks[0].id);
  assert.deepEqual(tasks.summarize('2026-09-29', '2026-09-30'), { '2026-09-29': { total: 1, done: 1 }, '2026-09-30': { total: 1, done: 0 } });
  assert.deepEqual(tasks.summarize('2026-09-30', '2026-09-30'), { '2026-09-30': { total: 1, done: 0 } });
  assert.throws(() => tasks.summarize('2026-09-30', '2026-09-29'), /Rango de fechas inválido/);
  assert.throws(() => tasks.summarize('1999-12-27', '2000-02-06'), /entre 2000 y 2100/);
  assert.throws(() => tasks.summarize('2026-09-29', undefined), /Fecha inválida/);
});

test('las operaciones de tareas avanzan de día antes de actuar', t => {
  const { tasks, store, clock } = createHarness(t, { saved: { focusCount: 4 } });
  clock.nextDay();
  tasks.add('Nueva', undefined);
  assert.equal(store.state.day, '2026-09-30');
  assert.equal(store.state.focusCount, 0);
  assert.deepEqual(store.state.tasks.map(task => [task.title, task.plannedDate]), [['Nueva', '2026-09-30']]);
});

const rustRoute = { topic: 'Rust', goal: '', level: 'beginner', dailyPomodoros: 2, stages: [{ title: 'Ownership', topics: [] }, { title: 'Traits', topics: [] }], instructions: '' };

test('vincula una tarea a una etapa existente de su ruta al crearla o editarla', t => {
  const { tasks, store, study } = createHarness(t);
  const route = study.create(rustRoute);
  const [ownership, traits] = route.stages;
  tasks.add('Leer sobre ownership', undefined, { routeId: route.id, stageId: ownership.id });
  tasks.add('Suelta', undefined, null);
  assert.deepEqual(store.state.tasks.map(task => [task.title, task.routeId, task.stageId]), [['Leer sobre ownership', route.id, ownership.id], ['Suelta', null, null]]);

  const [, loose] = store.state.tasks;
  tasks.update(loose.id, { link: { routeId: route.id, stageId: traits.id } });
  assert.deepEqual([store.state.tasks[1].routeId, store.state.tasks[1].stageId], [route.id, traits.id]);
  tasks.update(loose.id, { link: null });
  assert.equal(store.state.tasks[1].stageId, null);
  tasks.update(loose.id, { done: true });
  assert.equal(store.state.tasks[1].done, true);
});

test('rechaza vínculos a etapas inexistentes o de otra ruta sin crear ni cambiar nada', t => {
  const { tasks, store, study } = createHarness(t);
  const rust = study.create(rustRoute);
  const go = study.create({ ...rustRoute, topic: 'Go' });
  assert.throws(() => tasks.add('Mal', undefined, { routeId: go.id, stageId: rust.stages[0].id }), /La etapa ya no existe/);
  assert.throws(() => tasks.add('Mal', undefined, { routeId: rust.id, stageId: 'inventada' }), /La etapa ya no existe/);
  assert.throws(() => tasks.add('Mal', undefined, 'r1'), /etapa válida/);
  assert.equal(store.state.tasks.length, 0);

  tasks.add('Buena', undefined);
  const [task] = store.state.tasks;
  assert.throws(() => tasks.update(task.id, { title: 'Otra', link: { routeId: rust.id, stageId: go.stages[0].id } }), /La etapa ya no existe/);
  assert.deepEqual([store.state.tasks[0].title, store.state.tasks[0].stageId], ['Buena', null]);
});

test('resume el avance por etapa y desvincula las tareas de etapas quitadas', t => {
  const { tasks, store, study } = createHarness(t);
  const route = study.create(rustRoute);
  const [ownership, traits] = route.stages;
  tasks.add('Hoy', undefined, { routeId: route.id, stageId: ownership.id });
  tasks.add('Mañana', '2026-09-30', { routeId: route.id, stageId: traits.id });
  tasks.toggle(store.state.tasks[0].id);
  assert.deepEqual(tasks.stageProgress(), { [ownership.id]: { total: 1, done: 1 }, [traits.id]: { total: 1, done: 0 } });

  tasks.unlinkStages(route.id, [traits.id]);
  assert.equal(store.state.tasks[0].stageId, null, 'la lista de hoy queda al día');
  assert.deepEqual(tasks.stageProgress(), { [traits.id]: { total: 1, done: 0 } });
});
