import test from 'node:test';
import assert from 'node:assert/strict';
import { createHarness } from '../../../helpers/harness';

const input = { topic: '  Sistemas   distribuidos ', goal: ' Entender Raft. ', level: 'advanced', dailyPomodoros: 3, stages: [{ title: 'Consenso', topics: ['Raft', 'Raft'] }], instructions: '' };

test('valida y normaliza la ruta antes de guardarla', t => {
  const { study } = createHarness(t);
  const route = study.create(input);
  assert.equal(route.topic, 'Sistemas distribuidos');
  assert.equal(route.goal, 'Entender Raft.');
  assert.deepEqual(route.stages, [{ id: 'study-2', title: 'Consenso', topics: ['Raft'] }]);
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
  const updated = study.update(route.id, { ...input, stages: [...route.stages, { title: 'Replicación', topics: [] }] });
  assert.deepEqual(updated.stages.map(stage => stage.title), ['Consenso', 'Replicación']);
  assert.equal(updated.stages[0].id, route.stages[0].id);
  assert.notEqual(updated.updatedAt, route.updatedAt);
  study.remove(route.id);
  assert.deepEqual(study.list(), []);
});
