import test from 'node:test';
import assert from 'node:assert/strict';
import {
  MAX_PROMPT_TASKS,
  buildAgentPrompt,
  buildAgentRequest,
  proposalsSchema,
  readAgentProposals,
} from '../../../../src/main/study/agent-prompt';
import type { StudyAgentContext, StudyTaskRecord } from '../../../../src/main/study/ports';
import { PublicError } from '../../../../src/shared/ipc';
import { DEFAULT_AGENT_INSTRUCTIONS, MAX_PROPOSALS, type StudyRoute } from '../../../../src/shared/study/contract';
import { FakeStudyAgent } from '../../../helpers/fakes';
import { emptyRouteRoadmap, stage } from '../../../helpers/study';

const route: StudyRoute = {
  id: 'r1',
  topic: 'Rust',
  goal: 'Escribir un servidor HTTP.',
  level: 'intermediate',
  dailyPomodoros: 4, ...emptyRouteRoadmap(),
  stages: [
    stage({ id: 'e1', title: 'Propiedad', topics: ['Préstamos', 'Lifetimes'] }),
    stage({ id: 'e2', title: 'Concurrencia', topics: ['Hilos', 'async'] }),
    stage({ id: 'e3', title: 'Proyecto', topics: [] }),
  ],
  instructions: 'Solo ejercicios de Rustlings.',
  createdAt: '2026-09-01T09:00:00.000Z',
  updatedAt: '2026-09-01T09:00:00.000Z',
};

const task = (title: string, stageId: string, done: boolean, plannedDate = '2026-09-28'): StudyTaskRecord => ({ title, stageId, done, plannedDate });

const context = (patch: Partial<StudyAgentContext> = {}): StudyAgentContext => ({
  route,
  tasks: [task('Leer el capítulo 4', 'e1', true), task('Rustlings: move_semantics', 'e2', false)],
  today: '2026-09-29',
  ...patch,
});

/** Datos de la ruta que el prompt lleva entre `<ruta>` y `</ruta>`. */
function routeData(prompt: string) {
  const match = /<ruta>\n(.*)\n<\/ruta>$/.exec(prompt);
  assert.ok(match, 'el prompt termina con los datos de la ruta');
  return JSON.parse(match[1]);
}

const proposal = { title: 'Implementar un pool de hilos', stageId: 'e2', pomodoros: 3, doneWhen: 'Pasa las pruebas.', reason: 'Sigue a los hilos.' };

test('el prompt incluye el tema, el día, las reglas y las instrucciones del usuario delimitadas', () => {
  const prompt = buildAgentPrompt(context());
  assert.match(prompt, /estudio de «Rust»\. Hoy es 2026-09-29\./);
  assert.match(prompt, new RegExp(`de 1 a ${MAX_PROPOSALS} tareas`));
  assert.match(prompt, /dedica 4 pomodoros/);
  assert.match(prompt, /"stageId"/);
  assert.match(prompt, /No uses herramientas/);
  assert.match(prompt, /<instrucciones>\nSolo ejercicios de Rustlings\.\n<\/instrucciones>/);
  assert.doesNotMatch(prompt, /Propón tareas concretas y verificables/);
});

test('sin instrucciones propias usa las de por defecto', () => {
  const prompt = buildAgentPrompt(context({ route: { ...route, instructions: '' } }));
  assert.ok(prompt.includes(`<instrucciones>\n${DEFAULT_AGENT_INSTRUCTIONS}\n</instrucciones>`));
});

test('los datos de la ruta llevan el avance y las tareas de cada etapa', () => {
  assert.deepEqual(routeData(buildAgentPrompt(context())), {
    topic: 'Rust',
    goal: 'Escribir un servidor HTTP.',
    level: 'intermedio',
    dailyPomodoros: 4,
    currentStageId: 'e2',
    stages: [
      { id: 'e1', title: 'Propiedad', topics: ['Préstamos', 'Lifetimes'], tasksDone: 1, tasksTotal: 1, tasks: [{ title: 'Leer el capítulo 4', plannedDate: '2026-09-28', done: true }] },
      { id: 'e2', title: 'Concurrencia', topics: ['Hilos', 'async'], tasksDone: 0, tasksTotal: 1, tasks: [{ title: 'Rustlings: move_semantics', plannedDate: '2026-09-28', done: false }] },
      { id: 'e3', title: 'Proyecto', topics: [], tasksDone: 0, tasksTotal: 0, tasks: [] },
    ],
  });
});

test('la etapa en curso es la primera sin tareas o con alguna pendiente, o ninguna si todo está hecho', () => {
  assert.equal(routeData(buildAgentPrompt(context({ tasks: [] }))).currentStageId, 'e1');
  const allDone = ['e1', 'e2', 'e3'].map(stageId => task(`Tarea ${stageId}`, stageId, true));
  assert.equal(routeData(buildAgentPrompt(context({ tasks: allDone }))).currentStageId, null);
  const level = routeData(buildAgentPrompt(context({ route: { ...route, level: 'beginner' } }))).level;
  assert.equal(level, 'principiante');
  assert.equal(routeData(buildAgentPrompt(context({ route: { ...route, level: 'advanced' } }))).level, 'avanzado');
});

