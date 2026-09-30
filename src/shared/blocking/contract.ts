import { PublicError, type ChannelMap } from '../ipc';

/** Parte del estado de la app que pertenece al bloqueo. */
export interface BlockingState {
  domains: string[];
  blockError: string | null;
}

export const DEFAULT_DOMAINS = ['facebook.com', 'linkedin.com', 'x.com', 'twitter.com'];
export const PENDING_BLOCK_MESSAGE = 'Hay un bloqueo pendiente. Usa “Quitar bloqueo” para recuperar el acceso.';

export function normalizeDomain(value: unknown): string {
  const domain = String(value || '').trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, '').replace(/:\d+$/, '');
  if (domain.length > 253 || !/^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/.test(domain)) {
    throw new PublicError('Escribe un dominio válido, por ejemplo instagram.com.');
  }
  return domain;
}

export function normalizeDomains(values: unknown): string[] {
  if (!Array.isArray(values) || values.length > 50) throw new PublicError('La lista de sitios no es válida.');
  return [...new Set(values.map(normalizeDomain))];
}

export interface BlockingAPI {
  addDomain(domain: string): Promise<void>;
  removeDomain(domain: string): Promise<void>;
  retryUnblock(): Promise<void>;
}

export type BlockingChannels = ChannelMap<BlockingAPI, {
  addDomain: 'add-domain';
  removeDomain: 'remove-domain';
  retryUnblock: 'retry-unblock';
}>;
