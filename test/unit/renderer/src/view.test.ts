import test from 'node:test';
import assert from 'node:assert/strict';
import type { RitmoAPI } from '../../../../src/shared/api';
import { GENERIC_ERROR_MESSAGE } from '../../../../src/shared/ipc';
import type { AppState, PublicState } from '../../../../src/shared/state/contract';
import { AGENT_CANCELLED, DEFAULT_AGENT_INSTRUCTIONS, DEFAULT_AGENT_SETTINGS, MAX_ROADMAP_BRIEF, MAX_STAGES, type AgentStatus, type StudyRoute, type TaskProposal } from '../../../../src/shared/study/contract';
import type { Task } from '../../../../src/shared/tasks/contract';
import {
  LEVEL_LABELS, agentModelHint, agentPathPlaceholder, agentSettingsChanged, agentSettingsProblem, agentStatusView, agentSummary, uncheckedAgents, withProviderSettings,
  calendarRange, canSaveDraft, completionText, dateLabel, dayButtonLabel, dayIndicator, dayToDate, domainsLocked, draftChanged, draftProblem,
  draftToInput, emptyRouteDraft, errorMessage, focusCountText, isPlannableDate, monthOf, moveStage, newStageDraft, oneAtATime, parseLines,
  plannedDateToSave,
  acceptableProposals, addDays, agentNoticeText, elapsedText, pomodorosText, proposalGate, proposalProblem, proposalsSummary, proposalStageLabel, relativeDayLabel,
  scheduleProposals, withoutProposals, withProposal, withRouteProposals, type ProposalDraft,
  ROADMAP_CANCELLED, agentBusyText, briefProblem, roadmapFailureText, roadmapNoticeText, roadmapToDraft, roadmapView,
  linkFromStage, routeProgressView, routeSummary, routeToDraft, stageLimits, stageOptions, stageProgressView, taskStageValue, tasksRevision, timerActions, timerView, withDraft
} from '../../../../src/renderer/src/view';
import { buildState } from '../../../helpers/harness';
import { emptyRouteRoadmap, sampleRoadmap, stage } from '../../../helpers/study';

const now = new Date(2026, 8, 29, 9, 0, 0).getTime();

test('el banner solo acepta errores públicos de la API', () => {
  assert.equal(errorMessage({ kind: 'ritmo-api-error', message: 'Fecha inválida.' }), 'Fecha inválida.');
  assert.equal(errorMessage(new Error('Error invoking remote method add-task')), GENERIC_ERROR_MESSAGE);
  assert.equal(errorMessage('ruta /private/secret'), GENERIC_ERROR_MESSAGE);
});

function publicState(overrides: Partial<AppState> = {}, busy = false): PublicState {
  return { ...buildState(overrides), busy, now, tasksVersion: 0 };
}

function task(id: string, done: boolean): Task {
  return { id, title: id, done, plannedDate: '2026-09-29', createdAt: '', completedAt: done ? '' : null, routeId: null, stageId: null };
}

test('resume el avance de tareas o muestra el texto vacío', () => {
  assert.equal(completionText([task('a', true), task('b', false), task('c', true)], 'Nada'), '2 de 3 completadas');
  assert.equal(completionText([], 'Elige lo que importa.'), 'Elige lo que importa.');
});

test('cuenta pomodoros en singular y plural', () => {
  assert.equal(focusCountText(0), '0 pomodoros hoy');
  assert.equal(focusCountText(1), '1 pomodoro hoy');
  assert.equal(focusCountText(4), '4 pomodoros hoy');
});

test('escribe la fecha del encabezado a partir de la clave del día', () => {
  assert.equal(dateLabel('2026-09-29'), 'martes, 29 de septiembre');
  assert.equal(dateLabel('2026-10-01'), 'jueves, 1 de octubre');
});

test('la revisión de tareas solo cambia con el día o las tareas de cualquier día', () => {
  const base = publicState({ tasks: [task('a', false)] });
  assert.equal(tasksRevision({ ...base, busy: true, now: now + 1000, focusCount: 3 }), tasksRevision(base));
  assert.notEqual(tasksRevision({ ...base, tasks: [task('a', true)] }), tasksRevision(base));
  assert.notEqual(tasksRevision({ ...base, day: '2026-09-30' }), tasksRevision(base));
  assert.notEqual(tasksRevision({ ...base, tasksVersion: 1 }), tasksRevision(base));
});

test('solo mueve una tarea a un día completo, en rango y distinto', () => {
  assert.equal(isPlannableDate('2026-10-01'), true);
  for (const value of ['', '0202-10-01', '2026-02-30']) assert.equal(isPlannableDate(value), false, value);
  assert.equal(plannedDateToSave('2026-10-01', '2026-09-29'), '2026-10-01');
  assert.equal(plannedDateToSave('2026-09-29', '2026-09-29'), null);
  assert.equal(plannedDateToSave('0202-09-29', '2026-09-29'), null);
  assert.equal(plannedDateToSave('', '2026-09-29'), null);
});

