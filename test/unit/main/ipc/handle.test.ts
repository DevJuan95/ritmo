import test from 'node:test';
import assert from 'node:assert/strict';
import type { FocusChannels } from '../../../../src/shared/focus/contract';
import { PublicError, type IpcResult } from '../../../../src/shared/ipc';
import { createHandle } from '../../../../src/main/ipc/handle';
import { FakeIpc } from '../../../helpers/fakes';

function setup(t: { mock: { method: typeof test.mock.method } }) {
  const ipc = new FakeIpc();
  const logged: unknown[][] = [];
  t.mock.method(console, 'error', (...args: unknown[]) => { logged.push(args); });
  return { ipc, handle: createHandle<FocusChannels>(ipc), logged };
}

test('devuelve el valor del manejador y le pasa los argumentos sin el evento', async t => {
  const { ipc, handle } = setup(t);
  const received: unknown[] = [];
  handle('start-break', kind => { received.push(kind); });
  assert.deepEqual(await ipc.invokeRaw('start-break', 'shortBreak'), { ok: true, value: undefined });
  assert.deepEqual(received, ['shortBreak']);
});

test('un PublicError conserva su mensaje y registra solo su causa', async t => {
  const { ipc, handle, logged } = setup(t);
  const cause = new Error('sudo /private/secret');
  handle('start-focus', async () => { throw new PublicError('No se pudo activar el bloqueo.', { cause }); });
  handle('finish-focus', () => { throw new PublicError('Sin causa.'); });
  const withCause = await ipc.invokeRaw('start-focus') as IpcResult<void>;
  assert.deepEqual(withCause, { ok: false, error: { kind: 'expected', message: 'No se pudo activar el bloqueo.' } });
  assert.deepEqual(await ipc.invokeRaw('finish-focus'), { ok: false, error: { kind: 'expected', message: 'Sin causa.' } });
  assert.deepEqual(logged, [['Causa de error en IPC (start-focus):', cause]]);
});

test('un error inesperado cruza IPC sin detalle y queda registrado', async t => {
  const { ipc, handle, logged } = setup(t);
  const detail = new Error('sqlite /private/secret.db');
  handle('finish-break', () => { throw detail; });
  assert.deepEqual(await ipc.invokeRaw('finish-break'), { ok: false, error: { kind: 'unexpected' } });
  assert.deepEqual(logged, [['Error en IPC (finish-break):', detail]]);
});
