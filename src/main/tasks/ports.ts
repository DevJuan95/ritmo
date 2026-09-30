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
  importLegacy(tasks: ReadonlyArray<{ id: string; title: string; done: boolean }>, day: string): void;
  close(): void;
}

export interface TaskServicePort {
  add(title: unknown, date: unknown, link?: unknown): void;
  toggle(id: unknown): void;
  remove(id: unknown): void;
  listByDay(date: unknown): Task[];
  summarize(from: unknown, to: unknown): TaskSummary;
  update(id: unknown, patch: unknown): void;
}

/** Lo que las rutas de estudio necesitan de las tareas: su avance por etapa y soltar las de etapas borradas. */
export interface StudyTasksPort {
  stageProgress(): Record<string, DaySummary>;
  /**
   * Desvincula las tareas de la ruta cuya etapa ya no está en `keep` (todas, si está vacío) y
   * actualiza las de hoy en el estado.
   */
  unlinkStages(routeId: string, keep: readonly string[]): void;
}
