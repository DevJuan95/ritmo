import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { PublicError } from '../../shared/ipc';

/** Tiempo máximo por defecto de una petición al agente. */
export const AGENT_TIMEOUT_MS = 180_000;
/** Espera entre `SIGTERM` y `SIGKILL` al terminar un CLI que no sale solo. */
export const AGENT_KILL_GRACE_MS = 2_000;
/** Salida máxima que se acepta del CLI; una respuesta válida ocupa unos pocos KB. */
export const AGENT_MAX_OUTPUT_BYTES = 1_000_000;

export const AGENT_CANCELLED = 'Se canceló la petición al agente.';

export interface AgentCliOptions {
  /** Nombre del CLI para los mensajes de error, por ejemplo «Claude Code». */
  name: string;
  timeoutMs: number;
  killGraceMs?: number;
  maxOutputBytes?: number;
  signal?: AbortSignal;
}

export interface AgentCliResult {
  stdout: string;
  exitCode: number;
}

/**
 * Ejecuta un CLI de agente sin shell, sin entrada estándar y en un directorio temporal vacío que se
 * borra al terminar. El proceso va en su propio grupo para poder terminarlo con todos sus hijos
 * cuando se agota el tiempo, se cancela o la salida excede el límite: primero con `SIGTERM` y, si no
 * sale, con `SIGKILL`. Resuelve con la salida estándar y el código de salida, sea cual sea; rechaza
 * con un `PublicError` si el CLI no existe, no se puede lanzar o no termina por sí mismo.
 */
export function runAgentCli(command: string, args: readonly string[], options: AgentCliOptions): Promise<AgentCliResult> {
  const { name, timeoutMs, signal } = options;
  const killGraceMs = options.killGraceMs ?? AGENT_KILL_GRACE_MS;
  const maxOutputBytes = options.maxOutputBytes ?? AGENT_MAX_OUTPUT_BYTES;
  if (signal?.aborted) return Promise.reject(new PublicError(AGENT_CANCELLED));

  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'ritmo-agent-'));
  return new Promise<AgentCliResult>((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    let stopped: PublicError | undefined;
    let failure: PublicError | undefined;
    let killTimer: NodeJS.Timeout | undefined;

    let child: ReturnType<typeof spawn>;
    try {
      child = spawn(command, args, { cwd, stdio: ['ignore', 'pipe', 'ignore'], detached: true });
    } catch (error) {
      // `spawn` falla de forma síncrona con argumentos inválidos, por ejemplo con un byte NUL.
      fs.rmSync(cwd, { recursive: true, force: true });
      return reject(new PublicError(`No se pudo iniciar ${name}.`, { cause: error }));
    }

    const signalGroup = (kill: NodeJS.Signals) => {
      try { process.kill(-child.pid!, kill); } catch { /* El grupo ya terminó. */ }
    };

    const stop = (reason: PublicError) => {
      if (stopped) return;
      stopped = reason;
      signalGroup('SIGTERM');
      killTimer = setTimeout(() => signalGroup('SIGKILL'), killGraceMs);
    };

    const onAbort = () => stop(new PublicError(AGENT_CANCELLED));
    const timeout = setTimeout(() => stop(new PublicError(`${name} tardó demasiado en responder. Inténtalo de nuevo.`)), timeoutMs);
    signal?.addEventListener('abort', onAbort, { once: true });

    child.stdout!.on('data', (chunk: Buffer) => {
      size += chunk.length;
      if (size > maxOutputBytes) return stop(new PublicError(`${name} devolvió una respuesta demasiado larga.`));
      chunks.push(chunk);
    });

    child.on('error', (error: NodeJS.ErrnoException) => {
      failure = new PublicError(
        error.code === 'ENOENT' ? `No se encontró ${name}. Instálalo o revisa su ruta.` : `No se pudo iniciar ${name}.`,
        { cause: error },
      );
    });

    child.on('close', (code) => {
      clearTimeout(timeout);
      // Aunque el CLI haya salido, algún hijo suyo puede seguir vivo en el grupo.
      signalGroup('SIGKILL');
      clearTimeout(killTimer);
      signal?.removeEventListener('abort', onAbort);
      fs.rmSync(cwd, { recursive: true, force: true });
      const error = failure ?? stopped;
      if (error) reject(error);
      else resolve({ stdout: Buffer.concat(chunks).toString('utf8'), exitCode: code ?? -1 });
    });
  });
}
