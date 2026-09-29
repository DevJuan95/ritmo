import { app, BrowserWindow, ipcMain, dialog, Notification } from 'electron';
import { execFile } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { promisify } from 'node:util';
import { DEFAULT_DOMAINS, MINUTES, normalizeDomain, normalizeDomains, todayKey, safeTaskTitle } from './core';

const execFileAsync = promisify(execFile);
const helperPath = path.join(__dirname, 'block-sites.sh');
const iconPath = path.join(__dirname, 'icon.png');
const appleScript = `on run argv
  set helperPath to item 1 of argv
  set actionName to item 2 of argv
  set domainList to item 3 of argv
  do shell script "/bin/sh " & quoted form of helperPath & " " & quoted form of actionName & " " & quoted form of domainList with administrator privileges
end run`;

let window: BrowserWindow | undefined;
let state: AppState;
let statePath: string;
let timer: NodeJS.Timeout | undefined;
let busy = false;
let quitting = false;

function initialState(): AppState {
  return { day: todayKey(), tasks: [], domains: [...DEFAULT_DOMAINS], session: null, focusCount: 0, blockError: null };
}

function loadState(): AppState {
  try {
    const saved = JSON.parse(fs.readFileSync(statePath, 'utf8')) as Partial<AppState>;
    const base = initialState();
    return {
      ...base,
      ...saved,
      tasks: Array.isArray(saved.tasks) ? saved.tasks.filter(task => task && typeof task.id === 'string' && typeof task.title === 'string') : [],
      domains: normalizeDomains(saved.domains || DEFAULT_DOMAINS),
      session: saved.session && ['focus', 'shortBreak', 'longBreak'].includes(saved.session.kind) && Number.isFinite(saved.session.endsAt) ? saved.session : null,
      blockError: typeof saved.blockError === 'string' ? saved.blockError : null
    };
  } catch {
    return initialState();
  }
}

function saveState() {
  fs.mkdirSync(path.dirname(statePath), { recursive: true });
  const temporary = `${statePath}.${process.pid}.tmp`;
  fs.writeFileSync(temporary, JSON.stringify(state, null, 2));
  fs.renameSync(temporary, statePath);
  if (window && !window.isDestroyed()) window.webContents.send('state', publicState());
}

function hasManagedBlock() {
  try { return fs.readFileSync('/etc/hosts', 'utf8').includes('# >>> RITMO FOCUS BLOCK >>>'); }
  catch { return false; }
}

function rollDay() {
  const day = todayKey();
  if (state.day === day) return;
  state.day = day;
  state.tasks = [];
  state.focusCount = 0;
  saveState();
}

function publicState(): PublicState {
  return { ...state, busy, now: Date.now() };
}

function notify(title: string, body: string): void {
  if (Notification.isSupported()) new Notification({ title, body }).show();
}

async function changeBlock(action: 'block' | 'unblock'): Promise<void> {
  if (process.platform !== 'darwin') throw new Error('El bloqueo de sitios de esta versión requiere macOS.');
  const domains = action === 'block' ? state.domains.join('\n') : '';
  try {
    await execFileAsync('/usr/bin/osascript', ['-e', appleScript, helperPath, action, domains], { timeout: 120000 });
  } catch (error) {
    const detail = error as Error & { stderr?: string };
    if (/User canceled|(-128)/i.test(`${detail.message} ${detail.stderr || ''}`)) {
      throw new Error('Se canceló la autorización de macOS.');
    }
    throw new Error(`No se pudo ${action === 'block' ? 'activar' : 'quitar'} el bloqueo. Revisa los permisos de administrador.`);
  }
}

async function guarded<T>(work: () => Promise<T>): Promise<T> {
  if (busy) throw new Error('Espera a que termine la operación anterior.');
  busy = true;
  if (window && !window.isDestroyed()) window.webContents.send('state', publicState());
  try { return await work(); }
  finally { busy = false; saveState(); }
}

async function endFocus(completed: boolean): Promise<void> {
  if (state.session?.kind !== 'focus' && !state.blockError) return;
  await changeBlock('unblock');
  state.session = null;
  state.blockError = null;
  if (completed) {
    state.focusCount += 1;
    notify('Foco completado', 'Terminó tu pomodoro. Es momento de descansar.');
  }
}

