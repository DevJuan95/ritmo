import path from 'node:path';
import { asFunction, asValue, createContainer, InjectionMode, type AwilixContainer } from 'awilix';
import { BRIDGE_SOCKET_NAME } from '../shared/bridge/contract';
import { BridgeService } from './bridge/bridge-service';
import type { BridgeLifecyclePort, BridgeServer, BridgeServicePort } from './bridge/ports';
import { SocketBridgeServer } from './bridge/socket-server';
import { DomainService } from './blocking/domain-service';
import type { DomainServicePort, SiteBlocker } from './blocking/ports';
import { createSiteBlocker } from './blocking/site-blocker';
import { createNotifier, type NotificationApi } from './common/notifier';
import type { Clock, Notifier, Timers } from './common/ports';
import { systemTimers } from './common/timers';
import { FocusService } from './focus/focus-service';
import type { FocusLifecyclePort, FocusServicePort, SoundPlayer } from './focus/ports';
import { createSoundPlayer } from './focus/sound-player';
import { LifecycleService } from './lifecycle/lifecycle-service';
import type { LifecycleServicePort } from './lifecycle/ports';
import type { PublicStatePort, PublishState, StateShutdownPort, StateStorePort, TodayPort } from './state/ports';
import { StateStore } from './state/state-store';
import { AgentService } from './study/agent-service';
import { SystemAgentDetector } from './study/agent-detector';
import { CliStudyAgentFactory } from './study/agent-factory';
import type {
  AgentDetector, AgentNoticeRepositoryPort, AgentServicePort, AgentSettingsRepositoryPort, ProposalLifecyclePort, ProposalServicePort, StudyAgentFactory, StudyRepositoryPort,
  StudyRouteReaderPort, StudyServicePort, StudyStagesPort
} from './study/ports';
import { ProposalService } from './study/proposal-service';
import { StudyRepository } from './study/study-repository';
import { StudyService } from './study/study-service';
import type { RouteTasksPort, StudyTasksPort, TaskRepositoryPort, TaskServicePort } from './tasks/ports';
import { TaskRepository } from './tasks/task-repository';
import { TaskService } from './tasks/task-service';

export interface MainCradle {
  userDataPath: string;
  resourcesPath: string;
  publish: PublishState;
  now: Clock;
  timers: Timers;
  shutdownTimeoutMs: number | undefined;
  notificationApi: NotificationApi;
  blocker: SiteBlocker;
  notifier: Notifier;
  sound: SoundPlayer;
  taskRepository: TaskRepositoryPort;
  studyRepository: StudyRepositoryPort & StudyRouteReaderPort & StudyStagesPort & AgentSettingsRepositoryPort & AgentNoticeRepositoryPort;
  agentDetector: AgentDetector;
  agentFactory: StudyAgentFactory;
  bridgeServer: BridgeServer;
  store: StateStorePort & TodayPort & PublicStatePort & StateShutdownPort;
  focus: FocusServicePort & FocusLifecyclePort;
  tasks: TaskServicePort & StudyTasksPort & RouteTasksPort;
  domains: DomainServicePort;
  study: StudyServicePort;
  agents: AgentServicePort;
  proposals: ProposalServicePort & ProposalLifecyclePort;
  bridge: BridgeServicePort & BridgeLifecyclePort;
  lifecycle: LifecycleServicePort;
}

export interface MainContainerOptions {
  userDataPath: string;
  /** Carpeta `resources/` de la app, con los scripts del bloqueo de sitios. */
  resourcesPath: string;
  publish: PublishState;
  notificationApi: NotificationApi;
  now?: Clock;
  timers?: Timers;
  /** Tiempo máximo del cierre ordenado; por defecto, `DEFAULT_SHUTDOWN_TIMEOUT_MS`. */
  shutdownTimeoutMs?: number;
}

