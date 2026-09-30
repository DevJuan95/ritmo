import type { StudyProgress, StudyRoute, StudyRouteInput } from '../../shared/study/contract';

/** Lo que las tareas necesitan de las rutas: comprobar que la etapa de un vínculo existe. */
export interface StudyStagesPort {
  /** Si la etapa existe y pertenece a esa ruta. */
  hasStage(routeId: string, stageId: string): boolean;
}

/** Rutas de estudio y sus etapas en SQLite. Recibe entradas ya validadas con `safeStudyRoute()`. */
export interface StudyRepositoryPort {
  /** Todas las rutas, de la más antigua a la más reciente, con sus etapas en orden. */
  list(): StudyRoute[];
  create(route: StudyRouteInput): StudyRoute;
  /**
   * Reemplaza los datos y las etapas de la ruta. Conserva el `id` de las etapas que lo traen, crea las
   * nuevas y borra las que faltan. Falla si la ruta no existe o si una etapa es de otra ruta.
   */
  update(id: string, route: StudyRouteInput): StudyRoute;
  delete(id: string): void;
  close(): void;
}

export interface StudyServicePort {
  list(): StudyRoute[];
  create(route: unknown): StudyRoute;
  update(id: unknown, route: unknown): StudyRoute;
  remove(id: unknown): void;
  /** Avance de cada etapa con tareas vinculadas, por `stageId`. */
  progress(): StudyProgress;
}
