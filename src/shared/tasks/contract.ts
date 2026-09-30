import { PublicError, type ChannelMap } from '../ipc';

export interface Task {
  id: string;
  title: string;
  done: boolean;
  plannedDate: string;
  createdAt: string;
  completedAt: string | null;
}

/** Cuántas tareas tiene un día y cuántas están completadas. */
export interface DaySummary {
  total: number;
  done: number;
}

/** Resumen de un rango de días, por clave `AAAA-MM-DD`. Solo incluye los días con tareas. */
export type TaskSummary = Record<string, DaySummary>;

export type TaskPatch = { title?: string; plannedDate?: string; done?: boolean };

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

export interface TasksAPI {
  addTask(title: string, date?: string): Promise<void>;
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
