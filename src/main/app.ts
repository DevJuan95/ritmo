import { app, BrowserWindow, ipcMain, Notification, powerMonitor } from 'electron';
import path from 'node:path';
import { createMainContainer } from './container';
import { registerHandlers } from './ipc';
import { createQuitSignals } from './quit-signals';

const resources = path.join(__dirname, '..');
const iconPath = path.join(resources, 'icon.png');
let window: BrowserWindow | undefined;

function createWindow(): void {
  window = new BrowserWindow({
    width: 1100, height: 760, minWidth: 850, minHeight: 620,
    title: 'Ritmo', icon: iconPath, backgroundColor: '#f1f4f8',
    webPreferences: { preload: path.join(resources, 'preload.js'), contextIsolation: true, nodeIntegration: false, sandbox: true }
  });
  window.loadFile(path.join(resources, 'index.html'));
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
}

app.whenReady().then(() => {
  app.setName('Ritmo');
  if (process.platform === 'darwin') app.dock?.setIcon(iconPath);
  const container = createMainContainer({
    userDataPath: app.getPath('userData'),
    notificationApi: Notification,
    publish: state => { if (window && !window.isDestroyed()) window.webContents.send('state', state); }
  });
  const { lifecycle } = container.cradle;
  // Todas las vías de salida pasan por el cierre ordenado, que ya cierra SQLite; `app.exit()` no
  // vuelve a emitir `before-quit` ni `will-quit`.
  lifecycle.listen(createQuitSignals({ app, powerMonitor, process }), error => {
    if (error) console.error(error);
    app.exit(error ? 1 : 0);
  });
  registerHandlers(ipcMain, container.cradle);
  createWindow();
  lifecycle.start(console.error);
});

app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
