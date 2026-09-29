import type { Task, TaskSummary } from '../shared/contracts';
import { safePlannedDate } from '../shared/validation';
import type { TaskPatch, TaskRepositoryPort } from './ports';
import { StateStore } from './state';

export class TaskService {
  constructor(private readonly store: StateStore, private readonly repository: TaskRepositoryPort) {}

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
    if (first > last) throw new Error('Rango de fechas inválido.');
    return this.repository.summarizeRange(first, last);
  }

  update(id: unknown, patch: unknown): void {
    if (typeof id !== 'string' || !patch || typeof patch !== 'object' || Array.isArray(patch)) throw new Error('Cambio de tarea inválido.');
    this.repository.update(id, patch as TaskPatch);
    this.refreshToday();
  }

  private requireId(id: unknown): string {
    if (typeof id !== 'string') throw new Error('Identificador de tarea inválido.');
    return id;
  }

  private refreshToday(): void {
    this.store.state.tasks = this.repository.listByDay(this.store.today());
    this.store.save();
  }
}
