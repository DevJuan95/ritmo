import type { StudyTaskRecord } from '../study/ports';
import type { DaySummary, Task, TaskLink, TaskPatch, TaskSummary } from '../../shared/tasks/contract';

export interface TaskRepositoryPort {
  listByDay(date: string): Task[];
  /** Total y completadas de cada día con tareas entre `from` y `to`, ambos incluidos. */
  summarizeRange(from: string, to: string): TaskSummary;
  create(title: string, date: string, link?: TaskLink | null): Task;
  update(id: string, patch: TaskPatch): Task;
  delete(id: string): void;
  /** Total y completadas de cada etapa con tareas vinculadas, por `stageId`, de todos los días. */
  summarizeByStage(): Record<string, DaySummary>;
  /** Desvincula las tareas de la ruta cuya etapa no está en `keep`; con `keep` vacío, todas las de la ruta. */
  unlinkStages(routeId: string, keep: readonly string[]): void;
  /** Tareas vinculadas a la ruta, de todos los días, por día. */
  listByRoute(routeId: string): Task[];
  /** Borra las tareas vinculadas a la ruta, de todos los días. */
  deleteByRoute(routeId: string): void;
  importLegacy(tasks: ReadonlyArray<{ id: string; title: string; done: boolean }>, day: string): void;
  close(): void;
}

/** Alta de tareas sin validar: la del renderer y la del puente para agentes de terminal. */
export interface TaskCreatorPort {
  /** Crea la tarea en `date` (hoy si es `undefined`), vinculada a la etapa de `link` si llega. */
  add(title: unknown, date: unknown, link?: unknown): void;
}

export interface TaskServicePort extends TaskCreatorPort {
  toggle(id: unknown): void;
  remove(id: unknown): void;
  listByDay(date: unknown): Task[];
  summarize(from: unknown, to: unknown): TaskSummary;
  update(id: unknown, patch: unknown): void;
}

/**
 * Lo que las rutas de estudio necesitan de las tareas: su avance por etapa, soltar las de etapas
 * borradas y borrar las de una ruta borrada.
 */
export interface StudyTasksPort {
  stageProgress(): Record<string, DaySummary>;
  /**
   * Desvincula las tareas de la ruta cuya etapa ya no está en `keep` (todas, si está vacío) y
   * actualiza las de hoy en el estado.
   */
  unlinkStages(routeId: string, keep: readonly string[]): void;
  /** Borra las tareas vinculadas a la ruta, de todos los días, y actualiza las de hoy en el estado. */
  deleteRouteTasks(routeId: string): void;
}

/** Lo que la petición al agente necesita de las tareas: el historial de una ruta. */
export interface RouteTasksPort {
  /** Tareas vinculadas a la ruta, de todos los días, completadas o pendientes. */
  routeTasks(routeId: string): StudyTaskRecord[];
}
