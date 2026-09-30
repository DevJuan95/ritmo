import { PublicError, type ChannelMap } from '../ipc';
import { safeTaskTitle } from '../tasks/contract';

/** Agente de IA local que propone tareas: el CLI de Claude Code o el de Codex. */
export type StudyProvider = 'claude' | 'codex';

export type StudyLevel = 'beginner' | 'intermediate' | 'advanced';

/** Hito de una ruta, con los temas que cubre. */
export interface StudyStage {
  id: string;
  title: string;
  topics: string[];
}

/** Roadmap de un tema, con las instrucciones que se dan al agente al pedirle tareas. */
export interface StudyRoute {
  id: string;
  topic: string;
  goal: string;
  level: StudyLevel;
  dailyPomodoros: number;
  stages: StudyStage[];
  instructions: string;
  createdAt: string;
  updatedAt: string;
}

/** Etapa tal como la envía el renderer: sin `id` si es nueva. */
export type StudyStageInput = Omit<StudyStage, 'id'> & { id?: string };

/** Datos editables de una ruta; el proceso principal asigna los identificadores y las fechas. */
export type StudyRouteInput = Omit<StudyRoute, 'id' | 'stages' | 'createdAt' | 'updatedAt'> & { stages: StudyStageInput[] };

/** Tarea que propone el agente para una etapa. Al aceptarla se convierte en una tarea del Planner. */
export interface TaskProposal {
  title: string;
  stageId: string;
  pomodoros: number;
  doneWhen: string;
  reason: string;
}

/** Tareas vinculadas a una etapa y cuántas están completadas, de todos los días. */
export interface StageProgress {
  done: number;
  total: number;
}

/** Avance de las etapas por `stageId`. Una etapa sin tareas vinculadas no aparece. */
export type StudyProgress = Record<string, StageProgress>;

export const STUDY_PROVIDERS: readonly StudyProvider[] = ['claude', 'codex'];
export const STUDY_LEVELS: readonly StudyLevel[] = ['beginner', 'intermediate', 'advanced'];
export const MAX_STAGES = 30;
export const MAX_TOPICS_PER_STAGE = 20;
export const MAX_DAILY_POMODOROS = 16;
export const MAX_PROPOSALS = 10;
export const MAX_PROPOSAL_POMODOROS = 8;
/** Largo máximo del criterio de «hecho» y del motivo de una propuesta. */
export const MAX_PROPOSAL_TEXT = 300;

export const DEFAULT_AGENT_INSTRUCTIONS =
  'Propón tareas concretas y verificables, de 1 a 4 pomodoros, que alternen lectura, ejercicios y práctica. Indica un recurso o un criterio claro para saber cuándo está hecha. Responde en español.';

function record(value: unknown, message: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new PublicError(message);
  return value as Record<string, unknown>;
}

/** Texto de una línea, sin espacios repetidos, de `min` a `max` caracteres. */
function line(value: unknown, min: number, max: number, message: string): string {
  if (value !== undefined && value !== null && typeof value !== 'string') throw new PublicError(message);
  const text = (value ?? '').trim().replace(/\s+/g, ' ');
  if (text.length < min || text.length > max) throw new PublicError(message);
  return text;
}

/** Texto libre que conserva los saltos de línea, de 0 a `max` caracteres. */
function paragraph(value: unknown, max: number, message: string): string {
  if (value !== undefined && value !== null && typeof value !== 'string') throw new PublicError(message);
  const text = (value ?? '').replace(/\r\n?/g, '\n').trim();
  if (text.length > max) throw new PublicError(message);
  return text;
}

function integer(value: unknown, min: number, max: number, message: string): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < min || value > max) throw new PublicError(message);
  return value;
}

export function safeStudyProvider(value: unknown): StudyProvider {
  if (!STUDY_PROVIDERS.includes(value as StudyProvider)) throw new PublicError('Elige Claude Code o Codex.');
  return value as StudyProvider;
}

export function safeStudyLevel(value: unknown): StudyLevel {
  if (!STUDY_LEVELS.includes(value as StudyLevel)) throw new PublicError('Elige un nivel válido.');
  return value as StudyLevel;
}

export function safeStudyStage(value: unknown): StudyStageInput {
  const stage = record(value, 'La etapa no es válida.');
  const title = line(stage.title, 1, 120, 'Cada etapa debe tener un título de 1 a 120 caracteres.');
  if (!Array.isArray(stage.topics) || stage.topics.length > MAX_TOPICS_PER_STAGE) {
    throw new PublicError(`Cada etapa admite hasta ${MAX_TOPICS_PER_STAGE} temas.`);
  }
  const topics = [...new Set(stage.topics.map((topic) => line(topic, 1, 80, 'Cada tema debe tener de 1 a 80 caracteres.')))];
  if (stage.id === undefined) return { title, topics };
  return { id: line(stage.id, 1, 64, 'La etapa no es válida.'), title, topics };
}

