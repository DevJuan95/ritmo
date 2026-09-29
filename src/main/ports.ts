import type { PublicState, Task } from '../shared/contracts';

export type BlockAction = 'block' | 'unblock';

export interface SiteBlocker {
  hasManagedBlock(): boolean;
  changeBlock(action: BlockAction, domains: string[]): Promise<void>;
}

export interface Notifier {
  notify(title: string, body: string): void;
}

export interface SoundPlayer {
  play(): void;
}

export type TaskPatch = { title?: string; plannedDate?: string; done?: boolean };

export interface TaskRepositoryPort {
  listByDay(date: string): Task[];
  create(title: string, date: string): Task;
  update(id: string, patch: TaskPatch): Task;
  delete(id: string): void;
  importLegacy(tasks: ReadonlyArray<{ id: string; title: string; done: boolean }>, day: string): void;
}

export type Clock = () => number;
export type IdGenerator = () => string;
export type PublishState = (state: PublicState) => void;

export interface IpcRegistrar {
  handle(channel: string, listener: (event: unknown, ...args: any[]) => unknown): void;
}

export type TimerHandle = unknown;

/** Temporizadores del proceso: el intervalo del tic y el tiempo máximo del cierre. */
export interface Timers {
  setInterval(callback: () => void, ms: number): TimerHandle;
  clearInterval(handle: TimerHandle): void;
  setTimeout(callback: () => void, ms: number): TimerHandle;
  clearTimeout(handle: TimerHandle): void;
}

/** Motivo por el que se pide salir: `before-quit`, una señal del proceso o el apagado de macOS. */
export type QuitReason = 'before-quit' | 'SIGINT' | 'SIGTERM' | 'shutdown';

/** Avisos de que la app debe cerrarse. Cada aviso puede llegar varias veces. */
export interface QuitSignals {
  subscribe(listener: (reason: QuitReason) => void): void;
}
