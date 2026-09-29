import test from 'node:test';
import assert from 'node:assert/strict';
import { systemTimers } from '../../../../src/main/common/timers';

test('systemTimers programa y cancela temporizadores reales', async () => {
  const fired: string[] = [];
  const cancelledTimeout = systemTimers.setTimeout(() => fired.push('cancelado'), 0);
  systemTimers.clearTimeout(cancelledTimeout);
  await new Promise<void>(resolve => {
    const interval = systemTimers.setInterval(() => {
      fired.push('intervalo');
      systemTimers.clearInterval(interval);
      systemTimers.setTimeout(resolve, 0);
    }, 0);
  });
  assert.deepEqual(fired, ['intervalo']);
});
