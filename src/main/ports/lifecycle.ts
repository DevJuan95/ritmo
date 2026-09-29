/** Motivo por el que se pide salir: `before-quit`, una señal del proceso o el apagado de macOS. */
export type QuitReason = 'before-quit' | 'SIGINT' | 'SIGTERM' | 'shutdown';

/** Avisos de que la app debe cerrarse. Cada aviso puede llegar varias veces. */
export interface QuitSignals {
  subscribe(listener: (reason: QuitReason) => void): void;
}
