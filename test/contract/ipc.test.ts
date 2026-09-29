import test from 'node:test';
import assert from 'node:assert/strict';
import Module from 'node:module';
import path from 'node:path';
import { GENERIC_ERROR_MESSAGE, PublicError, type PublicState, type RitmoAPI } from '../../src/shared/contracts';
import { registerHandlers } from '../../src/main/ipc/handlers';
import { errorMessage } from '../../src/renderer/src/view';
import { FakeIpc } from '../helpers/fakes';
import { createHarness } from '../helpers/harness';
import { distRoot } from '../helpers/paths';

interface LoadedPreload {
  api: RitmoAPI;
  invocations: Array<{ channel: string; args: unknown[] }>;
  listeners: Map<string, Set<(...args: unknown[]) => void>>;
}

/** Carga el preload compilado con un módulo `electron` falso para ver qué canales usa. */
function loadPreload(invoke?: (channel: string, ...args: unknown[]) => Promise<unknown>): LoadedPreload {
  const invocations: LoadedPreload['invocations'] = [];
  const listeners: LoadedPreload['listeners'] = new Map();
  let api: RitmoAPI | undefined;
  const electron = {
    contextBridge: { exposeInMainWorld: (name: string, value: RitmoAPI) => { if (name === 'ritmo') api = value; } },
    ipcRenderer: {
      invoke: async (channel: string, ...args: unknown[]) => {
        invocations.push({ channel, args });
        return invoke ? invoke(channel, ...args) : { ok: true, value: undefined };
      },
      on: (channel: string, listener: (...args: unknown[]) => void) => {
        if (!listeners.has(channel)) listeners.set(channel, new Set());
        listeners.get(channel)!.add(listener);
      },
      removeListener: (channel: string, listener: (...args: unknown[]) => void) => { listeners.get(channel)?.delete(listener); }
    }
  };
  const loader = Module as unknown as { _load: (request: string, ...rest: unknown[]) => unknown };
  const original = loader._load;
  const preloadPath = path.join(distRoot, 'src', 'preload', 'index.js');
  loader._load = function (request: string, ...rest: unknown[]) {
    if (request === 'electron') return electron;
    if ((rest[0] as { filename?: string } | undefined)?.filename === preloadPath && request.startsWith('.')) {
      throw new Error(`El preload con sandbox no puede cargar ${request}.`);
    }
    return original.call(this, request, ...rest);
  };
  try {
    delete require.cache[preloadPath];
    require(preloadPath);
  } finally { loader._load = original; }
  assert.ok(api, 'el preload debe exponer window.ritmo');
  return { api, invocations, listeners };
}

/** Un ejemplo de llamada por método. Si RitmoAPI crece, este objeto deja de compilar. */
const sampleCalls: { [K in Exclude<keyof RitmoAPI, 'onState'>]: Parameters<RitmoAPI[K]> } = {
  getState: [],
  startFocus: [],
  finishFocus: [],
  startBreak: ['shortBreak'],
  finishBreak: [],
  addTask: ['Tarea', '2026-09-30'],
  toggleTask: ['id-1'],
  deleteTask: ['id-1'],
  getTasksForDay: ['2026-09-29'],
  getTaskSummary: ['2026-09-28', '2026-11-08'],
  updateTask: ['id-1', { done: true }],
  addDomain: ['x.com'],
  removeDomain: ['x.com'],
  retryUnblock: []
};

test('cada método del preload invoca un canal registrado por el proceso principal con sus argumentos', async t => {
  const { api, invocations } = loadPreload();
  const ipc = new FakeIpc();
  const harness = createHarness(t);
  registerHandlers(ipc, harness);

  for (const [method, args] of Object.entries(sampleCalls)) {
    await (api[method as keyof typeof sampleCalls] as (...values: unknown[]) => Promise<unknown>)(...args);
    const last = invocations.at(-1)!;
    assert.ok(ipc.handlers.has(last.channel), `${method} usa el canal ${last.channel}, que no tiene manejador`);
    assert.deepEqual(last.args, args, `${method} reenvía sus argumentos`);
  }
  const used = new Set(invocations.map(item => item.channel));
  const unused = [...ipc.handlers.keys()].filter(channel => !used.has(channel));
  assert.deepEqual(unused, [], 'no hay manejadores huérfanos');
});

