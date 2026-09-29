import { app, BrowserWindow, dialog, ipcMain, Notification } from 'electron';
import path from 'node:path';
import type { AwilixContainer } from 'awilix';
import { createMainContainer, type MainCradle } from './container';
import type { FocusService } from './focus';
import { registerHandlers } from './ipc';
import type { StateStore } from './state';

const resources = path.join(__dirname, '..');
const iconPath = path.join(resources, 'icon.png');
let window: BrowserWindow | undefined;
let store: StateStore;
let focus: FocusService;
let container: AwilixContainer<MainCradle> | undefined;
let timer: NodeJS.Timeout | undefined;
let quitting = false;

function createWindow(): void {
  window = new BrowserWindow({
    width: 1100, height: 760, minWidth: 850, minHeight: 620,
    title: 'Ritmo', icon: iconPath, backgroundColor: '#f1f4f8',
    webPreferences: { preload: path.join(resources, 'preload.js'), contextIsolation: true, nodeIntegration: false, sandbox: true }
  });
  window.loadFile(path.join(resources, 'index.html'));
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
}

app.whenReady().then(async () => {
  app.setName('Ritmo');
  if (process.platform === 'darwin') app.dock?.setIcon(iconPath);
  container = createMainContainer({
    userDataPath: app.getPath('userData'),
    notificationApi: Notification,
    publish: state => { if (window && !window.isDestroyed()) window.webContents.send('state', state); }
  });
  ({ store, focus } = container.cradle);
  focus.recover();
  registerHandlers(ipcMain, container.cradle);
  createWindow();
  store.rollDay();
  if (store.state.session?.kind === 'focus' && store.now() >= store.state.session.endsAt) await focus.tick();
  timer = setInterval(() => { focus.tick().catch(console.error); }, 1000);
});

app.on('before-quit', event => {
  if (quitting || !store || !focus.mustReleaseBeforeQuit()) return;
  event.preventDefault();
  if (store.busy) return;
  store.guarded(async () => {
    try { await focus.endFocus(false); quitting = true; app.quit(); }
    catch (error) {
      store.state.blockError = error instanceof Error ? error.message : String(error);
      window?.show();
      dialog.showErrorBox('El bloqueo sigue activo', 'No se pudo quitar el bloqueo. Autoriza el cambio en macOS y usa “Quitar bloqueo” antes de salir.');
    }
  }).catch(console.error);
});

app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
app.on('will-quit', event => {
  if (timer) clearInterval(timer);
  if (!container) return;
  // Awilix ejecuta los disposers (cierre de SQLite) de forma asíncrona. Se sale al terminar con
  // `app.exit`, porque `app.quit` no vuelve a emitir `will-quit` una vez cancelado.
  event.preventDefault();
  container.dispose().catch(console.error).finally(() => app.exit());
});
