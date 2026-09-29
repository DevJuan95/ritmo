/** Puertos que comparten varios módulos del proceso principal. */

export type Clock = () => number;

export type TimerHandle = unknown;

/** Temporizadores del proceso: el intervalo del tic y el tiempo máximo del cierre. */
export interface Timers {
  setInterval(callback: () => void, ms: number): TimerHandle;
  clearInterval(handle: TimerHandle): void;
  setTimeout(callback: () => void, ms: number): TimerHandle;
  clearTimeout(handle: TimerHandle): void;
}

export interface Notifier {
  notify(title: string, body: string): void;
}
