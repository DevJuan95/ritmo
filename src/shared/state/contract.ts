import type { BlockingState } from '../blocking/contract';
import type { FocusState } from '../focus/contract';
import type { ChannelMap } from '../ipc';
import type { TasksState } from '../tasks/contract';

/** Estado persistente de la app: el día y la parte de cada módulo. */
export interface AppState extends FocusState, TasksState, BlockingState {
  day: string;
}

export interface PublicState extends AppState {
  busy: boolean;
  now: number;
  /**
   * Sube con cada alta, cambio o borrado de tareas, de cualquier día. No se guarda: solo sirve para que
   * el renderer sepa cuándo volver a pedir las tareas de otros días, que no van en `tasks`.
   */
  tasksVersion: number;
}

export function todayKey(date = new Date()): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export interface StateAPI {
  getState(): Promise<PublicState>;
  onState(callback: (state: PublicState) => void): () => void;
}

export type StateChannels = ChannelMap<Omit<StateAPI, 'onState'>, { getState: 'get-state' }>;

/** Canales que van del proceso principal al renderer, con lo que envían. */
export type StateEvents = { state: PublicState };
