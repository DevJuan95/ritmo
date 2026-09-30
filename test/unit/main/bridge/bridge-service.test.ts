import test, { type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { MAX_BRIDGE_RESPONSE, MAX_BRIDGE_TASKS } from '../../../../src/shared/bridge/contract';
import {
  MAX_DEPRIORITIZED_PER_STAGE, MAX_RESOURCES_PER_STAGE, MAX_ROADMAP_TEXT, MAX_STAGE_TEXT, MAX_STAGES, MAX_TOPICS_PER_STAGE
} from '../../../../src/shared/study/contract';
import { MAX_TASK_TITLE } from '../../../../src/shared/tasks/contract';
import { createHarness } from '../../../helpers/harness';
import { stage } from '../../../helpers/study';

const rustRoute = {
  topic: 'Rust', goal: 'Escribir una CLI.', level: 'beginner', dailyPomodoros: 3,
  approach: 'Práctica antes que teoría.', finalProject: 'Una CLI publicada.', studyRules: 'Un ejercicio al día.',
  stages: [
    stage({
      title: 'Ownership', summary: 'El modelo de memoria.', topics: ['Borrowing'], deprioritized: ['Unsafe'],
      project: 'Un parser de argumentos.', resources: ['The Rust Book']
    }),
    stage({ title: 'Traits', topics: [] })
  ],
  instructions: 'En español.'
};

function setup(t: TestContext) {
  const harness = createHarness(t);
  const route = harness.study.create(rustRoute);
  return { ...harness, route, stages: route.stages.map(stage => stage.id) };
}

test('start abre el socket en los datos de la app y stop lo cierra', async t => {
  const { bridge, bridgeServer, directory } = setup(t);
  await bridge.start();
  assert.equal(bridgeServer.socketPath, path.join(directory, 'ritmo.sock'));
  assert.deepEqual(bridgeServer.handler!({ op: 'list-routes' }), bridge.handle({ op: 'list-routes' }));
  await bridge.stop();
  assert.equal(bridgeServer.listening, false);
});

test('lista las rutas con sus etapas y el avance de sus tareas', t => {
  const { bridge, route, stages, tasks, store, study } = setup(t);
  const other = study.create({ ...rustRoute, topic: 'Go', stages: [stage({ title: 'Sintaxis', topics: [] })] });
  tasks.add('Leer el capítulo 4', store.today(), { routeId: route.id, stageId: stages[0] });
  tasks.add('Ejercicios', store.today(), { routeId: route.id, stageId: stages[1] });
  tasks.toggle(store.state.tasks[0].id);
  tasks.add('Tarea suelta', store.today());
  assert.deepEqual(bridge.handle({ op: 'list-routes' }), [
    { id: route.id, topic: 'Rust', goal: 'Escribir una CLI.', level: 'beginner', stages: 2, progress: { total: 2, done: 1 } },
    { id: other.id, topic: 'Go', goal: 'Escribir una CLI.', level: 'beginner', stages: 1, progress: { total: 0, done: 0 } }
  ]);
});

test('lee una ruta con el avance de cada etapa y sus tareas más recientes', t => {
  const { bridge, route, stages, tasks, store } = setup(t);
  tasks.add('Leer el capítulo 4', '2026-01-02', { routeId: route.id, stageId: stages[0] });
  tasks.add('Resumen', '2026-01-01', { routeId: route.id, stageId: stages[0] });
  const today = store.today();
  assert.deepEqual(bridge.handle({ op: 'get-route', routeId: route.id }), {
    id: route.id, topic: 'Rust', goal: 'Escribir una CLI.', level: 'beginner', dailyPomodoros: 3,
    approach: 'Práctica antes que teoría.', finalProject: 'Una CLI publicada.', studyRules: 'Un ejercicio al día.',
    instructions: 'En español.', today,
    stages: [
      {
        id: stages[0], title: 'Ownership', summary: 'El modelo de memoria.', topics: ['Borrowing'], deprioritized: ['Unsafe'],
        project: 'Un parser de argumentos.', resources: ['The Rust Book'], progress: { total: 2, done: 0 }
      },
      { ...stage({ id: stages[1], title: 'Traits' }), progress: { total: 0, done: 0 } }
    ],
    tasks: [
      { title: 'Resumen', stageId: stages[0], done: false, plannedDate: '2026-01-01' },
      { title: 'Leer el capítulo 4', stageId: stages[0], done: false, plannedDate: '2026-01-02' }
    ],
    totalTasks: 2
  });
});

test('devuelve como máximo las tareas más recientes, pero cuenta todas en el avance', t => {
  const { bridge, route, stages, repository } = setup(t);
  for (let day = 1; day <= MAX_BRIDGE_TASKS + 5; day++) {
    const date = new Date(Date.UTC(2026, 0, day)).toISOString().slice(0, 10);
    repository.create(`Tarea ${day}`, date, { routeId: route.id, stageId: stages[1] });
  }
  const detail = bridge.handle({ op: 'get-route', routeId: route.id }) as { tasks: Array<{ title: string }>; totalTasks: number; stages: Array<{ progress: unknown }> };
  assert.equal(detail.tasks.length, MAX_BRIDGE_TASKS);
  assert.equal(detail.tasks[0].title, 'Tarea 6');
  assert.equal(detail.tasks.at(-1)!.title, `Tarea ${MAX_BRIDGE_TASKS + 5}`);
  assert.equal(detail.totalTasks, MAX_BRIDGE_TASKS + 5);
  assert.deepEqual(detail.stages[1].progress, { total: MAX_BRIDGE_TASKS + 5, done: 0 });
});

test('crea una tarea vinculada hoy o en el día pedido y actualiza las de hoy', t => {
  const { bridge, route, stages, store, published, repository } = setup(t);
  const today = store.today();
  assert.deepEqual(
    bridge.handle({ op: 'add-task', routeId: route.id, stageId: stages[0], title: ' Leer  el capítulo 4 ' }),
    { title: 'Leer el capítulo 4', plannedDate: today, routeId: route.id, stageId: stages[0] }
  );
  assert.deepEqual(store.state.tasks.map(task => [task.title, task.routeId, task.stageId]), [['Leer el capítulo 4', route.id, stages[0]]]);
  assert.equal(published.at(-1)!.tasks.length, 1, 'la ventana abierta ve la tarea nueva');
  const version = published.at(-1)!.tasksVersion;
  assert.deepEqual(
    bridge.handle({ op: 'add-task', routeId: route.id, stageId: stages[1], title: 'Traits', date: '2030-05-01' }),
    { title: 'Traits', plannedDate: '2030-05-01', routeId: route.id, stageId: stages[1] }
  );
  assert.deepEqual(repository.listByDay('2030-05-01').map(task => task.stageId), [stages[1]]);
  assert.equal(published.at(-1)!.tasks.length, 1, 'la tarea de otro día no entra en las de hoy');
  assert.equal(published.at(-1)!.tasksVersion, version + 1, 'pero la ventana abierta sabe que debe recargar el Planner y el avance');
});

test('rechaza rutas y etapas que no existen y peticiones inválidas sin crear nada', t => {
  const { bridge, route, stages, study, repository, store } = setup(t);
  const other = study.create({ ...rustRoute, topic: 'Go' });
  assert.throws(() => bridge.handle({ op: 'get-route', routeId: 'nada' }), /no existe/);
  assert.throws(() => bridge.handle({ op: 'add-task', routeId: route.id, stageId: other.stages[0].id, title: 'Leer' }), /La etapa ya no existe/);
  assert.throws(() => bridge.handle({ op: 'add-task', routeId: 'nada', stageId: stages[0], title: 'Leer' }), /La etapa ya no existe/);
  assert.throws(() => bridge.handle({ op: 'delete-task', id: 'x' }), /Petición inválida/);
  assert.deepEqual(repository.listByDay(store.today()), []);
});

test('la ruta más grande que se puede guardar cabe en una respuesta del puente', t => {
  const { bridge, study, tasks, store } = setup(t);
  // Un carácter de control ocupa 6 bytes en JSON (`\u0001`), el peor caso por carácter.
  const text = (length: number, prefix = '') => `${prefix}x`.padEnd(length, '\u0001');
  const list = (count: number, length: number) => Array.from({ length: count }, (_, index) => text(length, String(index)));
  const route = study.create({
    topic: text(80), goal: text(500), level: 'advanced', dailyPomodoros: 16,
    approach: text(MAX_ROADMAP_TEXT), finalProject: text(MAX_ROADMAP_TEXT), studyRules: text(MAX_ROADMAP_TEXT),
    instructions: text(2000),
    stages: Array.from({ length: MAX_STAGES }, (_, index) => ({
      title: text(120, String(index)), summary: text(MAX_STAGE_TEXT), topics: list(MAX_TOPICS_PER_STAGE, 80),
      deprioritized: list(MAX_DEPRIORITIZED_PER_STAGE, 120), project: text(MAX_STAGE_TEXT),
      resources: list(MAX_RESOURCES_PER_STAGE, 200)
    }))
  });
  for (let index = 0; index < MAX_BRIDGE_TASKS; index++) {
    tasks.add(text(MAX_TASK_TITLE, String(index)), store.today(), { routeId: route.id, stageId: route.stages[0].id });
  }
  const response = `${JSON.stringify({ ok: true, value: bridge.handle({ op: 'get-route', routeId: route.id }) })}\n`;
  assert.ok(Buffer.byteLength(response) > 256 * 1024);
  assert.ok(Buffer.byteLength(response) <= MAX_BRIDGE_RESPONSE, `${Buffer.byteLength(response)} bytes`);
});
