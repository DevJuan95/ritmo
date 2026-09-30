import type { UnvalidatedArgs } from '../../shared/ipc';

export interface IpcRegistrar {
  handle(channel: string, listener: (event: unknown, ...args: any[]) => unknown): void;
}

/** Canales `invoke` de un contrato (`FocusChannels`…), con la firma del método que los usa. */
export type Channels = Record<string, (...args: never[]) => unknown>;

/**
 * Registra un canal de `C`: solo compila si el canal existe en el contrato y el manejador recibe tantos
 * argumentos como su método, sin validar, y devuelve lo que este promete.
 */
export type Handle<C extends Channels> = <K extends keyof C & string>(
  channel: K,
  work: (...args: UnvalidatedArgs<C[K]>) => ReturnType<C[K]> | Awaited<ReturnType<C[K]>>
) => void;
