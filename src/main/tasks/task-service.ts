import { PublicError } from '../../shared/ipc';
import { safePlannedDate, type Task, type TaskPatch, type TaskSummary } from '../../shared/tasks/contract';
import type { StateStorePort } from '../state/ports';
import type { TaskRepositoryPort, TaskServicePort } from './ports';

export class TaskService implements TaskServicePort {
  constructor(private readonly store: StateStorePort, private readonly repository: TaskRepositoryPort) {}

  add(title: unknown, date: unknown): void {
    this.store.rollDay();
    this.repository.create(title as string, date === undefined ? this.store.today() : safePlannedDate(date));
    this.refreshToday();
  }

  toggle(id: unknown): void {
    this.store.rollDay();
    const taskId = this.requireId(id);
    const task = this.store.state.tasks.find(item => item.id === taskId);
    if (task) this.repository.update(taskId, { done: !task.done });
    this.refreshToday();
  }

  remove(id: unknown): void {
    this.store.rollDay();
    this.repository.delete(this.requireId(id));
    this.refreshToday();
  }

  listByDay(date: unknown): Task[] {
    return this.repository.listByDay(safePlannedDate(date));
  }

  /** Resumen del rango que muestra el calendario del Planner, en una sola consulta. */
  summarize(from: unknown, to: unknown): TaskSummary {
    const first = safePlannedDate(from);
    const last = safePlannedDate(to);
    if (first > last) throw new PublicError('Rango de fechas inválido.');
    return this.repository.summarizeRange(first, last);
  }

  update(id: unknown, patch: unknown): void {
    if (typeof id !== 'string' || !patch || typeof patch !== 'object' || Array.isArray(patch)) throw new PublicError('Cambio de tarea inválido.');
    this.repository.update(id, patch as TaskPatch);
    this.refreshToday();
  }

  private requireId(id: unknown): string {
    if (typeof id !== 'string') throw new PublicError('Identificador de tarea inválido.');
    return id;
  }

  private refreshToday(): void {
    this.store.state.tasks = this.repository.listByDay(this.store.today());
    this.store.save();
  }
}
