import test from 'node:test';
import assert from 'node:assert/strict';
import { registerFocusIpc } from '../../../../src/main/focus/ipc';
import { createHandle } from '../../../../src/main/ipc/handle';
import { FakeIpc } from '../../../helpers/fakes';
import { createHarness } from '../../../helpers/harness';

test('los canales de foco y descanso llegan a FocusService', async t => {
  const ipc = new FakeIpc();
  const { store, blocker, focus } = createHarness(t);
  registerFocusIpc(createHandle(ipc), focus);
  assert.deepEqual([...ipc.handlers.keys()], ['start-focus', 'finish-focus', 'start-break', 'finish-break']);
  const session = () => store.state.session?.kind ?? null;
  await ipc.invoke('start-focus');
  assert.equal(session(), 'focus');
  await ipc.invoke('finish-focus');
  assert.equal(session(), null);
  assert.deepEqual(blocker.calls.map(call => call.action), ['block', 'unblock']);

  await ipc.invoke('start-break', 'longBreak');
  assert.equal(session(), 'longBreak');
  await ipc.invoke('finish-break');
  assert.equal(session(), null);
  await assert.rejects(ipc.invoke('start-break', 'siesta'), /inválido/);
});
