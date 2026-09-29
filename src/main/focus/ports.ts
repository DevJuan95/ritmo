import type { ChangeBlockOptions } from '../blocking/ports';

export interface SoundPlayer {
  play(): void;
}

/** Operaciones de foco y descanso que pide el renderer. */
export interface FocusServicePort {
  startFocus(): Promise<void>;
  finishFocus(): Promise<void>;
  startBreak(kind: unknown): Promise<void>;
  finishBreak(): Promise<void>;
}

/** Lo que el ciclo de vida usa del foco: arranque, tic y liberación al salir. */
export interface FocusLifecyclePort {
  /** Reconcilia la sesión guardada con `/etc/hosts` al arrancar. */
  recover(): void;
  tick(): Promise<void>;
  mustReleaseBeforeQuit(): boolean;
  endFocus(completed: boolean, options?: ChangeBlockOptions): Promise<void>;
}
