import test from 'node:test';
import assert from 'node:assert/strict';
import {
  AGENT_MODEL_PATTERN,
  DEFAULT_AGENT_INSTRUCTIONS,
  DEFAULT_AGENT_SETTINGS,
  MAX_AGENT_PATH,
  safeAgentSettings,
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
  assert.deepEqual(safeStudyStage({ title: '  Tipos   y traits ', topics: [' Traits ', 'Traits', 'Genéricos'] }), {
    title: 'Tipos y traits',
    topics: ['Traits', 'Genéricos'],
  });
  assert.deepEqual(safeStudyStage({ id: 'e1', title: 'Async', topics: [] }), { id: 'e1', title: 'Async', topics: [] });
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
  assert.deepEqual(valid.stages, [{ title: 'Ownership', topics: ['Move', 'Borrowing'] }]);
  assert.equal(safeStudyRoute(route({ goal: null })).goal, '');
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
