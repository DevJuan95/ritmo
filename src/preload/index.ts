import { contextBridge, ipcRenderer } from 'electron';
import type { ApiError, IpcResult, PublicState, RitmoAPI } from '../shared/contracts';

// El preload con sandbox no puede cargar módulos locales mediante require().
const GENERIC_ERROR_MESSAGE = 'No se pudo completar la operación. Inténtalo de nuevo.';

async function invoke<T>(channel: string, ...args: unknown[]): Promise<T> {
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
  addTask: (title, date) => invoke('add-task', title, date),
  toggleTask: id => invoke('toggle-task', id),
  deleteTask: id => invoke('delete-task', id),
  getTasksForDay: date => invoke('get-tasks-for-day', date),
  getTaskSummary: (from, to) => invoke('get-task-summary', from, to),
  updateTask: (id, patch) => invoke('update-task', id, patch),
  addDomain: domain => invoke('add-domain', domain),
  removeDomain: domain => invoke('remove-domain', domain),
  retryUnblock: () => invoke('retry-unblock'),
  onState: callback => {
    const listener = (_event: Electron.IpcRendererEvent, state: PublicState) => callback(state);
    ipcRenderer.on('state', listener);
    return () => ipcRenderer.removeListener('state', listener);
  }
};

contextBridge.exposeInMainWorld('ritmo', ritmo);
