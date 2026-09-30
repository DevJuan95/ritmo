import test from 'node:test';
import assert from 'node:assert/strict';
import { PassThrough } from 'node:stream';
import type { BridgeResponse } from '../../../src/shared/bridge/contract';
import { MCP_PROTOCOL_VERSIONS, MCP_SERVER_INFO, MCP_TOOLS, handleMcpMessage, serveMcp, type CallBridge } from '../../../src/mcp/mcp-server';

function bridge(response: BridgeResponse = { ok: true, value: { hecho: true } }) {
  const calls: unknown[] = [];
  const call: CallBridge = async request => { calls.push(request); return response; };
  return { calls, call };
}

const request = (method: string, params?: unknown, id: number | string = 1) => ({ jsonrpc: '2.0', id, method, params });

test('initialize anuncia las herramientas y acepta la versión del cliente si la conoce', async () => {
  const { call } = bridge();
  const answer = await handleMcpMessage(request('initialize', { protocolVersion: '2025-06-18', capabilities: {} }), call) as { result: Record<string, unknown> };
  assert.equal(answer.result.protocolVersion, '2025-06-18');
  assert.deepEqual(answer.result.capabilities, { tools: { listChanged: false } });
  assert.deepEqual(answer.result.serverInfo, MCP_SERVER_INFO);
  assert.match(String(answer.result.instructions), /Ritmo debe estar abierto/);
  for (const version of ['1999-01-01', undefined]) {
    const other = await handleMcpMessage(request('initialize', { protocolVersion: version }), call) as { result: { protocolVersion: string } };
    assert.equal(other.result.protocolVersion, MCP_PROTOCOL_VERSIONS[0]);
  }
});

test('responde a ping y lista las herramientas sin la operación interna', async () => {
  const { call } = bridge();
  assert.deepEqual(await handleMcpMessage(request('ping', undefined, 'a'), call), { jsonrpc: '2.0', id: 'a', result: {} });
  const answer = await handleMcpMessage(request('tools/list'), call) as { result: { tools: Array<Record<string, unknown>> } };
  assert.deepEqual(answer.result.tools.map(tool => tool.name), ['list_study_routes', 'get_study_route', 'add_study_task']);
  assert.ok(answer.result.tools.every(tool => !('op' in tool) && tool.inputSchema && tool.description));
  assert.deepEqual(answer.result.tools.map(tool => (tool.annotations as { readOnlyHint: boolean }).readOnlyHint), [true, true, false]);
});

test('cada herramienta envía su operación al puente y devuelve el resultado como texto', async () => {
  const { calls, call } = bridge();
  for (const tool of MCP_TOOLS) {
    const answer = await handleMcpMessage(request('tools/call', { name: tool.name, arguments: { routeId: 'r1', op: 'delete-task' } }), call);
    assert.deepEqual(answer, { jsonrpc: '2.0', id: 1, result: { content: [{ type: 'text', text: '{\n  "hecho": true\n}' }] } });
  }
  assert.deepEqual(calls, [
    { routeId: 'r1', op: 'list-routes' }, { routeId: 'r1', op: 'get-route' }, { routeId: 'r1', op: 'add-task' }
  ]);
  await handleMcpMessage(request('tools/call', { name: 'list_study_routes' }), call);
  assert.deepEqual(calls.at(-1), { op: 'list-routes' });
});

test('un error de la app o unos argumentos inválidos se devuelven como error de la herramienta', async () => {
  const { calls, call } = bridge({ ok: false, error: 'Ritmo no está abierto.' });
  assert.deepEqual(
    await handleMcpMessage(request('tools/call', { name: 'list_study_routes', arguments: {} }), call),
    { jsonrpc: '2.0', id: 1, result: { content: [{ type: 'text', text: 'Ritmo no está abierto.' }], isError: true } }
  );
  const invalid = await handleMcpMessage(request('tools/call', { name: 'get_study_route', arguments: ['r1'] }), call) as { result: { isError: boolean } };
  assert.equal(invalid.result.isError, true);
  assert.equal(calls.length, 1);
});

test('responde con errores JSON-RPC a herramientas, métodos y mensajes desconocidos', async () => {
  const { calls, call } = bridge();
  assert.deepEqual(await handleMcpMessage(request('tools/call', { name: 'delete_task' }), call),
    { jsonrpc: '2.0', id: 1, error: { code: -32602, message: 'Unknown tool: delete_task' } });
  assert.deepEqual(await handleMcpMessage(request('tools/call'), call),
    { jsonrpc: '2.0', id: 1, error: { code: -32602, message: 'Unknown tool: undefined' } });
  assert.deepEqual(await handleMcpMessage(request('resources/list'), call),
    { jsonrpc: '2.0', id: 1, error: { code: -32601, message: 'Method not found: resources/list' } });
  assert.deepEqual(await handleMcpMessage([request('ping')], call), { jsonrpc: '2.0', id: null, error: { code: -32600, message: 'Invalid Request' } });
  assert.deepEqual(await handleMcpMessage({ jsonrpc: '1.0', id: 3, method: 'ping' }, call), { jsonrpc: '2.0', id: 3, error: { code: -32600, message: 'Invalid Request' } });
  assert.deepEqual(await handleMcpMessage({ jsonrpc: '2.0', id: {}, method: 5 }, call), { jsonrpc: '2.0', id: null, error: { code: -32600, message: 'Invalid Request' } });
  assert.equal(calls.length, 0);
});

test('no contesta notificaciones ni respuestas del cliente', async () => {
  const { call } = bridge();
  assert.equal(await handleMcpMessage({ jsonrpc: '2.0', method: 'notifications/initialized' }, call), undefined);
  assert.equal(await handleMcpMessage({ jsonrpc: '2.0', id: 9, result: {} }, call), undefined);
  assert.equal(await handleMcpMessage({ jsonrpc: '2.0', id: 9, error: { code: 1, message: 'x' } }, call), undefined);
});

test('serveMcp lee una línea por mensaje, contesta cada una y termina al cerrarse la entrada', async () => {
  const { call } = bridge();
  const input = new PassThrough();
  const output = new PassThrough();
  const served = serveMcp(input, output, call);
  input.write(`${JSON.stringify(request('ping'))}\n\n   \n`);
  input.write('{roto\r\n');
  input.write(`${JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' })}\n`);
  input.end(`${JSON.stringify(request('tools/call', { name: 'list_study_routes' }, 2))}\n`);
  await served;
  const lines = String(output.read()).trim().split('\n').map(line => JSON.parse(line));
  assert.deepEqual(lines, [
    { jsonrpc: '2.0', id: 1, result: {} },
    { jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } },
    { jsonrpc: '2.0', id: 2, result: { content: [{ type: 'text', text: '{\n  "hecho": true\n}' }] } }
  ]);
});
