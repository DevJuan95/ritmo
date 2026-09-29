import test, { type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { TaskRepository } from '../../../src/main/tasks';
import { FakeClock, sequentialIds } from '../../helpers/fakes';
import { tempDir } from '../../helpers/temp';

function openRepository(t: TestContext, clock = new FakeClock()): { repository: TaskRepository; dbPath: string; clock: FakeClock } {
  const dbPath = path.join(tempDir(t), 'ritmo.db');
  const repository = new TaskRepository(dbPath, { now: clock.now, newId: sequentialIds() });
  t.after(() => repository.close());
  return { repository, dbPath, clock };
}

test('guarda tareas por fecha y las recupera tras reabrir la base', t => {
  const { repository, dbPath, clock } = openRepository(t);
  const task = repository.create('Preparar informe', '2026-10-02');
  assert.deepEqual(task, {
    id: 'task-1', title: 'Preparar informe', plannedDate: '2026-10-02',
    createdAt: new Date(clock.now()).toISOString(), completedAt: null, done: false
  });
  assert.equal(repository.listByDay('2026-10-01').length, 0);
  repository.close();

  const reopened = new TaskRepository(dbPath);
  t.after(() => reopened.close());
  assert.deepEqual(reopened.listByDay('2026-10-02'), [task]);
});

test('ordena las tareas del día por fecha de creación', t => {
  const { repository, clock } = openRepository(t);
  repository.create('Primera', '2026-09-29');
  clock.advanceMinutes(1);
  repository.create('Segunda', '2026-09-29');
  assert.deepEqual(repository.listByDay('2026-09-29').map(task => task.title), ['Primera', 'Segunda']);
});

test('permite editar, completar, reprogramar y borrar sin mover pendientes automáticamente', t => {
  const { repository, clock } = openRepository(t);
  const first = repository.create('Borrador', '2026-09-29');
  repository.create('Mañana', '2026-09-30');
  clock.advanceMinutes(10);
  repository.update(first.id, { title: 'Borrador revisado', done: true });
  let task = repository.listByDay('2026-09-29')[0];
  assert.equal(task.title, 'Borrador revisado');
  assert.equal(task.done, true);
  assert.equal(task.completedAt, new Date(clock.now()).toISOString());

  clock.advanceMinutes(10);
  repository.update(first.id, { done: true });
  assert.equal(repository.listByDay('2026-09-29')[0].completedAt, task.completedAt, 'volver a completar conserva la fecha original');

  repository.update(first.id, { done: false });
  task = repository.listByDay('2026-09-29')[0];
  assert.equal(task.completedAt, null);
  assert.equal(task.done, false);
  assert.equal(repository.listByDay('2026-09-30').length, 1);

  repository.update(first.id, { plannedDate: '2026-10-01' });
  assert.equal(repository.listByDay('2026-09-29').length, 0);
  assert.deepEqual(repository.listByDay('2026-10-01').map(item => item.id), [first.id]);
  repository.delete(first.id);
  assert.equal(repository.listByDay('2026-10-01').length, 0);
});

test('rechaza fechas inválidas y títulos vacíos en la capa persistente', t => {
  const { repository } = openRepository(t);
  for (const date of ['2026-02-30', '2026-9-1', '2026-13-01', 'ayer']) {
    assert.throws(() => repository.create('Tarea', date));
    assert.throws(() => repository.listByDay(date));
  }
  assert.throws(() => repository.create('   ', '2026-09-29'));
  const task = repository.create('Válida', '2026-09-29');
  assert.throws(() => repository.update(task.id, { plannedDate: '2026-02-30' }));
  assert.deepEqual(repository.listByDay('2026-09-29').map(item => item.id), [task.id]);
});

test('rechaza cambios de tarea inexistentes o mal formados', t => {
  const { repository } = openRepository(t);
  const task = repository.create('Tarea', '2026-09-29');
  assert.throws(() => repository.update('no-existe', { done: true }), /no existe/);
  assert.throws(() => repository.update(task.id, {}), /inválido/);
  assert.throws(() => repository.update(task.id, { priority: 1 } as never), /inválido/);
  assert.throws(() => repository.update(task.id, { done: 'sí' } as never), /inválido/);
  assert.throws(() => repository.update('', { done: true }), /Identificador/);
  assert.throws(() => repository.delete(''), /Identificador/);
  assert.deepEqual(repository.listByDay('2026-09-29'), [task]);
});

test('importa tareas antiguas de forma idempotente y atómica', t => {
  const { repository } = openRepository(t);
  const legacy = [{ id: 'a', title: 'Antigua', done: false }, { id: 'b', title: 'Hecha', done: true }];
  repository.importLegacy(legacy, '2026-09-20');
  repository.importLegacy(legacy, '2026-09-20');
  assert.deepEqual(repository.listByDay('2026-09-20').map(task => [task.id, task.done]), [['a', false], ['b', true]]);

  assert.throws(() => repository.importLegacy([{ id: 'c', title: 'Válida', done: false }, { id: 'd', title: '   ', done: false }], '2026-09-21'));
  assert.equal(repository.listByDay('2026-09-21').length, 0, 'un error revierte toda la importación');
});

test('la importación omite entradas sin identificador', t => {
  const { repository } = openRepository(t);
  const legacy = [null, { id: '', title: 'Sin id', done: false }, { id: 7, title: 'Id numérico', done: false }, { id: 'ok', title: 'Válida', done: false }];
  repository.importLegacy(legacy as never, '2026-09-20');
  assert.deepEqual(repository.listByDay('2026-09-20').map(task => task.id), ['ok']);
});

test('sin generador inyectado usa UUID aleatorios', t => {
  const repository = new TaskRepository(path.join(tempDir(t), 'ritmo.db'));
  t.after(() => repository.close());
  const first = repository.create('Una', '2026-09-29');
  const second = repository.create('Otra', '2026-09-29');
  assert.match(first.id, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  assert.notEqual(first.id, second.id);
});
