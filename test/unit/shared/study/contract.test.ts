import test from 'node:test';
import assert from 'node:assert/strict';
import {
  AGENT_MODEL_PATTERN,
  DEFAULT_AGENT_INSTRUCTIONS,
  DEFAULT_AGENT_SETTINGS,
  INVALID_AGENT_RESPONSE,
  MAX_AGENT_PATH,
  MAX_DEPRIORITIZED_PER_STAGE,
  MAX_RESOURCES_PER_STAGE,
  MAX_ROADMAP_BRIEF,
  MAX_ROADMAP_TEXT,
  MAX_STAGE_TEXT,
  safeAgentSettings,
  safeRoadmapBrief,
  safeRoadmapDraft,
  MAX_PROPOSALS,
  MAX_STAGES,
  MAX_TOPICS_PER_STAGE,
  safeStudyLevel,
  safeStudyProvider,
  safeStudyRoute,
  safeStudyRouteId,
  safeStudyStage,
  safeTaskProposals,
} from '../../../../src/shared/study/contract';
import { emptyRouteRoadmap, stage } from '../../../helpers/study';

const route = (patch: Record<string, unknown> = {}) => ({
  topic: 'Rust',
  goal: 'Escribir una CLI propia.',
  level: 'beginner',
  dailyPomodoros: 4,
  stages: [{ title: 'Ownership', topics: ['Move', 'Borrowing'] }],
  instructions: DEFAULT_AGENT_INSTRUCTIONS,
  ...patch,
});

test('acepta solo los proveedores y niveles conocidos', () => {
  assert.equal(safeStudyProvider('claude'), 'claude');
  assert.equal(safeStudyProvider('codex'), 'codex');
  for (const value of ['gpt', '', undefined]) assert.throws(() => safeStudyProvider(value), /Claude Code o Codex/);
  for (const level of ['beginner', 'intermediate', 'advanced']) assert.equal(safeStudyLevel(level), level);
  for (const value of ['experto', undefined]) assert.throws(() => safeStudyLevel(value), /nivel válido/);
});

test('normaliza las etapas y sus temas', () => {
  assert.deepEqual(safeStudyStage({ title: '  Tipos   y traits ', topics: [' Traits ', 'Traits', 'Genéricos'] }), stage({
    title: 'Tipos y traits',
    topics: ['Traits', 'Genéricos'],
  }));
  assert.deepEqual(safeStudyStage({ id: 'e1', title: 'Async', topics: [] }), stage({ id: 'e1', title: 'Async', topics: [] }));
});

test('normaliza el roadmap de una etapa y lo deja vacío si falta', () => {
  assert.deepEqual(safeStudyStage({
    title: 'Fundamentos',
    summary: '  Entender el modelo de datos.\r\nY la replicación. ',
    topics: ['Replicación'],
    deprioritized: [' Kubernetes ', 'Kubernetes', 'Service   mesh'],
    project: ' Un log replicado. ',
    resources: ['Designing Data-Intensive Applications, Kleppmann', ' MIT 6.824 '],
  }), {
    title: 'Fundamentos',
    summary: 'Entender el modelo de datos.\nY la replicación.',
    topics: ['Replicación'],
    deprioritized: ['Kubernetes', 'Service mesh'],
    project: 'Un log replicado.',
    resources: ['Designing Data-Intensive Applications, Kleppmann', 'MIT 6.824'],
  });
  const empty = { summary: null, deprioritized: null, project: null, resources: null };
  assert.deepEqual(safeStudyStage({ title: 'Async', topics: [], ...empty }), stage({ title: 'Async' }));
});

