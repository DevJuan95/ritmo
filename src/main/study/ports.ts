import type { AgentAvailability, AgentSettings, AgentStatus, StudyProgress, StudyProvider, StudyRoute, StudyRouteInput, TaskProposal } from '../../shared/study/contract';

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

/** Configuración del agente guardada en SQLite. */
export interface AgentSettingsRepositoryPort {
  /** La configuración guardada, o la de por defecto si no hay o no es válida. */
  loadAgentSettings(): AgentSettings;
  /** Guarda una configuración ya validada con `safeAgentSettings()`. */
  saveAgentSettings(settings: AgentSettings): void;
}

/** Estado de la sesión de un CLI que sí se encontró. */
export type AgentLogin = Exclude<AgentAvailability, 'missing'>;

/**
 * Localiza el CLI de cada proveedor y comprueba su sesión, sin enviar ningún prompt. Una app abierta
 * desde Finder no hereda el `PATH` de la shell, así que también busca en rutas conocidas y en el
 * `PATH` de la shell de login.
 */
export interface AgentDetector {
  /**
   * Ruta del ejecutable del proveedor, o `null` si no está. Con `configured` (absoluta o con `~/`)
   * solo mira esa ruta; vacía, lo busca.
   */
  locate(provider: StudyProvider, configured: string): Promise<string | null>;
  /** Estado de la sesión del CLI en `command`; `unknown` si no se pudo comprobar. */
  login(provider: StudyProvider, command: string): Promise<AgentLogin>;
}

/** Configuración y estado del agente que pide el renderer. */
export interface AgentServicePort {
  settings(): AgentSettings;
  saveSettings(settings: unknown): AgentSettings;
  /** Estado del CLI de cada proveedor, en el orden de `STUDY_PROVIDERS`. */
  status(): Promise<AgentStatus[]>;
}
