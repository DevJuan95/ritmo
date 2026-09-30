import type { RitmoAPI } from '../../shared/api.js';
import { MINUTES } from '../../shared/focus/contract.js';
import { GENERIC_ERROR_MESSAGE, type PublicError } from '../../shared/ipc.js';
import {
  AGENT_CANCELLED, AGENT_NAMES, DEFAULT_AGENT_INSTRUCTIONS, DEFAULT_AGENT_MODELS, MAX_STAGES, safeAgentSettings, safeRoadmapBrief, safeStudyRoute, STUDY_PROVIDERS,
  type AgentProviderSettings, type AgentSettings, type AgentStatus, type RoadmapDraft, type StageProgress, type StudyProvider, type StudyLevel, type StudyProgress, type StudyRoute,
  type StudyRouteInput, type StudyStageInput, type TaskProposal } from '../../shared/study/contract.js';
import { todayKey, type PublicState } from '../../shared/state/contract.js';
import { FIRST_PLANNED_DATE, LAST_PLANNED_DATE, safePlannedDate, safeTaskTitle, type DaySummary, type Task, type TaskLink } from '../../shared/tasks/contract.js';

// Lógica de presentación sin DOM: los módulos de render solo copian estos valores a la página.

export function errorMessage(reason: unknown): string {
  if (reason && typeof reason === 'object' && 'kind' in reason && reason.kind === 'ritmo-api-error' &&
      'message' in reason && typeof reason.message === 'string') return reason.message;
  return GENERIC_ERROR_MESSAGE;
}

export function completionText(tasks: Task[], empty: string): string {
  const done = tasks.filter(task => task.done).length;
  return tasks.length ? `${done} de ${tasks.length} completadas` : empty;
}

export function focusCountText(count: number): string {
  return `${count} ${count === 1 ? 'pomodoro' : 'pomodoros'} hoy`;
}

/** Fecha del encabezado a partir de la clave del día, p. ej. «martes, 29 de septiembre». */
export function dateLabel(day: string): string {
  const [year, month, date] = day.split('-').map(Number);
  return new Intl.DateTimeFormat('es-CO', { weekday: 'long', day: 'numeric', month: 'long' }).format(new Date(year, month - 1, date));
}

/**
 * Cambia cuando cambian el día o las tareas de cualquier día, no con cada estado publicado.
 * El Planner vuelve a pedir la lista del día elegido solo cuando cambia. `tasksVersion` cubre las
 * tareas de otros días, que puede añadir un agente por el puente sin que cambien las de hoy.
 */
export function tasksRevision(state: PublicState): string {
  return JSON.stringify([state.day, state.tasks, state.tasksVersion]);
}

/** Si el valor del campo de fecha es un día que se puede planificar. Vacío o a medio escribir, no. */
export function isPlannableDate(value: string): boolean {
  try { safePlannedDate(value); return true; }
  catch { return false; }
}

/** El día al que mover una tarea, o `null` si el campo no tiene un día válido o no cambió. */
export function plannedDateToSave(value: string, current: string): string | null {
  return value !== current && isPlannableDate(value) ? value : null;
}

/** La fecha local de una clave de día, a medianoche. */
export function dayToDate(day: string): Date {
  const [year, month, date] = day.split('-').map(Number);
  return new Date(year, month - 1, date);
}

