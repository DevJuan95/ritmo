import test, { type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { TaskRepository } from '../../../../src/main/tasks/task-repository';
import { FakeClock, sequentialIds } from '../../../helpers/fakes';
import { tempDir } from '../../../helpers/temp';

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
    createdAt: new Date(clock.now()).toISOString(), completedAt: null, done: false, routeId: null, stageId: null
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

test('resume por día el total y las completadas de un rango, con ambos extremos', t => {
  const { repository } = openRepository(t);
  const first = repository.create('Una', '2026-09-01');
  repository.create('Dos', '2026-09-01');
  repository.create('Fin', '2026-09-30');
  repository.create('Fuera', '2026-10-01');
  repository.update(first.id, { done: true });
  assert.deepEqual(repository.summarizeRange('2026-09-01', '2026-09-30'), {
    '2026-09-01': { total: 2, done: 1 },
    '2026-09-30': { total: 1, done: 0 }
  });
  assert.deepEqual(repository.summarizeRange('2026-08-01', '2026-08-31'), {});
  assert.throws(() => repository.summarizeRange('ayer', '2026-09-30'), /Fecha inválida/);
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

test('guarda el vínculo con una etapa al crear y lo cambia o lo quita al editar', t => {
  const { repository, dbPath } = openRepository(t);
  const linked = repository.create('Leer el capítulo 4', '2026-09-29', { routeId: 'r1', stageId: 's1' });
  assert.deepEqual([linked.routeId, linked.stageId], ['r1', 's1']);
  const loose = repository.create('Suelta', '2026-09-29', null);
  assert.deepEqual([loose.routeId, loose.stageId], [null, null]);

  assert.deepEqual(repository.update(linked.id, { title: 'Leer el capítulo 5' }), { ...linked, title: 'Leer el capítulo 5' }, 'editar otro campo conserva el vínculo');
  const moved = repository.update(loose.id, { link: { routeId: 'r1', stageId: 's2' } });
  assert.deepEqual([moved.routeId, moved.stageId], ['r1', 's2']);
  const unlinked = repository.update(linked.id, { link: null });
  assert.deepEqual([unlinked.routeId, unlinked.stageId], [null, null]);
  assert.throws(() => repository.create('Mal', '2026-09-29', { routeId: 'r1' } as never), /etapa válida/);
  assert.throws(() => repository.update(loose.id, { link: { routeId: '', stageId: 's1' } }), /etapa válida/);
  repository.close();

  const reopened = new TaskRepository(dbPath);
  t.after(() => reopened.close());
  assert.deepEqual(reopened.listByDay('2026-09-29').map(task => [task.title, task.routeId, task.stageId]), [['Leer el capítulo 5', null, null], ['Suelta', 'r1', 's2']]);
});

test('resume por etapa las tareas vinculadas de todos los días', t => {
  const { repository } = openRepository(t);
  const first = repository.create('Una', '2026-09-01', { routeId: 'r1', stageId: 's1' });
  repository.create('Dos', '2026-10-15', { routeId: 'r1', stageId: 's1' });
  repository.create('Tres', '2026-09-29', { routeId: 'r1', stageId: 's2' });
  repository.create('Suelta', '2026-09-29');
  repository.update(first.id, { done: true });
  assert.deepEqual(repository.summarizeByStage(), { s1: { total: 2, done: 1 }, s2: { total: 1, done: 0 } });
});

test('desvincula las tareas de las etapas que ya no están en la ruta', t => {
  const { repository } = openRepository(t);
  repository.create('Uno', '2026-09-29', { routeId: 'r1', stageId: 's1' });
  repository.create('Dos', '2026-09-29', { routeId: 'r1', stageId: 's2' });
  repository.create('Otra ruta', '2026-09-29', { routeId: 'r2', stageId: 's9' });
  repository.unlinkStages('r1', ['s1']);
  const links = () => repository.listByDay('2026-09-29').map(task => [task.title, task.routeId, task.stageId]);
  assert.deepEqual(links(), [['Uno', 'r1', 's1'], ['Dos', null, null], ['Otra ruta', 'r2', 's9']]);
  repository.unlinkStages('r1', []);
  assert.deepEqual(links(), [['Uno', null, null], ['Dos', null, null], ['Otra ruta', 'r2', 's9']]);
});

test('añade las columnas del vínculo a una base creada antes de las rutas', t => {
  const dbPath = path.join(tempDir(t), 'ritmo.db');
  const old = new DatabaseSync(dbPath);
  old.exec(`
    CREATE TABLE tasks (id TEXT PRIMARY KEY, title TEXT NOT NULL, planned_date TEXT NOT NULL, created_at TEXT NOT NULL, completed_at TEXT);
    INSERT INTO tasks VALUES ('vieja', 'Antes de las rutas', '2026-09-29', '2026-09-01T00:00:00.000Z', NULL);
  `);
  old.close();
  const repository = new TaskRepository(dbPath);
  t.after(() => repository.close());
  assert.deepEqual(repository.listByDay('2026-09-29').map(task => [task.id, task.routeId, task.stageId]), [['vieja', null, null]]);
  repository.update('vieja', { link: { routeId: 'r1', stageId: 's1' } });
  assert.deepEqual(repository.summarizeByStage(), { s1: { total: 1, done: 0 } });
});

test('lista las tareas vinculadas a una ruta, de todos los días, por día', t => {
  const { repository } = openRepository(t);
  repository.create('Después', '2026-10-02', { routeId: 'r1', stageId: 's2' });
  repository.create('Antes', '2026-09-01', { routeId: 'r1', stageId: 's1' });
  repository.create('Otra ruta', '2026-09-01', { routeId: 'r2', stageId: 's9' });
  repository.create('Suelta', '2026-09-01');
  assert.deepEqual(repository.listByRoute('r1').map(task => [task.title, task.plannedDate]), [['Antes', '2026-09-01'], ['Después', '2026-10-02']]);
  assert.deepEqual(repository.listByRoute('nada'), []);
});