test('bloquea la edición de sitios durante el foco, con bloqueo pendiente o en espera', () => {
  assert.equal(domainsLocked(publicState()), false);
  assert.equal(domainsLocked(publicState({ session: { kind: 'shortBreak', endsAt: now } })), false);
  assert.equal(domainsLocked(publicState({ session: { kind: 'focus', endsAt: now } })), true);
  assert.equal(domainsLocked(publicState({ blockError: 'pendiente' })), true);
  assert.equal(domainsLocked(publicState({}, true)), true);
});

test('sin sesión muestra 25:00 listo para empezar', () => {
  assert.deepEqual(timerView(publicState(), now), {
    value: '25:00', progress: '0%', kind: 'Tiempo de foco', caption: 'Sin distracciones',
    status: 'Listo para empezar', mode: 'ready', beats: 25, actionsKey: 'ready:false'
  });
});

test('durante el foco cuenta hacia atrás redondeando hacia arriba', () => {
  const view = timerView(publicState({ session: { kind: 'focus', endsAt: now + 10 * 60000 + 500 } }), now);
  assert.equal(view.value, '10:01');
  assert.equal(view.progress, `${(899 / 1500) * 100}%`);
  assert.equal(view.status, 'En foco');
  assert.equal(view.caption, 'Tus sitios están en pausa');
  assert.equal(view.mode, 'focus');
  assert.equal(view.actionsKey, 'focus:false');
});

test('los descansos usan su propia duración y no bajan de 00:00', () => {
  const short = timerView(publicState({ session: { kind: 'shortBreak', endsAt: now + 60000 } }), now);
  assert.deepEqual([short.value, short.progress, short.kind, short.status, short.mode, short.beats], ['01:00', '80%', 'Descanso', 'Descansando', 'break', 5]);
  const long = timerView(publicState({ session: { kind: 'longBreak', endsAt: now - 5000 } }, true), now);
  assert.deepEqual([long.value, long.progress, long.caption, long.actionsKey, long.beats], ['00:00', '100%', 'Respira y recarga', 'longBreak:true', 15]);
});

test('un bloqueo pendiente tiene prioridad en el estado', () => {
  const view = timerView(publicState({ blockError: 'pendiente' }), now);
  assert.equal(view.status, 'Bloqueo pendiente');
  assert.equal(view.mode, 'blocked');
  assert.equal(view.actionsKey, 'blocked:false');
});

test('ofrece las acciones de cada estado y llama a la API correspondiente', async () => {
  const calls: unknown[][] = [];
  const api = new Proxy({}, { get: (_target, method) => async (...args: unknown[]) => { calls.push([method, ...args]); } }) as RitmoAPI;
  const run = async (state: PublicState) => {
    calls.length = 0;
    const actions = timerActions(state);
    for (const action of actions) await action.run(api);
    return { buttons: actions.map(action => [action.label, action.style]), calls: [...calls] };
  };

  assert.deepEqual(await run(publicState()), {
    buttons: [['Iniciar foco', 'primary'], ['Descanso 5 min', 'secondary'], ['Descanso 15 min', 'ghost']],
    calls: [['startFocus'], ['startBreak', 'shortBreak'], ['startBreak', 'longBreak']]
  });
  assert.deepEqual(await run(publicState({ session: { kind: 'focus', endsAt: now } })), { buttons: [['Terminar foco', 'secondary']], calls: [['finishFocus']] });
  assert.deepEqual(await run(publicState({ session: { kind: 'longBreak', endsAt: now } })), { buttons: [['Terminar descanso', 'secondary']], calls: [['finishBreak']] });
  assert.deepEqual(await run(publicState({ blockError: 'pendiente', session: { kind: 'focus', endsAt: now } })), { buttons: [['Quitar bloqueo', 'primary']], calls: [['retryUnblock']] });
});

test('convierte claves de día en fechas locales y en el mes que las contiene', () => {
  assert.equal(dayToDate('2026-09-29').getTime(), new Date(2026, 8, 29).getTime());
  assert.equal(monthOf('2026-09-29').getTime(), new Date(2026, 8, 1).getTime());
});

test('el calendario muestra seis semanas desde el lunes de la semana del día 1', () => {
  assert.deepEqual(calendarRange(new Date(2026, 8, 1)), { from: '2026-08-31', to: '2026-10-11' });
  assert.deepEqual(calendarRange(new Date(2026, 5, 15)), { from: '2026-06-01', to: '2026-07-12' }, 'un mes que empieza en lunes');
  assert.deepEqual(calendarRange(new Date(2026, 2, 1)), { from: '2026-02-23', to: '2026-04-05' }, 'un mes que empieza en domingo');
});

test('el rango del calendario no sale de los días planificables', () => {
  assert.deepEqual(calendarRange(new Date(2000, 0, 1)), { from: '2000-01-01', to: '2000-02-06' });
  assert.deepEqual(calendarRange(new Date(2100, 11, 1)), { from: '2100-11-29', to: '2100-12-31' });
});

