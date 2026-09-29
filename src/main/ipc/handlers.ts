import { PublicError, type IpcResult } from '../../shared/contracts';
import type { DomainServicePort } from '../blocking/ports';
import type { FocusServicePort } from '../focus/ports';
import type { StateStorePort } from '../state/ports';
import type { TaskServicePort } from '../tasks/ports';
import type { IpcRegistrar } from './ports';

export interface Services {
  store: StateStorePort;
  focus: FocusServicePort;
  tasks: TaskServicePort;
  domains: DomainServicePort;
}

export function registerHandlers(ipc: IpcRegistrar, { store, focus, tasks, domains }: Services): void {
  function handle<T>(channel: string, work: (...args: any[]) => T | Promise<T>): void {
    ipc.handle(channel, async (_event, ...args): Promise<IpcResult<T>> => {
      try { return { ok: true, value: await work(...args) }; }
      catch (error) {
        if (error instanceof PublicError) {
          if (error.cause) console.error(`Causa de error en IPC (${channel}):`, error.cause);
          return { ok: false, error: { kind: 'expected', message: error.message } };
        }
        console.error(`Error en IPC (${channel}):`, error);
        return { ok: false, error: { kind: 'unexpected' } };
      }
    });
  }

  handle('get-state', () => { store.rollDay(); return store.publicState(); });
  handle('start-focus', () => focus.startFocus());
  handle('finish-focus', () => focus.finishFocus());
  handle('retry-unblock', () => focus.finishFocus());
  handle('start-break', (kind: unknown) => focus.startBreak(kind));
  handle('finish-break', () => focus.finishBreak());
  handle('add-task', (title: unknown, date: unknown) => tasks.add(title, date));
  handle('toggle-task', (id: unknown) => tasks.toggle(id));
  handle('delete-task', (id: unknown) => tasks.remove(id));
  handle('get-tasks-for-day', (date: unknown) => tasks.listByDay(date));
  handle('get-task-summary', (from: unknown, to: unknown) => tasks.summarize(from, to));
  handle('update-task', (id: unknown, patch: unknown) => tasks.update(id, patch));
  handle('add-domain', (value: unknown) => domains.add(value));
  handle('remove-domain', (domain: unknown) => domains.remove(domain));
}
