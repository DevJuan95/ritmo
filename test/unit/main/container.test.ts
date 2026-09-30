import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { asValue } from 'awilix';
import type { PublicState } from '../../../src/shared/state/contract';
import { createMainContainer } from '../../../src/main/container';
import type { NotificationApi } from '../../../src/main/common/notifier';
import { FakeBlocker, FakeClock, FakeSoundPlayer } from '../../helpers/fakes';
import { systemTimers } from '../../../src/main/common/timers';
import { StateStore } from '../../../src/main/state/state-store';
import { tempDir } from '../../helpers/temp';

const resourcesPath = '/app/resources';

function fakeNotificationApi(shown: string[]): NotificationApi {
  return class {
    static isSupported(): boolean { return true; }
    constructor(private readonly options: { title: string; body: string }) {}
    show(): void { shown.push(this.options.title); }
  };
}

test('el contenedor arma los servicios sobre un único store y repositorio', async t => {
  const directory = tempDir(t);
  const published: PublicState[] = [];
  const shown: string[] = [];
  const clock = new FakeClock();
  const container = createMainContainer({
    userDataPath: directory,
    resourcesPath,
    publish: state => published.push(state),
    notificationApi: fakeNotificationApi(shown),
    now: clock.now
  });
  const blocker = new FakeBlocker();
  const sound = new FakeSoundPlayer();
  container.register({ blocker: asValue(blocker), sound: asValue(sound) });
  t.after(() => container.dispose());

  const { store, tasks, domains, focus, taskRepository } = container.cradle;
  assert.equal(container.cradle.store, store);
  assert.ok(store instanceof StateStore);
  assert.equal(store.tasks, taskRepository);
  assert.equal(store.now, clock.now);
  assert.ok(fs.existsSync(path.join(directory, 'ritmo.db')));

  tasks.add('Escribir', store.today());
  assert.equal(published.at(-1)?.tasks[0]?.title, 'Escribir');
  assert.deepEqual(taskRepository.listByDay(store.today()).map(task => task.title), ['Escribir']);
  domains.add('example.com');
  await focus.startFocus();
  assert.equal(blocker.calls[0]?.action, 'block');
  clock.advanceMinutes(25);
  await focus.tick();
  assert.deepEqual(shown, ['Foco completado']);
  assert.equal(sound.plays, 1);
  assert.ok(fs.existsSync(path.join(directory, 'state.json')));
});

test('usa el reloj del sistema y el bloqueador real por defecto', t => {
  const container = createMainContainer({ userDataPath: tempDir(t), resourcesPath, publish: () => {}, notificationApi: fakeNotificationApi([]) });
  t.after(() => container.dispose());
  assert.equal(container.cradle.now, Date.now);
  assert.equal(container.cradle.timers, systemTimers);
  assert.equal(container.cradle.resourcesPath, resourcesPath);
  assert.equal(typeof container.cradle.blocker.hasManagedBlock, 'function');
});

test('dispose cierra las conexiones SQLite', async t => {
  const container = createMainContainer({ userDataPath: tempDir(t), resourcesPath, publish: () => {}, notificationApi: fakeNotificationApi([]) });
  const repositories = [container.cradle.taskRepository, container.cradle.studyRepository];
  const closes = repositories.map(repository => t.mock.method(repository, 'close'));
  await container.dispose();
  assert.deepEqual(closes.map(close => close.mock.callCount()), [1, 1]);
  for (const repository of repositories) assert.equal((repository as unknown as { closed: boolean }).closed, true);
});

test('arma las rutas de estudio sobre ritmo.db', async t => {
  const directory = tempDir(t);
  const clock = new FakeClock();
  const container = createMainContainer({ userDataPath: directory, resourcesPath, publish: () => {}, notificationApi: fakeNotificationApi([]), now: clock.now });
  t.after(() => container.dispose());
  const { study, studyRepository } = container.cradle;
  assert.equal(container.cradle.study, study);
  const route = study.create({ topic: 'Rust', goal: '', level: 'beginner', dailyPomodoros: 2, stages: [{ title: 'Ownership', topics: [] }], instructions: '' });
  assert.equal(route.createdAt, new Date(clock.now()).toISOString());
  assert.deepEqual(studyRepository.list(), [route]);
  assert.ok(fs.existsSync(path.join(directory, 'ritmo.db')));
});

test('registra el ciclo de vida con los temporizadores y el tiempo máximo del cierre', async t => {
  const clock = new FakeClock();
  const container = createMainContainer({
    userDataPath: tempDir(t), resourcesPath, publish: () => {}, notificationApi: fakeNotificationApi([]),
    now: clock.now, timers: clock, shutdownTimeoutMs: 10
  });
  t.after(() => container.dispose());
  const { lifecycle, store, taskRepository, studyRepository } = container.cradle;
  store.guarded(() => new Promise<void>(() => {})).catch(() => {});
  const closing = lifecycle.shutdown();
  clock.advance(10);
  await closing;
  assert.equal((taskRepository as unknown as { closed: boolean }).closed, true);
  assert.equal((studyRepository as unknown as { closed: boolean }).closed, true);
});
