import type { TestContext } from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
import { DEFAULT_DOMAINS } from '../../src/shared/blocking/contract';
import { todayKey, type AppState, type PublicState } from '../../src/shared/state/contract';
import { DomainService } from '../../src/main/blocking/domain-service';
import { FocusService } from '../../src/main/focus/focus-service';
import { LifecycleService } from '../../src/main/lifecycle/lifecycle-service';
import { StateStore } from '../../src/main/state/state-store';
import { TaskService } from '../../src/main/tasks/task-service';
import { TaskRepository } from '../../src/main/tasks/task-repository';
import { FakeBlocker, FakeClock, FakeNotifier, FakeSoundPlayer, sequentialIds } from './fakes';
import { tempDir } from './temp';

export function buildState(overrides: Partial<AppState> = {}, clock = new FakeClock()): AppState {
  return {
    day: todayKey(new Date(clock.now())), tasks: [], domains: [...DEFAULT_DOMAINS],
    session: null, focusCount: 0, blockError: null, ...overrides
  };
}

export interface HarnessOptions {
  /** Estado guardado previamente en state.json. Si se omite, no existe el archivo. */
  saved?: Partial<AppState> & { tasksMigrated?: boolean };
  clock?: FakeClock;
  /** Tiempo máximo del cierre ordenado de `lifecycle`. */
  shutdownTimeoutMs?: number;
}

export interface Harness {
  directory: string;
  statePath: string;
  dbPath: string;
  clock: FakeClock;
  blocker: FakeBlocker;
  notifier: FakeNotifier;
  sound: FakeSoundPlayer;
  published: PublicState[];
  repository: TaskRepository;
  store: StateStore;
  focus: FocusService;
  tasks: TaskService;
  domains: DomainService;
  /** Usa `clock` como temporizadores. */
  lifecycle: LifecycleService;
  /** Vuelve a abrir el estado desde disco con las mismas dependencias. */
  reopen(): StateStore;
  readSaved(): AppState & { tasksMigrated?: boolean };
}

/** Arma el proceso principal completo con dobles en memoria y archivos temporales. */
export function createHarness(t: TestContext, options: HarnessOptions = {}): Harness {
  const directory = tempDir(t);
  const statePath = path.join(directory, 'state.json');
  const dbPath = path.join(directory, 'ritmo.db');
  const clock = options.clock ?? new FakeClock();
  if (options.saved) fs.writeFileSync(statePath, JSON.stringify({ ...buildState({}, clock), tasksMigrated: true, ...options.saved }));

  const blocker = new FakeBlocker();
  const notifier = new FakeNotifier();
  const sound = new FakeSoundPlayer();
  const published: PublicState[] = [];
  const repository = new TaskRepository(dbPath, { now: clock.now, newId: sequentialIds() });
  t.after(() => repository.close());
  const open = () => new StateStore(statePath, { tasks: repository, now: clock.now, publish: state => published.push(state) });
  const store = open();
  const focus = new FocusService(store, { blocker, notifier, sound });

  return {
    directory, statePath, dbPath, clock, blocker, notifier, sound, published, repository, store, focus,
    lifecycle: new LifecycleService({ store, focus, notifier, tasks: repository, timers: clock, shutdownTimeoutMs: options.shutdownTimeoutMs }),
    tasks: new TaskService(store, repository),
    domains: new DomainService(store),
    reopen: open,
    readSaved: () => JSON.parse(fs.readFileSync(statePath, 'utf8'))
  };
}
