import type { AppState, PublicState } from '../../shared/contracts';
import type { Clock } from '../common/ports';

export type PublishState = (state: PublicState) => void;

/** Lo que los servicios y los manejadores IPC usan del almacén de estado. */
export interface StateStorePort {
  readonly state: AppState;
  /** Hay una operación protegida en curso. */
  readonly busy: boolean;
  readonly now: Clock;
  today(): string;
  publicState(): PublicState;
  save(): void;
  rollDay(): void;
  guarded<T>(work: () => Promise<T>): Promise<T>;
  drain(): Promise<void>;
  closeWith<T>(work: () => Promise<T>): Promise<T>;
}