test('rechaza un roadmap de etapa inválido', () => {
  const base = { title: 'Async', topics: [] };
  assert.throws(() => safeStudyStage({ ...base, summary: 'a'.repeat(MAX_STAGE_TEXT + 1) }), /resumen de cada etapa admite hasta 1000/);
  assert.throws(() => safeStudyStage({ ...base, summary: 3 }), /resumen de cada etapa/);
  assert.throws(() => safeStudyStage({ ...base, project: 'a'.repeat(MAX_STAGE_TEXT + 1) }), /proyecto de cada etapa admite hasta 1000/);
  assert.throws(() => safeStudyStage({ ...base, deprioritized: 'Kubernetes' }), /hasta 20 temas que no priorizar/);
  assert.throws(() => safeStudyStage({ ...base, deprioritized: Array(MAX_DEPRIORITIZED_PER_STAGE + 1).fill('t') }), /hasta 20 temas que no priorizar/);
  assert.throws(() => safeStudyStage({ ...base, deprioritized: [' '] }), /tema que no priorizar debe tener de 1 a 120/);
  assert.throws(() => safeStudyStage({ ...base, deprioritized: ['a'.repeat(121)] }), /tema que no priorizar/);
  assert.throws(() => safeStudyStage({ ...base, resources: {} }), /hasta 20 recursos/);
  assert.throws(() => safeStudyStage({ ...base, resources: Array(MAX_RESOURCES_PER_STAGE + 1).fill('r') }), /hasta 20 recursos/);
  assert.throws(() => safeStudyStage({ ...base, resources: ['a'.repeat(201)] }), /recurso debe tener de 1 a 200/);
  assert.throws(() => safeStudyStage({ ...base, resources: [7] }), /recurso debe tener/);
});

test('rechaza etapas inválidas', () => {
  for (const value of [null, 'etapa', [], { title: 'Async' }, { title: 'Async', topics: 'tokio' }]) {
    assert.throws(() => safeStudyStage(value));
  }
  assert.throws(() => safeStudyStage({ title: ' ', topics: [] }), /título de 1 a 120/);
  assert.throws(() => safeStudyStage({ title: 7, topics: [] }), /título de 1 a 120/);
  assert.throws(() => safeStudyStage({ title: null, topics: [] }), /título de 1 a 120/);
  assert.throws(() => safeStudyStage({ title: 'a'.repeat(121), topics: [] }), /título de 1 a 120/);
  assert.throws(() => safeStudyStage({ title: 'Async', topics: Array(MAX_TOPICS_PER_STAGE + 1).fill('t') }), /hasta 20 temas/);
  assert.throws(() => safeStudyStage({ title: 'Async', topics: ['a'.repeat(81)] }), /tema debe tener/);
  assert.throws(() => safeStudyStage({ id: '', title: 'Async', topics: [] }), /etapa no es válida/);
});

test('valida una ruta completa', () => {
  const valid = safeStudyRoute(route({ goal: '  Línea 1\r\nLínea 2  ', instructions: undefined }));
  assert.equal(valid.topic, 'Rust');
  assert.equal(valid.goal, 'Línea 1\nLínea 2');
  assert.equal(valid.instructions, '');
  assert.equal(valid.level, 'beginner');
  assert.equal(valid.dailyPomodoros, 4);
  assert.deepEqual(valid.stages, [stage({ title: 'Ownership', topics: ['Move', 'Borrowing'] })]);
  assert.equal(safeStudyRoute(route({ goal: null })).goal, '');
});

test('una ruta sin roadmap sigue siendo válida, con sus campos vacíos', () => {
  const valid = safeStudyRoute(route());
  assert.deepEqual({ approach: valid.approach, finalProject: valid.finalProject, studyRules: valid.studyRules }, emptyRouteRoadmap());
  const roadmap = safeStudyRoute(route({
    approach: ' 60-70 % sistemas distribuidos,\r\n30-40 % Java. ',
    finalProject: ' Un almacén clave-valor replicado. ',
    studyRules: ' Aprender Java y sistemas en paralelo. ',
  }));
  assert.equal(roadmap.approach, '60-70 % sistemas distribuidos,\n30-40 % Java.');
  assert.equal(roadmap.finalProject, 'Un almacén clave-valor replicado.');
  assert.equal(roadmap.studyRules, 'Aprender Java y sistemas en paralelo.');
});

test('rechaza un roadmap de ruta demasiado largo o que no es texto', () => {
  const long = 'a'.repeat(MAX_ROADMAP_TEXT + 1);
  assert.throws(() => safeStudyRoute(route({ approach: long })), /enfoque admite hasta 2000/);
  assert.throws(() => safeStudyRoute(route({ finalProject: long })), /proyecto final admite hasta 2000/);
  assert.throws(() => safeStudyRoute(route({ studyRules: long })), /reglas de estudio admiten hasta 2000/);
  assert.throws(() => safeStudyRoute(route({ approach: ['Java'] })), /enfoque admite/);
});

