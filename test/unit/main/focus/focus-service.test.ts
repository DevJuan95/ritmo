import test from 'node:test';
import assert from 'node:assert/strict';
import { FocusService } from '../../../../src/main/focus/focus-service';
import { createHarness } from '../../../helpers/harness';

test('iniciar foco bloquea los dominios y agenda 25 minutos', async t => {
  const { focus, store, blocker, clock } = createHarness(t, { saved: { domains: ['x.com', 'facebook.com'] } });
  await focus.startFocus();
  assert.deepEqual(blocker.calls, [{ action: 'block', domains: ['x.com', 'facebook.com'] }]);
  assert.deepEqual(store.state.session, { kind: 'focus', endsAt: clock.now() + 25 * 60000 });
});

test('no inicia foco con sesión activa, bloqueo pendiente o sin dominios', async t => {
  for (const saved of [
    { session: { kind: 'shortBreak' as const, endsAt: Date.now() } },
    { blockError: 'pendiente' },
    { domains: [] }
  ]) {
    const { focus, blocker } = createHarness(t, { saved });
    await assert.rejects(focus.startFocus());
    assert.equal(blocker.calls.length, 0);
  }
});

test('si macOS rechaza el bloqueo no se crea la sesión', async t => {
  const { focus, store, blocker } = createHarness(t);
  blocker.failNext(new Error('Se canceló la autorización de macOS.'));
  await assert.rejects(focus.startFocus(), /canceló/);
  assert.equal(store.state.session, null);
  assert.equal(store.busy, false);
});

test('no acepta una segunda operación mientras espera la autorización', async t => {
  const { focus, blocker } = createHarness(t);
  const release = blocker.hold();
  const pending = focus.startFocus();
  await assert.rejects(focus.startBreak('shortBreak'), /Espera a que termine/);
  release();
  await pending;
});

test('terminar el foco antes de tiempo desbloquea sin contar el pomodoro', async t => {
  const { focus, store, blocker, notifier, sound } = createHarness(t);
  await focus.startFocus();
  await focus.finishFocus();
  assert.deepEqual(blocker.calls.map(call => call.action), ['block', 'unblock']);
  assert.equal(store.state.session, null);
  assert.equal(store.state.focusCount, 0);
  assert.equal(notifier.sent.length, 0);
  assert.equal(sound.plays, 0);
});

test('tick no hace nada antes de que venza la sesión', async t => {
  const { focus, store, blocker, clock } = createHarness(t);
  await focus.startFocus();
  clock.advanceMinutes(24);
  await focus.tick();
  assert.equal(store.state.session?.kind, 'focus');
  assert.equal(blocker.calls.length, 1);
});

test('al vencer el foco desbloquea, suma el pomodoro, notifica y suena', async t => {
  const { focus, store, notifier, sound, clock } = createHarness(t);
  await focus.startFocus();
  clock.advanceMinutes(25);
  await focus.tick();
  assert.equal(store.state.session, null);
  assert.equal(store.state.focusCount, 1);
  assert.deepEqual(notifier.titles(), ['Foco completado']);
  assert.equal(sound.plays, 1);
});

test('el sonido de un foco completado no se repite en otros ticks ni al reabrir', async t => {
  const harness = createHarness(t);
  await harness.focus.startFocus();
  harness.clock.advanceMinutes(25);
  await harness.focus.tick();
  harness.clock.advanceMinutes(1);
  await harness.focus.tick();
  await harness.focus.tick();

  const reopened = new FocusService(harness.reopen(), { blocker: harness.blocker, notifier: harness.notifier, sound: harness.sound });
  reopened.recover();
  await reopened.tick();
  assert.equal(harness.sound.plays, 1);
  assert.deepEqual(harness.notifier.titles(), ['Foco completado']);
});

test('si falla el sonido el foco igual se desbloquea y se cuenta', async t => {
  const { focus, store, blocker, notifier, sound, clock } = createHarness(t);
  await focus.startFocus();
  clock.advanceMinutes(25);
  sound.failNext();
  await focus.tick();
  assert.equal(sound.plays, 1);
  assert.equal(blocker.blocked, false);
  assert.equal(store.state.session, null);
  assert.equal(store.state.blockError, null);
  assert.equal(store.state.focusCount, 1);
  assert.deepEqual(notifier.titles(), ['Foco completado']);
});

