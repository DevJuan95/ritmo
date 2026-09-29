export type SessionKind = 'focus' | 'shortBreak' | 'longBreak';
export type BreakKind = Exclude<SessionKind, 'focus'>;

/** Solo los errores de esta clase pueden mostrar su mensaje fuera del proceso principal. */
export class PublicError extends Error {}

export const GENERIC_ERROR_MESSAGE = 'No se pudo completar la operación. Inténtalo de nuevo.';
export const PENDING_BLOCK_MESSAGE = 'Hay un bloqueo pendiente. Usa “Quitar bloqueo” para recuperar el acceso.';

export type IpcResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: { kind: 'expected'; message: string } | { kind: 'unexpected' } };

export interface ApiError {
  kind: 'ritmo-api-error';
  message: string;
}

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

export interface Session {
  kind: SessionKind;
  endsAt: number;
}

export interface AppState {
  day: string;
  tasks: Task[];
  domains: string[];
  session: Session | null;
  focusCount: number;
  blockError: string | null;
}

export interface PublicState extends AppState {
  busy: boolean;
  now: number;
}

export interface RitmoAPI {
  getState(): Promise<PublicState>;
  startFocus(): Promise<void>;
  finishFocus(): Promise<void>;
  startBreak(kind: BreakKind): Promise<void>;
  finishBreak(): Promise<void>;
  addTask(title: string, date?: string): Promise<void>;
  toggleTask(id: string): Promise<void>;
  deleteTask(id: string): Promise<void>;
  getTasksForDay(date: string): Promise<Task[]>;
  getTaskSummary(from: string, to: string): Promise<TaskSummary>;
  updateTask(id: string, patch: { title?: string; plannedDate?: string; done?: boolean }): Promise<void>;
  addDomain(domain: string): Promise<void>;
  removeDomain(domain: string): Promise<void>;
  retryUnblock(): Promise<void>;
  onState(callback: (state: PublicState) => void): () => void;
}

declare global {
  interface Window {
    ritmo: RitmoAPI;
  }
}
