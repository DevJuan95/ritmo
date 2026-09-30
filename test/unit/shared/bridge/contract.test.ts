import test from 'node:test';
import assert from 'node:assert/strict';
import { INVALID_BRIDGE_REQUEST, safeBridgeRequest } from '../../../../src/shared/bridge/contract';
import { PublicError } from '../../../../src/shared/ipc';

const invalid = new PublicError(INVALID_BRIDGE_REQUEST);

test('acepta las tres operaciones con sus campos', () => {
  assert.deepEqual(safeBridgeRequest({ op: 'list-routes' }), { op: 'list-routes' });
  assert.deepEqual(safeBridgeRequest({ op: 'get-route', routeId: 'r1' }), { op: 'get-route', routeId: 'r1' });
  assert.deepEqual(
    safeBridgeRequest({ op: 'add-task', routeId: 'r1', stageId: 's1', title: '  Leer   el capítulo 4 ' }),
    { op: 'add-task', routeId: 'r1', stageId: 's1', title: 'Leer el capítulo 4' }
  );
  assert.deepEqual(
    safeBridgeRequest({ op: 'add-task', routeId: 'r1', stageId: 's1', title: 'Leer', date: '2026-10-01' }),
    { op: 'add-task', routeId: 'r1', stageId: 's1', title: 'Leer', date: '2026-10-01' }
  );
});

test('rechaza peticiones sin forma, operaciones desconocidas y campos que sobran o faltan', () => {
  for (const value of [null, undefined, 'list-routes', [], 42]) assert.throws(() => safeBridgeRequest(value), invalid);
  for (const op of [undefined, 1, 'delete-task', 'toString', '__proto__']) assert.throws(() => safeBridgeRequest({ op }), invalid);
  assert.throws(() => safeBridgeRequest({ op: 'list-routes', routeId: 'r1' }), invalid);
  assert.throws(() => safeBridgeRequest({ op: 'get-route' }), invalid);
  assert.throws(() => safeBridgeRequest({ op: 'add-task', routeId: 'r1', title: 'Leer' }), invalid);
  assert.throws(() => safeBridgeRequest({ op: 'add-task', routeId: 'r1', stageId: 's1', title: 'Leer', done: true }), invalid);
});

test('valida cada campo con las reglas de rutas y tareas', () => {
  assert.throws(() => safeBridgeRequest({ op: 'get-route', routeId: '' }), /La ruta no es válida/);
  assert.throws(() => safeBridgeRequest({ op: 'get-route', routeId: 'x'.repeat(65) }), /La ruta no es válida/);
  const task = { op: 'add-task', routeId: 'r1', stageId: 's1', title: 'Leer' };
  assert.throws(() => safeBridgeRequest({ ...task, stageId: '' }), /Elige una etapa válida/);
  assert.throws(() => safeBridgeRequest({ ...task, stageId: 7 }), /Elige una etapa válida/);
  assert.throws(() => safeBridgeRequest({ ...task, title: 123 }), invalid);
  assert.throws(() => safeBridgeRequest({ ...task, title: '   ' }), /La tarea debe tener/);
  assert.throws(() => safeBridgeRequest({ ...task, title: 'x'.repeat(161) }), /La tarea debe tener/);
  assert.throws(() => safeBridgeRequest({ ...task, date: '2026-02-30' }), /Fecha inválida/);
  assert.throws(() => safeBridgeRequest({ ...task, date: null }), /Fecha inválida/);
});
