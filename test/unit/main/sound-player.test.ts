import test from 'node:test';
import assert from 'node:assert/strict';
import { createSoundPlayer, type SoundPlayerDeps } from '../../../src/main/sound-player';

function playerWith(overrides: Partial<SoundPlayerDeps> = {}) {
  const calls: Array<{ file: string; args: string[] }> = [];
  const player = createSoundPlayer({
    platform: 'darwin',
    soundPath: '/sonidos/fin.aiff',
    exec: async (file, args) => { calls.push({ file, args }); },
    ...overrides
  });
  return { player, calls };
}

test('en macOS reproduce el sonido con afplay', () => {
  const { player, calls } = playerWith();
  player.play();
  assert.deepEqual(calls, [{ file: '/usr/bin/afplay', args: ['/sonidos/fin.aiff'] }]);
});

test('fuera de macOS no ejecuta nada', () => {
  const { player, calls } = playerWith({ platform: 'linux' });
  player.play();
  assert.equal(calls.length, 0);
});

test('un fallo de afplay se registra sin propagarse', async t => {
  const logged = t.mock.method(console, 'error', () => {});
  const failure = new Error('afplay no disponible');
  const { player } = playerWith({ exec: () => Promise.reject(failure) });
  assert.doesNotThrow(() => player.play());
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(logged.mock.callCount(), 1);
  assert.equal(logged.mock.calls[0].arguments[1], failure);
});

test('usa por defecto un sonido del sistema', () => {
  const calls: string[][] = [];
  createSoundPlayer({ platform: 'darwin', exec: async (_file, args) => { calls.push(args); } }).play();
  assert.deepEqual(calls, [['/System/Library/Sounds/Glass.aiff']]);
});