test('el indicador del día cuenta tareas pendientes o completadas', () => {
  assert.equal(dayIndicator(undefined), null);
  assert.equal(dayIndicator({ total: 0, done: 0 }), null);
  assert.deepEqual(dayIndicator({ total: 1, done: 0 }), { text: '1 tarea', label: '1 tarea', complete: false });
  assert.deepEqual(dayIndicator({ total: 3, done: 0 }), { text: '3 tareas', label: '3 tareas', complete: false });
  assert.deepEqual(dayIndicator({ total: 3, done: 1 }), { text: '✓ 1/3', label: '1 de 3 completadas', complete: false });
  assert.deepEqual(dayIndicator({ total: 2, done: 2 }), { text: '✓ 2/2', label: '2 de 2 completadas', complete: true });
});

test('la etiqueta accesible de cada día dice la fecha, si es hoy y sus tareas', () => {
  assert.equal(dayButtonLabel('2026-09-29', { total: 3, done: 1 }, true), 'martes, 29 de septiembre de 2026, hoy, 1 de 3 completadas');
  assert.equal(dayButtonLabel('2026-10-01', undefined, false), 'jueves, 1 de octubre de 2026, sin tareas');
});

function studyRoute(overrides: Partial<StudyRoute> = {}): StudyRoute {
  return {
    id: 'r1', topic: 'Rust', goal: 'Escribir un CLI', level: 'intermediate', dailyPomodoros: 3, ...emptyRouteRoadmap(),
    stages: [stage({ id: 's1', title: 'Ownership', topics: ['borrowing', 'lifetimes'] }), stage({ id: 's2', title: 'Traits', topics: [] })],
    instructions: 'En español.', createdAt: '', updatedAt: '', ...overrides
  };
}

test('el borrador de una ruta nueva trae una etapa vacía y las instrucciones por defecto', () => {
  assert.deepEqual(emptyRouteDraft('k1'), {
    topic: '', goal: '', level: 'beginner', dailyPomodoros: '4', approach: '', finalProject: '', studyRules: '',
    instructions: DEFAULT_AGENT_INSTRUCTIONS, stages: [newStageDraft('k1')]
  });
  assert.deepEqual(newStageDraft('k2'), { key: 'k2', title: '', summary: '', topics: '', deprioritized: '', project: '', resources: '' });
});

test('una ruta guardada se edita con un tema por línea y vuelve igual', () => {
  const route = studyRoute();
  const draft = routeToDraft(route);
  assert.deepEqual(draft.stages, [
    { key: 's1', id: 's1', title: 'Ownership', summary: '', topics: 'borrowing\nlifetimes', deprioritized: '', project: '', resources: '' },
    { key: 's2', id: 's2', title: 'Traits', summary: '', topics: '', deprioritized: '', project: '', resources: '' }
  ]);
  assert.equal(draft.dailyPomodoros, '3');
  assert.deepEqual(draftToInput(draft), {
    topic: 'Rust', goal: 'Escribir un CLI', level: 'intermediate', dailyPomodoros: 3, ...emptyRouteRoadmap(), instructions: 'En español.',
    stages: [stage({ id: 's1', title: 'Ownership', topics: ['borrowing', 'lifetimes'] }), stage({ id: 's2', title: 'Traits', topics: [] })]
  });
});

test('el borrador conserva el roadmap: temas y recursos van uno por línea porque pueden llevar comas', () => {
  const roadmap = { approach: '70 % sistemas distribuidos', finalProject: 'Un almacén clave-valor replicado.', studyRules: 'Java y sistemas en paralelo.' };
  const route = studyRoute({
    ...roadmap,
    stages: [stage({
      id: 's1', title: 'Fundamentos', summary: 'Modelo de datos.', topics: ['Replicación, particionado y consenso'], deprioritized: ['Kubernetes', 'Service mesh'],
      project: 'Un log replicado.', resources: ['Designing Data-Intensive Applications, Kleppmann', 'MIT 6.824']
    })]
  });
  const draft = routeToDraft(route);
  assert.equal(draft.approach, roadmap.approach);
  assert.deepEqual(draft.stages[0], {
    key: 's1', id: 's1', title: 'Fundamentos', summary: 'Modelo de datos.', topics: 'Replicación, particionado y consenso', deprioritized: 'Kubernetes\nService mesh',
    project: 'Un log replicado.', resources: 'Designing Data-Intensive Applications, Kleppmann\nMIT 6.824'
  });
  const { id: _id, createdAt: _createdAt, updatedAt: _updatedAt, ...input } = route;
  assert.deepEqual(draftToInput(draft), input);
});

test('los temas y los recursos se separan solo por saltos de línea, sin vacíos', () => {
  assert.deepEqual(parseLines(' DDIA, Kleppmann \n\n  MIT 6.824\n'), ['DDIA, Kleppmann', 'MIT 6.824']);
  assert.deepEqual(parseLines(''), []);
});

test('una etapa nueva se envía sin id y un número vacío no es válido', () => {
  const draft = { ...emptyRouteDraft('k1'), topic: 'Go', dailyPomodoros: ' ' };
  const input = draftToInput(draft);
  assert.equal('id' in input.stages[0], false);
  assert.ok(Number.isNaN(input.dailyPomodoros));
});