test('si falla el desbloqueo al vencer deja un bloqueo pendiente recuperable', async t => {
  const { focus, store, blocker, notifier, sound, clock } = createHarness(t);
  await focus.startFocus();
  clock.advanceMinutes(25);
  blocker.failNext(new Error('No se pudo quitar el bloqueo.'));
  await focus.tick();
  assert.equal(store.state.session, null);
  assert.equal(store.state.blockError, 'No se pudo quitar el bloqueo.');
  assert.equal(store.state.focusCount, 0);
  assert.deepEqual(notifier.titles(), ['Bloqueo aún activo']);
  assert.equal(sound.plays, 0);
  assert.equal(focus.mustReleaseBeforeQuit(), true);

  await focus.finishFocus();
  assert.equal(store.state.blockError, null);
  assert.equal(blocker.blocked, false);
  assert.equal(focus.mustReleaseBeforeQuit(), false);
});

test('los descansos duran 5 o 15 minutos y terminan sin tocar el bloqueo', async t => {
  for (const [kind, minutes] of [['shortBreak', 5], ['longBreak', 15]] as const) {
    const { focus, store, blocker, notifier, sound, clock } = createHarness(t);
    await focus.startBreak(kind);
    assert.deepEqual(store.state.session, { kind, endsAt: clock.now() + minutes * 60000 });
    clock.advanceMinutes(minutes);
    await focus.tick();
    assert.equal(store.state.session, null);
    assert.equal(blocker.calls.length, 0);
    assert.deepEqual(notifier.titles(), ['Descanso terminado']);
    assert.equal(sound.plays, 0);
  }
});

test('rechaza descansos inválidos o superpuestos', async t => {
  const { focus } = createHarness(t);
  await assert.rejects(focus.startBreak('siesta'), /inválido/);
  await focus.startBreak('shortBreak');
  await assert.rejects(focus.startBreak('longBreak'), /Termina la sesión/);
});

test('finishBreak nunca cierra una sesión de foco', async t => {
  const { focus, store } = createHarness(t);
  await focus.startFocus();
  await focus.finishBreak();
  assert.equal(store.state.session?.kind, 'focus');
});

test('recover reconcilia el estado guardado con /etc/hosts', t => {
  const focusSession = { kind: 'focus' as const, endsAt: Date.now() };
  const cases = [
    { blocked: true, saved: {}, session: null, error: /bloqueo anterior/ },
    { blocked: true, saved: { session: focusSession }, session: 'focus', error: null },
    { blocked: false, saved: { session: focusSession }, session: null, error: null },
    { blocked: false, saved: { blockError: 'viejo' }, session: null, error: null }
  ];
  for (const item of cases) {
    const { focus, store, blocker } = createHarness(t, { saved: item.saved });
    blocker.blocked = item.blocked;
    focus.recover();
    assert.equal(store.state.session?.kind ?? null, item.session);
    if (item.error) assert.match(store.state.blockError ?? '', item.error);
    else assert.equal(store.state.blockError, null);
  }
});

test('terminar el foco sin sesión ni bloqueo pendiente no toca hosts', async t => {
  const { focus, blocker } = createHarness(t);
  assert.equal(focus.mustReleaseBeforeQuit(), false);
  await focus.finishFocus();
  assert.equal(blocker.calls.length, 0);
});

test('durante el foco hay que quitar el bloqueo antes de salir', async t => {
  const { focus } = createHarness(t);
  await focus.startFocus();
  assert.equal(focus.mustReleaseBeforeQuit(), true);
});

test('finishBreak cierra el descanso en curso y tolera no tener sesión', async t => {
  const { focus, store } = createHarness(t);
  await focus.finishBreak();
  await focus.startBreak('longBreak');
  await focus.finishBreak();
  assert.equal(store.state.session, null);
});

test('guarda como texto un fallo de desbloqueo que no es un Error', async t => {
  const { focus, store, blocker, clock } = createHarness(t);
  await focus.startFocus();
  clock.advanceMinutes(25);
  blocker.failNext('sin permiso' as unknown as Error);
  await focus.tick();
  assert.equal(store.state.blockError, 'sin permiso');
});
