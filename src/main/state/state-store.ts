import { PENDING_BLOCK_MESSAGE, DEFAULT_DOMAINS, normalizeDomains } from '../../shared/blocking/contract';
import { PublicError } from '../../shared/ipc';
import { todayKey, type AppState, type PublicState } from '../../shared/state/contract';
import { safePlannedDate, safeTaskTitle } from '../../shared/tasks/contract';
import fs from 'node:fs';
import path from 'node:path';
import type { Clock } from '../common/ports';
import type { TaskRepositoryPort } from '../tasks/ports';
import type { PublicStatePort, PublishState, StateShutdownPort, StateStorePort, TodayPort } from './ports';

export interface StateStoreDeps {
  publish?: PublishState;
  now?: Clock;
  tasks?: TaskRepositoryPort;
}

export class StateStore implements StateStorePort, TodayPort, PublicStatePort, StateShutdownPort {
  state: AppState;
  busy = false;
  /** Contador de cambios de tareas; va en el estado público y no se guarda. */
  private tasksVersion = 0;
  /** Tras `closeWith`, ya no se aceptan operaciones protegidas. */
  closing = false;
  /** Tras `seal`, el estado en disco es el definitivo: una operación que termine tarde ya no lo cambia. */
  private sealed = false;
  private running?: Promise<unknown>;
  private migrated = false;
  readonly now: Clock;
  readonly tasks?: TaskRepositoryPort;
  private readonly publishState: PublishState;

  constructor(private readonly statePath: string, deps: StateStoreDeps = {}) {
    this.now = deps.now ?? Date.now;
    this.tasks = deps.tasks;
    this.publishState = deps.publish ?? (() => {});
    const tasks = this.tasks;
    this.state = this.load();
    if (tasks) {
      if (!this.migrated && fs.existsSync(this.statePath)) {
        const backup = `${this.statePath}.backup`;
        if (!fs.existsSync(backup)) fs.copyFileSync(this.statePath, backup);
        tasks.importLegacy(this.state.tasks, this.state.day);
        this.migrated = true;
        this.state.tasks = tasks.listByDay(this.today());
        this.save();
      } else this.state.tasks = tasks.listByDay(this.today());
    }
  }

  today(): string { return todayKey(new Date(this.now())); }

  private initial(): AppState {
    return { day: this.today(), tasks: [], domains: [...DEFAULT_DOMAINS], session: null, focusCount: 0, blockError: null };
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

  publicState(): PublicState {
    return { ...this.state, blockError: this.state.blockError ? PENDING_BLOCK_MESSAGE : null, busy: this.busy, now: this.now(), tasksVersion: this.tasksVersion };
  }

  tasksChanged(): void { this.tasksVersion++; }

  publish(): void { this.publishState(this.publicState()); }

  save(): void {
    if (this.sealed) return;
    fs.mkdirSync(path.dirname(this.statePath), { recursive: true });
    const temporary = `${this.statePath}.${process.pid}.tmp`;
    fs.writeFileSync(temporary, JSON.stringify({ ...this.state, tasksMigrated: this.migrated }, null, 2));
    fs.renameSync(temporary, this.statePath);
    this.publish();
  }

  /** Guarda por última vez; los `save()` posteriores no escriben. Lo usa el cierre ordenado. */
  seal(): void {
    this.save();
    this.sealed = true;
  }

  rollDay(): void {
    const day = this.today();
    if (this.state.day === day) return;
    this.state.day = day;
    this.state.tasks = this.tasks ? this.tasks.listByDay(day) : [];
    this.state.focusCount = 0;
    this.save();
  }

  async guarded<T>(work: () => Promise<T>): Promise<T> {
    if (this.closing) throw new PublicError('Ritmo se está cerrando.');
    if (this.busy) throw new PublicError('Espera a que termine la operación anterior.');
    return this.run(work);
  }

  /** Deja de aceptar operaciones protegidas y espera a que termine la que esté en curso. */
  async drain(): Promise<void> {
    this.closing = true;
    await this.running?.catch(() => {});
  }

  /** Como `drain`, y después ejecuta `work` como la última operación protegida. */
  async closeWith<T>(work: () => Promise<T>): Promise<T> {
    await this.drain();
    return this.run(work);
  }

  private run<T>(work: () => Promise<T>): Promise<T> {
    this.busy = true;
    this.publish();
    const running = (async () => {
      try { return await work(); }
      finally { this.busy = false; this.save(); }
    })();
    this.running = running;
    return running;
  }
}
