import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import type { SoundPlayer } from './ports';

export interface SoundPlayerDeps {
  exec: (file: string, args: string[], options: { timeout: number }) => Promise<unknown>;
  platform: NodeJS.Platform;
  soundPath: string;
}

/** Reproduce un sonido del sistema con `afplay`; suena aunque Ritmo esté en segundo plano. */
export function createSoundPlayer(overrides: Partial<SoundPlayerDeps> = {}): SoundPlayer {
  const deps: SoundPlayerDeps = {
    exec: promisify(execFile),
    platform: process.platform,
    soundPath: '/System/Library/Sounds/Glass.aiff',
    ...overrides
  };

  return {
    play() {
      if (deps.platform !== 'darwin') return;
      deps.exec('/usr/bin/afplay', [deps.soundPath], { timeout: 10000 }).catch(error => console.error('No se pudo reproducir el sonido:', error));
    }
  };
}
