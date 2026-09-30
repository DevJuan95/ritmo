import type { RitmoAPI } from '../../shared/api.js';
import { MINUTES } from '../../shared/focus/contract.js';
import { GENERIC_ERROR_MESSAGE, type PublicError } from '../../shared/ipc.js';
import { DEFAULT_AGENT_INSTRUCTIONS, MAX_STAGES, safeStudyRoute, type StudyLevel, type StudyRoute, type StudyRouteInput } from '../../shared/study/contract.js';
import { todayKey, type PublicState } from '../../shared/state/contract.js';
import { FIRST_PLANNED_DATE, LAST_PLANNED_DATE, safePlannedDate, type DaySummary, type Task } from '../../shared/tasks/contract.js';

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
 * Cambia cuando cambian el día o sus tareas, no con cada estado publicado.
 * El Planner vuelve a pedir la lista del día elegido solo cuando cambia.
 */
export function tasksRevision(state: PublicState): string {
  return JSON.stringify([state.day, state.tasks]);
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

/** Etapa tal como se edita en el formulario: los temas en un solo campo, separados por comas. */
export interface StageDraft {
  /** Clave estable para React; en las etapas guardadas es su `id`. */
  key: string;
  id?: string;
  title: string;
  topics: string;
}

/** Ruta tal como se edita en el formulario, con los números como texto del campo. */
export interface RouteDraft {
  topic: string;
  goal: string;
  level: StudyLevel;
  dailyPomodoros: string;
  instructions: string;
  stages: StageDraft[];
}

export function newStageDraft(key: string): StageDraft {
  return { key, title: '', topics: '' };
}

/** Borrador de una ruta nueva: una etapa vacía y las instrucciones por defecto del agente. */
export function emptyRouteDraft(stageKey: string): RouteDraft {
  return { topic: '', goal: '', level: 'beginner', dailyPomodoros: '4', instructions: DEFAULT_AGENT_INSTRUCTIONS, stages: [newStageDraft(stageKey)] };
}

export function routeToDraft(route: StudyRoute): RouteDraft {
  return {
    topic: route.topic,
    goal: route.goal,
    level: route.level,
    dailyPomodoros: String(route.dailyPomodoros),
    instructions: route.instructions,
    stages: route.stages.map(stage => ({ key: stage.id, id: stage.id, title: stage.title, topics: stage.topics.join(', ') }))
  };
}

/** Temas escritos en un campo, separados por comas o saltos de línea, sin vacíos. */
export function parseTopics(text: string): string[] {
  return text.split(/[,\n]/).map(topic => topic.trim()).filter(Boolean);
}

/** Lo que se envía al proceso principal, que vuelve a validarlo. */
export function draftToInput(draft: RouteDraft): StudyRouteInput {
  const pomodoros = draft.dailyPomodoros.trim();
  return {
    topic: draft.topic,
    goal: draft.goal,
    level: draft.level,
    dailyPomodoros: pomodoros === '' ? NaN : Number(pomodoros),
    instructions: draft.instructions,
    stages: draft.stages.map(stage => ({ ...(stage.id ? { id: stage.id } : {}), title: stage.title, topics: parseTopics(stage.topics) }))
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

/** Resumen de una ruta en la lista, p. ej. «3 etapas, 4 pomodoros al día, intermedio». */
export function routeSummary(route: StudyRoute): string {
  const stages = route.stages.length;
  const pomodoros = route.dailyPomodoros;
  return `${stages} ${stages === 1 ? 'etapa' : 'etapas'}, ${pomodoros} ${pomodoros === 1 ? 'pomodoro' : 'pomodoros'} al día, ${LEVEL_LABELS[route.level].toLowerCase()}`;
}

/** Tareas de una etapa y cuántas están completadas. */
export interface StageProgress {
  done: number;
  total: number;
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
export function routeProgressView(route: StudyRoute, progress: Readonly<Record<string, StageProgress>>): RouteProgressView {
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