/**
 * Registra las dependencias del proceso principal. Todas son singletons: comparten el mismo
 * `StateStore` y los mismos repositorios. Cada repositorio abre su conexión a `ritmo.db`; las cierran
 * el cierre ordenado y `container.dispose()`.
 * Los servicios no conocen el contenedor; las fábricas llaman a sus constructores explícitamente.
 * Es el único módulo que construye las clases de servicio: el resto depende de sus puertos.
 * Antes de resolver, se puede sustituir cualquier registro (por ejemplo, el bloqueador en pruebas).
 */
export function createMainContainer(options: MainContainerOptions): AwilixContainer<MainCradle> {
  const container = createContainer<MainCradle>({ injectionMode: InjectionMode.PROXY, strict: true });
  container.register({
    userDataPath: asValue(options.userDataPath),
    resourcesPath: asValue(options.resourcesPath),
    publish: asValue(options.publish),
    now: asValue(options.now ?? Date.now),
    timers: asValue(options.timers ?? systemTimers),
    shutdownTimeoutMs: asValue(options.shutdownTimeoutMs),
    notificationApi: asValue(options.notificationApi),
    blocker: asFunction(({ resourcesPath }: MainCradle) => createSiteBlocker(resourcesPath)).singleton(),
    notifier: asFunction(({ notificationApi }: MainCradle) => createNotifier(notificationApi)).singleton(),
    sound: asFunction(() => createSoundPlayer()).singleton(),
    taskRepository: asFunction(({ userDataPath, now }: MainCradle) => new TaskRepository(path.join(userDataPath, 'ritmo.db'), { now }))
      .singleton()
      .disposer(repository => repository.close()),
    studyRepository: asFunction(({ userDataPath, now }: MainCradle) => new StudyRepository(path.join(userDataPath, 'ritmo.db'), { now }))
      .singleton()
      .disposer(repository => repository.close()),
    agentDetector: asFunction(() => new SystemAgentDetector()).singleton(),
    agentFactory: asFunction(() => new CliStudyAgentFactory()).singleton(),
    bridgeServer: asFunction(() => new SocketBridgeServer()).singleton(),
    store: asFunction(({ userDataPath, taskRepository, publish, now }: MainCradle) =>
      new StateStore(path.join(userDataPath, 'state.json'), { tasks: taskRepository, publish, now })).singleton(),
    focus: asFunction(({ store, blocker, notifier, sound }: MainCradle) => new FocusService(store, { blocker, notifier, sound })).singleton(),
    tasks: asFunction(({ store, taskRepository, studyRepository }: MainCradle) => new TaskService(store, taskRepository, studyRepository)).singleton(),
    domains: asFunction(({ store }: MainCradle) => new DomainService(store)).singleton(),
    study: asFunction(({ studyRepository, tasks }: MainCradle) => new StudyService(studyRepository, tasks)).singleton(),
    agents: asFunction(({ studyRepository, agentDetector }: MainCradle) => new AgentService(studyRepository, agentDetector)).singleton(),
    proposals: asFunction(({ studyRepository, tasks, agentDetector, agentFactory, store }: MainCradle) => new ProposalService({
      routes: studyRepository, tasks, settings: studyRepository, notices: studyRepository, locator: agentDetector, agents: agentFactory, day: store
    })).singleton(),
    bridge: asFunction(({ bridgeServer, userDataPath, studyRepository, tasks, store }: MainCradle) => new BridgeService({
      server: bridgeServer, socketPath: path.join(userDataPath, BRIDGE_SOCKET_NAME), routes: studyRepository, tasks, day: store
    })).singleton(),
    lifecycle: asFunction(({ store, focus, proposals, bridge, notifier, taskRepository, studyRepository, timers, shutdownTimeoutMs }: MainCradle) =>
      new LifecycleService({ store, focus, proposals, bridge, notifier, databases: [taskRepository, studyRepository], timers, shutdownTimeoutMs })).singleton()
  });
  return container;
}
