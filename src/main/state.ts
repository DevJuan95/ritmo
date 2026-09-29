import fs from 'node:fs';
import path from 'node:path';
import { BrowserWindow } from 'electron';
import type { AppState, PublicState } from '../shared/contracts';
import { DEFAULT_DOMAINS, normalizeDomains, safePlannedDate, safeTaskTitle, todayKey } from '../shared/validation';
import { TaskRepository } from './tasks';

export class StateStore {
  state: AppState;
  busy = false;
  private migrated = false;

  constructor(private readonly statePath: string, private readonly getWindow: () => BrowserWindow | undefined, readonly tasks?: TaskRepository) {
    this.state = this.load();
    if (tasks) {
      if (!this.migrated && fs.existsSync(this.statePath)) {
        const backup = `${this.statePath}.backup`;
        if (!fs.existsSync(backup)) fs.copyFileSync(this.statePath, backup);
        tasks.importLegacy(this.state.tasks, this.state.day);
        this.migrated = true;
        this.state.tasks = tasks.listByDay(todayKey());
        this.save();
      } else this.state.tasks = tasks.listByDay(todayKey());
    }
  }

  private initial(): AppState {
    return { day: todayKey(), tasks: [], domains: [...DEFAULT_DOMAINS], session: null, focusCount: 0, blockError: null };
  }

  private load(): AppState {
    let contents: string;
    try {
      contents = fs.readFileSync(this.statePath, 'utf8');
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return this.initial();
      throw error;
    }
    try {
      const saved = JSON.parse(contents) as Partial<AppState>;
      if (!saved || typeof saved !== 'object' || Array.isArray(saved)) throw new Error('El estado no es un objeto.');
      if (saved.day !== undefined) safePlannedDate(saved.day);
      if (saved.tasks !== undefined && (!Array.isArray(saved.tasks) || saved.tasks.some(task =>
        !task || typeof task.id !== 'string' || !task.id || typeof task.title !== 'string' ||
        !task.title.trim() || typeof task.done !== 'boolean'
      ))) throw new Error('La lista de tareas es inválida.');
      saved.tasks?.forEach(task => safeTaskTitle(task.title));
      this.migrated = (saved as Partial<AppState> & { tasksMigrated?: boolean }).tasksMigrated === true;
      return {
        ...this.initial(), ...saved,
        tasks: saved.tasks || [],
        domains: normalizeDomains(saved.domains || DEFAULT_DOMAINS),
        session: saved.session && ['focus', 'shortBreak', 'longBreak'].includes(saved.session.kind) && Number.isFinite(saved.session.endsAt) ? saved.session : null,
        blockError: typeof saved.blockError === 'string' ? saved.blockError : null
      };
    } catch (error) {
      throw new Error(`El estado guardado en ${this.statePath} es inválido. Conserva el archivo para recuperarlo.`, { cause: error });
    }
  }

  publicState(): PublicState { return { ...this.state, busy: this.busy, now: Date.now() }; }

  publish(): void {
    const window = this.getWindow();
    if (window && !window.isDestroyed()) window.webContents.send('state', this.publicState());
  }

  save(): void {
    fs.mkdirSync(path.dirname(this.statePath), { recursive: true });
    const temporary = `${this.statePath}.${process.pid}.tmp`;
    fs.writeFileSync(temporary, JSON.stringify({ ...this.state, tasksMigrated: this.migrated }, null, 2));
    fs.renameSync(temporary, this.statePath);
    this.publish();
  }

  rollDay(): void {
    const day = todayKey();
    if (this.state.day === day) return;
    this.state.day = day;
    this.state.tasks = this.tasks ? this.tasks.listByDay(day) : [];
    this.state.focusCount = 0;
    this.save();
  }

  async guarded<T>(work: () => Promise<T>): Promise<T> {
    if (this.busy) throw new Error('Espera a que termine la operación anterior.');
    this.busy = true;
    this.publish();
    try { return await work(); }
    finally { this.busy = false; this.save(); }
  }
}
