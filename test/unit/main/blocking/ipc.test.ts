import test from 'node:test';
import assert from 'node:assert/strict';
import { registerBlockingIpc } from '../../../../src/main/blocking/ipc';
import { createHandle } from '../../../../src/main/ipc/handle';
import { FakeIpc } from '../../../helpers/fakes';
import { createHarness } from '../../../helpers/harness';

function setup(t: Parameters<typeof createHarness>[0], options: Parameters<typeof createHarness>[1] = {}) {
  const ipc = new FakeIpc();
  const harness = createHarness(t, options);
  registerBlockingIpc(createHandle(ipc), harness);
  return { ipc, ...harness };
}

test('los canales de dominios validan en el proceso principal', async t => {
  const { ipc, store } = setup(t, { saved: { domains: ['x.com'] } });
  await ipc.invoke('add-domain', 'https://Instagram.com/');
  await ipc.invoke('remove-domain', 'x.com');
  assert.deepEqual(store.state.domains, ['instagram.com']);
  await assert.rejects(ipc.invoke('add-domain', 'no es dominio'), /dominio válido/);
});

test('retry-unblock quita un bloqueo pendiente', async t => {
  const { ipc, store, blocker } = setup(t, { saved: { blockError: 'pendiente' } });
  await ipc.invoke('retry-unblock');
  assert.equal(store.state.blockError, null);
  assert.deepEqual(blocker.calls.map(call => call.action), ['unblock']);
});
