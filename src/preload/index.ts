import { contextBridge, ipcRenderer } from 'electron';
import type { RitmoAPI, RitmoChannel, RitmoChannels, RitmoEvents } from '../shared/api';
import type { ApiError, IpcResult } from '../shared/ipc';

// El preload con sandbox no puede cargar módulos locales mediante require().
const GENERIC_ERROR_MESSAGE = 'No se pudo completar la operación. Inténtalo de nuevo.';

async function invoke<C extends RitmoChannel>(channel: C, ...args: Parameters<RitmoChannels[C]>): Promise<Awaited<ReturnType<RitmoChannels[C]>>> {
  type T = Awaited<ReturnType<RitmoChannels[C]>>;
  let result: IpcResult<T>;
  try { result = await ipcRenderer.invoke(channel, ...args) as IpcResult<T>; }
  catch { throw { kind: 'ritmo-api-error', message: GENERIC_ERROR_MESSAGE } satisfies ApiError; }
  if (result?.ok === true) return result.value;
  const message = result?.ok === false && result.error?.kind === 'expected' && typeof result.error.message === 'string'
    ? result.error.message : GENERIC_ERROR_MESSAGE;
  throw { kind: 'ritmo-api-error', message } satisfies ApiError;
}

const ritmo: RitmoAPI = {
  getState: () => invoke('get-state'),
  startFocus: () => invoke('start-focus'),
  finishFocus: () => invoke('finish-focus'),
  startBreak: kind => invoke('start-break', kind),
  finishBreak: () => invoke('finish-break'),
  addTask: (title, date, link) => invoke('add-task', title, date, link),
  toggleTask: id => invoke('toggle-task', id),
  deleteTask: id => invoke('delete-task', id),
  getTasksForDay: date => invoke('get-tasks-for-day', date),
  getTaskSummary: (from, to) => invoke('get-task-summary', from, to),
  updateTask: (id, patch) => invoke('update-task', id, patch),
  addDomain: domain => invoke('add-domain', domain),
  removeDomain: domain => invoke('remove-domain', domain),
  retryUnblock: () => invoke('retry-unblock'),
  listStudyRoutes: () => invoke('list-study-routes'),
  createStudyRoute: route => invoke('create-study-route', route),
  updateStudyRoute: (id, route) => invoke('update-study-route', id, route),
  deleteStudyRoute: id => invoke('delete-study-route', id),
  getStudyProgress: () => invoke('get-study-progress'),
  onState: callback => {
    const channel = 'state' satisfies keyof RitmoEvents;
    const listener = (_event: Electron.IpcRendererEvent, state: RitmoEvents[typeof channel]) => callback(state);
    ipcRenderer.on(channel, listener);
    return () => ipcRenderer.removeListener(channel, listener);
  }
};

contextBridge.exposeInMainWorld('ritmo', ritmo);
