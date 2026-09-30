import { PublicError, type ChannelMap } from '../ipc';

export interface Task {
  id: string;
  title: string;
  done: boolean;
  plannedDate: string;
  createdAt: string;
  completedAt: string | null;
  /** Ruta de estudio a la que pertenece la tarea, o `null` si es una tarea suelta. */
  routeId: string | null;
  /** Etapa de esa ruta; siempre va junto a `routeId`. */
  stageId: string | null;
}

/** Ruta y etapa a las que se vincula una tarea. */
export interface TaskLink {
  routeId: string;
  stageId: string;
}

/** Cuántas tareas tiene un día y cuántas están completadas. */
export interface DaySummary {
  total: number;
  done: number;
}

/** Resumen de un rango de días, por clave `AAAA-MM-DD`. Solo incluye los días con tareas. */
export type TaskSummary = Record<string, DaySummary>;

/** Cambios de una tarea. `link: null` la desvincula de su ruta. */
export type TaskPatch = { title?: string; plannedDate?: string; done?: boolean; link?: TaskLink | null };

/** Parte del estado de la app que pertenece a las tareas: las de hoy. */
export interface TasksState {
  tasks: Task[];
}

/**
 * Rango de días que se pueden planificar. Evita guardar los años intermedios que el campo de
 * fecha produce mientras se escribe el año a mano (0202-… antes de 2026-…).
 */
export const FIRST_PLANNED_DATE = '2000-01-01';
export const LAST_PLANNED_DATE = '2100-12-31';

export function safePlannedDate(value: unknown): string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new PublicError('Fecha inválida.');
  if (value < FIRST_PLANNED_DATE || value > LAST_PLANNED_DATE) throw new PublicError('Elige una fecha entre 2000 y 2100.');
  const [year, month, day] = value.split('-').map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  if (parsed.getUTCFullYear() !== year || parsed.getUTCMonth() + 1 !== month || parsed.getUTCDate() !== day) throw new PublicError('Fecha inválida.');
  return value;
}

export function safeTaskTitle(value: unknown): string {
  const title = String(value || '').trim().replace(/\s+/g, ' ');
  if (!title || title.length > 160) throw new PublicError('La tarea debe tener entre 1 y 160 caracteres.');
  return title;
}

/**
 * Valida la forma de un vínculo: `null` o `undefined` es una tarea suelta. Que la etapa sea de esa
 * ruta lo comprueba el proceso principal contra las rutas guardadas.
 */
export function safeTaskLink(value: unknown): TaskLink | null {
  if (value === undefined || value === null) return null;
  const invalid = 'Elige una etapa válida.';
  if (typeof value !== 'object' || Array.isArray(value)) throw new PublicError(invalid);
  const { routeId, stageId, ...rest } = value as Record<string, unknown>;
  const id = (item: unknown) => typeof item === 'string' && item.length > 0 && item.length <= 64;
  if (!id(routeId) || !id(stageId) || Object.keys(rest).length) throw new PublicError(invalid);
  return { routeId: routeId as string, stageId: stageId as string };
}

export interface TasksAPI {
  /** Crea una tarea en `date` (hoy si se omite), vinculada a una etapa si llega `link`. */
  addTask(title: string, date?: string, link?: TaskLink | null): Promise<void>;
  toggleTask(id: string): Promise<void>;
  deleteTask(id: string): Promise<void>;
  getTasksForDay(date: string): Promise<Task[]>;
  getTaskSummary(from: string, to: string): Promise<TaskSummary>;
  updateTask(id: string, patch: TaskPatch): Promise<void>;
}

export type TasksChannels = ChannelMap<TasksAPI, {
  addTask: 'add-task';
  toggleTask: 'toggle-task';
  deleteTask: 'delete-task';
  getTasksForDay: 'get-tasks-for-day';
  getTaskSummary: 'get-task-summary';
  updateTask: 'update-task';
}>;
