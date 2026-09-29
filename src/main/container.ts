import path from 'node:path';
import { asFunction, asValue, createContainer, InjectionMode, type AwilixContainer } from 'awilix';
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
import type { PublicStatePort, PublishState, StateShutdownPort, StateStorePort } from './state/ports';
import { StateStore } from './state/state-store';
import type { TaskRepositoryPort, TaskServicePort } from './tasks/ports';
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
  store: StateStorePort & PublicStatePort & StateShutdownPort;
  focus: FocusServicePort & FocusLifecyclePort;
  tasks: TaskServicePort;
  domains: DomainServicePort;
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
 * `StateStore` y la misma conexión SQLite, que se cierra con `container.dispose()`.
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
    store: asFunction(({ userDataPath, taskRepository, publish, now }: MainCradle) =>
      new StateStore(path.join(userDataPath, 'state.json'), { tasks: taskRepository, publish, now })).singleton(),
    focus: asFunction(({ store, blocker, notifier, sound }: MainCradle) => new FocusService(store, { blocker, notifier, sound })).singleton(),
    tasks: asFunction(({ store, taskRepository }: MainCradle) => new TaskService(store, taskRepository)).singleton(),
    domains: asFunction(({ store }: MainCradle) => new DomainService(store)).singleton(),
    lifecycle: asFunction(({ store, focus, notifier, taskRepository, timers, shutdownTimeoutMs }: MainCradle) =>
      new LifecycleService({ store, focus, notifier, tasks: taskRepository, timers, shutdownTimeoutMs })).singleton()
  });
  return container;
}
