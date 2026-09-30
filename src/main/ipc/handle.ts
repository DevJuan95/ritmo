import { PublicError, type IpcResult } from '../../shared/ipc';
import type { Channels, Handle, IpcRegistrar } from './ports';

/**
 * Crea el `handle` con que cada módulo registra sus canales. Cada manejador devuelve un `IpcResult`:
 * un `PublicError` conserva su mensaje; cualquier otro error se registra aquí y cruza IPC sin detalle.
 */
export function createHandle<C extends Channels>(ipc: IpcRegistrar): Handle<C> {
  return (channel, work) => {
    ipc.handle(channel, async (_event, ...args): Promise<IpcResult<unknown>> => {
      try { return { ok: true, value: await (work as (...values: unknown[]) => unknown)(...args) }; }
      catch (error) {
        if (error instanceof PublicError) {
          if (error.cause) console.error(`Causa de error en IPC (${channel}):`, error.cause);
          return { ok: false, error: { kind: 'expected', message: error.message } };
        }
        console.error(`Error en IPC (${channel}):`, error);
        return { ok: false, error: { kind: 'unexpected' } };
      }
    });
  };
}
