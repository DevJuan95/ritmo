import { ipcMain } from 'electron';
import { normalizeDomain, normalizeDomains, safePlannedDate, todayKey } from '../shared/validation';
import { FocusService } from './focus';
import { StateStore } from './state';

export function registerHandlers(store: StateStore, focus: FocusService): void {
  ipcMain.handle('get-state', () => { store.rollDay(); return store.publicState(); });
  ipcMain.handle('start-focus', () => focus.startFocus());
  ipcMain.handle('finish-focus', () => focus.finishFocus());
  ipcMain.handle('retry-unblock', () => focus.finishFocus());
  ipcMain.handle('start-break', (_event, kind: unknown) => focus.startBreak(kind));
  ipcMain.handle('finish-break', () => focus.finishBreak());
  ipcMain.handle('add-task', (_event, title: unknown, date: unknown) => {
    store.rollDay();
    if (!store.tasks) throw new Error('La base de tareas no está disponible.');
    store.tasks.create(title as string, date === undefined ? todayKey() : safePlannedDate(date));
    store.state.tasks = store.tasks.listByDay(todayKey());
    store.save();
  });
  ipcMain.handle('toggle-task', (_event, id: unknown) => {
    store.rollDay();
    if (!store.tasks) throw new Error('La base de tareas no está disponible.');
    if (typeof id !== 'string') throw new Error('Identificador de tarea inválido.');
    const task = store.state.tasks.find(item => item.id === id);
    if (task) store.tasks.update(id, { done: !task.done });
    store.state.tasks = store.tasks.listByDay(todayKey());
    store.save();
  });
  ipcMain.handle('delete-task', (_event, id: unknown) => {
    store.rollDay();
    if (!store.tasks) throw new Error('La base de tareas no está disponible.');
    if (typeof id !== 'string') throw new Error('Identificador de tarea inválido.');
    store.tasks.delete(id);
    store.state.tasks = store.tasks.listByDay(todayKey());
    store.save();
  });
  ipcMain.handle('get-tasks-for-day', (_event, date: unknown) => {
    if (!store.tasks) throw new Error('La base de tareas no está disponible.');
    return store.tasks.listByDay(safePlannedDate(date));
  });
  ipcMain.handle('update-task', (_event, id: unknown, patch: unknown) => {
    if (!store.tasks) throw new Error('La base de tareas no está disponible.');
    if (typeof id !== 'string' || !patch || typeof patch !== 'object' || Array.isArray(patch)) throw new Error('Cambio de tarea inválido.');
    store.tasks.update(id, patch as { title?: string; plannedDate?: string; done?: boolean });
    store.state.tasks = store.tasks.listByDay(todayKey());
    store.save();
  });
  ipcMain.handle('add-domain', (_event, value: unknown) => {
    if (store.state.session?.kind === 'focus' || store.state.blockError) throw new Error('Edita los sitios cuando termine el foco.');
    store.state.domains = normalizeDomains([...store.state.domains, normalizeDomain(value)]);
    store.save();
  });
  ipcMain.handle('remove-domain', (_event, domain: unknown) => {
    if (store.state.session?.kind === 'focus' || store.state.blockError) throw new Error('Edita los sitios cuando termine el foco.');
    store.state.domains = store.state.domains.filter(item => item !== domain);
    store.save();
  });
}