async function tick() {
  rollDay();
  if (busy || !state.session || Date.now() < state.session.endsAt) return;
  const kind = state.session.kind;
  await guarded(async () => {
    if (kind === 'focus') {
      try { await endFocus(true); }
      catch (error) { state.blockError = error instanceof Error ? error.message : String(error); state.session = null; notify('Bloqueo aún activo', 'Abre Ritmo y usa “Quitar bloqueo”.'); }
    } else {
      state.session = null;
      notify('Descanso terminado', 'Puedes iniciar otro pomodoro.');
    }
  });
}

function registerHandlers() {
  ipcMain.handle('get-state', () => { rollDay(); return publicState(); });
  ipcMain.handle('start-focus', () => guarded(async () => {
    if (state.session || state.blockError) throw new Error('Termina la sesión actual o quita el bloqueo pendiente.');
    if (!state.domains.length) throw new Error('Añade al menos un sitio para bloquear.');
    await changeBlock('block');
    state.blockError = null;
    state.session = { kind: 'focus', endsAt: Date.now() + MINUTES.focus * 60000 };
  }));
  ipcMain.handle('finish-focus', () => guarded(async () => endFocus(false)));
  ipcMain.handle('retry-unblock', () => guarded(async () => endFocus(false)));
  ipcMain.handle('start-break', (_event, kind: unknown) => guarded(async () => {
    if (kind !== 'shortBreak' && kind !== 'longBreak') throw new Error('Tipo de descanso inválido.');
    if (state.session || state.blockError) throw new Error('Termina la sesión actual primero.');
    state.session = { kind, endsAt: Date.now() + MINUTES[kind] * 60000 };
  }));
  ipcMain.handle('finish-break', () => guarded(async () => {
    if (state.session?.kind !== 'focus') state.session = null;
  }));
  ipcMain.handle('add-task', (_event, title: unknown) => {
    rollDay();
    state.tasks.push({ id: crypto.randomUUID(), title: safeTaskTitle(title), done: false });
    saveState();
  });
  ipcMain.handle('toggle-task', (_event, id: unknown) => {
    rollDay();
    const task = state.tasks.find(item => item.id === id);
    if (task) task.done = !task.done;
    saveState();
  });
  ipcMain.handle('delete-task', (_event, id: unknown) => {
    rollDay();
    state.tasks = state.tasks.filter(item => item.id !== id);
    saveState();
  });
  ipcMain.handle('add-domain', (_event, value: unknown) => {
    if (state.session?.kind === 'focus' || state.blockError) throw new Error('Edita los sitios cuando termine el foco.');
    state.domains = normalizeDomains([...state.domains, normalizeDomain(value)]);
    saveState();
  });
  ipcMain.handle('remove-domain', (_event, domain: unknown) => {
    if (state.session?.kind === 'focus' || state.blockError) throw new Error('Edita los sitios cuando termine el foco.');
    state.domains = state.domains.filter(item => item !== domain);
    saveState();
  });
}

function createWindow() {
  window = new BrowserWindow({
    width: 1100, height: 760, minWidth: 850, minHeight: 620,
    title: 'Ritmo', icon: iconPath, backgroundColor: '#f1f4f8',
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false, sandbox: true }
  });
  window.loadFile(path.join(__dirname, 'index.html'));
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
}

app.whenReady().then(async () => {
  app.setName('Ritmo');
  if (process.platform === 'darwin') app.dock?.setIcon(iconPath);
  statePath = path.join(app.getPath('userData'), 'state.json');
  state = loadState();
  const blocked = hasManagedBlock();
  if (blocked && state.session?.kind !== 'focus') {
    state.blockError = 'Se encontró un bloqueo anterior. Usa “Quitar bloqueo” para recuperar el acceso.';
  }
  if (!blocked && state.session?.kind === 'focus') {
    state.session = null;
  }
  if (!blocked) state.blockError = null;
  registerHandlers();
  createWindow();
  rollDay();
  if (state.session?.kind === 'focus' && Date.now() >= state.session.endsAt) await tick();
  timer = setInterval(() => { tick().catch(console.error); }, 1000);
});

app.on('before-quit', event => {
  if (quitting || !state || (state.session?.kind !== 'focus' && !state.blockError)) return;
  event.preventDefault();
  if (busy) return;
  guarded(async () => {
    try { await endFocus(false); quitting = true; app.quit(); }
    catch (error) {
      state.blockError = error instanceof Error ? error.message : String(error);
      window?.show();
      dialog.showErrorBox('El bloqueo sigue activo', 'No se pudo quitar el bloqueo. Autoriza el cambio en macOS y usa “Quitar bloqueo” antes de salir.');
    }
  }).catch(console.error);
});

app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
app.on('will-quit', () => { if (timer) clearInterval(timer); });
