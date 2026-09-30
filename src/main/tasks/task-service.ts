import { PublicError } from '../../shared/ipc';
import { safePlannedDate, safeTaskLink, type DaySummary, type Task, type TaskLink, type TaskPatch, type TaskSummary } from '../../shared/tasks/contract';
import type { StateStorePort } from '../state/ports';
import type { StudyStagesPort, StudyTaskRecord } from '../study/ports';
import type { RouteTasksPort, StudyTasksPort, TaskRepositoryPort, TaskServicePort } from './ports';

export class TaskService implements TaskServicePort, StudyTasksPort, RouteTasksPort {
  constructor(
    private readonly store: StateStorePort,
    private readonly repository: TaskRepositoryPort,
    private readonly stages: StudyStagesPort
  ) {}

  add(title: unknown, date: unknown, link?: unknown): void {
    this.store.rollDay();
    const plannedDate = date === undefined ? this.store.today() : safePlannedDate(date);
    this.repository.create(title as string, plannedDate, this.existingLink(link));
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
    const changes = patch as TaskPatch;
    this.repository.update(id, changes.link === undefined ? changes : { ...changes, link: this.existingLink(changes.link) });
    this.refreshToday();
  }

  stageProgress(): Record<string, DaySummary> {
    return this.repository.summarizeByStage();
  }

  unlinkStages(routeId: string, keep: readonly string[]): void {
    this.repository.unlinkStages(routeId, keep);
    this.refreshToday();
  }

  routeTasks(routeId: string): StudyTaskRecord[] {
    // Un vínculo siempre lleva ruta y etapa: una tarea con `routeId` tiene `stageId`.
    return this.repository.listByRoute(routeId).map(task => ({ title: task.title, stageId: task.stageId as string, done: task.done, plannedDate: task.plannedDate }));
  }

  /** Valida el vínculo que llega por IPC y comprueba que la etapa es de esa ruta. */
  private existingLink(value: unknown): TaskLink | null {
    const link = safeTaskLink(value);
    if (link && !this.stages.hasStage(link.routeId, link.stageId)) throw new PublicError('La etapa ya no existe. Elige otra.');
    return link;
  }

  private requireId(id: unknown): string {
    if (typeof id !== 'string') throw new PublicError('Identificador de tarea inválido.');
    return id;
  }

  /** Tras cualquier cambio de tareas: recarga las de hoy y publica el cambio, que puede ser de otro día. */
  private refreshToday(): void {
    this.store.tasksChanged();
    this.store.state.tasks = this.repository.listByDay(this.store.today());
    this.store.save();
  }
}