test('onState se suscribe al canal state y permite cancelar la suscripción', () => {
  const { api, listeners } = loadPreload();
  const received: PublicState[] = [];
  const unsubscribe = api.onState(state => received.push(state));
  const [listener] = listeners.get('state') ?? [];
  assert.ok(listener);
  listener({}, { focusCount: 1 });
  assert.deepEqual(received, [{ focusCount: 1 }]);
  unsubscribe();
  assert.equal(listeners.get('state')?.size, 0);
});

test('los manejadores conectan con los servicios reales', async t => {
  const ipc = new FakeIpc();
  const harness = createHarness(t);
  registerHandlers(ipc, harness);

  await ipc.invoke('add-task', 'Desde IPC');
  await ipc.invoke('add-domain', 'instagram.com');
  await ipc.invoke('start-focus');
  const state = await ipc.invoke('get-state') as PublicState;
  assert.deepEqual(state.tasks.map(task => task.title), ['Desde IPC']);
  assert.ok(state.domains.includes('instagram.com'));
  assert.equal(state.session?.kind, 'focus');
  await assert.rejects(ipc.invoke('remove-domain', 'instagram.com'), /cuando termine el foco/);
  await ipc.invoke('retry-unblock');
  assert.equal(harness.store.state.session, null);
  assert.equal(harness.blocker.blocked, false);
});

test('preload y renderer conservan un error esperado sin exponer el canal', async t => {
  const ipc = new FakeIpc();
  registerHandlers(ipc, createHarness(t));
  const { api } = loadPreload((channel, ...args) => ipc.invokeRaw(channel, ...args));
  const reason = await api.addDomain('no es dominio').catch(error => error);
  assert.deepEqual(reason, { kind: 'ritmo-api-error', message: 'Escribe un dominio válido, por ejemplo instagram.com.' });
  assert.equal(errorMessage(reason), 'Escribe un dominio válido, por ejemplo instagram.com.');
});

test('preload y renderer ocultan fallos inesperados y el detalle queda en el proceso principal', async t => {
  const ipc = new FakeIpc();
  const harness = createHarness(t);
  registerHandlers(ipc, harness);
  const detail = new Error('sqlite /private/secret.db add-task');
  t.mock.method(harness.tasks, 'add', () => { throw detail; });
  const logged: unknown[][] = [];
  t.mock.method(console, 'error', (...args: unknown[]) => { logged.push(args); });
  const { api } = loadPreload((channel, ...args) => ipc.invokeRaw(channel, ...args));
  const reason = await api.addTask('Tarea').catch(error => error);
  assert.equal(errorMessage(reason), GENERIC_ERROR_MESSAGE);
  assert.deepEqual(reason, { kind: 'ritmo-api-error', message: GENERIC_ERROR_MESSAGE });
  assert.equal(logged[0]?.[1], detail);
});

test('un rechazo del transporte IPC no llega al banner', async () => {
  const { api } = loadPreload(async () => { throw new Error('Error invoking remote method add-domain'); });
  const reason = await api.addDomain('x.com').catch(error => error);
  assert.equal(errorMessage(reason), GENERIC_ERROR_MESSAGE);
});

test('el proceso principal registra la causa técnica de un error público', async t => {
  const ipc = new FakeIpc();
  const harness = createHarness(t);
  registerHandlers(ipc, harness);
  const cause = new Error('sudo /private/secret');
  t.mock.method(harness.focus, 'startFocus', async () => { throw new PublicError('No se pudo activar el bloqueo.', { cause }); });
  const logged: unknown[][] = [];
  t.mock.method(console, 'error', (...args: unknown[]) => { logged.push(args); });
  const { api } = loadPreload((channel, ...args) => ipc.invokeRaw(channel, ...args));
  const reason = await api.startFocus().catch(error => error);
  assert.equal(errorMessage(reason), 'No se pudo activar el bloqueo.');
  assert.equal(logged[0]?.[1], cause);
});
