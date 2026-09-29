import { contextBridge, ipcRenderer } from 'electron';
import type { PublicState, RitmoAPI } from './shared/contracts';

const ritmo: RitmoAPI = {
  getState: () => ipcRenderer.invoke('get-state'),
  startFocus: () => ipcRenderer.invoke('start-focus'),
  finishFocus: () => ipcRenderer.invoke('finish-focus'),
  startBreak: kind => ipcRenderer.invoke('start-break', kind),
  finishBreak: () => ipcRenderer.invoke('finish-break'),
  addTask: (title, date) => ipcRenderer.invoke('add-task', title, date),
  toggleTask: id => ipcRenderer.invoke('toggle-task', id),
  deleteTask: id => ipcRenderer.invoke('delete-task', id),
  getTasksForDay: date => ipcRenderer.invoke('get-tasks-for-day', date),
  updateTask: (id, patch) => ipcRenderer.invoke('update-task', id, patch),
  addDomain: domain => ipcRenderer.invoke('add-domain', domain),
  removeDomain: domain => ipcRenderer.invoke('remove-domain', domain),
  retryUnblock: () => ipcRenderer.invoke('retry-unblock'),
  onState: callback => {
    const listener = (_event: Electron.IpcRendererEvent, state: PublicState) => callback(state);
    ipcRenderer.on('state', listener);
    return () => ipcRenderer.removeListener('state', listener);
  }
};

contextBridge.exposeInMainWorld('ritmo', ritmo);
