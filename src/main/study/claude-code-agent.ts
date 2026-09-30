import { PublicError } from '../../shared/ipc';
import { AGENT_MODEL_PATTERN, INVALID_AGENT_RESPONSE, type TaskProposal } from '../../shared/study/contract';
import { AGENT_LOGIN_TIMEOUT_MS, AGENT_TIMEOUT_MS, runAgentCli } from './agent-cli';
import { buildAgentRequest, readAgentProposals } from './agent-prompt';
import type { AgentLogin, StudyAgent, StudyAgentContext, StudyAgentOptions } from './ports';

export const CLAUDE_CODE_NAME = 'Claude Code';
export const CLAUDE_CODE_FAILED = 'Claude Code no pudo completar la petición. Inténtalo de nuevo.';
export const CLAUDE_CODE_LOGIN = 'Inicia sesión en Claude Code con tu cuenta de claude.ai: ejecuta `claude auth login` en la terminal.';
export const CLAUDE_CODE_API_KEY = 'Claude Code está configurado con una clave de API. Inicia sesión con tu cuenta de claude.ai (`claude auth login`) para usar tu suscripción.';

/** Argumentos que muestran la sesión de Claude Code en JSON, con `loggedIn` y `authMethod`. */
export const CLAUDE_CODE_STATUS_ARGS = ['auth', 'status', '--json'];

export interface ClaudeCodeAgentOptions {
  /** Ruta o nombre del ejecutable `claude`. */
  command?: string;
  /** Modelo o alias para `--model`; sin él, el que tenga configurado el usuario. */
  model?: string;
  timeoutMs?: number;
  /** Espera entre `SIGTERM` y `SIGKILL` al terminar el CLI. */
  killGraceMs?: number;
}

/**
 * Argumentos de `claude -p`: salida JSON con el esquema de la petición y sin herramientas.
 * `--tools ""` solo quita las herramientas integradas; `--strict-mcp-config` sin `--mcp-config` deja
 * fuera los servidores MCP del usuario y `--safe-mode` desactiva sus hooks, plugins, skills y
 * `CLAUDE.md`, para que la petición no dependa de la configuración del usuario.
 * `--no-session-persistence` evita que Claude Code guarde la sesión (con los datos de la ruta) en
 * `~/.claude/projects`, donde cada directorio temporal dejaría una carpeta de proyecto nueva.
 */
export function claudeCodeArgs(prompt: string, schema: object, model?: string): string[] {
  const args = ['-p', prompt, '--output-format', 'json', '--json-schema', JSON.stringify(schema), '--tools', '', '--strict-mcp-config', '--safe-mode', '--no-session-persistence'];
  if (model === undefined) return args;
  if (!AGENT_MODEL_PATTERN.test(model)) throw new PublicError('El modelo de Claude Code no es válido.');
  return [...args, '--model', model];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Lee el JSON final de `claude -p --output-format json`. La respuesta estructurada llega en
 * `structured_output` o, como texto, en `result`; `is_error` o un código de salida distinto de 0
 * indican que la petición falló.
 */
export function readClaudeCodeOutput(stdout: string, exitCode: number): unknown {
  let envelope: unknown;
  try {
    envelope = JSON.parse(stdout);
  } catch {
    throw new PublicError(exitCode === 0 ? INVALID_AGENT_RESPONSE : CLAUDE_CODE_FAILED);
  }
  if (!isRecord(envelope)) throw new PublicError(exitCode === 0 ? INVALID_AGENT_RESPONSE : CLAUDE_CODE_FAILED);
  if (exitCode !== 0 || envelope.is_error === true) throw new PublicError(CLAUDE_CODE_FAILED);
  return envelope.structured_output ?? envelope.result;
}

/**
 * Estado de la sesión según la salida de `claude auth status --json`, que sale con 1 si no hay
 * sesión: `logged-out` sin sesión, `api-key` si la sesión es una clave de API (en la configuración,
 * porque del entorno ya se quitó) y `unknown` si la salida no se reconoce, sea cual sea el código:
 * un error de configuración o la falta de `node` (127) no significan que falte la sesión.
 */
export function claudeCodeLogin(stdout: string, exitCode: number): AgentLogin {
  let status: unknown;
  try {
    status = JSON.parse(stdout);
  } catch {
    status = undefined;
  }
  const loggedIn = isRecord(status) ? status.loggedIn : undefined;
  if (loggedIn === false) return 'logged-out';
  if (exitCode !== 0) return 'unknown';
  if (isRecord(status) && status.authMethod === 'api_key') return 'api-key';
  return loggedIn === true ? 'ready' : 'unknown';
}

/**
 * Rechaza sin sesión o con una clave de API, con un mensaje que dice cómo iniciar sesión con la
 * suscripción. Un estado que no reconoce no bloquea la petición: si falta la sesión, fallará igual.
 */
export function checkClaudeCodeLogin(stdout: string, exitCode: number): void {
  const login = claudeCodeLogin(stdout, exitCode);
  if (login === 'logged-out') throw new PublicError(CLAUDE_CODE_LOGIN);
  if (login === 'api-key') throw new PublicError(CLAUDE_CODE_API_KEY);
}

/**
 * Adaptador de `StudyAgent` que lanza `claude -p` sin herramientas, en un directorio temporal, con
 * tiempo máximo y cancelable. Antes comprueba que hay sesión con la cuenta de claude.ai, para no
 * enviar nada si no la hay. Solo devuelve propuestas validadas.
 */
export class ClaudeCodeAgent implements StudyAgent {
  private readonly command: string;
  private readonly timeoutMs: number;

  constructor(private readonly options: ClaudeCodeAgentOptions = {}) {
    this.command = options.command ?? 'claude';
    this.timeoutMs = options.timeoutMs ?? AGENT_TIMEOUT_MS;
  }

  async propose(context: StudyAgentContext, { signal }: StudyAgentOptions = {}): Promise<TaskProposal[]> {
    const { prompt, schema } = buildAgentRequest(context);
    const args = claudeCodeArgs(prompt, schema, this.options.model);
    const status = await runAgentCli(this.command, CLAUDE_CODE_STATUS_ARGS, {
      name: CLAUDE_CODE_NAME,
      timeoutMs: Math.min(this.timeoutMs, AGENT_LOGIN_TIMEOUT_MS),
      killGraceMs: this.options.killGraceMs,
      signal,
    });
    checkClaudeCodeLogin(status.stdout, status.exitCode);
    const { stdout, exitCode } = await runAgentCli(this.command, args, {
      name: CLAUDE_CODE_NAME,
      timeoutMs: this.timeoutMs,
      killGraceMs: this.options.killGraceMs,
      signal,
    });
    return readAgentProposals(readClaudeCodeOutput(stdout, exitCode), context.route);
  }
}
