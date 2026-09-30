import type { StudyProgress, StudyRoute, StudyRouteInput, TaskProposal } from '../../shared/study/contract';

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

/** Tarea vinculada a una etapa de la ruta, tal como la ve el agente para no repetir trabajo. */
export interface StudyTaskRecord {
  title: string;
  stageId: string;
  done: boolean;
  plannedDate: string;
}

/** Lo que el agente necesita para proponer tareas: la ruta, sus tareas vinculadas y el día de hoy. */
export interface StudyAgentContext {
  route: StudyRoute;
  /** Tareas vinculadas a la ruta, de cualquier día, completadas o pendientes. */
  tasks: StudyTaskRecord[];
  /** Día de hoy, `AAAA-MM-DD`. */
  today: string;
}

export interface StudyAgentOptions {
  /** Cancela la petición: el adaptador termina el proceso del CLI y rechaza. */
  signal?: AbortSignal;
}

/**
 * Agente de IA local (Claude Code o Codex) que propone las siguientes tareas de una ruta. Cada
 * adaptador arma la petición con `buildAgentRequest()` y devuelve solo propuestas validadas con
 * `readAgentProposals()`; si la respuesta no cumple el esquema, rechaza con un `PublicError`.
 */
export interface StudyAgent {
  propose(context: StudyAgentContext, options?: StudyAgentOptions): Promise<TaskProposal[]>;
}
