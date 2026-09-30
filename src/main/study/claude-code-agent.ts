import { PublicError } from '../../shared/ipc';
import { INVALID_AGENT_RESPONSE, type TaskProposal } from '../../shared/study/contract';
import { AGENT_TIMEOUT_MS, runAgentCli } from './agent-cli';
import { buildAgentRequest, readAgentProposals } from './agent-prompt';
import type { StudyAgent, StudyAgentContext, StudyAgentOptions } from './ports';

export const CLAUDE_CODE_NAME = 'Claude Code';
export const CLAUDE_CODE_FAILED = 'Claude Code no pudo completar la petición. Inténtalo de nuevo.';

/** Nombre o alias de modelo que se pasa a `--model`: sin espacios y sin empezar por `-`. */
const MODEL_PATTERN = /^[A-Za-z0-9][\w.:[\]-]{0,99}$/;

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
  if (!MODEL_PATTERN.test(model)) throw new PublicError('El modelo de Claude Code no es válido.');
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
 * Adaptador de `StudyAgent` que lanza `claude -p` sin herramientas, en un directorio temporal, con
 * tiempo máximo y cancelable. Solo devuelve propuestas validadas.
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
    const { stdout, exitCode } = await runAgentCli(this.command, args, {
      name: CLAUDE_CODE_NAME,
      timeoutMs: this.timeoutMs,
      killGraceMs: this.options.killGraceMs,
      signal,
    });
    return readAgentProposals(readClaudeCodeOutput(stdout, exitCode), context.route);
  }
}
