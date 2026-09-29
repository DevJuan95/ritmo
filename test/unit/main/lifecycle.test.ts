import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_SHUTDOWN_TIMEOUT_MS, LifecycleService } from '../../../src/main/lifecycle';
import { FakeClock, FakeQuitSignals } from '../../helpers/fakes';
import { createHarness } from '../../helpers/harness';

/** Deja correr las promesas pendientes sin avanzar el reloj. */
const settle = () => new Promise<void>(resolve => setImmediate(resolve));

function repositoryClosed(harness: ReturnType<typeof createHarness>): boolean {
  return (harness.repository as unknown as { closed: boolean }).closed;
}

test('start recupera, cierra la sesión vencida con la app cerrada y hace el tic cada segundo', async t => {
  const harness = createHarness(t, { saved: { session: { kind: 'focus', endsAt: Date.UTC(2020, 0, 1) } } });
  const { lifecycle, store, blocker, clock } = harness;
  blocker.blocked = true;
  const errors: unknown[] = [];
  lifecycle.start(error => errors.push(error));
  await settle();
  assert.equal(store.state.session, null);
  assert.equal(store.state.focusCount, 1);
  assert.deepEqual(blocker.calls.map(call => call.action), ['unblock']);

  await store.guarded(async () => { store.state.session = { kind: 'shortBreak', endsAt: clock.now() + 1500 }; });
  clock.advance(1000);
  await settle();
  assert.equal(store.state.session!.kind, 'shortBreak');
  clock.advance(1000);
  await settle();
  assert.equal(store.state.session, null);
  assert.deepEqual(errors, []);
});

test('start informa de los errores del tic sin detenerlo', async t => {
  const { lifecycle, focus, clock } = createHarness(t);
  const tick = t.mock.method(focus, 'tick', async () => { throw new Error('falló el tic'); });
  const errors: unknown[] = [];
  lifecycle.start(error => errors.push(error));
  clock.advance(2000);
  await settle();
  assert.equal(tick.mock.callCount(), 3);
  assert.equal(errors.length, 3);
});

test('cierre sin foco: detiene el tic, guarda el estado y cierra SQLite sin tocar el bloqueo', async t => {
  const harness = createHarness(t);
  const { lifecycle, store, blocker, clock } = harness;
  lifecycle.start(() => {});
  store.state.focusCount = 2;
  await lifecycle.shutdown();
  assert.equal(clock.pendingTimers, 0);
  assert.equal(blocker.calls.length, 0);
  assert.equal(harness.readSaved().focusCount, 2);
  assert.equal(repositoryClosed(harness), true);
  assert.equal(store.closing, true);
  await assert.rejects(harness.focus.startFocus(), /se está cerrando/);
});

test('cierre con foco: quita el bloqueo y persiste el estado sin sesión', async t => {
  const harness = createHarness(t);
  const { lifecycle, focus, blocker, notifier } = harness;
  await focus.startFocus();
  await lifecycle.shutdown();
  assert.deepEqual(blocker.calls.map(call => call.action), ['block', 'unblock']);
  assert.equal(blocker.calls[1].authorize, false, 'al salir no se pide autorización');
  assert.equal(blocker.blocked, false);
  assert.equal(harness.readSaved().session, null);
  assert.equal(harness.readSaved().blockError, null);
  assert.deepEqual(notifier.sent, []);
  assert.equal(repositoryClosed(harness), true);
});

test('cierre con bloqueo pendiente: vuelve a intentar quitarlo', async t => {
  const harness = createHarness(t, { saved: { blockError: 'pendiente' } });
  harness.blocker.blocked = true;
  await harness.lifecycle.shutdown();
  assert.equal(harness.blocker.blocked, false);
  assert.equal(harness.readSaved().blockError, null);
});

test('si falla el desbloqueo, sale igualmente con blockError persistido y sin el foco', async t => {
  const harness = createHarness(t);
  const { lifecycle, focus, blocker, notifier, clock } = harness;
  await focus.startFocus();
  blocker.failNext(new Error('Se canceló la autorización de macOS.'));
  await lifecycle.shutdown();
  const saved = harness.readSaved();
  assert.equal(saved.blockError, 'Se canceló la autorización de macOS.');
  assert.equal(saved.session, null);
  assert.deepEqual(notifier.titles(), ['Bloqueo aún activo']);
  assert.equal(repositoryClosed(harness), true);

  // Al reabrir después de la hora de fin, el foco interrumpido no cuenta como pomodoro.
  const later = new FakeClock(clock.now());
  later.advanceMinutes(30);
  const reopened = createHarness(t, { saved, clock: later });
  reopened.blocker.blocked = true;
  reopened.focus.recover();
  await reopened.focus.tick();
  assert.match(reopened.store.state.blockError ?? '', /bloqueo anterior/);
  assert.equal(reopened.store.state.session, null);
  assert.equal(reopened.store.state.focusCount, 0);
  assert.deepEqual(reopened.notifier.sent, []);
  assert.equal(reopened.focus.mustReleaseBeforeQuit(), true);
});

