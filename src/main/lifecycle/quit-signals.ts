import type { QuitReason, QuitSignals } from './ports';

interface Preventable {
  preventDefault(): void;
}

/** Lo que `createQuitSignals` necesita de `app`, `powerMonitor` y `process`. */
export interface QuitSources {
  app: { on(event: 'before-quit', listener: (event: Preventable) => void): unknown };
  /** Electron pasa un evento cancelable aunque sus tipos declaren el oyente sin argumentos. */
  powerMonitor: { on(event: 'shutdown', listener: (event?: Preventable) => void): unknown };
  process: { on(event: 'SIGINT' | 'SIGTERM', listener: () => void): unknown };
}

/**
 * Reúne las vías de salida. Cancela `before-quit` y el apagado de macOS para que el cierre ordenado
 * termine antes; la app sale después con `app.exit()`, que ya no emite `before-quit`.
 */
export function createQuitSignals({ app, powerMonitor, process }: QuitSources): QuitSignals {
  return {
    subscribe(listener: (reason: QuitReason) => void): void {
      app.on('before-quit', event => { event.preventDefault(); listener('before-quit'); });
      powerMonitor.on('shutdown', event => { event?.preventDefault(); listener('shutdown'); });
      process.on('SIGINT', () => listener('SIGINT'));
      process.on('SIGTERM', () => listener('SIGTERM'));
    }
  };
}
