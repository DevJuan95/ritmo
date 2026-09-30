import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import { INVALID_BRIDGE_REQUEST, MAX_BRIDGE_MESSAGE, type BridgeResponse } from '../../shared/bridge/contract';
import { GENERIC_ERROR_MESSAGE, PublicError } from '../../shared/ipc';
import type { BridgeHandler, BridgeServer } from './ports';

export type BridgeLog = (message: string, error: unknown) => void;

export interface SocketServerOptions {
  /** Tiempo máximo sin actividad de una conexión antes de cortarla. */
  idleTimeoutMs?: number;
  /** Conexiones simultáneas como máximo. */
  maxConnections?: number;
  /** Registro de los errores inesperados, que no se envían al cliente. */
  log?: BridgeLog;
}

export const BRIDGE_IDLE_TIMEOUT_MS = 5000;
export const BRIDGE_MAX_CONNECTIONS = 4;

/** Convierte el resultado o el error del manejador en la respuesta que se envía. */
export function bridgeResponse(handler: BridgeHandler, line: string, log: BridgeLog): BridgeResponse {
  let request: unknown;
  try { request = JSON.parse(line); }
  catch { return { ok: false, error: INVALID_BRIDGE_REQUEST }; }
  try { return { ok: true, value: handler(request) }; }
  catch (error) {
    if (error instanceof PublicError) return { ok: false, error: error.message };
    log('Error en el puente para agentes de terminal:', error);
    return { ok: false, error: GENERIC_ERROR_MESSAGE };
  }
}

/** ¿Hay otra app escuchando en el socket? Si no responde, es un socket abandonado. */
function socketAlive(socketPath: string): Promise<boolean> {
  return new Promise(resolve => {
    const probe = net.connect(socketPath);
    probe.once('connect', () => { probe.destroy(); resolve(true); });
    probe.once('error', () => resolve(false));
  });
}

/**
 * Servidor del puente en un socket Unix. Lo crea en una carpeta solo para el usuario (0700) con permisos
 * 0600, de modo que solo los procesos del mismo usuario pueden conectarse. Cada conexión envía una línea
 * de JSON de como máximo `MAX_BRIDGE_MESSAGE` bytes, recibe una respuesta y se cierra.
 */
export class SocketBridgeServer implements BridgeServer {
  private server?: net.Server;
  private socketPath?: string;
  private readonly connections = new Set<net.Socket>();
  private readonly idleTimeoutMs: number;
  private readonly maxConnections: number;
  private readonly log: BridgeLog;

  constructor(options: SocketServerOptions = {}) {
    this.idleTimeoutMs = options.idleTimeoutMs ?? BRIDGE_IDLE_TIMEOUT_MS;
    this.maxConnections = options.maxConnections ?? BRIDGE_MAX_CONNECTIONS;
    this.log = options.log ?? console.error;
  }

  async listen(socketPath: string, handler: BridgeHandler): Promise<void> {
    if (this.server) throw new Error('El puente ya está escuchando.');
    fs.mkdirSync(path.dirname(socketPath), { recursive: true, mode: 0o700 });
    const server = net.createServer(socket => this.serve(socket, handler));
    server.maxConnections = this.maxConnections;
    try { await this.bind(server, socketPath); }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EADDRINUSE' || await socketAlive(socketPath)) throw error;
      // Quedó de un cierre inesperado: nadie escucha en él.
      fs.rmSync(socketPath, { force: true });
      await this.bind(server, socketPath);
    }
    fs.chmodSync(socketPath, 0o600);
    server.on('error', error => this.log('Error en el puente para agentes de terminal:', error));
    this.server = server;
    this.socketPath = socketPath;
  }

  async close(): Promise<void> {
    const server = this.server;
    if (!server) return;
    this.server = undefined;
    for (const socket of this.connections) socket.destroy();
    await new Promise<void>(resolve => server.close(() => resolve()));
    fs.rmSync(this.socketPath as string, { force: true });
  }

  private bind(server: net.Server, socketPath: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const failed = (error: Error) => reject(error);
      server.once('error', failed);
      server.listen(socketPath, () => { server.off('error', failed); resolve(); });
    });
  }

  private serve(socket: net.Socket, handler: BridgeHandler): void {
    this.connections.add(socket);
    socket.on('close', () => this.connections.delete(socket));
    socket.on('error', () => {});
    socket.setTimeout(this.idleTimeoutMs, () => socket.destroy());
    let received = Buffer.alloc(0);
    const onData = (chunk: Buffer) => {
      received = Buffer.concat([received, chunk]);
      const end = received.indexOf(0x0a);
      if (end >= 0 && end <= MAX_BRIDGE_MESSAGE) reply(bridgeResponse(handler, received.subarray(0, end).toString('utf8'), this.log));
      else if (received.length > MAX_BRIDGE_MESSAGE) reply({ ok: false, error: INVALID_BRIDGE_REQUEST });
    };
    const reply = (response: BridgeResponse) => {
      socket.off('data', onData);
      socket.end(`${JSON.stringify(response)}\n`);
    };
    socket.on('data', onData);
  }
}