test('explica por qué no se puede guardar el borrador con las reglas del contrato', () => {
  const draft = emptyRouteDraft('k1');
  assert.equal(draftProblem(draft), 'Cada etapa debe tener un título de 1 a 120 caracteres.');
  const named = { ...draft, stages: [{ ...draft.stages[0], title: 'Básicos' }] };
  assert.equal(draftProblem(named), 'El tema debe tener de 1 a 80 caracteres.');
  assert.equal(draftProblem({ ...named, topic: 'Go', dailyPomodoros: '0' }), 'Elige de 1 a 16 pomodoros por día.');
  assert.equal(draftProblem({ ...named, topic: 'Go' }), null);
});

test('detecta cambios respecto a la ruta guardada, no solo de formato', () => {
  const saved = routeToDraft(studyRoute());
  assert.equal(draftChanged(saved, saved), false);
  assert.equal(draftChanged({ ...saved, stages: saved.stages.map(stage => ({ ...stage, topics: stage.topics.replace(', ', ',') })) }, saved), false);
  assert.equal(draftChanged({ ...saved, topic: 'Go' }, saved), true);
  assert.equal(draftChanged({ ...saved, stages: moveStage(saved.stages, 0, 1) }, saved), true);
});

test('mueve etapas dentro de la lista y no fuera de ella', () => {
  assert.deepEqual(moveStage(['a', 'b', 'c'], 0, 1), ['b', 'a', 'c']);
  assert.deepEqual(moveStage(['a', 'b', 'c'], 2, -1), ['a', 'c', 'b']);
  assert.deepEqual(moveStage(['a', 'b'], 0, -1), ['a', 'b']);
  assert.deepEqual(moveStage(['a', 'b'], 1, 1), ['a', 'b']);
  assert.deepEqual(moveStage(['a', 'b'], -1, 1), ['a', 'b']);
  assert.deepEqual(moveStage(['a', 'b'], 2, -1), ['a', 'b']);
});

test('una ruta tiene de una a treinta etapas', () => {
  assert.deepEqual(stageLimits(1), { canAdd: true, canRemove: false });
  assert.deepEqual(stageLimits(2), { canAdd: true, canRemove: true });
  assert.deepEqual(stageLimits(MAX_STAGES), { canAdd: false, canRemove: true });
});

test('el editor solo guarda cambios válidos cuando no hay otra operación en curso', () => {
  assert.equal(canSaveDraft(true, null, false), true);
  assert.equal(canSaveDraft(false, null, false), false);
  assert.equal(canSaveDraft(true, 'Falta el tema.', false), false);
  assert.equal(canSaveDraft(true, null, true), false);
});

test('un doble envío mientras se guarda ejecuta la operación una sola vez', async () => {
  const busy: boolean[] = [];
  const exclusive = oneAtATime(value => busy.push(value));
  let calls = 0;
  let finish!: () => void;
  const operation = () => { calls++; return new Promise<void>(resolve => { finish = resolve; }); };
  const first = exclusive(operation);
  assert.equal(await exclusive(operation), false);
  assert.equal(calls, 1);
  finish();
  assert.equal(await first, true);
  assert.deepEqual(busy, [true, false]);
  assert.equal(await exclusive(async () => { calls++; }), true);
  assert.equal(calls, 2);
});

test('el guardián se libera aunque la operación falle', async () => {
  const exclusive = oneAtATime();
  await assert.rejects(exclusive(async () => { throw new Error('falló'); }));
  assert.equal(await exclusive(async () => {}), true);
});

test('resume una ruta con sus etapas, pomodoros y nivel', () => {
  assert.equal(routeSummary(studyRoute()), '2 etapas, 3 pomodoros al día, intermedio');
  const one = studyRoute({ dailyPomodoros: 1, level: 'advanced', stages: [stage({ id: 's1', title: 'Todo', topics: [] })] });
  assert.equal(routeSummary(one), '1 etapa, 1 pomodoro al día, avanzado');
  assert.equal(LEVEL_LABELS.beginner, 'Principiante');
});

test('el avance de una etapa cuenta sus tareas completadas', () => {
  assert.deepEqual(stageProgressView(undefined), { text: 'Sin tareas todavía', percent: '0%', complete: false });
  assert.deepEqual(stageProgressView({ done: 0, total: 0 }), { text: 'Sin tareas todavía', percent: '0%', complete: false });
  assert.deepEqual(stageProgressView({ done: 2, total: 5 }), { text: '2 de 5 tareas', percent: '40%', complete: false });
  assert.deepEqual(stageProgressView({ done: 1, total: 1 }), { text: '1 de 1 tarea', percent: '100%', complete: true });
  assert.deepEqual(stageProgressView({ done: 4, total: 3 }), { text: '3 de 3 tareas', percent: '100%', complete: true });
});

test('el avance de una ruta señala la primera etapa sin completar', () => {
  const route = studyRoute();
  assert.deepEqual(routeProgressView(route, {}), { completed: 0, current: 0, stages: ['current', 'next'], text: 'Etapa 1 de 2: Ownership' });
  assert.deepEqual(routeProgressView(route, { s1: { done: 2, total: 2 } }), { completed: 1, current: 1, stages: ['done', 'current'], text: 'Etapa 2 de 2: Traits' });
  assert.deepEqual(routeProgressView(route, { s1: { done: 2, total: 2 }, s2: { done: 1, total: 1 } }), { completed: 2, current: null, stages: ['done', 'done'], text: 'Ruta completada' });
});

