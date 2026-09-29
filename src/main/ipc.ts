import type { DomainService } from './domains';
import type { FocusService } from './focus';
import type { IpcRegistrar } from './ports';
import type { StateStore } from './state';
import type { TaskService } from './task-service';

export interface Services {
  store: StateStore;
  focus: FocusService;
  tasks: TaskService;
  domains: DomainService;
}

export function registerHandlers(ipc: IpcRegistrar, { store, focus, tasks, domains }: Services): void {
  ipc.handle('get-state', () => { store.rollDay(); return store.publicState(); });
  ipc.handle('start-focus', () => focus.startFocus());
  ipc.handle('finish-focus', () => focus.finishFocus());
  ipc.handle('retry-unblock', () => focus.finishFocus());
  ipc.handle('start-break', (_event, kind: unknown) => focus.startBreak(kind));
  ipc.handle('finish-break', () => focus.finishBreak());
  ipc.handle('add-task', (_event, title: unknown, date: unknown) => tasks.add(title, date));
  ipc.handle('toggle-task', (_event, id: unknown) => tasks.toggle(id));
  ipc.handle('delete-task', (_event, id: unknown) => tasks.remove(id));
  ipc.handle('get-tasks-for-day', (_event, date: unknown) => tasks.listByDay(date));
  ipc.handle('get-task-summary', (_event, from: unknown, to: unknown) => tasks.summarize(from, to));
  ipc.handle('update-task', (_event, id: unknown, patch: unknown) => tasks.update(id, patch));
  ipc.handle('add-domain', (_event, value: unknown) => domains.add(value));
  ipc.handle('remove-domain', (_event, domain: unknown) => domains.remove(domain));
}
