import type { PublicState, RitmoAPI, Task } from '../shared/contracts.js';
import { MINUTES } from '../shared/validation.js';

// Lógica de presentación sin DOM: los módulos de render solo copian estos valores a la página.

export function completionText(tasks: Task[], empty: string): string {
  const done = tasks.filter(task => task.done).length;
  return tasks.length ? `${done} de ${tasks.length} completadas` : empty;
}

export function focusCountText(count: number): string {
  return `${count} ${count === 1 ? 'pomodoro' : 'pomodoros'} hoy`;
}

/** Los sitios no se editan mientras el bloqueo está activo, pendiente o en autorización. */
export function domainsLocked(state: PublicState): boolean {
  return state.session?.kind === 'focus' || !!state.blockError || state.busy;
}

export interface TimerView {
  value: string;
  progress: string;
  kind: string;
  caption: string;
  status: string;
  statusClass: string;
  /** Cambia solo cuando cambian los botones, para no recrearlos en cada tic. */
  actionsKey: string;
}

export function timerView(state: PublicState, now: number): TimerView {
  const session = state.session;
  const kind = session?.kind;
  const focus = kind === 'focus';
  const breakTime = kind === 'shortBreak' || kind === 'longBreak';
  const total = MINUTES[kind ?? 'focus'] * 60;
  const remaining = session ? Math.max(0, Math.ceil((session.endsAt - now) / 1000)) : total;
  const minutes = String(Math.floor(remaining / 60)).padStart(2, '0');
  const seconds = String(remaining % 60).padStart(2, '0');
  return {
    value: `${minutes}:${seconds}`,
    progress: `${((total - remaining) / total) * 100}%`,
    kind: breakTime ? 'Descanso' : 'Tiempo de foco',
    caption: focus ? 'Tus sitios están en pausa' : breakTime ? 'Respira y recarga' : 'Sin distracciones',
    status: state.blockError ? 'Bloqueo pendiente' : focus ? 'En foco' : breakTime ? 'Descansando' : 'Listo para empezar',
    statusClass: `badge badge-soft status-pill ${state.blockError ? 'badge-error' : focus ? 'badge-warning' : 'badge-secondary'}`,
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