test('el avance de una ruta marca cada etapa aunque se completen fuera de orden', () => {
  const route = studyRoute();
  assert.deepEqual(routeProgressView(route, { s1: { done: 0, total: 2 }, s2: { done: 1, total: 1 } }), { completed: 1, current: 0, stages: ['current', 'done'], text: 'Etapa 1 de 2: Ownership' });
});

test('los borradores se guardan y se quitan por clave sin tocar los demás', () => {
  const route = routeToDraft(studyRoute());
  const other = { ...route, topic: 'Go' };
  const drafts = withDraft(withDraft({}, 'a', route), 'b', other);
  assert.deepEqual(drafts, { a: route, b: other });
  assert.deepEqual(withDraft(drafts, 'a', other), { a: other, b: other });
  assert.deepEqual(withDraft(drafts, 'a', undefined), { b: other });
  assert.deepEqual(withDraft(drafts, 'c', undefined), drafts);
});

test('el selector de etapa agrupa las etapas numeradas por ruta', () => {
  const go = studyRoute({ id: 'r2', topic: 'Go', stages: [stage({ id: 's3', title: 'Goroutines', topics: [] })] });
  assert.deepEqual(stageOptions([studyRoute(), go]), [
    { label: 'Rust', options: [{ value: 's1', label: '1. Ownership' }, { value: 's2', label: '2. Traits' }] },
    { label: 'Go', options: [{ value: 's3', label: '1. Goroutines' }] }
  ]);
  assert.deepEqual(stageOptions([]), []);
});

test('la etapa elegida se convierte en el vínculo de la tarea', () => {
  const routes = [studyRoute(), studyRoute({ id: 'r2', stages: [stage({ id: 's3', title: 'Goroutines', topics: [] })] })];
  assert.deepEqual(linkFromStage(routes, 's2'), { routeId: 'r1', stageId: 's2' });
  assert.deepEqual(linkFromStage(routes, 's3'), { routeId: 'r2', stageId: 's3' });
  assert.equal(linkFromStage(routes, ''), null);
  assert.equal(linkFromStage(routes, 'borrada'), null);
});

test('el selector muestra la etapa de la tarea solo si sigue en su ruta', () => {
  const routes = [studyRoute()];
  assert.equal(taskStageValue(routes, { routeId: 'r1', stageId: 's2' }), 's2');
  assert.equal(taskStageValue(routes, { routeId: null, stageId: null }), '');
  assert.equal(taskStageValue(routes, { routeId: 'r2', stageId: 's2' }), '');
  assert.equal(taskStageValue(routes, { routeId: 'r1', stageId: 'borrada' }), '');
});

const agentStatus = (patch: Partial<AgentStatus> = {}): AgentStatus => ({ provider: 'claude', availability: 'ready', path: '/Users/ana/.local/bin/claude', configured: false, ...patch });

test('agentStatusView explica cada estado del CLI y cómo resolverlo', () => {
  assert.deepEqual(agentStatusView('claude', undefined), { tone: 'checking', label: 'Comprobando…', detail: 'Buscando Claude Code y su sesión.' });
  assert.deepEqual(agentStatusView('claude', agentStatus()), { tone: 'ready', label: 'Listo', detail: 'Sesión iniciada con tu cuenta de claude.ai.' });
  assert.deepEqual(agentStatusView('codex', agentStatus({ provider: 'codex', availability: 'missing', path: null })), {
    tone: 'missing', label: 'No encontrado', detail: 'No se encontró Codex en este Mac. Instálalo o indica la ruta del ejecutable.'
  });
  assert.match(agentStatusView('codex', agentStatus({ availability: 'missing', path: null, configured: true })).detail, /en la ruta indicada/);
  assert.deepEqual(agentStatusView('codex', agentStatus({ availability: 'logged-out' })), {
    tone: 'warning', label: 'Sin sesión', detail: 'Ejecuta «codex login» en la terminal con tu cuenta de ChatGPT y vuelve a comprobarlo.'
  });
  const apiKey = agentStatusView('claude', agentStatus({ availability: 'api-key' }));
  assert.equal(apiKey.label, 'Con clave de API');
  assert.match(apiKey.detail, /se factura aparte\. Ejecuta «claude auth login»/);
  assert.deepEqual(agentStatusView('claude', agentStatus({ availability: 'unknown' })), {
    tone: 'warning', label: 'Sin confirmar', detail: 'No se pudo comprobar la sesión de Claude Code. Se comprobará otra vez al pedir tareas.'
  });
});

test('uncheckedAgents deja los dos proveedores sin confirmar', () => {
  assert.deepEqual(uncheckedAgents().map(status => [status.provider, status.availability, status.path]), [['claude', 'unknown', null], ['codex', 'unknown', null]]);
});

test('agentPathPlaceholder muestra dónde se detectó el CLI', () => {
  assert.equal(agentPathPlaceholder(agentStatus()), 'Detectado en /Users/ana/.local/bin/claude');
  assert.equal(agentPathPlaceholder(agentStatus({ configured: true })), 'Detectar automáticamente');
  assert.equal(agentPathPlaceholder(agentStatus({ path: null })), 'Detectar automáticamente');
  assert.equal(agentPathPlaceholder(undefined), 'Detectar automáticamente');
});

