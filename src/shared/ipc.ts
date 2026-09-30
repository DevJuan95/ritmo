/** Solo los errores de esta clase pueden mostrar su mensaje fuera del proceso principal. */
export class PublicError extends Error {}

export const GENERIC_ERROR_MESSAGE = 'No se pudo completar la operación. Inténtalo de nuevo.';

export type IpcResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: { kind: 'expected'; message: string } | { kind: 'unexpected' } };

export interface ApiError {
  kind: 'ritmo-api-error';
  message: string;
}

/**
 * Canales `invoke` de la API de un módulo, por nombre de canal, con la firma del método que lo usa.
 * `Names` asigna a cada método de `Api` su canal; si falta uno, no compila.
 */
export type ChannelMap<Api, Names extends { [M in keyof Api]: string }> = {
  [M in keyof Api as Names[M]]: Api[M];
};

/** Argumentos de un canal tal como llegan al proceso principal: sin validar. */
export type UnvalidatedArgs<Method> = Method extends (...args: infer Args) => unknown ? { [K in keyof Args]: unknown } : never;
