import { normalizeDomain, normalizeDomains } from '../../shared/blocking/contract';
import { PublicError } from '../../shared/ipc';
import type { StateStorePort } from '../state/ports';
import type { DomainServicePort } from './ports';

export class DomainService implements DomainServicePort {
  constructor(private readonly store: StateStorePort) {}

  add(value: unknown): void {
    this.assertEditable();
    this.store.state.domains = normalizeDomains([...this.store.state.domains, normalizeDomain(value)]);
    this.store.save();
  }

  remove(domain: unknown): void {
    this.assertEditable();
    this.store.state.domains = this.store.state.domains.filter(item => item !== domain);
    this.store.save();
  }

  private assertEditable(): void {
    if (this.store.state.session?.kind === 'focus' || this.store.state.blockError) throw new PublicError('Edita los sitios cuando termine el foco.');
  }
}
