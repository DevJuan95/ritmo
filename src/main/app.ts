import { app, BrowserWindow, ipcMain, Notification, powerMonitor, screen } from 'electron';
import path from 'node:path';
import type { RitmoEvents } from '../shared/api';
import { createMainContainer } from './container';
import { registerHandlers } from './ipc/register';
import { createQuitSignals } from './lifecycle/quit-signals';
import { initialWindowSize } from './window-size';

// Sin empaquetar, `app.getAppPath()` es la raíz del proyecto, que contiene `resources/` y la salida `out/`.
// En Ritmo.app, electron-builder copia esos archivos a Contents/Resources, fuera de app.asar.
const resourcesPath = app.isPackaged ? process.resourcesPath : path.join(app.getAppPath(), 'resources');
const iconPath = path.join(resourcesPath, 'icon.png');
let window: BrowserWindow | undefined;

// El menú de macOS («Acerca de», «Ocultar», «Salir») usa el nombre de la app al estar lista, así que se
// cambia antes. `setName` también movería los datos a `…/Ritmo`: se conservan en `…/ritmo`, donde los
// busca el servidor MCP, o en el `--user-data-dir` indicado.
const userDataPath = app.getPath('userData');
app.setName('Ritmo');
app.setPath('userData', userDataPath);

function createWindow(): void {
  window = new BrowserWindow({
    ...initialWindowSize(screen.getPrimaryDisplay().workAreaSize),
    title: 'Ritmo', icon: iconPath, backgroundColor: '#f1f4f8',
    webPreferences: { preload: path.join(__dirname, '../preload/index.js'), contextIsolation: true, nodeIntegration: false, sandbox: true }
  });
  // `electron-vite dev` sirve el renderer con recarga en caliente; la app compilada carga sus archivos.
  const devServer = app.isPackaged ? undefined : process.env.ELECTRON_RENDERER_URL;
  if (devServer) window.loadURL(devServer);
  else window.loadFile(path.join(__dirname, '../renderer/index.html'));
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
}

app.whenReady().then(() => {
  if (process.platform === 'darwin') app.dock?.setIcon(iconPath);
  const container = createMainContainer({
    userDataPath,
    resourcesPath,
    notificationApi: Notification,
    publish: state => { if (window && !window.isDestroyed()) window.webContents.send('state' satisfies keyof RitmoEvents, state); }
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