test('valida el brief de un roadmap', () => {
  assert.equal(safeRoadmapBrief('  Senior Backend → Tech Lead\r\n2 h al día  '), 'Senior Backend → Tech Lead\n2 h al día');
  assert.equal(safeRoadmapBrief('a'.repeat(MAX_ROADMAP_BRIEF)).length, MAX_ROADMAP_BRIEF);
  for (const value of ['', '   ', undefined, null, 42, 'a'.repeat(MAX_ROADMAP_BRIEF + 1)]) {
    assert.throws(() => safeRoadmapBrief(value), /Describe qué quieres estudiar en 1 a 4000 caracteres/);
  }
});

test('valida el roadmap del agente como una ruta sin ids', () => {
  const draft = {
    ...route({ approach: 'Sistemas distribuidos primero.', finalProject: 'Un almacén replicado.', studyRules: 'Una hora de teoría, una de práctica.' }),
    stages: [{ title: ' Fundamentos ', summary: 'Modelo de datos.', topics: ['Replicación'], deprioritized: ['Kubernetes'], project: 'Un log.', resources: ['DDIA'] }],
  };
  assert.deepEqual(safeRoadmapDraft(draft), {
    topic: 'Rust', goal: 'Escribir una CLI propia.', level: 'beginner', dailyPomodoros: 4,
    approach: 'Sistemas distribuidos primero.', finalProject: 'Un almacén replicado.', studyRules: 'Una hora de teoría, una de práctica.',
    instructions: DEFAULT_AGENT_INSTRUCTIONS,
    stages: [{ title: 'Fundamentos', summary: 'Modelo de datos.', topics: ['Replicación'], deprioritized: ['Kubernetes'], project: 'Un log.', resources: ['DDIA'] }],
  });
  assert.deepEqual(safeRoadmapDraft(route()).stages, [stage({ title: 'Ownership', topics: ['Move', 'Borrowing'] })]);

  const invalid = [
    null,
    'roadmap',
    route({ stages: [] }),
    route({ topic: '' }),
    route({ approach: 'a'.repeat(MAX_ROADMAP_TEXT + 1) }),
    route({ stages: [{ title: 'Async', topics: [], resources: ['a'.repeat(201)] }] }),
    route({ stages: [{ id: 'e1', title: 'Async', topics: [] }] }),
  ];
  for (const value of invalid) assert.throws(() => safeRoadmapDraft(value), { message: INVALID_AGENT_RESPONSE });
});

test('rechaza rutas inválidas', () => {
  for (const value of [undefined, null, 'Rust', [route()]]) assert.throws(() => safeStudyRoute(value), /ruta no es válida/);
  for (const stages of [undefined, [], Array(MAX_STAGES + 1).fill({ title: 'E', topics: [] })]) {
    assert.throws(() => safeStudyRoute(route({ stages })), /de 1 a 30 etapas/);
  }
  const repeated = [{ id: 'e1', title: 'A', topics: [] }, { id: 'e1', title: 'B', topics: [] }];
  assert.throws(() => safeStudyRoute(route({ stages: repeated })), /etapas repetidas/);
  assert.throws(() => safeStudyRoute(route({ topic: '' })), /tema debe tener/);
  assert.throws(() => safeStudyRoute(route({ goal: 'a'.repeat(501) })), /objetivo admite/);
  assert.throws(() => safeStudyRoute(route({ goal: 3 })), /objetivo admite/);
  assert.throws(() => safeStudyRoute(route({ instructions: 'a'.repeat(2001) })), /instrucciones admiten/);
  for (const dailyPomodoros of [0, 17, 2.5, '4']) {
    assert.throws(() => safeStudyRoute(route({ dailyPomodoros })), /pomodoros por día/);
  }
});

