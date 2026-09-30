import test from 'node:test';
import assert from 'node:assert/strict';
import type { RitmoAPI } from '../../../../src/shared/api';
import { GENERIC_ERROR_MESSAGE } from '../../../../src/shared/ipc';
import type { AppState, PublicState } from '../../../../src/shared/state/contract';
import { DEFAULT_AGENT_INSTRUCTIONS, MAX_STAGES, type StudyRoute } from '../../../../src/shared/study/contract';
import type { Task } from '../../../../src/shared/tasks/contract';
import {
  LEVEL_LABELS, calendarRange, canSaveDraft, completionText, dateLabel, dayButtonLabel, dayIndicator, dayToDate, domainsLocked, draftChanged, draftProblem,
  draftToInput, emptyRouteDraft, errorMessage, focusCountText, isPlannableDate, monthOf, moveStage, newStageDraft, oneAtATime, parseTopics, plannedDateToSave,
  routeProgressView, routeSummary, routeToDraft, stageLimits, stageProgressView, tasksRevision, timerActions, timerView, withDraft
} from '../../../../src/renderer/src/view';
import { buildState } from '../../../helpers/harness';

const now = new Date(2026, 8, 29, 9, 0, 0).getTime();

test('el banner solo acepta errores públicos de la API', () => {
  assert.equal(errorMessage({ kind: 'ritmo-api-error', message: 'Fecha inválida.' }), 'Fecha inválida.');
  assert.equal(errorMessage(new Error('Error invoking remote method add-task')), GENERIC_ERROR_MESSAGE);
  assert.equal(errorMessage('ruta /private/secret'), GENERIC_ERROR_MESSAGE);
});

function publicState(overrides: Partial<AppState> = {}, busy = false): PublicState {
  return { ...buildState(overrides), busy, now };
}

function task(id: string, done: boolean): Task {
  return { id, title: id, done, plannedDate: '2026-09-29', createdAt: '', completedAt: done ? '' : null };
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

test('la revisión de tareas solo cambia con el día o sus tareas', () => {
  const base = publicState({ tasks: [task('a', false)] });
  assert.equal(tasksRevision({ ...base, busy: true, now: now + 1000, focusCount: 3 }), tasksRevision(base));
  assert.notEqual(tasksRevision({ ...base, tasks: [task('a', true)] }), tasksRevision(base));
  assert.notEqual(tasksRevision({ ...base, day: '2026-09-30' }), tasksRevision(base));
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
    id: 'r1', topic: 'Rust', goal: 'Escribir un CLI', level: 'intermediate', dailyPomodoros: 3,
    stages: [{ id: 's1', title: 'Ownership', topics: ['borrowing', 'lifetimes'] }, { id: 's2', title: 'Traits', topics: [] }],
    instructions: 'En español.', createdAt: '', updatedAt: '', ...overrides
  };
}

test('el borrador de una ruta nueva trae una etapa vacía y las instrucciones por defecto', () => {
  assert.deepEqual(emptyRouteDraft('k1'), {
    topic: '', goal: '', level: 'beginner', dailyPomodoros: '4', instructions: DEFAULT_AGENT_INSTRUCTIONS,
    stages: [{ key: 'k1', title: '', topics: '' }]
  });
  assert.deepEqual(newStageDraft('k2'), { key: 'k2', title: '', topics: '' });
});

test('una ruta guardada se edita con los temas separados por comas y vuelve igual', () => {
  const route = studyRoute();
  const draft = routeToDraft(route);
  assert.deepEqual(draft.stages, [
    { key: 's1', id: 's1', title: 'Ownership', topics: 'borrowing, lifetimes' },
    { key: 's2', id: 's2', title: 'Traits', topics: '' }
  ]);
  assert.equal(draft.dailyPomodoros, '3');
  assert.deepEqual(draftToInput(draft), {
    topic: 'Rust', goal: 'Escribir un CLI', level: 'intermediate', dailyPomodoros: 3, instructions: 'En español.',
    stages: [{ id: 's1', title: 'Ownership', topics: ['borrowing', 'lifetimes'] }, { id: 's2', title: 'Traits', topics: [] }]
  });
});

test('los temas se separan por comas o saltos de línea, sin vacíos', () => {
  assert.deepEqual(parseTopics(' a, b\nc ,, \n'), ['a', 'b', 'c']);
  assert.deepEqual(parseTopics(''), []);
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
  const one = studyRoute({ dailyPomodoros: 1, level: 'advanced', stages: [{ id: 's1', title: 'Todo', topics: [] }] });
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
