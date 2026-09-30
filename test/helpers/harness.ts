import type { TestContext } from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
import { DEFAULT_DOMAINS } from '../../src/shared/blocking/contract';
import { todayKey, type AppState, type PublicState } from '../../src/shared/state/contract';
import { BridgeService } from '../../src/main/bridge/bridge-service';
import { DomainService } from '../../src/main/blocking/domain-service';
import { FocusService } from '../../src/main/focus/focus-service';
import { LifecycleService } from '../../src/main/lifecycle/lifecycle-service';
import { StateStore } from '../../src/main/state/state-store';
import { AgentService } from '../../src/main/study/agent-service';
import { StudyRepository } from '../../src/main/study/study-repository';
import { ProposalService } from '../../src/main/study/proposal-service';
import { StudyService } from '../../src/main/study/study-service';
import { TaskService } from '../../src/main/tasks/task-service';
import { TaskRepository } from '../../src/main/tasks/task-repository';
import { FakeAgentDetector, FakeBlocker, FakeBridgeServer, FakeStudyAgent, FakeStudyAgentFactory, FakeClock, FakeNotifier, FakeSoundPlayer, sequentialIds } from './fakes';
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
  /** Abre su propia conexión a `dbPath`, como en la app. */
  studyRepository: StudyRepository;
  store: StateStore;
  focus: FocusService;
  tasks: TaskService;
  domains: DomainService;
  study: StudyService;
  /** Configuración y estado del agente, con `detector` en lugar de los CLI reales. */
  agents: AgentService;
  detector: FakeAgentDetector;
  /** Peticiones de propuestas al agente, con `agent` en lugar de los CLI reales. */
  proposals: ProposalService;
  /** El agente que crea `agentFactory` para cualquier proveedor. */
  agent: FakeStudyAgent;
  agentFactory: FakeStudyAgentFactory;
  /** Puente para agentes de terminal sobre `bridgeServer`, sin socket; lo abre `lifecycle.start()`. */
  bridge: BridgeService;
  bridgeServer: FakeBridgeServer;
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
  const studyRepository = new StudyRepository(dbPath, { now: clock.now, newId: sequentialIds('study') });
  t.after(() => studyRepository.close());
  const open = () => new StateStore(statePath, { tasks: repository, now: clock.now, publish: state => published.push(state) });
  const store = open();
  const focus = new FocusService(store, { blocker, notifier, sound });

  const tasks = new TaskService(store, repository, studyRepository);
  const detector = new FakeAgentDetector();
  const agentFactory = new FakeStudyAgentFactory();
  const proposals = new ProposalService({
    routes: studyRepository, tasks, settings: studyRepository, notices: studyRepository, locator: detector, agents: agentFactory, day: store
  });

  const bridgeServer = new FakeBridgeServer();
  const bridge = new BridgeService({
    server: bridgeServer, socketPath: path.join(directory, 'ritmo.sock'), routes: studyRepository, tasks, day: store
  });

  return {
    directory, statePath, dbPath, clock, blocker, notifier, sound, published, repository, studyRepository, store, focus,
    lifecycle: new LifecycleService({
      store, focus, proposals, bridge, notifier, databases: [repository, studyRepository], timers: clock, shutdownTimeoutMs: options.shutdownTimeoutMs
    }),
    tasks,
    domains: new DomainService(store),
    study: new StudyService(studyRepository, tasks),
    agents: new AgentService(studyRepository, detector),
    detector,
    proposals,
    agent: agentFactory.agent,
    agentFactory,
    bridge,
    bridgeServer,
    reopen: open,
    readSaved: () => JSON.parse(fs.readFileSync(statePath, 'utf8'))
  };
}