test('el historial se limita a las tareas más recientes de etapas de la ruta, en orden de día', () => {
  const old = Array.from({ length: MAX_PROMPT_TASKS }, (_, index) => task(`Vieja ${index}`, 'e1', true, '2026-08-01'));
  const tasks = [
    task('Reciente', 'e2', false, '2026-09-30'),
    ...old,
    task('Etapa borrada', 'otra', false, '2026-10-01'),
    task('Intermedia', 'e1', true, '2026-09-15'),
  ];
  const data = routeData(buildAgentPrompt(context({ tasks })));
  const listed = data.stages.flatMap((stage: { tasks: Array<{ title: string }> }) => stage.tasks.map(item => item.title));
  assert.equal(listed.length, MAX_PROMPT_TASKS);
  assert.deepEqual(listed.slice(-2), ['Intermedia', 'Reciente']);
  assert.deepEqual(listed.slice(0, 2), ['Vieja 2', 'Vieja 3']);
  assert.ok(!listed.includes('Etapa borrada'));
  assert.equal(data.stages[0].tasksTotal, MAX_PROMPT_TASKS + 1, 'el avance cuenta todas las tareas');
});

test('el esquema exige todas las propiedades y limita stageId a las etapas de la ruta', () => {
  const schema = proposalsSchema(route);
  const items = schema.properties.proposals.items;
  assert.equal(schema.additionalProperties, false);
  assert.deepEqual(schema.required, ['proposals']);
  assert.equal(schema.properties.proposals.maxItems, MAX_PROPOSALS);
  assert.equal(items.additionalProperties, false);
  assert.deepEqual([...items.required].sort(), Object.keys(items.properties).sort());
  assert.deepEqual(items.properties.stageId.enum, ['e1', 'e2', 'e3']);
  assert.deepEqual(items.properties.pomodoros, { type: 'integer', minimum: 1, maximum: 8 });
  assert.doesNotMatch(JSON.stringify(schema), /maxLength|minLength/);
});

test('buildAgentRequest junta el prompt y el esquema', () => {
  const request = buildAgentRequest(context());
  assert.equal(request.prompt, buildAgentPrompt(context()));
  assert.deepEqual(request.schema, proposalsSchema(route));
});

test('readAgentProposals acepta JSON, texto y un bloque de código', () => {
  const expected = [proposal];
  assert.deepEqual(readAgentProposals({ proposals: [proposal] }, route), expected);
  assert.deepEqual(readAgentProposals(` ${JSON.stringify({ proposals: [proposal] })}\n`, route), expected);
  assert.deepEqual(readAgentProposals('```json\n' + JSON.stringify({ proposals: [proposal] }) + '\n```', route), expected);
  assert.deepEqual(readAgentProposals('```\n' + JSON.stringify({ proposals: [proposal] }) + '\n```', route), expected);
});

test('readAgentProposals rechaza con un error público lo que no cumple el esquema', () => {
  const invalid: unknown[] = [
    'no es JSON',
    '',
    '```json\n{"proposals": [}\n```',
    { proposals: [{ ...proposal, stageId: 'otra' }] },
    { proposals: [{ ...proposal, pomodoros: 9 }] },
    { proposals: [] },
    null,
  ];
  for (const output of invalid) {
    assert.throws(() => readAgentProposals(output, route), (error: Error) => {
      assert.ok(error instanceof PublicError);
      assert.equal(error.message, 'El agente devolvió una respuesta que no se puede usar.');
      return true;
    });
  }
});

test('FakeStudyAgent registra la petición y valida la salida como un adaptador', async () => {
  const agent = new FakeStudyAgent();
  agent.respondWith(JSON.stringify({ proposals: [proposal] }));
  assert.deepEqual(await agent.propose(context()), [proposal]);
  assert.equal(agent.requests.length, 1);
  assert.deepEqual(agent.requests[0], { ...buildAgentRequest(context()), context: context() });

  agent.respondWith({ proposals: [{ ...proposal, stageId: 'otra' }] });
  await assert.rejects(agent.propose(context()), /respuesta que no se puede usar/);

  agent.failNext();
  await assert.rejects(agent.propose(context()), /No se pudo lanzar el agente/);
});

test('FakeStudyAgent puede quedarse esperando hasta que se cancela', async () => {
  const agent = new FakeStudyAgent();
  agent.hang();
  const controller = new AbortController();
  const pending = agent.propose(context(), { signal: controller.signal });
  controller.abort();
  await assert.rejects(pending, /Se canceló la petición al agente/);
});
