import type { BlockingChannels } from '../../shared/blocking/contract';
import type { FocusServicePort } from '../focus/ports';
import type { Handle } from '../ipc/ports';
import type { DomainServicePort } from './ports';

export interface BlockingIpcServices {
  domains: DomainServicePort;
  /** Quitar un bloqueo pendiente usa el mismo camino que terminar el foco. */
  focus: Pick<FocusServicePort, 'finishFocus'>;
}

export function registerBlockingIpc(handle: Handle<BlockingChannels>, { domains, focus }: BlockingIpcServices): void {
  handle('add-domain', (value: unknown) => domains.add(value));
  handle('remove-domain', (domain: unknown) => domains.remove(domain));
  handle('retry-unblock', () => focus.finishFocus());
}
