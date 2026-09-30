import type { AppState, PublicState } from '../../shared/state/contract';
import type { Clock } from '../common/ports';

export type PublishState = (state: PublicState) => void;

/** El día de hoy según el reloj del almacén. */
export interface TodayPort {
  /** `AAAA-MM-DD`. */
  today(): string;
}

/** Lo que los servicios usan del almacén de estado. */
export interface StateStorePort extends TodayPort {
  readonly state: AppState;
  /** Hay una operación protegida en curso. */
  readonly busy: boolean;
  readonly now: Clock;
  save(): void;
  rollDay(): void;
  guarded<T>(work: () => Promise<T>): Promise<T>;
}

/** Lo que los manejadores IPC usan del almacén: el estado público del día actual. */
export interface PublicStatePort {
  rollDay(): void;
  publicState(): PublicState;
}

/** Lo que el cierre ordenado usa además de `StateStorePort`. */
export interface StateShutdownPort {
  drain(): Promise<void>;
  closeWith<T>(work: () => Promise<T>): Promise<T>;
  /** Guarda por última vez; los `save()` posteriores no escriben. */
  seal(): void;
}
