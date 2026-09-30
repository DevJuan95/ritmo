import { PublicError } from '../../shared/ipc';
import { AGENT_MODEL_PATTERN, INVALID_AGENT_RESPONSE, type TaskProposal } from '../../shared/study/contract';
import { AGENT_LOGIN_TIMEOUT_MS, AGENT_TIMEOUT_MS, runAgentCli } from './agent-cli';
import { buildAgentRequest, readAgentProposals } from './agent-prompt';
import type { AgentLogin, StudyAgent, StudyAgentContext, StudyAgentOptions } from './ports';

export const CODEX_NAME = 'Codex';
export const CODEX_FAILED = 'Codex no pudo completar la petición. Inténtalo de nuevo.';
export const CODEX_LOGIN = 'Inicia sesión en Codex con tu cuenta de ChatGPT: ejecuta `codex login` en la terminal.';
export const CODEX_API_KEY = 'Codex está configurado con una clave de API. Inicia sesión con tu cuenta de ChatGPT (`codex login`) para usar tu suscripción.';

/** Argumentos que muestran la sesión de Codex, por ejemplo «Logged in using ChatGPT». */
export const CODEX_STATUS_ARGS = ['login', 'status'];

/** Archivos que `codex exec` usa en su directorio temporal: el esquema de entrada y la respuesta. */
export const CODEX_SCHEMA_FILE = 'esquema.json';
export const CODEX_OUTPUT_FILE = 'respuesta.json';

export interface CodexAgentOptions {
  /** Ruta o nombre del ejecutable `codex`. */
  command?: string;
  /** Modelo para `-m`; sin él, el modelo por defecto de Codex. */
  model?: string;
  timeoutMs?: number;
  /** Espera entre `SIGTERM` y `SIGKILL` al terminar el CLI. */
  killGraceMs?: number;
}

/**
 * Argumentos de `codex exec`: sandbox de solo lectura, sin sesión guardada y con la respuesta final
 * según el esquema, escrita en un archivo. Los archivos se nombran con ruta relativa al directorio
 * temporal donde se lanza. `--skip-git-repo-check` permite ese directorio, que no es un repositorio;
 * `--ephemeral` evita que Codex guarde la sesión (con los datos de la ruta) en `~/.codex/sessions`, e
 * `--ignore-user-config` deja fuera `~/.codex/config.toml` (sus servidores MCP, perfiles y
 * permisos), para que la petición no dependa de la configuración del usuario; la sesión de Codex
 * sigue usándose. El prompt va detrás de `--` para que nunca se lea como una opción.
 */
export function codexArgs(prompt: string, model?: string): string[] {
  const args = [
    'exec', '--skip-git-repo-check', '--ephemeral', '--ignore-user-config', '--sandbox', 'read-only', '--color', 'never',
    '--output-schema', CODEX_SCHEMA_FILE, '-o', CODEX_OUTPUT_FILE,
  ];
  if (model !== undefined) {
    if (!AGENT_MODEL_PATTERN.test(model)) throw new PublicError('El modelo de Codex no es válido.');
    args.push('-m', model);
  }
  return [...args, '--', prompt];
}

/**
 * Lee la respuesta de `codex exec`: el último mensaje del agente, que Codex escribe en el archivo de
 * `-o`. Un código de salida distinto de 0 indica que la petición falló; sin archivo o vacío, la
 * respuesta no es válida.
 */
export function readCodexOutput(output: string | undefined, exitCode: number): string {
  if (exitCode !== 0) throw new PublicError(CODEX_FAILED);
  if (!output?.trim()) throw new PublicError(INVALID_AGENT_RESPONSE);
  return output;
}

/**
 * Estado de la sesión según la salida de `codex login status`, que Codex escribe en la salida de
 * error. Sale con 1 e imprime «Not logged in» si no hay sesión, dice «Logged in using an API key» si
 * la sesión es una clave de API guardada y «Logged in using ChatGPT» con la suscripción. Cualquier
 * otra salida es `unknown`, también con un código distinto de 0: un `config.toml` inválido o la falta
 * de `node` (127) no significan que falte la sesión.
 */
export function codexLogin(stdout: string, exitCode: number): AgentLogin {
  if (/not logged in/i.test(stdout)) return 'logged-out';
  if (exitCode !== 0) return 'unknown';
  if (/api key/i.test(stdout)) return 'api-key';
  return /logged in/i.test(stdout) ? 'ready' : 'unknown';
}

/**
 * Rechaza sin sesión o con una clave de API, con un mensaje que dice cómo iniciar sesión con la
 * suscripción. Un estado que no reconoce no bloquea la petición: si falta la sesión, fallará igual.
 */
export function checkCodexLogin(stdout: string, exitCode: number): void {
  const login = codexLogin(stdout, exitCode);
  if (login === 'logged-out') throw new PublicError(CODEX_LOGIN);
  if (login === 'api-key') throw new PublicError(CODEX_API_KEY);
}

/**
 * Adaptador de `StudyAgent` que lanza `codex exec` en un sandbox de solo lectura, en un directorio
 * temporal, con tiempo máximo y cancelable. Antes comprueba que hay sesión con la cuenta de ChatGPT,
 * para no enviar nada si no la hay. Solo devuelve propuestas validadas.
 */
export class CodexAgent implements StudyAgent {
  private readonly command: string;
  private readonly timeoutMs: number;

  constructor(private readonly options: CodexAgentOptions = {}) {
    this.command = options.command ?? 'codex';
    this.timeoutMs = options.timeoutMs ?? AGENT_TIMEOUT_MS;
  }

  async propose(context: StudyAgentContext, { signal }: StudyAgentOptions = {}): Promise<TaskProposal[]> {
    const { prompt, schema } = buildAgentRequest(context);
    const args = codexArgs(prompt, this.options.model);
    const status = await runAgentCli(this.command, CODEX_STATUS_ARGS, {
      name: CODEX_NAME,
      timeoutMs: Math.min(this.timeoutMs, AGENT_LOGIN_TIMEOUT_MS),
      killGraceMs: this.options.killGraceMs,
      signal,
      mergeStderr: true,
    });
    checkCodexLogin(status.stdout, status.exitCode);
    const { output, exitCode } = await runAgentCli(this.command, args, {
      name: CODEX_NAME,
      timeoutMs: this.timeoutMs,
      killGraceMs: this.options.killGraceMs,
      signal,
      files: { [CODEX_SCHEMA_FILE]: JSON.stringify(schema) },
      outputFile: CODEX_OUTPUT_FILE,
    });
    return readAgentProposals(readCodexOutput(output, exitCode), context.route);
  }
}
