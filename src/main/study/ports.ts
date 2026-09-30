import type { AgentAvailability, AgentSettings, AgentStatus, StudyProgress, StudyProvider, StudyRoute, StudyRouteInput, TaskProposal } from '../../shared/study/contract';

/** Lo que las tareas necesitan de las rutas: comprobar que la etapa de un vínculo existe. */
export interface StudyStagesPort {
  /** Si la etapa existe y pertenece a esa ruta. */
  hasStage(routeId: string, stageId: string): boolean;
}

/** Lo que la petición al agente necesita de las rutas: la ruta guardada. */
export interface StudyRouteReaderPort {
  /** La ruta con sus etapas en orden; falla con un `PublicError` si no existe. */
  get(id: string): StudyRoute;
}

/** Lo que el puente para agentes de terminal necesita de las rutas, además de leer una: la lista. */
export interface StudyRouteListPort {
  /** Todas las rutas, de la más antigua a la más reciente, con sus etapas en orden. */
  list(): StudyRoute[];
}

/** Rutas de estudio y sus etapas en SQLite. Recibe entradas ya validadas con `safeStudyRoute()`. */
export interface StudyRepositoryPort extends StudyRouteListPort {
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

/** Lectura de la configuración del agente guardada en SQLite. */
export interface AgentSettingsReaderPort {
  /** La configuración guardada, o la de por defecto si no hay o no es válida. */
  loadAgentSettings(): AgentSettings;
}

/** Configuración del agente guardada en SQLite. */
export interface AgentSettingsRepositoryPort extends AgentSettingsReaderPort {
  /** Guarda una configuración ya validada con `safeAgentSettings()`. */
  saveAgentSettings(settings: AgentSettings): void;
}

/** Estado de la sesión de un CLI que sí se encontró. */
export type AgentLogin = Exclude<AgentAvailability, 'missing'>;

/** Avisos de privacidad que aceptó el usuario, por proveedor, guardados en SQLite. */
export interface AgentNoticeRepositoryPort {
  /** Proveedores con el aviso aceptado; ninguno si no hay o lo guardado no es válido. */
  loadAgentNotices(): StudyProvider[];
  saveAgentNotices(providers: readonly StudyProvider[]): void;
}

/**
 * Localiza el CLI de un proveedor. Una app abierta desde Finder no hereda el `PATH` de la shell,
 * así que también busca en rutas conocidas y en el `PATH` de la shell de login.
 */
export interface AgentLocator {
  /**
   * Ruta del ejecutable del proveedor, o `null` si no está. Con `configured` (absoluta o con `~/`)
   * solo mira esa ruta; vacía, lo busca.
   */
  locate(provider: StudyProvider, configured: string): Promise<string | null>;
}

/** Localiza el CLI de cada proveedor y comprueba su sesión, sin enviar ningún prompt. */
export interface AgentDetector extends AgentLocator {
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

/** CLI con el que se crea un `StudyAgent`: el ejecutable encontrado y el modelo configurado. */
export interface StudyAgentCli {
  command: string;
  /** Modelo o alias; vacío para usar el que tenga configurado el CLI. */
  model: string;
}

/** Crea el adaptador de `StudyAgent` del proveedor elegido. No lanza ningún proceso. */
export interface StudyAgentFactory {
  create(provider: StudyProvider, cli: StudyAgentCli): StudyAgent;
}

/**
 * Petición de propuestas al agente elegido: el aviso de privacidad de cada proveedor, una petición
 * a la vez y su cancelación. Las propuestas no se guardan; el usuario acepta las que quiere como
 * tareas del Planner.
 */
export interface ProposalServicePort {
  /** Proveedores con el aviso de privacidad aceptado. */
  notices(): StudyProvider[];
  acceptNotice(provider: unknown): StudyProvider[];
  /** Envía la ruta guardada al agente; rechaza si el aviso de su proveedor no está aceptado o si ya hay otra petición. */
  propose(routeId: unknown): Promise<TaskProposal[]>;
  /** Cancela la petición en curso, si la hay. */
  cancel(): void;
}

/** Parte de la petición de propuestas que usa el cierre ordenado. */
export interface ProposalLifecyclePort {
  /**
   * Deja de aceptar peticiones y cancela la que esté en curso. Se cumple, sin rechazar nunca, cuando
   * esa petición termina: su CLI ya salió y su directorio temporal ya se borró.
   */
  stop(): Promise<void>;
}
