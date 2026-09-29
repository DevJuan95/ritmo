import type { Task, TaskSummary } from '../../shared/contracts';

export type TaskPatch = { title?: string; plannedDate?: string; done?: boolean };

export interface TaskRepositoryPort {
  listByDay(date: string): Task[];
  /** Total y completadas de cada día con tareas entre `from` y `to`, ambos incluidos. */
  summarizeRange(from: string, to: string): TaskSummary;
  create(title: string, date: string): Task;
  update(id: string, patch: TaskPatch): Task;
  delete(id: string): void;
  importLegacy(tasks: ReadonlyArray<{ id: string; title: string; done: boolean }>, day: string): void;
  close(): void;
}

export type IdGenerator = () => string;
