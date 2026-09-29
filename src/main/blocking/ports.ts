export type BlockAction = 'block' | 'unblock';

/**
 * `authorize: false` no pide autorización de administrador: al salir no hay quien la conceda a tiempo.
 * `signal` cancela el cambio en curso y termina los procesos que haya lanzado.
 */
export interface ChangeBlockOptions {
  authorize?: boolean;
  signal?: AbortSignal;
}

export interface SiteBlocker {
  hasManagedBlock(): boolean;
  changeBlock(action: BlockAction, domains: string[], options?: ChangeBlockOptions): Promise<void>;
}

export interface DomainServicePort {
  add(value: unknown): void;
  remove(domain: unknown): void;
}