/** El primer día del mes al que pertenece la clave de día. */
export function monthOf(day: string): Date {
  const date = dayToDate(day);
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

/** Semanas que muestra siempre el calendario, para que la cuadrícula no cambie de alto entre meses. */
export const CALENDAR_WEEKS = 6;

/**
 * Días que muestra el calendario del mes: seis semanas desde el lunes de la semana del día 1.
 * Se recorta al rango planificable, porque enero de 2000 empieza a mostrarse en diciembre de 1999.
 */
export function calendarRange(month: Date): { from: string; to: string } {
  const first = new Date(month.getFullYear(), month.getMonth(), 1);
  const start = new Date(first.getFullYear(), first.getMonth(), 1 - (first.getDay() + 6) % 7);
  const end = new Date(start.getFullYear(), start.getMonth(), start.getDate() + CALENDAR_WEEKS * 7 - 1);
  const from = todayKey(start);
  const to = todayKey(end);
  return { from: from < FIRST_PLANNED_DATE ? FIRST_PLANNED_DATE : from, to: to > LAST_PLANNED_DATE ? LAST_PLANNED_DATE : to };
}

export interface DayIndicator {
  /** Texto corto de la celda, p. ej. «3 tareas» o «✓ 1/3». */
  text: string;
  /** Lo mismo, dicho completo para el lector de pantalla. */
  label: string;
  complete: boolean;
}

/** Indicador de las tareas de un día en el calendario, o `null` si no tiene. */
export function dayIndicator(summary: DaySummary | undefined): DayIndicator | null {
  if (!summary?.total) return null;
  const { total, done } = summary;
  const tasks = `${total} ${total === 1 ? 'tarea' : 'tareas'}`;
  return {
    text: done ? `✓ ${done}/${total}` : tasks,
    label: done ? `${done} de ${total} completadas` : tasks,
    complete: done === total
  };
}

/** Etiqueta accesible del botón de un día: la fecha, si es hoy y sus tareas. */
export function dayButtonLabel(day: string, summary: DaySummary | undefined, today: boolean): string {
  const indicator = dayIndicator(summary);
  return [`${dateLabel(day)} de ${day.slice(0, 4)}`, today && 'hoy', indicator ? indicator.label : 'sin tareas'].filter(Boolean).join(', ');
}

/** Los sitios no se editan mientras el bloqueo está activo, pendiente o en autorización. */
export function domainsLocked(state: PublicState): boolean {
  return state.session?.kind === 'focus' || !!state.blockError || state.busy;
}

export type TimerMode = 'ready' | 'focus' | 'break' | 'blocked';

export interface TimerView {
  value: string;
  progress: string;
  kind: string;
  caption: string;
  status: string;
  /** Estado visual del temporizador; el CSS colorea el panel según este valor. */
  mode: TimerMode;
  /** Una marca por minuto de la sesión en curso (o del foco, si no hay sesión). */
  beats: number;
  /** Cambia solo cuando cambian los botones, para no recrearlos en cada tic. */
  actionsKey: string;
}

export function timerView(state: PublicState, now: number): TimerView {
  const session = state.session;
  const kind = session?.kind;
  const focus = kind === 'focus';
  const breakTime = kind === 'shortBreak' || kind === 'longBreak';
  const minutesTotal = MINUTES[kind ?? 'focus'];
  const total = minutesTotal * 60;
  const remaining = session ? Math.max(0, Math.ceil((session.endsAt - now) / 1000)) : total;
  const minutes = String(Math.floor(remaining / 60)).padStart(2, '0');
  const seconds = String(remaining % 60).padStart(2, '0');
  return {
    value: `${minutes}:${seconds}`,
    progress: `${((total - remaining) / total) * 100}%`,
    kind: breakTime ? 'Descanso' : 'Tiempo de foco',
    caption: focus ? 'Tus sitios están en pausa' : breakTime ? 'Respira y recarga' : 'Sin distracciones',
    status: state.blockError ? 'Bloqueo pendiente' : focus ? 'En foco' : breakTime ? 'Descansando' : 'Listo para empezar',
    mode: state.blockError ? 'blocked' : focus ? 'focus' : breakTime ? 'break' : 'ready',
    beats: minutesTotal,
    actionsKey: `${state.blockError ? 'blocked' : kind || 'ready'}:${state.busy}`
  };
}

export type ButtonStyle = 'primary' | 'secondary' | 'ghost';

export interface TimerAction {
  label: string;
  style: ButtonStyle;
  run(api: RitmoAPI): Promise<void>;
}

export function timerActions(state: PublicState): TimerAction[] {
  const kind = state.session?.kind;
  if (state.blockError) return [{ label: 'Quitar bloqueo', style: 'primary', run: api => api.retryUnblock() }];
  if (kind === 'focus') return [{ label: 'Terminar foco', style: 'secondary', run: api => api.finishFocus() }];
  if (kind) return [{ label: 'Terminar descanso', style: 'secondary', run: api => api.finishBreak() }];
  return [
    { label: 'Iniciar foco', style: 'primary', run: api => api.startFocus() },
    { label: 'Descanso 5 min', style: 'secondary', run: api => api.startBreak('shortBreak') },
    { label: 'Descanso 15 min', style: 'ghost', run: api => api.startBreak('longBreak') }
  ];
}

// Rutas de estudio.

export const LEVEL_LABELS: Record<StudyLevel, string> = {
  beginner: 'Principiante',
  intermediate: 'Intermedio',
  advanced: 'Avanzado'
};

/**
 * Etapa tal como se edita en el formulario: los temas, los temas que no priorizar y los recursos,
 * uno por línea, porque cualquiera puede llevar comas («Replicación, particionado y consenso»).
 */
export interface StageDraft {
  /** Clave estable para React; en las etapas guardadas es su `id`. */
  key: string;
  id?: string;
  title: string;
  summary: string;
  topics: string;
  deprioritized: string;
  project: string;
  resources: string;
}

/** Ruta tal como se edita en el formulario, con los números como texto del campo. */
export interface RouteDraft {
  topic: string;
  goal: string;
  level: StudyLevel;
  dailyPomodoros: string;
  approach: string;
  finalProject: string;
  studyRules: string;
  instructions: string;
  stages: StageDraft[];
}

export function newStageDraft(key: string): StageDraft {
  return { key, title: '', summary: '', topics: '', deprioritized: '', project: '', resources: '' };
}

/** Borrador de una ruta nueva: una etapa vacía y las instrucciones por defecto del agente. */
export function emptyRouteDraft(stageKey: string): RouteDraft {
  return {
    topic: '', goal: '', level: 'beginner', dailyPomodoros: '4', approach: '', finalProject: '', studyRules: '',
    instructions: DEFAULT_AGENT_INSTRUCTIONS, stages: [newStageDraft(stageKey)]
  };
}

/** Etapa tal como se edita, con la clave dada; conserva el `id` si la etapa ya está guardada. */
function stageToDraft(stage: StudyStageInput, key: string): StageDraft {
  return {
    key, ...(stage.id ? { id: stage.id } : {}), title: stage.title, summary: stage.summary, topics: stage.topics.join('\n'),
    deprioritized: stage.deprioritized.join('\n'), project: stage.project, resources: stage.resources.join('\n')
  };
}

/** Borrador de una ruta con sus etapas; cada etapa recibe la clave que devuelve `key`. */
function inputToDraft(route: Omit<StudyRouteInput, 'stages'>, stages: StageDraft[]): RouteDraft {
  return {
    topic: route.topic,
    goal: route.goal,
    level: route.level,
    dailyPomodoros: String(route.dailyPomodoros),
    approach: route.approach,
    finalProject: route.finalProject,
    studyRules: route.studyRules,
    instructions: route.instructions,
    stages
  };
}

export function routeToDraft(route: StudyRoute): RouteDraft {
  return inputToDraft(route, route.stages.map(stage => stageToDraft(stage, stage.id)));
}

/**
 * Borrador de una ruta nueva a partir del roadmap que propuso el agente, para revisarlo en el editor
 * antes de guardarlo. Sus etapas no tienen `id`, así que cada una recibe una clave nueva.
 */
export function roadmapToDraft(roadmap: RoadmapDraft, stageKey: () => string): RouteDraft {
  return inputToDraft(roadmap, roadmap.stages.map(stage => stageToDraft(stage, stageKey())));
}

/** Elementos escritos uno por línea, sin vacíos. */
export function parseLines(text: string): string[] {
  return text.split('\n').map(item => item.trim()).filter(Boolean);
}

/** Lo que se envía al proceso principal, que vuelve a validarlo. */
export function draftToInput(draft: RouteDraft): StudyRouteInput {
  const pomodoros = draft.dailyPomodoros.trim();
  return {
    topic: draft.topic,
    goal: draft.goal,
    level: draft.level,
    dailyPomodoros: pomodoros === '' ? NaN : Number(pomodoros),
    approach: draft.approach,
    finalProject: draft.finalProject,
    studyRules: draft.studyRules,
    instructions: draft.instructions,
    stages: draft.stages.map(stage => ({
      ...(stage.id ? { id: stage.id } : {}), title: stage.title, summary: stage.summary, topics: parseLines(stage.topics),
      deprioritized: parseLines(stage.deprioritized), project: stage.project, resources: parseLines(stage.resources)
    }))
  };
}

/** Por qué no se puede guardar todavía el borrador, con las mismas reglas del proceso principal, o `null`. */
export function draftProblem(draft: RouteDraft): string | null {
  try { safeStudyRoute(draftToInput(draft)); return null; }
  // `safeStudyRoute()` solo lanza `PublicError`, con un mensaje pensado para el usuario.
  catch (error) { return (error as PublicError).message; }
}

/** Si el borrador difiere de la ruta guardada (o de una ruta nueva vacía). */
export function draftChanged(draft: RouteDraft, saved: RouteDraft): boolean {
  const comparable = (value: RouteDraft) => JSON.stringify(draftToInput(value));
  return comparable(draft) !== comparable(saved);
}

/** Borradores sin guardar por clave de editor; conservan el trabajo al cambiar de ruta o de pantalla. */
export type RouteDrafts = Readonly<Record<string, RouteDraft>>;

/** Copia de `drafts` con el borrador de `key` sustituido, o quitado si es `undefined`. */
export function withDraft(drafts: RouteDrafts, key: string, draft: RouteDraft | undefined): RouteDrafts {
  const { [key]: _previous, ...rest } = drafts;
  return draft ? { ...rest, [key]: draft } : rest;
}

/** Mueve una etapa una posición hacia arriba (`-1`) o hacia abajo (`1`); fuera de rango no cambia nada. */
export function moveStage<T>(stages: readonly T[], index: number, delta: -1 | 1): T[] {
  const target = index + delta;
  if (index < 0 || index >= stages.length || target < 0 || target >= stages.length) return [...stages];
  const next = [...stages];
  [next[index], next[target]] = [next[target], next[index]];
  return next;
}

/** Si el editor puede guardar: hay cambios válidos y no queda otra operación en curso. */
export function canSaveDraft(changed: boolean, problem: string | null, busy: boolean): boolean {
  return changed && !problem && !busy;
}

/**
 * Crea un guardián que ejecuta una operación a la vez: mientras una sigue en curso, las demás
 * llamadas se ignoran y devuelven `false`. Evita, por ejemplo, crear dos rutas con un doble clic.
 * `onBusyChange` avisa al empezar y al terminar, para desactivar los botones.
 */
export function oneAtATime(onBusyChange: (busy: boolean) => void = () => {}): (operation: () => Promise<void>) => Promise<boolean> {
  let busy = false;
  return async operation => {
    if (busy) return false;
    busy = true;
    onBusyChange(true);
    try { await operation(); return true; }
    finally { busy = false; onBusyChange(false); }
  };
}

/** Si se puede añadir o quitar una etapa sin salir del rango que admite una ruta. */
export function stageLimits(count: number): { canAdd: boolean; canRemove: boolean } {
  return { canAdd: count < MAX_STAGES, canRemove: count > 1 };
}

/** Nombre del estado de una etapa en su página, p. ej. «En curso». */
export const STAGE_STATE_LABELS: Readonly<Record<StageState, string>> = { done: 'Completada', current: 'En curso', next: 'Pendiente' };

/**
 * Clave del borrador de una ruta guardada en `RouteDrafts`. Cambia al guardar la ruta, así que un
 * borrador hecho sobre una versión anterior no se vuelve a abrir.
 */
export function routeDraftKey(route: Pick<StudyRoute, 'id' | 'updatedAt'>): string {
  return `${route.id}:${route.updatedAt}`;
}

/** Si la etapa tiene algo más que el título; el editor abre los detalles de las que no, para completarlos. */
export function stageHasDetails(stage: StageDraft): boolean {
  return [stage.summary, stage.topics, stage.deprioritized, stage.project, stage.resources].some(text => text.trim() !== '');
}

/** Resumen de una ruta en la lista, p. ej. «3 etapas, 4 pomodoros al día, intermedio». */
export function routeSummary(route: StudyRoute): string {
  const stages = route.stages.length;
  const pomodoros = route.dailyPomodoros;
  return `${stages} ${stages === 1 ? 'etapa' : 'etapas'}, ${pomodoros} ${pomodoros === 1 ? 'pomodoro' : 'pomodoros'} al día, ${LEVEL_LABELS[route.level].toLowerCase()}`;
}

export interface StageProgressView {
  text: string;
  /** Ancho de la barra de avance, p. ej. «40%». */
  percent: string;
  complete: boolean;
}

/** Avance de una etapa según sus tareas; sin tareas, la etapa aún no empieza. */
export function stageProgressView(progress: StageProgress | undefined): StageProgressView {
  if (!progress?.total) return { text: 'Sin tareas todavía', percent: '0%', complete: false };
  const done = Math.min(progress.done, progress.total);
  return {
    text: `${done} de ${progress.total} ${progress.total === 1 ? 'tarea' : 'tareas'}`,
    percent: `${(done / progress.total) * 100}%`,
    complete: done === progress.total
  };
}

export interface RouteProgressView {
  /** Etapas con todas sus tareas completadas. */
  completed: number;
  /** Índice de la primera etapa sin completar, o `null` si la ruta está terminada. */
  current: number | null;
  /** Estado de cada etapa, en orden: completa, la primera sin completar o pendiente. */
  stages: StageState[];
  text: string;
}

export type StageState = 'done' | 'current' | 'next';

/** Avance de una ruta: cuántas etapas están completas y en cuál va. */
export function routeProgressView(route: StudyRoute, progress: Readonly<StudyProgress>): RouteProgressView {
  const complete = route.stages.map(stage => stageProgressView(progress[stage.id]).complete);
  const completed = complete.filter(Boolean).length;
  const index = complete.indexOf(false);
  const current = index === -1 ? null : index;
  const total = route.stages.length;
  return {
    completed,
    current,
    stages: complete.map((done, stage): StageState => done ? 'done' : stage === current ? 'current' : 'next'),
    text: current === null ? 'Ruta completada' : `Etapa ${current + 1} de ${total}: ${route.stages[current].title}`
  };
}

export interface StageOption {
  /** El `stageId`; el vínculo completo sale de `linkFromStage()`. */
  value: string;
  label: string;
}

/** Etapas de una ruta para el selector de etapa de una tarea, con la ruta como grupo. */
export interface StageOptionGroup {
  label: string;
  options: StageOption[];
}

export function stageOptions(routes: readonly StudyRoute[]): StageOptionGroup[] {
  return routes.map(route => ({
    label: route.topic,
    options: route.stages.map((stage, index) => ({ value: stage.id, label: `${index + 1}. ${stage.title}` }))
  }));
}

/** El vínculo de la etapa elegida en el selector; vacío o una etapa que ya no existe, ninguno. */
export function linkFromStage(routes: readonly StudyRoute[], stageId: string): TaskLink | null {
  const route = stageId ? routes.find(item => item.stages.some(stage => stage.id === stageId)) : undefined;
  return route ? { routeId: route.id, stageId } : null;
}

/** Valor del selector de etapa de una tarea: su etapa si sigue en las rutas cargadas, o vacío. */
export function taskStageValue(routes: readonly StudyRoute[], task: Pick<Task, 'routeId' | 'stageId'>): string {
  const { routeId, stageId } = task;
  if (!stageId) return '';
  return routes.some(route => route.id === routeId && route.stages.some(stage => stage.id === stageId)) ? stageId : '';
}

// Agente de estudio.

/** Cómo iniciar sesión en cada CLI con la cuenta de la suscripción. */
export const AGENT_LOGIN_COMMANDS: Readonly<Record<StudyProvider, string>> = { claude: 'claude auth login', codex: 'codex login' };
/** Cuenta con la que cada CLI usa la suscripción del usuario. */
export const AGENT_ACCOUNTS: Readonly<Record<StudyProvider, string>> = { claude: 'claude.ai', codex: 'ChatGPT' };

export type AgentTone = 'checking' | 'ready' | 'warning' | 'missing';

export interface AgentStatusView {
  tone: AgentTone;
  /** Estado en pocas palabras, p. ej. «Listo» o «Sin sesión». */
  label: string;
  /** Qué significa y, si hace falta, cómo resolverlo. */
  detail: string;
}

/** Estado del CLI de un proveedor para la pantalla; sin estado, se está comprobando. */
export function agentStatusView(provider: StudyProvider, status: AgentStatus | undefined): AgentStatusView {
  const name = AGENT_NAMES[provider];
  const login = `Ejecuta «${AGENT_LOGIN_COMMANDS[provider]}» en la terminal con tu cuenta de ${AGENT_ACCOUNTS[provider]} y vuelve a comprobarlo.`;
  switch (status?.availability) {
    case undefined: return { tone: 'checking', label: 'Comprobando…', detail: `Buscando ${name} y su sesión.` };
    case 'ready': return { tone: 'ready', label: 'Listo', detail: `Sesión iniciada con tu cuenta de ${AGENT_ACCOUNTS[provider]}.` };
    case 'missing': return {
      tone: 'missing',
      label: 'No encontrado',
      detail: status.configured
        ? 'No hay un programa que se pueda ejecutar en la ruta indicada. Corrígela o déjala vacía para buscarlo.'
        : `No se encontró ${name} en este Mac. Instálalo o indica la ruta del ejecutable.`
    };
    case 'logged-out': return { tone: 'warning', label: 'Sin sesión', detail: login };
    case 'api-key': return {
      tone: 'warning',
      label: 'Con clave de API',
      detail: `${name} usa una clave de API, que se factura aparte. ${login}`
    };
    case 'unknown': return { tone: 'warning', label: 'Sin confirmar', detail: `No se pudo comprobar la sesión de ${name}. Se comprobará otra vez al pedir tareas.` };
  }
}

/** Estado de los dos proveedores cuando no se pudo comprobar ninguno. */
export function uncheckedAgents(): AgentStatus[] {
  return STUDY_PROVIDERS.map(provider => ({ provider, availability: 'unknown', path: null, configured: false }));
}

/** Texto del campo de ruta vacío: dónde se detectó el CLI, si se detectó. */
export function agentPathPlaceholder(status: AgentStatus | undefined): string {
  return status?.path && !status.configured ? `Detectado en ${status.path}` : 'Detectar automáticamente';
}

/** Ayuda del campo de modelo, con el modelo ligero por defecto. */
export function agentModelHint(provider: StudyProvider): string {
  return `Por defecto, «${DEFAULT_AGENT_MODELS[provider]}», un modelo ligero. Vacío, usa el que tenga configurado ${AGENT_NAMES[provider]}.`;
}

/** Copia de la configuración con los campos de un proveedor cambiados. */
export function withProviderSettings(settings: AgentSettings, provider: StudyProvider, patch: Partial<AgentProviderSettings>): AgentSettings {
  return { ...settings, [provider]: { ...settings[provider], ...patch } };
}

/** Por qué no se puede guardar la configuración, con las reglas del proceso principal, o `null`. */
export function agentSettingsProblem(settings: AgentSettings): string | null {
  try { safeAgentSettings(settings); return null; }
  // `safeAgentSettings()` solo lanza `PublicError`, con un mensaje pensado para el usuario.
  catch (error) { return (error as PublicError).message; }
}

/** Si la configuración difiere de la guardada, sin contar espacios al principio o al final. */
export function agentSettingsChanged(settings: AgentSettings, saved: AgentSettings): boolean {
  const comparable = (value: AgentSettings) => JSON.stringify([
    value.provider, ...STUDY_PROVIDERS.flatMap(provider => [value[provider].path.trim(), value[provider].model.trim()])
  ]);
  return comparable(settings) !== comparable(saved);
}

export interface AgentSummaryView {
  tone: AgentTone;
  text: string;
}

/** Resumen del agente elegido para la pantalla de rutas, p. ej. «Las tareas las propondrá Claude Code con haiku.». */
export function agentSummary(settings: AgentSettings, statuses: readonly AgentStatus[] | undefined): AgentSummaryView {
  const provider = settings.provider;
  const name = AGENT_NAMES[provider];
  const status = statuses?.find(item => item.provider === provider);
  const view = agentStatusView(provider, status);
  const model = settings[provider].model;
  switch (status?.availability) {
    case undefined: return { tone: view.tone, text: `Comprobando ${name}…` };
    case 'ready': return { tone: view.tone, text: `Las tareas las propondrá ${name}${model ? ` con ${model}` : ''}.` };
    case 'unknown': return { tone: view.tone, text: `No se pudo confirmar la sesión de ${name}.` };
    default: return { tone: view.tone, text: `${name} no está listo: ${view.label.toLowerCase()}.` };
  }
}

// Propuestas del agente.

/** Proveedor de cada CLI, para el aviso de privacidad. */
export const AGENT_COMPANIES: Readonly<Record<StudyProvider, string>> = { claude: 'Anthropic', codex: 'OpenAI' };

/** Lo que se envía al proveedor al pedir tareas; se muestra junto al botón y en el aviso. */
export function agentNoticeText(provider: StudyProvider): string {
  return `Al pedir tareas, Ritmo envía a ${AGENT_NAMES[provider]} (${AGENT_COMPANIES[provider]}) el tema, el objetivo, el nivel, el roadmap (enfoque, etapas, proyecto final y reglas de estudio) y las instrucciones de esta ruta, y el título, el día y el estado de sus tareas. Ritmo no envía nada más, y solo cuando pulsas el botón.`;
}

/** Propuesta tal como se revisa: editable y con el día en el que se añadirá al Planner. */
export interface ProposalDraft {
  /** Clave estable para React. */
  key: string;
  title: string;
  stageId: string;
  /** Día del Planner, `AAAA-MM-DD`; puede estar a medio escribir. */
  plannedDate: string;
  pomodoros: number;
  doneWhen: string;
  reason: string;
  /** Día en el que se añadió al Planner, o `null` si sigue por revisar. */
  acceptedOn: string | null;
}

/** Propuestas por revisar de cada ruta, por `routeId`. Viven en `App` para no perderse al cambiar de sección. */
export type ProposalsByRoute = Readonly<Record<string, readonly ProposalDraft[]>>;

/** El día `days` días después de `day`. */
export function addDays(day: string, days: number): string {
  const date = dayToDate(day);
  return todayKey(new Date(date.getFullYear(), date.getMonth(), date.getDate() + days));
}

/**
 * Convierte las propuestas en borradores y les reparte días desde hoy según los pomodoros al día de
 * la ruta: una propuesta pasa al día siguiente cuando ya no cabe en el día. Una sola propuesta más
 * larga que el día ocupa un día entero.
 */
export function scheduleProposals(proposals: readonly TaskProposal[], today: string, dailyPomodoros: number, key: (index: number) => string): ProposalDraft[] {
  const budget = Math.max(1, dailyPomodoros);
  let day = 0;
  let used = 0;
  return proposals.map((proposal, index) => {
    if (used > 0 && used + proposal.pomodoros > budget) { day += 1; used = 0; }
    used += proposal.pomodoros;
    return { ...proposal, key: key(index), plannedDate: addDays(today, day), acceptedOn: null };
  });
}

/** Copia de las propuestas de todas las rutas con las de `routeId` sustituidas; sin propuestas, quita la ruta. */
export function withRouteProposals(all: ProposalsByRoute, routeId: string, proposals: readonly ProposalDraft[]): ProposalsByRoute {
  const { [routeId]: _previous, ...rest } = all;
  return proposals.length ? { ...rest, [routeId]: proposals } : rest;
}

/** Copia de la lista con los campos de una propuesta cambiados. */
export function withProposal(proposals: readonly ProposalDraft[], key: string, patch: Partial<Omit<ProposalDraft, 'key'>>): ProposalDraft[] {
  return proposals.map(proposal => proposal.key === key ? { ...proposal, ...patch } : proposal);
}

/** Copia de la lista sin las propuestas de `keys`. */
export function withoutProposals(proposals: readonly ProposalDraft[], keys: readonly string[]): ProposalDraft[] {
  return proposals.filter(proposal => !keys.includes(proposal.key));
}

/** Por qué no se puede añadir la propuesta al Planner, con las reglas del proceso principal, o `null`. */
export function proposalProblem(proposal: ProposalDraft, route: StudyRoute): string | null {
  try { safeTaskTitle(proposal.title); }
  catch (error) { return (error as PublicError).message; }
  if (!route.stages.some(stage => stage.id === proposal.stageId)) return 'La etapa ya no existe. Elige otra.';
  if (!isPlannableDate(proposal.plannedDate)) return 'Elige un día entre 2000 y 2100.';
  return null;
}

/** Propuestas por revisar que ya se pueden añadir al Planner. */
export function acceptableProposals(proposals: readonly ProposalDraft[], route: StudyRoute): ProposalDraft[] {
  return proposals.filter(proposal => proposal.acceptedOn === null && proposalProblem(proposal, route) === null);
}

/** Nombre de la etapa de una propuesta, p. ej. «Etapa 2: Traits», o `null` si ya no existe. */
export function proposalStageLabel(route: StudyRoute, stageId: string): string | null {
  const index = route.stages.findIndex(stage => stage.id === stageId);
  return index === -1 ? null : `Etapa ${index + 1}: ${route.stages[index].title}`;
}

export function pomodorosText(count: number): string {
  return `${count} ${count === 1 ? 'pomodoro' : 'pomodoros'}`;
}

/** Día relativo a hoy para una propuesta: «hoy», «mañana» o la fecha, p. ej. «jueves, 1 de octubre». */
export function relativeDayLabel(day: string, today: string): string {
  if (day === today) return 'hoy';
  if (day === addDays(today, 1)) return 'mañana';
  return dateLabel(day);
}

/** Resumen de la revisión, p. ej. «3 por revisar, 1 añadida al Planner». */
export function proposalsSummary(proposals: readonly ProposalDraft[]): string {
  const accepted = proposals.filter(proposal => proposal.acceptedOn !== null).length;
  const pending = proposals.length - accepted;
  if (!pending) return accepted === 1 ? 'La propuesta ya está en el Planner.' : `Las ${accepted} propuestas ya están en el Planner.`;
  const parts = [`${pending} por revisar`];
  if (accepted) parts.push(`${accepted} ${accepted === 1 ? 'añadida' : 'añadidas'} al Planner`);
  return parts.join(', ');
}

/** Propuestas de una ruta que faltan por revisar, para señalarlas en su tarjeta y en su pestaña. */
export function pendingProposalCount(proposals: readonly ProposalDraft[] | undefined): number {
  return proposals?.filter(proposal => proposal.acceptedOn === null).length ?? 0;
}

/** Tiempo de espera de la petición, p. ej. «0:07» o «2:15». */
export function elapsedText(ms: number): string {
  const seconds = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}

/** Si se pueden pedir tareas: listo, primero el aviso de privacidad o bloqueado con el motivo. */
export type ProposalGate = { kind: 'ready' } | { kind: 'notice' } | { kind: 'blocked'; reason: string };

/**
 * Qué pasa al pulsar «Proponer tareas». Un CLI que falta, sin sesión o con clave de API bloquea con
 * lo que hay que hacer; mientras se comprueba o si la sesión no se pudo confirmar, se deja pedir y
 * el proceso principal lo comprueba otra vez. La ruta debe estar guardada, porque se envía la guardada.
 */
export function proposalGate(provider: StudyProvider, status: AgentStatus | undefined, notices: readonly StudyProvider[], routeChanged: boolean): ProposalGate {
  const availability = status?.availability;
  if (availability === 'missing' || availability === 'logged-out' || availability === 'api-key') {
    return { kind: 'blocked', reason: agentStatusView(provider, status).detail };
  }
  if (routeChanged) return { kind: 'blocked', reason: 'Guarda los cambios de la ruta en Opciones: el agente usa la ruta guardada.' };
  return notices.includes(provider) ? { kind: 'ready' } : { kind: 'notice' };
}

/** Petición al agente en curso, una a la vez en toda la app: propuestas de una ruta o un roadmap. */
export type AgentRequest =
  | { kind: 'tasks'; routeId: string; startedAt: number }
  | { kind: 'roadmap'; startedAt: number };

/**
 * Por qué otra petición en curso impide pedir desde un panel, o `undefined` si no hay ninguna o es la
 * del propio panel. `routeId` es la ruta del panel de propuestas, o `null` en el panel del roadmap.
 */
export function agentBusyText(request: AgentRequest | undefined, routes: readonly StudyRoute[] | undefined, routeId: string | null): string | undefined {
  if (!request) return undefined;
  if (request.kind === 'roadmap') return routeId === null ? undefined : 'Espera a que el agente termine el roadmap que estás generando.';
  if (request.routeId === routeId) return undefined;
  const topic = routes?.find(route => route.id === request.routeId)?.topic ?? 'otra ruta';
  return `Espera a que terminen las propuestas de «${topic}».`;
}

// Roadmap del agente.

/** Lo que se envía al proveedor al generar un roadmap; se muestra junto al botón y en el aviso. */
export function roadmapNoticeText(provider: StudyProvider): string {
  return `Al generar un roadmap, Ritmo envía a ${AGENT_NAMES[provider]} (${AGENT_COMPANIES[provider]}) solo el brief que escribes aquí. Ritmo no envía nada más, y solo cuando pulsas el botón.`;
}

/** Por qué no se puede enviar el brief todavía, con las reglas del proceso principal, o `null`. */
export function briefProblem(brief: string): string | null {
  try { safeRoadmapBrief(brief); return null; }
  // `safeRoadmapBrief()` solo lanza `PublicError`, con un mensaje pensado para el usuario.
  catch (error) { return (error as PublicError).message; }
}

/** Mensaje de una petición de roadmap cancelada; el brief se conserva para volver a intentarlo. */
export const ROADMAP_CANCELLED = 'Cancelaste la generación del roadmap. Tu brief sigue aquí para intentarlo de nuevo.';

/**
 * Qué decir cuando la petición del roadmap no terminó: la cancelación, que el usuario pidió o que
 * llegó como `AGENT_CANCELLED`, o el error público (tiempo agotado, respuesta inválida…), con que el
 * brief sigue ahí.
 */
export function roadmapFailureText(error: unknown, cancelled: boolean): string {
  const message = errorMessage(error);
  if (cancelled || message === AGENT_CANCELLED) return ROADMAP_CANCELLED;
  return `${message} Tu brief sigue aquí.`;
}

/** Lista con nombre dentro de una etapa del roadmap, p. ej. «Dominar». */
export interface RoadmapList {
  label: string;
  items: string[];
}

export interface RoadmapStageView {
  id: string;
  /** Posición en el orden recomendado, desde 1. */
  number: number;
  title: string;
  summary: string;
  /** Dominar, no priorizar todavía y recursos, solo las que tienen elementos. */
  lists: RoadmapList[];
  project: string;
}

/** Roadmap de una ruta guardada, listo para leer: solo las secciones con contenido. */
export interface RoadmapView {
  approach: string;
  stages: RoadmapStageView[];
  finalProject: string;
  studyRules: string;
}

export function roadmapView(route: StudyRoute): RoadmapView {
  return {
    approach: route.approach,
    stages: route.stages.map((stage, index) => ({
      id: stage.id,
      number: index + 1,
      title: stage.title,
      summary: stage.summary,
      lists: ([
        { label: 'Dominar', items: stage.topics },
        { label: 'No priorizar todavía', items: stage.deprioritized },
        { label: 'Recursos', items: stage.resources }
      ] satisfies RoadmapList[]).filter(list => list.items.length > 0),
      project: stage.project
    })),
    finalProject: route.finalProject,
    studyRules: route.studyRules
  };
}
