import test from 'node:test';
import assert from 'node:assert/strict';
import { createHarness } from '../../helpers/harness';

test('añade dominios normalizados sin duplicarlos y los guarda', t => {
  const harness = createHarness(t, { saved: { domains: ['x.com'] } });
  harness.domains.add('https://Instagram.com/reels');
  harness.domains.add('X.com');
  assert.deepEqual(harness.store.state.domains, ['x.com', 'instagram.com']);
  assert.deepEqual(harness.readSaved().domains, ['x.com', 'instagram.com']);
});

test('rechaza dominios inválidos sin cambiar la lista', t => {
  const { domains, store } = createHarness(t, { saved: { domains: ['x.com'] } });
  assert.throws(() => domains.add('x.com; rm -rf /'), /dominio válido/);
  assert.deepEqual(store.state.domains, ['x.com']);
});

test('quita dominios existentes e ignora los desconocidos', t => {
  const { domains, store } = createHarness(t, { saved: { domains: ['x.com', 'facebook.com'] } });
  domains.remove('x.com');
  domains.remove('nada.com');
  assert.deepEqual(store.state.domains, ['facebook.com']);
});

test('no permite editar dominios durante el foco o con bloqueo pendiente', t => {
  for (const saved of [{ session: { kind: 'focus' as const, endsAt: Date.now() } }, { blockError: 'pendiente' }]) {
    const { domains, store } = createHarness(t, { saved: { ...saved, domains: ['x.com'] } });
    assert.throws(() => domains.add('instagram.com'), /cuando termine el foco/);
    assert.throws(() => domains.remove('x.com'), /cuando termine el foco/);
    assert.deepEqual(store.state.domains, ['x.com']);
  }
});

test('no permite editar dominios mientras se autoriza el bloqueo', { todo: 'DomainService no revisa store.busy; hoy solo lo impide el renderer' }, async t => {
  const { domains, focus, blocker } = createHarness(t);
  const release = blocker.hold();
  const pending = focus.startFocus();
  try { assert.throws(() => domains.add('instagram.com')); }
  finally { release(); await pending; }
});
