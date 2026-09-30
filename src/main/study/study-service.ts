import { safeStudyRoute, safeStudyRouteId, type StudyProgress, type StudyRoute } from '../../shared/study/contract';
import type { StudyTasksPort } from '../tasks/ports';
import type { StudyRepositoryPort, StudyServicePort } from './ports';

/**
 * Alta, edición y borrado de rutas de estudio, y avance de sus etapas según las tareas vinculadas.
 * Valida la entrada que llega por IPC antes de guardarla.
 */
export class StudyService implements StudyServicePort {
  constructor(private readonly repository: StudyRepositoryPort, private readonly tasks: StudyTasksPort) {}

  list(): StudyRoute[] {
    return this.repository.list();
  }

  create(route: unknown): StudyRoute {
    return this.repository.create(safeStudyRoute(route));
  }

  /** Las tareas de las etapas que se quitaron dejan de estar vinculadas; conservan su día y su estado. */
  update(id: unknown, route: unknown): StudyRoute {
    const saved = this.repository.update(safeStudyRouteId(id), safeStudyRoute(route));
    this.tasks.unlinkStages(saved.id, saved.stages.map(stage => stage.id));
    return saved;
  }

  /** Borra la ruta y sus etapas; sus tareas quedan en el Planner, sin vincular. */
  remove(id: unknown): void {
    const routeId = safeStudyRouteId(id);
    this.repository.delete(routeId);
    this.tasks.unlinkStages(routeId, []);
  }

  progress(): StudyProgress {
    return this.tasks.stageProgress();
  }
}