test('valida las propuestas del agente contra las etapas de la ruta', () => {
  const stageIds = new Set(['e1', 'e2']);
  const proposal = { title: ' Leer  el capítulo 4 ', stageId: 'e1', pomodoros: 2, doneWhen: 'Resuelves los ejercicios.', reason: 'Base del resto.' };
  assert.deepEqual(safeTaskProposals({ proposals: [proposal, { title: 'Proyecto', stageId: 'e2', pomodoros: 4 }] }, stageIds), [
    { title: 'Leer el capítulo 4', stageId: 'e1', pomodoros: 2, doneWhen: 'Resuelves los ejercicios.', reason: 'Base del resto.' },
    { title: 'Proyecto', stageId: 'e2', pomodoros: 4, doneWhen: '', reason: '' },
  ]);

  const invalid = [
    null,
    [],
    { proposals: 'tareas' },
    { proposals: [] },
    { proposals: Array(MAX_PROPOSALS + 1).fill(proposal) },
    { proposals: [null] },
    { proposals: [{ ...proposal, stageId: 'e3' }] },
    { proposals: [{ ...proposal, stageId: 1 }] },
    { proposals: [{ ...proposal, title: '' }] },
    { proposals: [{ ...proposal, title: ['Leer'] }] },
    { proposals: [{ ...proposal, title: 'a'.repeat(161) }] },
    { proposals: [{ ...proposal, pomodoros: 0 }] },
    { proposals: [{ ...proposal, pomodoros: 9 }] },
    { proposals: [{ ...proposal, doneWhen: 'a'.repeat(301) }] },
    { proposals: [{ ...proposal, reason: 5 }] },
  ];
  for (const value of invalid) assert.throws(() => safeTaskProposals(value, stageIds), /respuesta que no se puede usar/);
});

test('safeStudyRouteId acepta un texto de 1 a 64 caracteres', () => {
  assert.equal(safeStudyRouteId('route-1'), 'route-1');
  for (const value of ['', 'x'.repeat(65), 42, undefined, null]) assert.throws(() => safeStudyRouteId(value), /La ruta no es válida/);
});

test('la configuración por defecto del agente es válida y usa modelos ligeros', () => {
  assert.deepEqual(safeAgentSettings(DEFAULT_AGENT_SETTINGS), DEFAULT_AGENT_SETTINGS);
  assert.equal(DEFAULT_AGENT_SETTINGS.claude.model, 'haiku');
  assert.equal(DEFAULT_AGENT_SETTINGS.codex.model, 'gpt-6-luna');
});

test('safeAgentSettings recorta las rutas y los modelos y admite dejarlos vacíos', () => {
  assert.deepEqual(safeAgentSettings({
    provider: 'codex',
    claude: { path: '  ~/.local/bin/claude ', model: ' sonnet ' },
    codex: { path: '   ', model: '' },
  }), { provider: 'codex', claude: { path: '~/.local/bin/claude', model: 'sonnet' }, codex: { path: '', model: '' } });
  assert.equal(safeAgentSettings({ ...DEFAULT_AGENT_SETTINGS, codex: { path: '/opt/homebrew/bin/codex', model: 'gpt-6-luna' } }).codex.path, '/opt/homebrew/bin/codex');
});

test('safeAgentSettings rechaza proveedores, rutas y modelos inválidos', () => {
  const settings = (patch: Record<string, unknown>) => ({ ...DEFAULT_AGENT_SETTINGS, ...patch });
  assert.throws(() => safeAgentSettings(null), /configuración del agente no es válida/);
  assert.throws(() => safeAgentSettings(settings({ provider: 'gemini' })), /Elige Claude Code o Codex/);
  assert.throws(() => safeAgentSettings(settings({ claude: 'claude' })), /configuración del agente no es válida/);
  for (const path of ['claude', 'bin/claude', '~claude', `/${'a'.repeat(MAX_AGENT_PATH)}`, '/bin/cla\nude', 42]) {
    assert.throws(() => safeAgentSettings(settings({ claude: { path, model: '' } })), /La ruta de Claude Code debe ser absoluta/);
  }
  for (const model of ['--tools', 'haiku sonnet', 7]) {
    assert.throws(() => safeAgentSettings(settings({ codex: { path: '', model } })), /El modelo de Codex debe ser un nombre sin espacios, como «gpt-6-luna»/);
  }
  assert.ok(AGENT_MODEL_PATTERN.test('claude-haiku-4-5[1m]'));
});
