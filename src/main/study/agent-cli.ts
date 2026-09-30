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

/** Nombre o alias de modelo que se pasa al CLI: sin espacios y sin empezar por `-`. */
export const AGENT_MODEL_PATTERN = /^[A-Za-z0-9][\w.:[\]-]{0,99}$/;

/** Tiempo máximo para comprobar la sesión del CLI (`claude auth status`, `codex login status`). */
export const AGENT_LOGIN_TIMEOUT_MS = 15_000;

export const AGENT_CANCELLED = 'Se canceló la petición al agente.';

/**
 * Variables del entorno que harían que un CLI de agente usara una clave de API, facturada por uso,
 * en lugar de la sesión del usuario con su suscripción (claude.ai o ChatGPT): `ANTHROPIC_API_KEY` y
 * `ANTHROPIC_AUTH_TOKEN` en Claude Code, y `OPENAI_API_KEY` y `CODEX_API_KEY` en Codex.
 */
export const AGENT_API_KEY_VARIABLES = ['ANTHROPIC_API_KEY', 'ANTHROPIC_AUTH_TOKEN', 'OPENAI_API_KEY', 'CODEX_API_KEY'] as const;

/** Copia de `env` sin las claves de API de `AGENT_API_KEY_VARIABLES`, para lanzar un CLI de agente. */
export function agentEnv(env: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  const copy = { ...env };
  for (const name of AGENT_API_KEY_VARIABLES) delete copy[name];
  return copy;
}

export interface AgentCliOptions {
  /** Nombre del CLI para los mensajes de error, por ejemplo «Claude Code». */
  name: string;
  timeoutMs: number;
  killGraceMs?: number;
  maxOutputBytes?: number;
  signal?: AbortSignal;
  /**
   * Archivos que se escriben en el directorio temporal antes de lanzar el CLI, por nombre (sin
   * carpetas) y contenido; los argumentos pueden nombrarlos con ruta relativa.
   */
  files?: Readonly<Record<string, string>>;
  /**
   * Archivo del directorio temporal que el CLI deja con su respuesta, por nombre. Se lee antes de
   * borrar el directorio y llega en `AgentCliResult.output`, con el mismo límite que la salida.
   */
  outputFile?: string;
  /**
   * Si la salida de error se junta con la estándar en `AgentCliResult.stdout`, con el mismo límite.
   * Sirve para comandos que informan por la salida de error, como `codex login status`.
   */
  mergeStderr?: boolean;
}

export interface AgentCliResult {
  stdout: string;
  exitCode: number;
  /** Contenido de `outputFile`, o `undefined` si el CLI no lo creó; solo si se pidió. */
  output?: string;
}

/**
 * Ejecuta un CLI de agente sin shell, sin entrada estándar, sin claves de API en el entorno (ver
 * `agentEnv()`) y en un directorio temporal vacío que se borra al terminar. El proceso va en su
 * propio grupo para poder terminarlo con todos sus hijos cuando se agota el tiempo, se cancela o la
 * salida excede el límite: primero con `SIGTERM` y, si no sale, con `SIGKILL`. Antes de lanzarlo
 * escribe en ese directorio los archivos de `files` y, al terminar, lee `outputFile` si se pidió.
 * Resuelve con la salida estándar, el código de salida, sea cual sea, y ese archivo; rechaza con un
 * `PublicError` si el CLI no existe, no se puede lanzar o no termina por sí mismo, o si su respuesta
 * excede el límite o no se puede leer.
 */
export function runAgentCli(command: string, args: readonly string[], options: AgentCliOptions): Promise<AgentCliResult> {
  const { name, timeoutMs, signal } = options;
  const killGraceMs = options.killGraceMs ?? AGENT_KILL_GRACE_MS;
  const maxOutputBytes = options.maxOutputBytes ?? AGENT_MAX_OUTPUT_BYTES;
  if (signal?.aborted) return Promise.reject(new PublicError(AGENT_CANCELLED));

  const tooLong = () => new PublicError(`${name} devolvió una respuesta demasiado larga.`);
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'ritmo-agent-'));
  return new Promise<AgentCliResult>((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    let stopped: PublicError | undefined;
    let failure: PublicError | undefined;
    let killTimer: NodeJS.Timeout | undefined;

    let child: ReturnType<typeof spawn>;
    try {
      for (const [file, content] of Object.entries(options.files ?? {})) {
        fs.writeFileSync(inside(cwd, file), content, { mode: 0o600 });
      }
      child = spawn(command, args, {
        cwd,
        env: agentEnv(process.env),
        stdio: ['ignore', 'pipe', options.mergeStderr ? 'pipe' : 'ignore'],
        detached: true,
      });
    } catch (error) {
      // `spawn` falla de forma síncrona con argumentos inválidos, por ejemplo con un byte NUL, y
      // escribir un archivo de la petición también puede fallar.
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

    const collect = (chunk: Buffer) => {
      size += chunk.length;
      if (size > maxOutputBytes) return stop(tooLong());
      chunks.push(chunk);
    };
    child.stdout!.on('data', collect);
    child.stderr?.on('data', collect);

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
      let error = failure ?? stopped;
      const result: AgentCliResult = { stdout: Buffer.concat(chunks).toString('utf8'), exitCode: code ?? -1 };
      if (!error && options.outputFile !== undefined) {
        try {
          result.output = readOutputFile(inside(cwd, options.outputFile), maxOutputBytes, tooLong);
        } catch (readError) {
          error = readError instanceof PublicError
            ? readError
            : new PublicError(`No se pudo leer la respuesta de ${name}.`, { cause: readError });
        }
      }
      fs.rmSync(cwd, { recursive: true, force: true });
      if (error) reject(error);
      else resolve(result);
    });
  });
}

/** Ruta de `file` dentro de `dir`; solo admite nombres simples, sin carpetas, para no salir de él. */
function inside(dir: string, file: string): string {
  if (!/^\w[\w.-]*$/.test(file)) throw new Error(`Nombre de archivo inválido: ${file}`);
  return path.join(dir, file);
}

/** Lee el archivo de respuesta del CLI si existe, sin seguir enlaces y con el límite de tamaño. */
function readOutputFile(file: string, maxBytes: number, tooLong: () => PublicError): string | undefined {
  const stat = fs.lstatSync(file, { throwIfNoEntry: false });
  if (!stat?.isFile()) return undefined;
  if (stat.size > maxBytes) throw tooLong();
  return fs.readFileSync(file, 'utf8');
}
