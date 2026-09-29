import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { TaskRepository } from '../src/main/tasks';
import { StateStore } from '../src/main/state';
import { safePlannedDate, todayKey } from '../src/shared/validation';

test('valida fechas de calendario en formato ISO', () => {
  assert.equal(safePlannedDate('2026-09-29'), '2026-09-29');
  assert.equal(safePlannedDate('2028-02-29'), '2028-02-29');
  for (const value of ['2026-02-29', '2026-02-30', '2026-9-1', '2026-13-01', 'ayer']) {
    assert.throws(() => safePlannedDate(value));
  }
});

function fixture(): { directory: string; repository: TaskRepository; statePath: string; cleanup: () => void } {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'ritmo-planner-'));
  const repository = new TaskRepository(path.join(directory, 'ritmo.db'));
  return {
    directory,
    repository,
    statePath: path.join(directory, 'state.json'),
    cleanup: () => {
      try { repository.close(); } catch { /* La prueba puede haber cerrado la conexión antes. */ }
      fs.rmSync(directory, { recursive: true, force: true });
    }
  };
}

test('guarda tareas por fecha y las recupera tras reabrir la base', () => {
  const { directory, repository, cleanup } = fixture();
  try {
    const task = repository.create('Preparar informe', '2026-10-02');
    assert.equal(task.title, 'Preparar informe');
    assert.equal(task.plannedDate, '2026-10-02');
    assert.equal(task.done, false);
    assert.ok(task.createdAt);
    assert.equal(repository.listByDay('2026-10-01').length, 0);
    assert.deepEqual(repository.listByDay('2026-10-02').map(item => item.id), [task.id]);

    repository.close();
    const reopened = new TaskRepository(path.join(directory, 'ritmo.db'));
    try {
      assert.deepEqual(reopened.listByDay('2026-10-02').map(item => item.id), [task.id]);
    } finally { reopened.close(); }
  } finally { cleanup(); }
});

test('permite editar, completar, reprogramar y borrar sin mover pendientes automáticamente', () => {
  const { repository, cleanup } = fixture();
  try {
    const first = repository.create('Borrador', '2026-09-29');
    repository.create('Mañana', '2026-09-30');
    repository.update(first.id, { title: 'Borrador revisado', done: true });
    let task = repository.listByDay('2026-09-29')[0];
    assert.equal(task.title, 'Borrador revisado');
    assert.equal(task.done, true);
    assert.ok(task.completedAt);

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
  } finally { cleanup(); }
});

test('rechaza fechas inválidas y títulos vacíos en la capa persistente', () => {
  const { repository, cleanup } = fixture();
  try {
    for (const date of ['2026-02-30', '2026-9-1', '2026-13-01', 'ayer']) {
      assert.throws(() => repository.create('Tarea', date));
      assert.throws(() => repository.listByDay(date));
    }
    assert.throws(() => repository.create('   ', '2026-09-29'));
    const task = repository.create('Válida', '2026-09-29');
    assert.throws(() => repository.update(task.id, { plannedDate: '2026-02-30' }));
    assert.deepEqual(repository.listByDay('2026-09-29').map(item => item.id), [task.id]);
  } finally { cleanup(); }
});

test('migra tareas del JSON una sola vez y conserva dominios y copia de respaldo', () => {
  const { repository, statePath, cleanup } = fixture();
  const oldDay = '2026-09-20';
  const legacy = {
    day: oldDay,
    tasks: [
      { id: 'old-pending', title: 'Pendiente antigua', done: false },
      { id: 'old-done', title: 'Completada antigua', done: true }
    ],
    domains: ['example.com'],
    session: null,
    focusCount: 2,
    blockError: null
  };
  try {
    fs.writeFileSync(statePath, JSON.stringify(legacy));
    const store = new StateStore(statePath, () => undefined, repository);
    assert.deepEqual(repository.listByDay(oldDay).map(item => item.id).sort(), ['old-done', 'old-pending']);
    assert.equal(repository.listByDay(oldDay).find(item => item.id === 'old-done')?.done, true);
    assert.deepEqual(store.state.domains, ['example.com']);
    assert.ok(fs.existsSync(`${statePath}.backup`));
    assert.deepEqual(JSON.parse(fs.readFileSync(`${statePath}.backup`, 'utf8')), legacy);

    new StateStore(statePath, () => undefined, repository);
    assert.deepEqual(repository.listByDay(oldDay).map(item => item.id).sort(), ['old-done', 'old-pending']);
  } finally { cleanup(); }
});

test('al cambiar de día reinicia el contador sin perder tareas históricas', () => {
  const { repository, statePath, cleanup } = fixture();
  try {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const oldDay = todayKey(yesterday);
    fs.writeFileSync(statePath, JSON.stringify({
      day: oldDay,
      tasks: [{ id: 'carry-over', title: 'Sin terminar', done: false }],
      domains: ['example.com'],
      session: null,
      focusCount: 3,
      blockError: null
    }));
    const store = new StateStore(statePath, () => undefined, repository);
    store.rollDay();
    assert.equal(store.state.day, todayKey());
    assert.equal(store.state.focusCount, 0);
    assert.deepEqual(repository.listByDay(oldDay).map(item => item.id), ['carry-over']);
    assert.equal(repository.listByDay(todayKey()).length, 0);
  } finally { cleanup(); }
});

test('rechaza un state.json corrupto sin sobrescribir sus bytes', () => {
  const { repository, statePath, cleanup } = fixture();
  const corrupt = '{"day":"2026-09-29","tasks":[';
  try {
    fs.writeFileSync(statePath, corrupt);
    assert.throws(() => new StateStore(statePath, () => undefined, repository), /estado|JSON|corrupt|inválid/i);
    assert.equal(fs.readFileSync(statePath, 'utf8'), corrupt);
    assert.equal(repository.listByDay('2026-09-29').length, 0);
  } finally { cleanup(); }
});

test('rechaza un state.json con estructura inválida sin importar tareas parcialmente', () => {
  const { repository, statePath, cleanup } = fixture();
  const invalid = JSON.stringify({
    day: '2026-09-29',
    tasks: [{ id: 'valid', title: 'No importar parcialmente', done: false }, { id: 2, title: 'ID inválido', done: false }],
    domains: ['example.com']
  });
  try {
    fs.writeFileSync(statePath, invalid);
    assert.throws(() => new StateStore(statePath, () => undefined, repository), /estado|JSON|corrupt|inválid/i);
    assert.equal(fs.readFileSync(statePath, 'utf8'), invalid);
    assert.equal(repository.listByDay('2026-09-29').length, 0);
  } finally { cleanup(); }
});
