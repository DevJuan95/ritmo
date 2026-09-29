import test from 'node:test';
import assert from 'node:assert/strict';
import type { AppState, PublicState, RitmoAPI, Task } from '../../../src/shared/contracts';
import { calendarRange, completionText, dateLabel, dayButtonLabel, dayIndicator, dayToDate, domainsLocked, focusCountText, isPlannableDate, monthOf, plannedDateToSave, tasksRevision, timerActions, timerView } from '../../../src/renderer/view';
import { buildState } from '../../helpers/harness';

const now = new Date(2026, 8, 29, 9, 0, 0).getTime();

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