export function safeStudyRoute(value: unknown): StudyRouteInput {
  const route = record(value, 'La ruta no es válida.');
  if (!Array.isArray(route.stages) || route.stages.length < 1 || route.stages.length > MAX_STAGES) {
    throw new PublicError(`La ruta debe tener de 1 a ${MAX_STAGES} etapas.`);
  }
  const stages = route.stages.map(safeStudyStage);
  const ids = stages.flatMap((stage) => (stage.id ? [stage.id] : []));
  if (new Set(ids).size !== ids.length) throw new PublicError('La ruta tiene etapas repetidas.');
  return {
    topic: line(route.topic, 1, 80, 'El tema debe tener de 1 a 80 caracteres.'),
    goal: paragraph(route.goal, 500, 'El objetivo admite hasta 500 caracteres.'),
    level: safeStudyLevel(route.level),
    dailyPomodoros: integer(route.dailyPomodoros, 1, MAX_DAILY_POMODOROS, `Elige de 1 a ${MAX_DAILY_POMODOROS} pomodoros por día.`),
    stages,
    instructions: paragraph(route.instructions, 2000, 'Las instrucciones admiten hasta 2000 caracteres.'),
  };
}

/** Error público de una petición al agente que canceló el usuario o el cierre de la app. */
export const AGENT_CANCELLED = 'Se canceló la petición al agente.';

/** Error público de una respuesta del agente que no cumple el esquema; no incluye la respuesta. */
export const INVALID_AGENT_RESPONSE = 'El agente devolvió una respuesta que no se puede usar.';

/**
 * Valida la respuesta del agente: `{ proposals: TaskProposal[] }`, con cada propuesta en una etapa de
 * la ruta. Es una entrada externa, así que se valida igual que la que llega por IPC.
 */
export function safeTaskProposals(value: unknown, stageIds: ReadonlySet<string>): TaskProposal[] {
  const invalid = INVALID_AGENT_RESPONSE;
  const { proposals } = record(value, invalid);
  if (!Array.isArray(proposals) || proposals.length < 1 || proposals.length > MAX_PROPOSALS) throw new PublicError(invalid);
  return proposals.map((item) => {
    const proposal = record(item, invalid);
    if (typeof proposal.stageId !== 'string' || !stageIds.has(proposal.stageId)) throw new PublicError(invalid);
    let title: string;
    try {
      title = safeTaskTitle(typeof proposal.title === 'string' ? proposal.title : '');
    } catch {
      throw new PublicError(invalid);
    }
    return {
      title,
      stageId: proposal.stageId,
      pomodoros: integer(proposal.pomodoros, 1, MAX_PROPOSAL_POMODOROS, invalid),
      doneWhen: paragraph(proposal.doneWhen, MAX_PROPOSAL_TEXT, invalid),
      reason: paragraph(proposal.reason, MAX_PROPOSAL_TEXT, invalid),
    };
  });
}

/** Identificador de una ruta: texto de 1 a 64 caracteres. */
export function safeStudyRouteId(value: unknown): string {
  if (typeof value !== 'string' || !value || value.length > 64) throw new PublicError('La ruta no es válida.');
  return value;
}

/** Nombre o alias de modelo que se pasa al CLI: sin espacios y sin empezar por `-`. */
export const AGENT_MODEL_PATTERN = /^[A-Za-z0-9][\w.:[\]-]{0,99}$/;
export const MAX_AGENT_PATH = 1024;

/** Configuración del CLI de un proveedor. */
export interface AgentProviderSettings {
  /** Ruta del ejecutable, absoluta o con `~/`; vacía para detectarlo. */
  path: string;
  /** Modelo o alias que se pasa al CLI; vacío para usar el que tenga configurado el CLI. */
  model: string;
}

/** Configuración del agente de estudio: el proveedor elegido y el CLI de cada uno. */
export interface AgentSettings {
  provider: StudyProvider;
  claude: AgentProviderSettings;
  codex: AgentProviderSettings;
}

/** Modelos ligeros por defecto: las peticiones cuentan para los límites de la suscripción. */
export const DEFAULT_AGENT_MODELS: Readonly<Record<StudyProvider, string>> = { claude: 'haiku', codex: 'gpt-6-luna' };

export const DEFAULT_AGENT_SETTINGS: AgentSettings = {
  provider: 'claude',
  claude: { path: '', model: DEFAULT_AGENT_MODELS.claude },
  codex: { path: '', model: DEFAULT_AGENT_MODELS.codex },
};