test('guarda como texto un fallo de desbloqueo que no es Error', async t => {
  const harness = createHarness(t, { saved: { blockError: 'pendiente' } });
  t.mock.method(harness.blocker, 'changeBlock', () => Promise.reject('sin permiso'));
  await harness.lifecycle.shutdown();
  assert.equal(harness.readSaved().blockError, 'sin permiso');
});

test('una salida durante una operación protegida espera a que termine y luego cierra', async t => {
  const harness = createHarness(t);
  const { lifecycle, focus, blocker, store } = harness;
  const release = blocker.hold();
  const starting = focus.startFocus();
  let closed = false;
  const closing = lifecycle.shutdown().then(() => { closed = true; });
  await settle();
  assert.equal(closed, false);
  assert.deepEqual(blocker.calls.map(call => call.action), ['block']);

  release();
  await Promise.all([starting, closing]);
  assert.deepEqual(blocker.calls.map(call => call.action), ['block', 'unblock']);
  assert.equal(store.state.session, null);
  assert.equal(harness.readSaved().session, null);
  assert.equal(repositoryClosed(harness), true);
});

test('varias señales ejecutan el cierre y la salida una sola vez', async t => {
  const harness = createHarness(t);
  const { lifecycle, focus, blocker } = harness;
  await focus.startFocus();
  const signals = new FakeQuitSignals();
  const exits: unknown[] = [];
  lifecycle.listen(signals, error => exits.push(error));
  const close = t.mock.method(harness.repository, 'close');
  signals.emit('before-quit');
  signals.emit('SIGINT');
  signals.emit('SIGTERM');
  signals.emit('shutdown');
  assert.equal(lifecycle.shutdown(), lifecycle.shutdown());
  await lifecycle.shutdown();
  await settle();
  assert.deepEqual(exits, [undefined]);
  assert.deepEqual(blocker.calls.map(call => call.action), ['block', 'unblock']);
  assert.equal(close.mock.callCount(), 1);
});

test('si el cierre falla, sale igualmente informando del error y cierra SQLite', async t => {
  const harness = createHarness(t);
  const { lifecycle, store } = harness;
  t.mock.method(store, 'save', () => { throw new Error('disco lleno'); });
  const signals = new FakeQuitSignals();
  const exits: unknown[] = [];
  lifecycle.listen(signals, error => exits.push(error));
  signals.emit('SIGTERM');
  await settle();
  assert.equal(exits.length, 1);
  assert.match(String(exits[0]), /disco lleno/);
  assert.equal(repositoryClosed(harness), true);
});

test('al agotarse el tiempo máximo sale dejando blockError para recover() y lo notifica', async t => {
  const harness = createHarness(t, { shutdownTimeoutMs: 5000 });
  const { lifecycle, focus, blocker, clock, notifier } = harness;
  await focus.startFocus();
  const release = blocker.hold();
  let closed = false;
  const closing = lifecycle.shutdown().then(() => { closed = true; });
  await settle();
  clock.advance(4999);
  await settle();
  assert.equal(closed, false);
  clock.advance(1);
  await closing;
  const saved = harness.readSaved();
  assert.equal(saved.blockError, 'Ritmo se cerró antes de quitar el bloqueo.');
  assert.equal(saved.session, null);
  assert.deepEqual(notifier.titles(), ['Bloqueo aún activo']);
  assert.equal(repositoryClosed(harness), true);
  assert.equal(clock.pendingTimers, 0);

  const stillBlocked = createHarness(t, { saved });
  stillBlocked.blocker.blocked = true;
  stillBlocked.focus.recover();
  assert.match(stillBlocked.store.state.blockError ?? '', /bloqueo anterior/);

  // Si macOS termina de desbloquear después, recover() lo reconcilia en el siguiente arranque.
  release();
  await settle();
  const reopened = createHarness(t, { saved });
  reopened.focus.recover();
  assert.equal(reopened.store.state.blockError, null);
  assert.equal(reopened.store.state.session, null);
});

