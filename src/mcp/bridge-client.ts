import net from 'node:net';
import path from 'node:path';
import { BRIDGE_SOCKET_NAME, MAX_BRIDGE_RESPONSE, type BridgeResponse } from '../shared/bridge/contract';

/** Tiempo máximo de una petición a la app, desde que se conecta hasta que llega la respuesta. */
export const BRIDGE_TIMEOUT_MS = 10000;

export const APP_CLOSED = 'Ritmo no está abierto. Ábrelo y vuelve a intentarlo.';
export const APP_TIMEOUT = 'Ritmo no respondió a tiempo. Inténtalo de nuevo.';
export const APP_UNREACHABLE = 'No se pudo conectar con Ritmo.';
export const APP_INVALID_RESPONSE = 'Ritmo devolvió una respuesta que no se entiende.';

/**
 * Socket de la app: `RITMO_SOCKET` si está definida (por ejemplo, con otro `--user-data-dir`); si no,
 * el de los datos de la app en macOS.
 */
export function defaultSocketPath(env: NodeJS.ProcessEnv, home: string): string {
  return env.RITMO_SOCKET || path.join(home, 'Library', 'Application Support', 'ritmo', BRIDGE_SOCKET_NAME);
}

function readResponse(text: string): BridgeResponse {
  try {
    const response = JSON.parse(text) as BridgeResponse;
    if (response?.ok === true && 'value' in response) return response;
    if (response?.ok === false && typeof response.error === 'string') return response;
  } catch { /* se informa abajo */ }
  return { ok: false, error: APP_INVALID_RESPONSE };
}

export interface CallBridgeOptions {
  timeoutMs?: number;
}

/**
 * Envía una petición a la app abierta y devuelve su respuesta. Nunca rechaza: si la app no está
 * abierta, no responde a tiempo o responde algo inválido, devuelve un error que se puede mostrar.
 */
export function callBridge(socketPath: string, request: object, options: CallBridgeOptions = {}): Promise<BridgeResponse> {
  return new Promise(resolve => {
    const socket = net.connect(socketPath);
    let received = Buffer.alloc(0);
    // Solo cuenta la primera respuesta: `destroy()` impide más eventos y `resolve` ignora los siguientes.
    const finish = (response: BridgeResponse) => {
      socket.destroy();
      resolve(response);
    };
    socket.setTimeout(options.timeoutMs ?? BRIDGE_TIMEOUT_MS, () => finish({ ok: false, error: APP_TIMEOUT }));
    socket.once('connect', () => socket.write(`${JSON.stringify(request)}\n`));
    socket.on('error', error => {
      const code = (error as NodeJS.ErrnoException).code;
      finish({ ok: false, error: code === 'ENOENT' || code === 'ECONNREFUSED' ? APP_CLOSED : APP_UNREACHABLE });
    });
    socket.on('data', chunk => {
      received = Buffer.concat([received, chunk]);
      const end = received.indexOf(0x0a);
      if (end >= 0) finish(readResponse(received.subarray(0, end).toString('utf8')));
      else if (received.length > MAX_BRIDGE_RESPONSE) finish({ ok: false, error: APP_INVALID_RESPONSE });
    });
    socket.on('end', () => finish(readResponse(received.toString('utf8'))));
  });
}
