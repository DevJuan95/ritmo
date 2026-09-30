import test from 'node:test';
import assert from 'node:assert/strict';
import { createHarness } from '../../../helpers/harness';
import { stage } from '../../../helpers/study';

const input = { topic: '  Sistemas   distribuidos ', goal: ' Entender Raft. ', level: 'advanced', dailyPomodoros: 3, stages: [stage({ title: 'Consenso', topics: ['Raft', 'Raft'] })], instructions: '' };

test('valida y normaliza la ruta antes de guardarla', t => {
  const { study } = createHarness(t);
  const route = study.create(input);
  assert.equal(route.topic, 'Sistemas distribuidos');
  assert.equal(route.goal, 'Entender Raft.');
  assert.deepEqual(route.stages, [stage({ id: 'study-2', title: 'Consenso', topics: ['Raft'] })]);
  assert.deepEqual(study.list(), [route]);
});

test('rechaza entradas inválidas sin guardar nada', t => {
  const { study } = createHarness(t);
  assert.throws(() => study.create(null), /La ruta no es válida/);
  assert.throws(() => study.create({ ...input, level: 'experto' }), /nivel válido/);
  const route = study.create(input);
  assert.throws(() => study.update(route.id, { ...input, dailyPomodoros: 0 }), /pomodoros por día/);
  assert.throws(() => study.update('', input), /La ruta no es válida/);
  assert.throws(() => study.update('otra', input), /La ruta no existe/);
  assert.throws(() => study.remove({ id: route.id }), /La ruta no es válida/);
  assert.deepEqual(study.list(), [route]);
});

test('edita y borra una ruta por su id', t => {
  const { study, clock } = createHarness(t);
  const route = study.create(input);
  clock.advanceMinutes(1);
  const updated = study.update(route.id, { ...input, stages: [...route.stages, stage({ title: 'Replicación', topics: [] })] });
  assert.deepEqual(updated.stages.map(stage => stage.title), ['Consenso', 'Replicación']);
  assert.equal(updated.stages[0].id, route.stages[0].id);
  assert.notEqual(updated.updatedAt, route.updatedAt);
  study.remove(route.id);
  assert.deepEqual(study.list(), []);
});

test('el avance viene de las tareas vinculadas a cada etapa', t => {
  const { study, tasks, store } = createHarness(t);
  const route = study.create({ ...input, stages: [stage({ title: 'Consenso', topics: [] }), stage({ title: 'Replicación', topics: [] })] });
  const [consensus, replication] = route.stages;
  assert.deepEqual(study.progress(), {});
  tasks.add('Leer el paper de Raft', undefined, { routeId: route.id, stageId: consensus.id });
  tasks.add('Implementar el log', '2026-10-01', { routeId: route.id, stageId: consensus.id });
  tasks.add('Leer sobre quórums', undefined, { routeId: route.id, stageId: replication.id });
  tasks.toggle(store.state.tasks[0].id);
  assert.deepEqual(study.progress(), { [consensus.id]: { total: 2, done: 1 }, [replication.id]: { total: 1, done: 0 } });
});

test('quitar una etapa deja sus tareas en el Planner, sin vincular, y borrar la ruta borra sus tareas', t => {
  const { study, tasks, store, repository } = createHarness(t);
  const route = study.create({ ...input, stages: [stage({ title: 'Consenso', topics: [] }), stage({ title: 'Replicación', topics: [] })] });
  const other = study.create({ ...input, topic: 'Go' });
  const [consensus, replication] = route.stages;
  tasks.add('Raft', undefined, { routeId: route.id, stageId: consensus.id });
  tasks.add('Quórums', undefined, { routeId: route.id, stageId: replication.id });
  tasks.add('Goroutines', undefined, { routeId: other.id, stageId: other.stages[0].id });
  tasks.add('Logs', '2026-10-02', { routeId: route.id, stageId: consensus.id });
  tasks.add('Suelta', undefined);

  study.update(route.id, { ...input, stages: [consensus] });
  const links = () => store.state.tasks.map(task => [task.title, task.stageId]);
  assert.deepEqual(links(), [['Raft', consensus.id], ['Quórums', null], ['Goroutines', other.stages[0].id], ['Suelta', null]]);

  // La tarea que ya no está vinculada (Quórums) no es de la ruta: se conserva.
  study.remove(route.id);
  assert.deepEqual(links(), [['Quórums', null], ['Goroutines', other.stages[0].id], ['Suelta', null]]);
  assert.deepEqual(repository.listByDay('2026-10-02'), []);
  assert.deepEqual(study.progress(), { [other.stages[0].id]: { total: 1, done: 0 } });
});
