import test from 'node:test';
import assert from 'node:assert/strict';
import type { PublicState } from '../../../../src/shared/state/contract';
import { createHandle } from '../../../../src/main/ipc/handle';
import { registerStateIpc } from '../../../../src/main/state/ipc';
import { FakeIpc } from '../../../helpers/fakes';
import { createHarness } from '../../../helpers/harness';

test('get-state avanza de día antes de devolver el estado público', async t => {
  const ipc = new FakeIpc();
  const { store, clock } = createHarness(t, { saved: { focusCount: 2 } });
  registerStateIpc(createHandle(ipc), store);
  clock.nextDay();
  const state = await ipc.invoke('get-state') as PublicState;
  assert.equal(state.day, '2026-09-30');
  assert.equal(state.focusCount, 0);
  assert.equal(state.busy, false);
  assert.equal(state.now, clock.now());
  assert.deepEqual([...ipc.handlers.keys()], ['get-state']);
});
