import { safeStudyRoute, safeStudyRouteId, type StudyRoute } from '../../shared/study/contract';
import type { StudyRepositoryPort, StudyServicePort } from './ports';

/** Alta, edición y borrado de rutas de estudio. Valida la entrada que llega por IPC antes de guardarla. */
export class StudyService implements StudyServicePort {
  constructor(private readonly repository: StudyRepositoryPort) {}

  list(): StudyRoute[] {
    return this.repository.list();
  }

  create(route: unknown): StudyRoute {
    return this.repository.create(safeStudyRoute(route));
  }

  update(id: unknown, route: unknown): StudyRoute {
    return this.repository.update(safeStudyRouteId(id), safeStudyRoute(route));
  }

  remove(id: unknown): void {
    this.repository.delete(safeStudyRouteId(id));
  }
}
