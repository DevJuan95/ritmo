import { PublicError } from '../ipc';
import { safeStudyRouteId, type StudyLevel } from '../study/contract';
import { safePlannedDate, safeTaskLink, safeTaskTitle, type DaySummary } from '../tasks/contract';

/**
 * Protocolo del puente para agentes de terminal: el servidor MCP (`src/mcp/`), que lanzan Claude Code o
 * Codex, habla con la app abierta por un socket Unix con una petición y una respuesta por conexión,
 * cada una en una línea de JSON. Toda la entrada se valida en el proceso principal.
 */

/** Nombre del socket dentro de los datos de la app. */
export const BRIDGE_SOCKET_NAME = 'ritmo.sock';

/** Tamaño máximo de una petición, en bytes. */
export const MAX_BRIDGE_REQUEST = 256 * 1024;

/**
 * Tamaño máximo de una respuesta, en bytes. `get-route` devuelve el roadmap completo: una ruta con
 * todos los campos al máximo que admite `safeStudyRoute()` ronda los 330 000 caracteres, y en el peor
 * caso cada uno ocupa 6 bytes en JSON (un carácter de control escapado como `\u0001`), unos 2 MB.
 */
export const MAX_BRIDGE_RESPONSE = 4 * 1024 * 1024;

/** Tareas de la ruta, las más recientes, que devuelve `get-route`; el avance cuenta todas. */
export const MAX_BRIDGE_TASKS = 60;

export type BridgeRequest =
  | { op: 'list-routes' }
  | { op: 'get-route'; routeId: string }
  | { op: 'add-task'; routeId: string; stageId: string; title: string; date?: string };

export type BridgeOp = BridgeRequest['op'];

export type BridgeResponse = { ok: true; value: unknown } | { ok: false; error: string };

/** Ruta en la lista de `list-routes`. */
export interface BridgeRouteSummary {
  id: string;
  topic: string;
  goal: string;
  level: StudyLevel;
  stages: number;
  /** Tareas vinculadas a la ruta, de todos los días. */
  progress: DaySummary;
}

/** Etapa de `get-route`, con los campos del roadmap (vacíos si la etapa no los tiene) y su avance. */
export interface BridgeStage {
  id: string;
  title: string;
  summary: string;
  /** Temas que hay que dominar. */
  topics: string[];
  deprioritized: string[];
  project: string;
  resources: string[];
  progress: DaySummary;
}

export interface BridgeTask {
  title: string;
  stageId: string;
  done: boolean;
  plannedDate: string;
}

/**
 * Ruta completa de `get-route`: el roadmap (enfoque, etapas, proyecto final y reglas de estudio), el
 * avance de cada etapa y sus tareas más recientes.
 */
export interface BridgeRouteDetail {
  id: string;
  topic: string;
  goal: string;
  level: StudyLevel;
  dailyPomodoros: number;
  approach: string;
  finalProject: string;
  studyRules: string;
  instructions: string;
  /** Día de hoy en la app, `AAAA-MM-DD`. */
  today: string;
  stages: BridgeStage[];
  /** Hasta `MAX_BRIDGE_TASKS`, por día. */
  tasks: BridgeTask[];
  /** Cuántas tareas vinculadas tiene la ruta en total. */
  totalTasks: number;
}

/** Tarea que creó `add-task` en el Planner. */
export interface BridgeTaskAdded {
  title: string;
  plannedDate: string;
  routeId: string;
  stageId: string;
}

export const INVALID_BRIDGE_REQUEST = 'Petición inválida.';

const FIELDS: Readonly<Record<BridgeOp, { required: readonly string[]; optional: readonly string[] }>> = {
  'list-routes': { required: [], optional: [] },
  'get-route': { required: ['routeId'], optional: [] },
  'add-task': { required: ['routeId', 'stageId', 'title'], optional: ['date'] }
};

/** Valida una petición que llega por el socket; falla con un `PublicError` si no es válida. */
export function safeBridgeRequest(value: unknown): BridgeRequest {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new PublicError(INVALID_BRIDGE_REQUEST);
  const { op, ...args } = value as Record<string, unknown>;
  if (typeof op !== 'string' || !Object.hasOwn(FIELDS, op)) throw new PublicError(INVALID_BRIDGE_REQUEST);
  const { required, optional } = FIELDS[op as BridgeOp];
  const keys = Object.keys(args);
  if (required.some(key => !keys.includes(key)) || keys.some(key => !required.includes(key) && !optional.includes(key))) {
    throw new PublicError(INVALID_BRIDGE_REQUEST);
  }
  if (op === 'list-routes') return { op };
  const routeId = safeStudyRouteId(args.routeId);
  if (op === 'get-route') return { op, routeId };
  if (typeof args.title !== 'string') throw new PublicError(INVALID_BRIDGE_REQUEST);
  const { stageId } = safeTaskLink({ routeId, stageId: args.stageId }) as { stageId: string };
  const request: BridgeRequest = { op: 'add-task', routeId, stageId, title: safeTaskTitle(args.title) };
  return args.date === undefined ? request : { ...request, date: safePlannedDate(args.date) };
}