test('agentModelHint nombra el modelo ligero por defecto', () => {
  assert.equal(agentModelHint('codex'), 'Por defecto, «gpt-6-luna», un modelo ligero. Vacío, usa el que tenga configurado Codex.');
});

test('la configuración del agente se edita por proveedor y se valida como en el proceso principal', () => {
  const settings = withProviderSettings(DEFAULT_AGENT_SETTINGS, 'codex', { path: '/opt/homebrew/bin/codex' });
  assert.deepEqual(settings.codex, { path: '/opt/homebrew/bin/codex', model: 'gpt-6-luna' });
  assert.deepEqual(settings.claude, DEFAULT_AGENT_SETTINGS.claude);
  assert.equal(DEFAULT_AGENT_SETTINGS.codex.path, '');
  assert.equal(agentSettingsProblem(settings), null);
  assert.match(agentSettingsProblem(withProviderSettings(settings, 'claude', { path: 'claude' }))!, /La ruta de Claude Code debe ser absoluta/);
  assert.equal(agentSettingsChanged(settings, DEFAULT_AGENT_SETTINGS), true);
  assert.equal(agentSettingsChanged(withProviderSettings(DEFAULT_AGENT_SETTINGS, 'claude', { model: ' haiku ' }), DEFAULT_AGENT_SETTINGS), false);
  assert.equal(agentSettingsChanged({ ...DEFAULT_AGENT_SETTINGS, provider: 'codex' }, DEFAULT_AGENT_SETTINGS), true);
});

test('agentSummary resume el agente elegido para la pantalla de rutas', () => {
  const codex = { ...DEFAULT_AGENT_SETTINGS, provider: 'codex' as const };
  assert.deepEqual(agentSummary(DEFAULT_AGENT_SETTINGS, undefined), { tone: 'checking', text: 'Comprobando Claude Code…' });
  assert.deepEqual(agentSummary(DEFAULT_AGENT_SETTINGS, [agentStatus()]), { tone: 'ready', text: 'Las tareas las propondrá Claude Code con haiku.' });
  assert.deepEqual(agentSummary(withProviderSettings(DEFAULT_AGENT_SETTINGS, 'claude', { model: '' }), [agentStatus()]), { tone: 'ready', text: 'Las tareas las propondrá Claude Code.' });
  assert.deepEqual(agentSummary(codex, [agentStatus(), agentStatus({ provider: 'codex', availability: 'logged-out' })]), { tone: 'warning', text: 'Codex no está listo: sin sesión.' });
  assert.deepEqual(agentSummary(codex, [agentStatus({ provider: 'codex', availability: 'missing', path: null })]), { tone: 'missing', text: 'Codex no está listo: no encontrado.' });
  assert.deepEqual(agentSummary(codex, uncheckedAgents()), { tone: 'warning', text: 'No se pudo confirmar la sesión de Codex.' });
});

function proposal(overrides: Partial<TaskProposal> = {}): TaskProposal {
  return { title: 'Leer el capítulo 4', stageId: 's1', pomodoros: 1, doneWhen: 'Resumen escrito', reason: 'Empieza la etapa', ...overrides };
}

function draft(overrides: Partial<ProposalDraft> = {}): ProposalDraft {
  return { ...proposal(), key: 'p1', plannedDate: '2026-09-29', acceptedOn: null, ...overrides };
}

test('addDays cuenta días de calendario, también al cambiar de mes y de año', () => {
  assert.equal(addDays('2026-09-29', 0), '2026-09-29');
  assert.equal(addDays('2026-09-30', 1), '2026-10-01');
  assert.equal(addDays('2026-12-31', 2), '2027-01-02');
});

test('scheduleProposals reparte las propuestas desde hoy según los pomodoros al día', () => {
  const items = [proposal({ pomodoros: 2 }), proposal({ pomodoros: 1 }), proposal({ pomodoros: 2 }), proposal({ pomodoros: 5 }), proposal({ pomodoros: 1 })];
  const drafts = scheduleProposals(items, '2026-09-29', 3, index => `k${index}`);
  assert.deepEqual(drafts.map(item => [item.key, item.plannedDate]), [
    ['k0', '2026-09-29'], ['k1', '2026-09-29'], ['k2', '2026-09-30'], ['k3', '2026-10-01'], ['k4', '2026-10-02']
  ]);
  assert.deepEqual(drafts[0], { ...items[0], key: 'k0', plannedDate: '2026-09-29', acceptedOn: null });
  assert.deepEqual(scheduleProposals([proposal({ pomodoros: 2 }), proposal()], '2026-09-29', 0, String).map(item => item.plannedDate), ['2026-09-29', '2026-09-30']);
});