/**
 * Disponibilidad del CLI de un proveedor: listo, no encontrado, sin sesión, con una clave de API
 * en lugar de la suscripción o con una sesión que no se pudo confirmar.
 */
export type AgentAvailability = 'ready' | 'missing' | 'logged-out' | 'api-key' | 'unknown';

/** Estado del CLI de un proveedor, tal como se comprobó al pedirlo. */
export interface AgentStatus {
  provider: StudyProvider;
  availability: AgentAvailability;
  /** Ejecutable encontrado, o `null` si no se encontró. */
  path: string | null;
  /** Si se buscó en la ruta configurada en lugar de detectarlo. */
  configured: boolean;
}

/** Nombre de cada proveedor para la interfaz y los mensajes. */
export const AGENT_NAMES: Readonly<Record<StudyProvider, string>> = { claude: 'Claude Code', codex: 'Codex' };

function agentPath(value: unknown, provider: StudyProvider): string {
  const message = `La ruta de ${AGENT_NAMES[provider]} debe ser absoluta (empieza por / o ~/) o quedar vacía.`;
  if (typeof value !== 'string') throw new PublicError(message);
  const text = value.trim();
  if (!text) return '';
  if (text.length > MAX_AGENT_PATH || /[\0-\x1f]/.test(text) || !(text.startsWith('/') || text.startsWith('~/'))) throw new PublicError(message);
  return text;
}

function agentModel(value: unknown, provider: StudyProvider): string {
  const message = `El modelo de ${AGENT_NAMES[provider]} debe ser un nombre sin espacios, como «${DEFAULT_AGENT_MODELS[provider]}», o quedar vacío.`;
  if (typeof value !== 'string') throw new PublicError(message);
  const text = value.trim();
  if (text && !AGENT_MODEL_PATTERN.test(text)) throw new PublicError(message);
  return text;
}

function providerSettings(value: unknown, provider: StudyProvider): AgentProviderSettings {
  const settings = record(value, 'La configuración del agente no es válida.');
  return { path: agentPath(settings.path, provider), model: agentModel(settings.model, provider) };
}

/** Valida la configuración del agente que llega por IPC o que estaba guardada. */
export function safeAgentSettings(value: unknown): AgentSettings {
  const settings = record(value, 'La configuración del agente no es válida.');
  return {
    provider: safeStudyProvider(settings.provider),
    claude: providerSettings(settings.claude, 'claude'),
    codex: providerSettings(settings.codex, 'codex'),
  };
}

export interface StudyAPI {
  listStudyRoutes(): Promise<StudyRoute[]>;
  createStudyRoute(route: StudyRouteInput): Promise<StudyRoute>;
  updateStudyRoute(id: string, route: StudyRouteInput): Promise<StudyRoute>;
  deleteStudyRoute(id: string): Promise<void>;
  getStudyProgress(): Promise<StudyProgress>;
  getAgentSettings(): Promise<AgentSettings>;
  saveAgentSettings(settings: AgentSettings): Promise<AgentSettings>;
  /** Busca el CLI de cada proveedor y comprueba su sesión; no envía ningún prompt. */
  checkStudyAgents(): Promise<AgentStatus[]>;
  /** Proveedores cuyo aviso de privacidad ya aceptó el usuario. */
  getAgentNotices(): Promise<StudyProvider[]>;
  /** Acepta el aviso de privacidad de un proveedor y devuelve los aceptados. */
  acceptAgentNotice(provider: StudyProvider): Promise<StudyProvider[]>;
  /**
   * Envía la ruta guardada al agente elegido y devuelve sus propuestas, ya validadas. No crea
   * tareas: el renderer añade las que el usuario acepta con `addTask`.
   */
  proposeStudyTasks(routeId: string): Promise<TaskProposal[]>;
  /** Cancela la petición en curso, que rechaza con `AGENT_CANCELLED`; sin petición, no hace nada. */
  cancelStudyProposals(): Promise<void>;
}

export type StudyChannels = ChannelMap<StudyAPI, {
  listStudyRoutes: 'list-study-routes';
  createStudyRoute: 'create-study-route';
  updateStudyRoute: 'update-study-route';
  deleteStudyRoute: 'delete-study-route';
  getStudyProgress: 'get-study-progress';
  getAgentSettings: 'get-agent-settings';
  saveAgentSettings: 'save-agent-settings';
  checkStudyAgents: 'check-study-agents';
  getAgentNotices: 'get-agent-notices';
  acceptAgentNotice: 'accept-agent-notice';
  proposeStudyTasks: 'propose-study-tasks';
  cancelStudyProposals: 'cancel-study-proposals';
}>;
