import { GENERIC_ERROR_MESSAGE, type DaySummary, type PublicState, type RitmoAPI, type Task } from '../shared/contracts.js';
import { FIRST_PLANNED_DATE, LAST_PLANNED_DATE, MINUTES, safePlannedDate, todayKey } from '../shared/validation.js';

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
