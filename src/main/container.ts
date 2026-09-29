import path from 'node:path';
import { asFunction, asValue, createContainer, InjectionMode, type AwilixContainer } from 'awilix';
import { DomainService } from './domains';
import { FocusService } from './focus';
import { LifecycleService } from './lifecycle';
import { createNotifier, type NotificationApi } from './notifier';
import type { Clock, Notifier, PublishState, SiteBlocker, SoundPlayer, Timers } from './ports';
import { createSiteBlocker } from './site-blocker';
import { createSoundPlayer } from './sound-player';
import { StateStore } from './state';
import { TaskService } from './task-service';
import { TaskRepository } from './tasks';
import { systemTimers } from './timers';

export interface MainCradle {
  userDataPath: string;
  publish: PublishState;
  now: Clock;
  timers: Timers;
  shutdownTimeoutMs: number | undefined;
  notificationApi: NotificationApi;
  blocker: SiteBlocker;
  notifier: Notifier;
  sound: SoundPlayer;
  taskRepository: TaskRepository;
  store: StateStore;
  focus: FocusService;
  tasks: TaskService;
  domains: DomainService;
  lifecycle: LifecycleService;
}

export interface MainContainerOptions {
  userDataPath: string;
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
 * Antes de resolver, se puede sustituir cualquier registro (por ejemplo, el bloqueador en pruebas).
 */
export function createMainContainer(options: MainContainerOptions): AwilixContainer<MainCradle> {
  const container = createContainer<MainCradle>({ injectionMode: InjectionMode.PROXY, strict: true });
  container.register({
    userDataPath: asValue(options.userDataPath),
    publish: asValue(options.publish),
    now: asValue(options.now ?? Date.now),
    timers: asValue(options.timers ?? systemTimers),
    shutdownTimeoutMs: asValue(options.shutdownTimeoutMs),
    notificationApi: asValue(options.notificationApi),
    blocker: asFunction(() => createSiteBlocker()).singleton(),
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
