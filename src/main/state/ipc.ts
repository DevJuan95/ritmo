import type { StateChannels } from '../../shared/state/contract';
import type { Handle } from '../ipc/ports';
import type { PublicStatePort } from './ports';

export function registerStateIpc(handle: Handle<StateChannels>, store: PublicStatePort): void {
  handle('get-state', () => { store.rollDay(); return store.publicState(); });
}
