import readline from 'node:readline';
import type { Readable, Writable } from 'node:stream';
import type { BridgeOp, BridgeResponse } from '../shared/bridge/contract';
import { MAX_TASK_TITLE } from '../shared/tasks/contract';

/**
 * Servidor MCP de Ritmo por la entrada y la salida estándar (JSON-RPC 2.0, un mensaje por línea). Lo
 * lanza Claude Code o Codex desde la terminal. No toca `ritmo.db`: cada herramienta es una petición a la
 * app abierta por el puente, que valida la entrada y hace el trabajo.
 */

/** Envía una petición al puente de la app. Nunca rechaza. */
export type CallBridge = (request: { op: BridgeOp } & Record<string, unknown>) => Promise<BridgeResponse>;

/** Versiones del protocolo MCP que admite, de la más reciente a la más antigua. */
export const MCP_PROTOCOL_VERSIONS = ['2025-11-25', '2025-06-18', '2025-03-26', '2024-11-05'];

export const MCP_SERVER_INFO = { name: 'ritmo', title: 'Ritmo', version: '0.1.0' };

const MCP_INSTRUCTIONS =
  'Rutas de estudio de Ritmo, la app de foco del usuario. Lee una ruta antes de proponer tareas y crea ' +
  'solo las que el usuario te pida, vinculadas a una etapa. Ritmo debe estar abierto.';

const ID = { type: 'string', minLength: 1, maxLength: 64 };

/** Herramientas que ofrece, con la operación del puente que usa cada una. */
export const MCP_TOOLS = [
  {
    op: 'list-routes' as const,
    name: 'list_study_routes',
    title: 'Listar rutas de estudio',
    description: 'Lista las rutas de estudio de Ritmo: id, tema, objetivo, nivel, número de etapas y tareas vinculadas (total y completadas).',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    annotations: { readOnlyHint: true, openWorldHint: false }
  },
  {
    op: 'get-route' as const,
    name: 'get_study_route',
    title: 'Leer una ruta de estudio',
    description:
      'Lee el roadmap de una ruta de estudio de Ritmo: objetivo, nivel, pomodoros al día, enfoque, proyecto final, ' +
      'reglas de estudio, instrucciones del usuario y el día de hoy; cada etapa en orden con su id, su resumen, lo que ' +
      'hay que dominar (topics), lo que no priorizar todavía (deprioritized), su proyecto, sus recursos y su avance; ' +
      'y las tareas vinculadas más recientes. Los campos del roadmap pueden venir vacíos.',
    inputSchema: { type: 'object', properties: { routeId: ID }, required: ['routeId'], additionalProperties: false },
    annotations: { readOnlyHint: true, openWorldHint: false }
  },
  {
    op: 'add-task' as const,
    name: 'add_study_task',
    title: 'Añadir una tarea al Planner',
    description:
      'Crea en el Planner de Ritmo una tarea vinculada a una etapa de una ruta, en el día indicado (hoy si se omite). ' +
      'No cambia ni borra tareas. Usa los id de get_study_route.',
    inputSchema: {
      type: 'object',
      properties: {
        routeId: ID,
        stageId: ID,
        title: { type: 'string', minLength: 1, maxLength: MAX_TASK_TITLE, description: 'Tarea concreta, en una línea.' },
        date: { type: 'string', pattern: '^\\d{4}-\\d{2}-\\d{2}$', description: 'Día del Planner, AAAA-MM-DD. Hoy si se omite.' }
      },
      required: ['routeId', 'stageId', 'title'],
      additionalProperties: false
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false }
  }
];

type JsonRpcId = string | number | null;

function success(id: JsonRpcId, result: unknown) {
  return { jsonrpc: '2.0' as const, id, result };
}

function failure(id: JsonRpcId, code: number, message: string) {
  return { jsonrpc: '2.0' as const, id, error: { code, message } };
}

function isObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

async function callTool(params: Record<string, unknown>, call: CallBridge): Promise<unknown> {
  const tool = MCP_TOOLS.find(item => item.name === params.name);
  if (!tool) return undefined;
  const args = params.arguments ?? {};
  const response: BridgeResponse = isObject(args)
    ? await call({ ...args, op: tool.op })
    : { ok: false, error: 'Los argumentos deben ser un objeto.' };
  return response.ok
    ? { content: [{ type: 'text', text: JSON.stringify(response.value, null, 2) }] }
    : { content: [{ type: 'text', text: response.error }], isError: true };
}

/**
 * Atiende un mensaje JSON-RPC ya leído. Devuelve la respuesta, o `undefined` si no hay que responder
 * (una notificación o una respuesta del cliente).
 */
export async function handleMcpMessage(message: unknown, call: CallBridge): Promise<object | undefined> {
  if (!isObject(message)) return failure(null, -32600, 'Invalid Request');
  // Una respuesta del cliente (con `result` o `error`) no se contesta.
  if (message.method === undefined && ('result' in message || 'error' in message)) return undefined;
  if (message.jsonrpc !== '2.0' || typeof message.method !== 'string') {
    return failure(typeof message.id === 'string' || typeof message.id === 'number' ? message.id : null, -32600, 'Invalid Request');
  }
  if (!('id' in message)) return undefined;
  const id = message.id as JsonRpcId;
  const params = isObject(message.params) ? message.params : {};
  switch (message.method) {
    case 'initialize': {
      const requested = params.protocolVersion;
      const protocolVersion = typeof requested === 'string' && MCP_PROTOCOL_VERSIONS.includes(requested) ? requested : MCP_PROTOCOL_VERSIONS[0];
      return success(id, { protocolVersion, capabilities: { tools: { listChanged: false } }, serverInfo: MCP_SERVER_INFO, instructions: MCP_INSTRUCTIONS });
    }
    case 'ping': return success(id, {});
    case 'tools/list': return success(id, { tools: MCP_TOOLS.map(({ op: _op, ...tool }) => tool) });
    case 'tools/call': {
      const result = await callTool(params, call);
      return result ? success(id, result) : failure(id, -32602, `Unknown tool: ${String(params.name)}`);
    }
    default: return failure(id, -32601, `Method not found: ${message.method}`);
  }
}

/**
 * Lee mensajes de `input`, una línea cada uno, y escribe las respuestas en `output`. Se cumple cuando
 * `input` se cierra y se han enviado todas las respuestas.
 */
export async function serveMcp(input: Readable, output: Writable, call: CallBridge): Promise<void> {
  const pending = new Set<Promise<void>>();
  const lines = readline.createInterface({ input, crlfDelay: Infinity });
  for await (const line of lines) {
    if (!line.trim()) continue;
    let message: unknown;
    try { message = JSON.parse(line); }
    catch {
      output.write(`${JSON.stringify(failure(null, -32700, 'Parse error'))}\n`);
      continue;
    }
    const answer = handleMcpMessage(message, call).then(response => {
      if (response) output.write(`${JSON.stringify(response)}\n`);
    });
    pending.add(answer);
    answer.finally(() => pending.delete(answer));
  }
  await Promise.all(pending);
}
