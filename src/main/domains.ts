import { PublicError } from '../shared/contracts';
import { normalizeDomain, normalizeDomains } from '../shared/validation';
import { StateStore } from './state';

export class DomainService {
  constructor(private readonly store: StateStore) {}

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
