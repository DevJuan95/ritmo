import type { ChangeBlockOptions } from '../blocking/ports';

export interface SoundPlayer {
  play(): void;
}

export interface FocusServicePort {
  startFocus(): Promise<void>;
  finishFocus(): Promise<void>;
  startBreak(kind: unknown): Promise<void>;
  finishBreak(): Promise<void>;
  /** Reconcilia la sesión guardada con `/etc/hosts` al arrancar. */
  recover(): void;
  tick(): Promise<void>;
  mustReleaseBeforeQuit(): boolean;
  endFocus(completed: boolean, options?: ChangeBlockOptions): Promise<void>;
}