test('las propuestas se editan, se descartan y se guardan por ruta sin mutar las anteriores', () => {
  const list = [draft({ key: 'a' }), draft({ key: 'b' })];
  const edited = withProposal(list, 'b', { title: 'Otro', plannedDate: '2026-10-01' });
  assert.deepEqual(edited.map(item => [item.key, item.title, item.plannedDate]), [['a', 'Leer el capítulo 4', '2026-09-29'], ['b', 'Otro', '2026-10-01']]);
  assert.equal(list[1].title, 'Leer el capítulo 4');
  assert.deepEqual(withoutProposals(list, ['a']).map(item => item.key), ['b']);

  const all = withRouteProposals({}, 'r1', list);
  assert.deepEqual(Object.keys(withRouteProposals(all, 'r2', edited)), ['r1', 'r2']);
  assert.deepEqual(withRouteProposals(all, 'r1', []), {});
});

test('proposalProblem aplica las reglas del proceso principal a título, etapa y día', () => {
  const route = studyRoute();
  assert.equal(proposalProblem(draft(), route), null);
  assert.match(proposalProblem(draft({ title: '  ' }), route) ?? '', /entre 1 y 160 caracteres/);
  assert.equal(proposalProblem(draft({ stageId: 'borrada' }), route), 'La etapa ya no existe. Elige otra.');
  assert.equal(proposalProblem(draft({ plannedDate: '0202-01-01' }), route), 'Elige un día entre 2000 y 2100.');
  assert.equal(proposalProblem(draft({ plannedDate: '' }), route), 'Elige un día entre 2000 y 2100.');
});

test('acceptableProposals deja fuera las añadidas y las que tienen un problema', () => {
  const list = [draft({ key: 'ok' }), draft({ key: 'hecha', acceptedOn: '2026-09-29' }), draft({ key: 'mala', title: '' })];
  assert.deepEqual(acceptableProposals(list, studyRoute()).map(item => item.key), ['ok']);
});

test('textos de una propuesta: etapa, pomodoros, día relativo y espera', () => {
  const route = studyRoute();
  assert.equal(proposalStageLabel(route, 's2'), 'Etapa 2: Traits');
  assert.equal(proposalStageLabel(route, 'borrada'), null);
  assert.equal(pomodorosText(1), '1 pomodoro');
  assert.equal(pomodorosText(3), '3 pomodoros');
  assert.equal(relativeDayLabel('2026-09-29', '2026-09-29'), 'hoy');
  assert.equal(relativeDayLabel('2026-09-30', '2026-09-29'), 'mañana');
  assert.equal(relativeDayLabel('2026-10-01', '2026-09-29'), dateLabel('2026-10-01'));
  assert.equal(elapsedText(7_900), '0:07');
  assert.equal(elapsedText(135_000), '2:15');
  assert.equal(elapsedText(-5), '0:00');
});

test('proposalsSummary cuenta las propuestas por revisar y las añadidas', () => {
  const accepted = draft({ acceptedOn: '2026-09-29' });
  assert.equal(proposalsSummary([draft(), draft()]), '2 por revisar');
  assert.equal(proposalsSummary([draft(), accepted]), '1 por revisar, 1 añadida al Planner');
  assert.equal(proposalsSummary([draft(), accepted, accepted]), '1 por revisar, 2 añadidas al Planner');
  assert.equal(proposalsSummary([accepted]), 'La propuesta ya está en el Planner.');
  assert.equal(proposalsSummary([accepted, accepted]), 'Las 2 propuestas ya están en el Planner.');
});

test('el aviso de privacidad dice a quién y qué se envía', () => {
  assert.match(agentNoticeText('claude'), /envía a Claude Code \(Anthropic\) el tema, el objetivo/);
  assert.match(agentNoticeText('codex'), /envía a Codex \(OpenAI\)/);
  assert.match(agentNoticeText('codex'), /solo cuando pulsas el botón/);
});

test('proposalGate pide el aviso la primera vez y bloquea con el motivo si el agente no está listo', () => {
  const ready: AgentStatus = { provider: 'claude', availability: 'ready', path: '/bin/claude', configured: false };
  assert.deepEqual(proposalGate('claude', ready, [], false), { kind: 'notice' });
  assert.deepEqual(proposalGate('claude', ready, ['claude'], false), { kind: 'ready' });
  assert.deepEqual(proposalGate('codex', undefined, ['claude'], false), { kind: 'notice' }, 'el aviso es de cada proveedor');
  assert.deepEqual(proposalGate('claude', { ...ready, availability: 'unknown' }, ['claude'], false), { kind: 'ready' });
  assert.deepEqual(proposalGate('claude', ready, ['claude'], true), { kind: 'blocked', reason: 'Guarda los cambios de la ruta: el agente usa la ruta guardada.' });
  for (const availability of ['missing', 'logged-out', 'api-key'] as const) {
    const status = { ...ready, availability };
    assert.deepEqual(proposalGate('claude', status, ['claude'], false), { kind: 'blocked', reason: agentStatusView('claude', status).detail });
  }
});

