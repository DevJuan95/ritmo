import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { DEFAULT_DOMAINS } from '../../../src/shared/validation';
import { FakeClock } from '../../helpers/fakes';
import { createHarness } from '../../helpers/harness';

test('sin state.json arranca con el estado inicial del día del reloj', t => {
  const { store } = createHarness(t);
  assert.deepEqual(store.state, { day: '2026-09-29', tasks: [], domains: DEFAULT_DOMAINS, session: null, focusCount: 0, blockError: null });
});

test('descarta sesiones y errores de bloqueo guardados con forma inválida', t => {
  for (const session of [{ kind: 'nap', endsAt: 1 }, { kind: 'focus', endsAt: 'pronto' }, { kind: 'focus' }]) {
    const { store } = createHarness(t, { saved: { session: session as never, blockError: 42 as never } });
    assert.equal(store.state.session, null);
    assert.equal(store.state.blockError, null);
  }
  const { store } = createHarness(t, { saved: { session: { kind: 'shortBreak', endsAt: 123 }, blockError: 'pendiente' } });
  assert.deepEqual(store.state.session, { kind: 'shortBreak', endsAt: 123 });
  assert.equal(store.state.blockError, 'pendiente');
});

test('rechaza un state.json corrupto o inválido sin sobrescribirlo ni importar tareas', t => {
  const cases = [
    '{"day":"2026-09-29","tasks":[',
    '[]',
    JSON.stringify({ day: '2026-02-30' }),
    JSON.stringify({ domains: ['no es dominio'] }),
    JSON.stringify({ day: '2026-09-29', tasks: [{ id: 'valid', title: 'No importar parcialmente', done: false }, { id: 2, title: 'ID inválido', done: false }] })
  ];
  for (const contents of cases) {
    const harness = createHarness(t);
    fs.writeFileSync(harness.statePath, contents);
    assert.throws(() => harness.reopen(), /estado guardado .* es inválido/);
    assert.equal(fs.readFileSync(harness.statePath, 'utf8'), contents);
    assert.equal(harness.repository.listByDay('2026-09-29').length, 0);
  }
});

test('migra tareas del JSON una sola vez y conserva dominios y copia de respaldo', t => {
  const legacy = {
    day: '2026-09-20',
    tasks: [{ id: 'old-pending', title: 'Pendiente antigua', done: false }, { id: 'old-done', title: 'Completada antigua', done: true }],
    domains: ['example.com'], session: null, focusCount: 2, blockError: null
  };
  const harness = createHarness(t);
  fs.writeFileSync(harness.statePath, JSON.stringify(legacy));
  const store = harness.reopen();

  assert.deepEqual(harness.repository.listByDay('2026-09-20').map(task => [task.id, task.done]).sort(), [['old-done', true], ['old-pending', false]]);
  assert.deepEqual(store.state.domains, ['example.com']);
  assert.deepEqual(JSON.parse(fs.readFileSync(`${harness.statePath}.backup`, 'utf8')), legacy);
  assert.equal(harness.readSaved().tasksMigrated, true);

  harness.repository.delete('old-done');
  harness.reopen();
  assert.deepEqual(harness.repository.listByDay('2026-09-20').map(task => task.id), ['old-pending'], 'no vuelve a importar');
});

test('carga las tareas de hoy desde la base de datos', t => {
  const harness = createHarness(t, { saved: {} });
  harness.repository.create('Hoy', '2026-09-29');
  harness.repository.create('Mañana', '2026-09-30');
  assert.deepEqual(harness.reopen().state.tasks.map(task => task.title), ['Hoy']);
});

test('al cambiar de día reinicia el contador y lista las tareas del nuevo día', t => {
  const harness = createHarness(t, { saved: { focusCount: 3, domains: ['example.com'] } });
  const { store, clock, repository } = harness;
  repository.create('Pendiente de ayer', '2026-09-29');
  repository.create('Planeada para mañana', '2026-09-30');

  store.rollDay();
  assert.equal(harness.published.length, 0, 'mismo día: no guarda ni publica');

  clock.nextDay();
  store.rollDay();
  assert.equal(store.state.day, '2026-09-30');
  assert.equal(store.state.focusCount, 0);
  assert.deepEqual(store.state.tasks.map(task => task.title), ['Planeada para mañana']);
  assert.deepEqual(store.state.domains, ['example.com']);
  assert.equal(harness.readSaved().day, '2026-09-30');
  assert.equal(repository.listByDay('2026-09-29').length, 1, 'no borra el historial');
});

test('guarda de forma atómica y publica el estado con la hora del reloj', t => {
  const harness = createHarness(t, { clock: new FakeClock(1_800_000_000_000) });
  harness.store.state.focusCount = 2;
  harness.store.save();
  assert.equal(harness.readSaved().focusCount, 2);
  assert.deepEqual(fs.readdirSync(harness.directory).filter(name => name.endsWith('.tmp')), []);
  assert.equal(harness.published.at(-1)?.now, 1_800_000_000_000);
  assert.equal(harness.published.at(-1)?.busy, false);
});

test('guarded serializa operaciones y siempre libera busy y guarda', async t => {
  const harness = createHarness(t);
  const { store, published } = harness;
  let release!: () => void;
  const first = store.guarded(() => new Promise<void>(resolve => { release = resolve; }));
  assert.equal(store.busy, true);
  assert.equal(published.at(-1)?.busy, true);
  await assert.rejects(store.guarded(async () => {}), /Espera a que termine/);
  release();
  await first;
  assert.equal(store.busy, false);

  await assert.rejects(store.guarded(async () => { store.state.focusCount = 9; throw new Error('falló'); }), /falló/);
  assert.equal(store.busy, false);
  assert.equal(harness.readSaved().focusCount, 9);
  assert.equal(published.at(-1)?.busy, false);
});
