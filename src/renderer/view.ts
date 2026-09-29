import type { PublicState, RitmoAPI, Task } from '../shared/contracts.js';
import { MINUTES, safePlannedDate } from '../shared/validation.js';

// Lógica de presentación sin DOM: los módulos de render solo copian estos valores a la página.

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