test('el roadmap del agente se abre como borrador de una ruta nueva y se guarda igual', () => {
  const sample = sampleRoadmap();
  const roadmap = {
    ...sample,
    stages: sample.stages.map((item, index) => index === 0
      ? { ...item, topics: ['Replicación, particionado y consenso', ...item.topics], deprioritized: ['Blockchain', 'Kubernetes, Helm y operadores'] }
      : item)
  };
  let key = 0;
  const draft = roadmapToDraft(roadmap, () => `k${++key}`);
  assert.deepEqual(draft.stages.map(item => item.key), ['k1', 'k2']);
  assert.ok(draft.stages.every(item => !('id' in item)), 'las etapas del agente no tienen id');
  assert.equal(draft.dailyPomodoros, '5');
  assert.equal(draft.stages[0].deprioritized, 'Blockchain\nKubernetes, Helm y operadores');
  assert.deepEqual(draftToInput(draft), roadmap);
  assert.equal(draftProblem(draft), null);
  assert.equal(draftChanged(draft, emptyRouteDraft('vacía')), true, 'se puede crear la ruta sin tocar nada');
});

test('agentBusyText explica qué petición en curso impide pedir desde cada panel', () => {
  const routes = [studyRoute()];
  assert.equal(agentBusyText(undefined, routes, 'r1'), undefined);
  assert.equal(agentBusyText(undefined, routes, null), undefined);
  const tasks = { kind: 'tasks', routeId: 'r1', startedAt: 0 } as const;
  assert.equal(agentBusyText(tasks, routes, 'r1'), undefined, 'la petición es del propio panel');
  assert.equal(agentBusyText(tasks, routes, 'r2'), 'Espera a que terminen las propuestas de «Rust».');
  assert.equal(agentBusyText(tasks, routes, null), 'Espera a que terminen las propuestas de «Rust».');
  assert.equal(agentBusyText({ ...tasks, routeId: 'borrada' }, routes, null), 'Espera a que terminen las propuestas de «otra ruta».');
  assert.equal(agentBusyText(tasks, undefined, null), 'Espera a que terminen las propuestas de «otra ruta».');
  const roadmap = { kind: 'roadmap', startedAt: 0 } as const;
  assert.equal(agentBusyText(roadmap, routes, null), undefined);
  assert.equal(agentBusyText(roadmap, routes, 'r1'), 'Espera a que el agente termine el roadmap que estás generando.');
});

test('el aviso del roadmap dice que solo se envía el brief', () => {
  assert.match(roadmapNoticeText('claude'), /envía a Claude Code \(Anthropic\) solo el brief/);
  assert.match(roadmapNoticeText('codex'), /envía a Codex \(OpenAI\)/);
  assert.match(roadmapNoticeText('codex'), /solo cuando pulsas el botón/);
});

test('el brief se valida con las reglas del proceso principal', () => {
  assert.equal(briefProblem('Senior Backend → Tech Lead, 2 h al día'), null);
  const message = `Describe qué quieres estudiar en 1 a ${MAX_ROADMAP_BRIEF} caracteres.`;
  assert.equal(briefProblem('  \n '), message);
  assert.equal(briefProblem('a'.repeat(MAX_ROADMAP_BRIEF + 1)), message);
});

test('un roadmap cancelado o fallido lo dice claro y recuerda que el brief sigue ahí', () => {
  const apiError = (message: string) => ({ kind: 'ritmo-api-error', message });
  assert.equal(roadmapFailureText(apiError('Claude Code tardó demasiado en responder. Inténtalo de nuevo.'), false),
    'Claude Code tardó demasiado en responder. Inténtalo de nuevo. Tu brief sigue aquí.');
  assert.equal(roadmapFailureText(new Error('interno'), false), `${GENERIC_ERROR_MESSAGE} Tu brief sigue aquí.`);
  assert.equal(roadmapFailureText(apiError(AGENT_CANCELLED), false), ROADMAP_CANCELLED);
  assert.equal(roadmapFailureText(apiError('No se pudo iniciar Codex.'), true), ROADMAP_CANCELLED, 'si el usuario canceló, cualquier rechazo es la cancelación');
  assert.match(ROADMAP_CANCELLED, /brief sigue aquí/);
});

test('roadmapView muestra el roadmap en el orden recomendado, solo con las secciones que tienen contenido', () => {
  const roadmap = sampleRoadmap();
  const route = studyRoute({ ...roadmap, stages: roadmap.stages.map((item, index) => ({ ...item, id: `s${index + 1}` })) });
  const view = roadmapView(route);
  assert.equal(view.approach, roadmap.approach);
  assert.equal(view.finalProject, roadmap.finalProject);
  assert.equal(view.studyRules, roadmap.studyRules);
  assert.deepEqual(view.order, ['Fundamentos de sistemas distribuidos', 'JVM en producción']);
  assert.deepEqual(view.stages[0], {
    id: 's1', number: 1, title: 'Fundamentos de sistemas distribuidos', summary: 'Entender replicación, particionado y consenso.',
    lists: [
      { label: 'Dominar', items: ['Replicación', 'Particionado'] },
      { label: 'No priorizar todavía', items: ['Blockchain'] },
      { label: 'Recursos', items: ['Designing Data-Intensive Applications'] }
    ],
    project: 'Un almacén clave-valor replicado.'
  });
  assert.deepEqual(view.stages[1], { id: 's2', number: 2, title: 'JVM en producción', summary: '', lists: [{ label: 'Dominar', items: ['GC', 'JFR'] }], project: '' });
  const plain = roadmapView(studyRoute());
  assert.deepEqual(plain.stages[1].lists, [], 'una etapa sin temas no muestra listas vacías');
  assert.equal(plain.approach, '');
});
