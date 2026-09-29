import test from 'node:test';
import assert from 'node:assert/strict';
import type { AppState, PublicState, RitmoAPI, Task } from '../../../src/shared/contracts';
import { completionText, domainsLocked, focusCountText, timerActions, timerView } from '../../../src/renderer/view';
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
