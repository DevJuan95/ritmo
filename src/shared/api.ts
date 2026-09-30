import type { BlockingAPI, BlockingChannels } from './blocking/contract';
import type { FocusAPI, FocusChannels } from './focus/contract';
import type { StateAPI, StateChannels, StateEvents } from './state/contract';
import type { StudyAPI, StudyChannels } from './study/contract';
import type { TasksAPI, TasksChannels } from './tasks/contract';

/** API que el preload expone como `window.ritmo`: la unión de la API de cada módulo. */
export interface RitmoAPI extends StateAPI, FocusAPI, TasksAPI, BlockingAPI, StudyAPI {}

/** Todos los canales `invoke`, con la firma del método de `RitmoAPI` que los usa. */
export type RitmoChannels = StateChannels & FocusChannels & TasksChannels & BlockingChannels & StudyChannels;
export type RitmoChannel = keyof RitmoChannels;

/** Todos los canales que van del proceso principal al renderer. */
export type RitmoEvents = StateEvents;

declare global {
  interface Window {
    ritmo: RitmoAPI;
  }
}