test('el desbloqueo tiene su propio tiempo máximo tras esperar la operación en curso', async t => {
  const harness = createHarness(t, { shutdownTimeoutMs: 5000 });
  const { lifecycle, focus, blocker, clock } = harness;
  const releaseBlock = blocker.hold();
  const starting = focus.startFocus();
  let closed = false;
  const closing = lifecycle.shutdown().then(() => { closed = true; });
  clock.advance(4000);
  releaseBlock();
  const releaseUnblock = blocker.hold();
  await starting;
  await settle();
  assert.deepEqual(blocker.calls.map(call => call.action), ['block', 'unblock']);

  clock.advance(4999);
  await settle();
  assert.equal(closed, false);
  releaseUnblock();
  await closing;
  assert.equal(harness.readSaved().session, null);
  assert.equal(harness.readSaved().blockError, null);
  assert.deepEqual(harness.notifier.sent, []);
});

test('si la operación en curso agota el tiempo, no empieza el desbloqueo', async t => {
  const harness = createHarness(t, { saved: { blockError: 'pendiente' }, shutdownTimeoutMs: 10 });
  const { lifecycle, store, blocker, clock } = harness;
  let finish!: () => void;
  const stuck = store.guarded(() => new Promise<void>(resolve => { finish = resolve; }));
  const closing = lifecycle.shutdown();
  clock.advance(10);
  await closing;
  assert.deepEqual(blocker.calls, []);
  assert.equal(harness.readSaved().blockError, 'pendiente');
  assert.equal(clock.pendingTimers, 0);
  finish();
  await stuck;
});

test('al agotarse el tiempo conserva un blockError anterior', async t => {
  const harness = createHarness(t, { saved: { blockError: 'pendiente' }, shutdownTimeoutMs: 10 });
  harness.blocker.hold();
  const closing = harness.lifecycle.shutdown();
  harness.clock.advance(10);
  await closing;
  assert.equal(harness.readSaved().blockError, 'pendiente');
  assert.deepEqual(harness.notifier.titles(), ['Bloqueo aún activo']);
});

test('al agotarse el tiempo, las señales llaman a exit una sola vez y sin error', async t => {
  const harness = createHarness(t, { shutdownTimeoutMs: 10 });
  const { lifecycle, focus, blocker, clock } = harness;
  await focus.startFocus();
  blocker.hold();
  const signals = new FakeQuitSignals();
  const exits: unknown[] = [];
  lifecycle.listen(signals, error => exits.push(error));
  signals.emit('before-quit');
  signals.emit('SIGINT');
  clock.advance(10);
  signals.emit('SIGTERM');
  await settle();
  assert.deepEqual(exits, [undefined]);
  assert.equal(harness.readSaved().blockError, 'Ritmo se cerró antes de quitar el bloqueo.');
});

test('al agotarse el tiempo mientras se inicia un foco no marca bloqueo; recover() lo reconcilia', async t => {
  const harness = createHarness(t, { shutdownTimeoutMs: 10 });
  const { lifecycle, focus, blocker, clock, notifier } = harness;
  const release = blocker.hold();
  const starting = focus.startFocus();
  const closing = lifecycle.shutdown();
  clock.advance(10);
  await closing;
  assert.equal(harness.readSaved().blockError, null);
  assert.equal(harness.readSaved().session, null);
  assert.deepEqual(notifier.sent, []);

  // Si macOS aplica el bloqueo después, la operación lo guarda y recover() mantiene el foco.
  release();
  await starting;
  const saved = harness.readSaved();
  assert.equal(saved.session?.kind, 'focus');
  const reopened = createHarness(t, { saved });
  reopened.blocker.blocked = true;
  reopened.focus.recover();
  assert.equal(reopened.store.state.session?.kind, 'focus');
  assert.equal(reopened.store.state.blockError, null);
});

test('al agotarse el tiempo sin nada que desbloquear no inventa un bloqueo pendiente', async t => {
  const harness = createHarness(t, { shutdownTimeoutMs: 10 });
  const { store, lifecycle, clock } = harness;
  let finish!: () => void;
  const stuck = store.guarded(() => new Promise<void>(resolve => { finish = resolve; }));
  const closing = lifecycle.shutdown();
  clock.advance(10);
  await closing;
  assert.equal(harness.readSaved().blockError, null);
  finish();
  await stuck;
});

test('usa un tiempo máximo por defecto', async t => {
  const harness = createHarness(t);
  const lifecycle = new LifecycleService({
    store: harness.store, focus: harness.focus, notifier: harness.notifier, tasks: harness.repository, timers: harness.clock
  });
  harness.store.guarded(() => new Promise<void>(() => {})).catch(() => {});
  const closing = lifecycle.shutdown();
  harness.clock.advance(DEFAULT_SHUTDOWN_TIMEOUT_MS - 1);
  await settle();
  assert.equal(repositoryClosed(harness), false);
  harness.clock.advance(1);
  await closing;
  assert.equal(repositoryClosed(harness), true);
});
