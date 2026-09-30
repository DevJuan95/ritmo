/**
 * Atiende una petición del puente sin validar y devuelve su resultado. Un `PublicError` se envía con
 * su mensaje; cualquier otro error, sin detalles.
 */
export type BridgeHandler = (request: unknown) => unknown;

/** Servidor local por el que llegan las peticiones del servidor MCP: un socket Unix solo para el usuario. */
export interface BridgeServer {
  /** Empieza a escuchar en `socketPath`; reemplaza un socket abandonado por un cierre inesperado. */
  listen(socketPath: string, handler: BridgeHandler): Promise<void>;
  /** Deja de escuchar, corta las conexiones abiertas y borra el socket. Idempotente. */
  close(): Promise<void>;
}

/** Lo que atiende las peticiones del servidor MCP: leer rutas y crear tareas vinculadas. */
export interface BridgeServicePort {
  handle(request: unknown): unknown;
}

/** Lo que el ciclo de vida usa del puente: abrirlo al arrancar y cerrarlo antes de cerrar SQLite. */
export interface BridgeLifecyclePort {
  start(): Promise<void>;
  stop(): Promise<void>;
}
