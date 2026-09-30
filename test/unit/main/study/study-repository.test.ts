import test, { type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { DEFAULT_AGENT_SETTINGS, type AgentSettings, type StudyRouteInput } from '../../../../src/shared/study/contract';
import { StudyRepository } from '../../../../src/main/study/study-repository';
import { TaskRepository } from '../../../../src/main/tasks/task-repository';
import { FakeClock, sequentialIds } from '../../../helpers/fakes';
import { tempDir } from '../../../helpers/temp';
import { emptyRouteRoadmap, stage } from '../../../helpers/study';

function openRepository(t: TestContext, clock = new FakeClock(), newId = sequentialIds('id')) {
  const dbPath = path.join(tempDir(t), 'datos', 'ritmo.db');
  const repository = new StudyRepository(dbPath, { now: clock.now, newId });
  t.after(() => repository.close());
  return { repository, dbPath, clock };
}

const input = (patch: Partial<StudyRouteInput> = {}): StudyRouteInput => ({
  topic: 'Rust', goal: 'Escribir una CLI.', level: 'beginner', dailyPomodoros: 4, ...emptyRouteRoadmap(),
  stages: [stage({ title: 'Ownership', topics: ['Move', 'Borrowing'] }), stage({ title: 'Traits', topics: [] })],
  instructions: 'En español.', ...patch
});

test('crea una ruta con sus etapas en orden y la recupera tras reabrir la base', t => {
  const { repository, dbPath, clock } = openRepository(t);
  const at = new Date(clock.now()).toISOString();
  const route = repository.create(input());
  assert.deepEqual(route, {
    id: 'id-1', topic: 'Rust', goal: 'Escribir una CLI.', level: 'beginner', dailyPomodoros: 4, ...emptyRouteRoadmap(),
    stages: [stage({ id: 'id-2', title: 'Ownership', topics: ['Move', 'Borrowing'] }), stage({ id: 'id-3', title: 'Traits', topics: [] })],
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
  const second = repository.create(input({ topic: 'Go', stages: [stage({ title: 'Goroutines', topics: [] })] }));
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
    stages: [stage({ id: traits.id, title: 'Traits y genéricos', topics: ['dyn'] }), stage({ title: 'Async', topics: [] })]
  }));
  assert.deepEqual(updated, {
    ...route, topic: 'Rust avanzado', level: 'intermediate', dailyPomodoros: 6, goal: '', instructions: '',
    stages: [stage({ id: traits.id, title: 'Traits y genéricos', topics: ['dyn'] }), stage({ id: 'id-4', title: 'Async', topics: [] })],
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
  assert.throws(() => repository.update(rust.id, input({ topic: 'Cambiado', stages: [stage({ id: go.stages[0].id, title: 'Ajena', topics: [] })] })), /La etapa no es válida/);
  assert.throws(() => repository.update(rust.id, input({ stages: [stage({ id: 'inventada', title: 'X', topics: [] })] })), /La etapa no es válida/);
  assert.deepEqual(repository.list(), [rust, go]);
});

test('una etapa con id no se acepta al crear la ruta', t => {
  const { repository } = openRepository(t);
  assert.throws(() => repository.create(input({ stages: [stage({ id: 'propia', title: 'X', topics: [] })] })), /La etapa no es válida/);
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
  assert.throws(() => repository.update(other.id, input({ stages: [stage({ id: route.stages[0].id, title: 'X', topics: [] })] })), /La etapa no es válida/);
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

test('lee una ruta guardada por su id y falla si no existe', t => {
  const { repository } = openRepository(t);
  const route = repository.create(input());
  assert.deepEqual(repository.get(route.id), route);
  assert.throws(() => repository.get('otra'), /La ruta no existe/);
});

test('guarda los avisos de privacidad aceptados y los recupera tras reabrir la base', t => {
  const { repository, dbPath } = openRepository(t);
  assert.deepEqual(repository.loadAgentNotices(), []);
  repository.saveAgentNotices(['codex']);
  repository.saveAgentNotices(['claude', 'codex']);
  repository.close();
  const reopened = new StudyRepository(dbPath);
  t.after(() => reopened.close());
  assert.deepEqual(reopened.loadAgentNotices(), ['claude', 'codex']);
});

test('unos avisos guardados que no se pueden leer cuentan como ninguno aceptado', t => {
  const { repository, dbPath } = openRepository(t);
  const db = new DatabaseSync(dbPath);
  t.after(() => db.close());
  const cases: Array<[string, string[]]> = [['{no es json', []], ['"claude"', []], [JSON.stringify(['gemini', 'codex', 'codex']), ['codex']]];
  for (const [value, expected] of cases) {
    db.prepare("INSERT OR REPLACE INTO study_settings (key, value) VALUES ('agent-notices', ?)").run(value);
    assert.deepEqual(repository.loadAgentNotices(), expected);
  }
});

const roadmap = (): StudyRouteInput => input({
  approach: '60-70 % sistemas distribuidos,\n30-40 % Java.', finalProject: 'Un servicio de pagos con colas.', studyRules: 'Java y sistemas en paralelo.',
  stages: [
    stage({
      title: 'Fundamentos', summary: 'Bases del sistema.', topics: ['Replicación', 'Particiones'], deprioritized: ['Kubernetes'],
      project: 'Un almacén clave-valor.', resources: ['DDIA', 'Curso de MIT 6.824']
    }),
    stage({ title: 'Traits', topics: [] })
  ]
});

test('guarda y lee los campos del roadmap de la ruta y de cada etapa al crear, editar, leer y listar', t => {
  const { repository, dbPath, clock } = openRepository(t);
  const at = new Date(clock.now()).toISOString();
  const created = repository.create(roadmap());
  const [first, second] = roadmap().stages;
  assert.deepEqual(created, {
    ...roadmap(), id: 'id-1', stages: [{ ...first, id: 'id-2' }, { ...second, id: 'id-3' }], createdAt: at, updatedAt: at
  });
  assert.deepEqual(repository.get(created.id), created);
  assert.deepEqual(repository.list(), [created]);

  const [fundamentals] = created.stages;
  const updated = repository.update(created.id, input({
    approach: 'Solo Java.', finalProject: '', studyRules: 'Una hora al día.',
    stages: [stage({ ...fundamentals, summary: 'Otro resumen.', deprioritized: [], project: '', resources: ['DDIA'] })]
  }));
  assert.equal(updated.approach, 'Solo Java.');
  assert.equal(updated.finalProject, '');
  assert.equal(updated.studyRules, 'Una hora al día.');
  assert.deepEqual(updated.stages, [{ ...fundamentals, summary: 'Otro resumen.', deprioritized: [], project: '', resources: ['DDIA'] }]);

  repository.close();
  const reopened = new StudyRepository(dbPath);
  t.after(() => reopened.close());
  assert.deepEqual(reopened.list(), [updated]);
});

test('abre una base con el esquema anterior al roadmap y conserva sus rutas con los campos nuevos vacíos', t => {
  const dbPath = path.join(tempDir(t), 'ritmo.db');
  const old = new DatabaseSync(dbPath);
  old.exec(`
    CREATE TABLE study_routes (
      id TEXT PRIMARY KEY, topic TEXT NOT NULL, goal TEXT NOT NULL, level TEXT NOT NULL, daily_pomodoros INTEGER NOT NULL,
      instructions TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
    );
    CREATE TABLE study_stages (
      id TEXT PRIMARY KEY, route_id TEXT NOT NULL REFERENCES study_routes(id) ON DELETE CASCADE,
      position INTEGER NOT NULL, title TEXT NOT NULL, topics TEXT NOT NULL
    );
    INSERT INTO study_routes VALUES ('r1', 'Rust', 'Escribir una CLI.', 'beginner', 4, 'En español.', '2026-01-01T00:00:00.000Z', '2026-01-02T00:00:00.000Z');
    INSERT INTO study_stages VALUES ('s2', 'r1', 1, 'Traits', '[]');
    INSERT INTO study_stages VALUES ('s1', 'r1', 0, 'Ownership', '["Move","Borrowing"]');
  `);
  old.close();

  const expected = {
    id: 'r1', topic: 'Rust', goal: 'Escribir una CLI.', level: 'beginner', dailyPomodoros: 4, ...emptyRouteRoadmap(),
    stages: [stage({ id: 's1', title: 'Ownership', topics: ['Move', 'Borrowing'] }), stage({ id: 's2', title: 'Traits', topics: [] })],
    instructions: 'En español.', createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-02T00:00:00.000Z'
  };
  const repository = new StudyRepository(dbPath, { newId: sequentialIds('id') });
  assert.deepEqual(repository.list(), [expected]);
  const updated = repository.update('r1', { ...roadmap(), stages: [stage({ id: 's1', title: 'Ownership', resources: ['The Book'] })] });
  repository.close();

  // Abrirla otra vez no vuelve a añadir las columnas ni pierde nada.
  const reopened = new StudyRepository(dbPath);
  t.after(() => reopened.close());
  assert.deepEqual(reopened.list(), [updated]);
  assert.deepEqual(updated.stages[0].resources, ['The Book']);
  assert.equal(updated.approach, roadmap().approach);
});
