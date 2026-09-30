import test from 'node:test';
import assert from 'node:assert/strict';
import type { RitmoChannel } from '../../../../src/shared/api';
import { registerHandlers } from '../../../../src/main/ipc/register';
import { FakeIpc } from '../../../helpers/fakes';
import { createHarness } from '../../../helpers/harness';

/** Todos los canales de `RitmoChannels`. Si falta o sobra uno, no compila. */
const channels: { [C in RitmoChannel]: true } = {
  'get-state': true,
  'start-focus': true,
  'finish-focus': true,
  'start-break': true,
  'finish-break': true,
  'add-task': true,
  'toggle-task': true,
  'delete-task': true,
  'get-tasks-for-day': true,
  'get-task-summary': true,
  'update-task': true,
  'add-domain': true,
  'remove-domain': true,
  'retry-unblock': true,
  'list-study-routes': true,
  'create-study-route': true,
  'update-study-route': true,
  'delete-study-route': true,
  'get-study-progress': true,
  'get-agent-settings': true,
  'save-agent-settings': true,
  'check-study-agents': true,
  'get-agent-notices': true,
  'accept-agent-notice': true,
  'propose-study-tasks': true,
  'cancel-study-proposals': true
};

test('registra una sola vez los canales de todos los módulos', t => {
  const ipc = new FakeIpc();
  registerHandlers(ipc, createHarness(t));
  assert.deepEqual([...ipc.handlers.keys()].sort(), Object.keys(channels).sort());
});
