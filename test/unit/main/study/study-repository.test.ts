import test, { type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { DEFAULT_AGENT_SETTINGS, type AgentSettings, type StudyRouteInput } from '../../../../src/shared/study/contract';
import { StudyRepository } from '../../../../src/main/study/study-repository';
import { TaskRepository } from '../../../../src/main/tasks/task-repository';
import { FakeClock, sequentialIds } from '../../../helpers/fakes';
import { tempDir } from '../../../helpers/temp';

function openRepository(t: TestContext, clock = new FakeClock(), newId = sequentialIds('id')) {
  const dbPath = path.join(tempDir(t), 'datos', 'ritmo.db');
  const repository = new StudyRepository(dbPath, { now: clock.now, newId });
  t.after(() => repository.close());
  return { repository, dbPath, clock };
}

const input = (patch: Partial<StudyRouteInput> = {}): StudyRouteInput => ({
  topic: 'Rust', goal: 'Escribir una CLI.', level: 'beginner', dailyPomodoros: 4,
  stages: [{ title: 'Ownership', topics: ['Move', 'Borrowing'] }, { title: 'Traits', topics: [] }],
  instructions: 'En español.', ...patch
});

test('crea una ruta con sus etapas en orden y la recupera tras reabrir la base', t => {
  const { repository, dbPath, clock } = openRepository(t);
  const at = new Date(clock.now()).toISOString();
  const route = repository.create(input());
  assert.deepEqual(route, {
    id: 'id-1', topic: 'Rust', goal: 'Escribir una CLI.', level: 'beginner', dailyPomodoros: 4,
    stages: [{ id: 'id-2', title: 'Ownership', topics: ['Move', 'Borrowing'] }, { id: 'id-3', title: 'Traits', topics: [] }],
    instructions: 'En español.', createdAt: at, updatedAt: at
  });
  repository.close();
  repository.close();

  const reopened = new StudyRepository(dbPath);
  t.after(() => reopened.close());
  assert.deepEqual(reopened.list(), [route]);
});

test('lista las rutas de la más antigua a la más reciente, cada una con sus etapas', t => {
  const { repository, clock } = openRepository(t);
  const first = repository.create(input({ topic: 'Rust' }));
  clock.advanceMinutes(1);
  const second = repository.create(input({ topic: 'Go', stages: [{ title: 'Goroutines', topics: [] }] }));
  const empty = repository.create(input({ topic: 'Sin etapas', stages: [] }));
  assert.deepEqual(repository.list(), [first, second, empty]);
  assert.deepEqual(empty.stages, []);
});

test('al editar conserva el id de las etapas que lo traen, crea las nuevas y borra las que faltan', t => {
  const { repository, clock } = openRepository(t);
  const route = repository.create(input());
  const [ownership, traits] = route.stages;
  clock.advanceMinutes(5);
  const updated = repository.update(route.id, input({
    topic: 'Rust avanzado', level: 'intermediate', dailyPomodoros: 6, goal: '', instructions: '',
    stages: [{ id: traits.id, title: 'Traits y genéricos', topics: ['dyn'] }, { title: 'Async', topics: [] }]
  }));
  assert.deepEqual(updated, {
    ...route, topic: 'Rust avanzado', level: 'intermediate', dailyPomodoros: 6, goal: '', instructions: '',
    stages: [{ id: traits.id, title: 'Traits y genéricos', topics: ['dyn'] }, { id: 'id-4', title: 'Async', topics: [] }],
    updatedAt: new Date(clock.now()).toISOString()
  });
  assert.deepEqual(repository.list(), [updated]);
  assert.notEqual(updated.stages[0].id, ownership.id);
});

test('rechaza editar una ruta inexistente o con etapas de otra ruta, sin cambiar nada', t => {
  const { repository } = openRepository(t);
  const rust = repository.create(input());
  const go = repository.create(input({ topic: 'Go' }));
  assert.throws(() => repository.update('nada', input()), /La ruta no existe/);
  assert.throws(() => repository.update(rust.id, input({ topic: 'Cambiado', stages: [{ id: go.stages[0].id, title: 'Ajena', topics: [] }] })), /La etapa no es válida/);
  assert.throws(() => repository.update(rust.id, input({ stages: [{ id: 'inventada', title: 'X', topics: [] }] })), /La etapa no es válida/);
  assert.deepEqual(repository.list(), [rust, go]);
});

test('una etapa con id no se acepta al crear la ruta', t => {
  const { repository } = openRepository(t);
  assert.throws(() => repository.create(input({ stages: [{ id: 'propia', title: 'X', topics: [] }] })), /La etapa no es válida/);
  assert.deepEqual(repository.list(), []);
});

test('deshace la ruta entera si falla una escritura a mitad', t => {
  const { repository } = openRepository(t, new FakeClock(), () => 'repetido');
  assert.throws(() => repository.create(input()), /UNIQUE/);
  assert.deepEqual(repository.list(), []);
});

test('borrar una ruta borra sus etapas; borrar una inexistente no falla', t => {
  const { repository } = openRepository(t);
  const route = repository.create(input());
  const other = repository.create(input({ topic: 'Go' }));
  repository.delete(route.id);
  repository.delete('nada');
  assert.deepEqual(repository.list(), [other]);
  assert.throws(() => repository.update(route.id, input()), /La ruta no existe/);
  // Las etapas borradas no quedan huérfanas: su id no pertenece a ninguna ruta.
  assert.throws(() => repository.update(other.id, input({ stages: [{ id: route.stages[0].id, title: 'X', topics: [] }] })), /La etapa no es válida/);
});

test('comparte ritmo.db con el repositorio de tareas, cada uno con su conexión', t => {
  const { repository, dbPath } = openRepository(t);
  const tasks = new TaskRepository(dbPath, { newId: sequentialIds() });
  t.after(() => tasks.close());
  tasks.create('Leer', '2026-09-29');
  const route = repository.create(input());
  assert.deepEqual(repository.list(), [route]);
  assert.equal(tasks.listByDay('2026-09-29').length, 1);
});

test('comprueba que una etapa existe y pertenece a la ruta', t => {
  const { repository } = openRepository(t);
  const rust = repository.create(input());
  const go = repository.create(input({ topic: 'Go' }));
  assert.equal(repository.hasStage(rust.id, rust.stages[0].id), true);
  assert.equal(repository.hasStage(go.id, rust.stages[0].id), false);
  assert.equal(repository.hasStage(rust.id, 'inventada'), false);
  repository.delete(rust.id);
  assert.equal(repository.hasStage(rust.id, rust.stages[0].id), false);
});

test('guarda la configuración del agente y la recupera tras reabrir la base', t => {
  const { repository, dbPath } = openRepository(t);
  assert.deepEqual(repository.loadAgentSettings(), DEFAULT_AGENT_SETTINGS);
  const loaded = repository.loadAgentSettings();
  loaded.claude.model = 'cambiado';
  assert.equal(DEFAULT_AGENT_SETTINGS.claude.model, 'haiku', 'devuelve una copia de la configuración por defecto');

  const settings: AgentSettings = { provider: 'codex', claude: { path: '~/.local/bin/claude', model: 'haiku' }, codex: { path: '', model: '' } };
  repository.saveAgentSettings(settings);
  repository.saveAgentSettings({ ...settings, codex: { path: '', model: 'gpt-6-luna' } });
  repository.close();
  const reopened = new StudyRepository(dbPath);
  t.after(() => reopened.close());
  assert.deepEqual(reopened.loadAgentSettings(), { ...settings, codex: { path: '', model: 'gpt-6-luna' } });
});

test('una configuración del agente guardada que no es válida vuelve a la de por defecto', t => {
  const { repository, dbPath } = openRepository(t);
  const db = new DatabaseSync(dbPath);
  t.after(() => db.close());
  for (const value of ['{no es json', JSON.stringify({ provider: 'gemini' })]) {
    db.prepare("INSERT OR REPLACE INTO study_settings (key, value) VALUES ('agent', ?)").run(value);
    assert.deepEqual(repository.loadAgentSettings(), DEFAULT_AGENT_SETTINGS);
  }
});
