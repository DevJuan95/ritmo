import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import type { QuitReason } from '../../../src/main/ports';
import { createQuitSignals, type QuitSources } from '../../../src/main/quit-signals';

function preventable(): { preventDefault(): void; prevented: boolean } {
  return { prevented: false, preventDefault() { this.prevented = true; } };
}

test('reúne before-quit, el apagado de macOS y las señales, y cancela los eventos cancelables', () => {
  const app = new EventEmitter();
  const powerMonitor = new EventEmitter();
  const process = new EventEmitter();
  const reasons: QuitReason[] = [];
  createQuitSignals({ app, powerMonitor, process } as unknown as QuitSources).subscribe(reason => reasons.push(reason));

  const beforeQuit = preventable();
  const shutdown = preventable();
  app.emit('before-quit', beforeQuit);
  powerMonitor.emit('shutdown', shutdown);
  powerMonitor.emit('shutdown');
  process.emit('SIGINT', 'SIGINT');
  process.emit('SIGTERM', 'SIGTERM');

  assert.deepEqual(reasons, ['before-quit', 'shutdown', 'shutdown', 'SIGINT', 'SIGTERM']);
  assert.equal(beforeQuit.prevented, true);
  assert.equal(shutdown.prevented, true);
});
