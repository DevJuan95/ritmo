import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { StudyProvider } from '../../shared/study/contract';
import { AGENT_LOGIN_TIMEOUT_MS, runAgentCli } from './agent-cli';
import { CLAUDE_CODE_NAME, CLAUDE_CODE_STATUS_ARGS, claudeCodeLogin } from './claude-code-agent';
import { CODEX_NAME, CODEX_STATUS_ARGS, codexLogin } from './codex-agent';
import type { AgentDetector, AgentLogin } from './ports';

/** Nombre del ejecutable de cada proveedor. */
export const AGENT_COMMANDS: Readonly<Record<StudyProvider, string>> = { claude: 'claude', codex: 'codex' };

/** Tiempo máximo para leer el `PATH` de la shell de login, que carga los archivos de inicio del usuario. */
export const LOGIN_SHELL_TIMEOUT_MS = 5_000;

/** Marca que rodea el `PATH` en la salida de la shell, para separarlo de lo que impriman sus archivos de inicio. */
const PATH_MARK = '__RITMO_PATH__';

/**
 * Carpetas donde suelen instalarse los CLI y que una app abierta desde Finder no tiene en su `PATH`:
 * el instalador nativo de Claude Code (`~/.local/bin`, `~/.claude/local`), Homebrew y los prefijos
 * globales habituales de npm, Bun y Volta.
 */
export function knownAgentDirs(home: string): string[] {
  return [
    path.join(home, '.local/bin'), path.join(home, '.claude/local'), '/opt/homebrew/bin', '/usr/local/bin',
    path.join(home, '.npm-global/bin'), path.join(home, '.bun/bin'), path.join(home, '.volta/bin'),
  ];
}

/** Carpetas absolutas de un `PATH`, sin repetir y sin entradas relativas como `.`. */
export function pathDirs(value: string | undefined): string[] {
  return [...new Set((value ?? '').split(path.delimiter).filter(dir => path.isAbsolute(dir)))];
}

/** Ruta configurada con `~/` expandido a la carpeta personal. */
export function expandHome(file: string, home: string): string {
  return file.startsWith('~/') ? path.join(home, file.slice(2)) : file;
}

/** Si `file` es un archivo que se puede ejecutar; sigue los enlaces. */
export function isExecutable(file: string): boolean {
  try {
    if (!fs.statSync(file).isFile()) return false;
    fs.accessSync(file, fs.constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

/** Lee el `PATH` que imprime la shell entre las marcas; `undefined` si no aparece. */
export function readShellPath(stdout: string): string | undefined {
  return new RegExp(`${PATH_MARK}(.*?)${PATH_MARK}`).exec(stdout)?.[1];
}

export interface AgentDetectorOptions {
  /** Entorno del proceso principal, del que se toma el `PATH`. */
  env?: NodeJS.ProcessEnv;
  home?: string;
  /** Shell de login del usuario; por defecto, `$SHELL` o `/bin/zsh`. */
  shell?: string;
  /** Carpetas conocidas; por defecto, `knownAgentDirs(home)`. */
  knownDirs?: readonly string[];
  shellTimeoutMs?: number;
  loginTimeoutMs?: number;
}

/**
 * Adaptador de `AgentDetector` con el sistema de archivos y procesos reales. Busca el ejecutable en
 * el `PATH` del proceso, en las carpetas conocidas y, si no está, en el `PATH` de la shell de login
 * (`$SHELL -ilc`), que lee una vez y recuerda. La sesión la comprueba con el comando de estado de
 * cada CLI (`claude auth status --json`, `codex login status`), que no envía ningún prompt, con esas
 * mismas carpetas delante del `PATH` para que un CLI de npm encuentre `node`.
 */
export class SystemAgentDetector implements AgentDetector {
  private readonly env: NodeJS.ProcessEnv;
  private readonly home: string;
  private readonly shell: string;
  private readonly knownDirs: readonly string[];
  private shellDirs?: Promise<string[]>;

  constructor(private readonly options: AgentDetectorOptions = {}) {
    this.env = options.env ?? process.env;
    this.home = options.home ?? os.homedir();
    this.shell = options.shell ?? (this.env.SHELL || '/bin/zsh');
    this.knownDirs = options.knownDirs ?? knownAgentDirs(this.home);
  }

  async locate(provider: StudyProvider, configured: string): Promise<string | null> {
    if (configured) {
      const file = expandHome(configured, this.home);
      return isExecutable(file) ? file : null;
    }
    const found = this.find(provider, [...pathDirs(this.env.PATH), ...this.knownDirs]);
    return found ?? this.find(provider, await this.loginShellDirs());
  }

  async login(provider: StudyProvider, command: string): Promise<AgentLogin> {
    try {
      const pathDirs = await this.searchDirs(command);
      const { stdout, exitCode } = await runAgentCli(command, provider === 'claude' ? CLAUDE_CODE_STATUS_ARGS : CODEX_STATUS_ARGS, {
        name: provider === 'claude' ? CLAUDE_CODE_NAME : CODEX_NAME,
        timeoutMs: this.options.loginTimeoutMs ?? AGENT_LOGIN_TIMEOUT_MS,
        mergeStderr: provider === 'codex',
        pathDirs,
      });
      return provider === 'claude' ? claudeCodeLogin(stdout, exitCode) : codexLogin(stdout, exitCode);
    } catch {
      return 'unknown';
    }
  }

  /**
   * Carpetas que se anteponen al `PATH` al lanzar `command`: la suya, las del `PATH` del proceso, las
   * conocidas y las de la shell de login. Así un CLI de npm (`#!/usr/bin/env node`) encuentra `node`
   * aunque la app se haya abierto desde Finder.
   */
  async searchDirs(command: string): Promise<string[]> {
    const own = path.isAbsolute(command) ? [path.dirname(command)] : [];
    return [...new Set([...own, ...pathDirs(this.env.PATH), ...this.knownDirs, ...await this.loginShellDirs()])];
  }

  private find(provider: StudyProvider, dirs: readonly string[]): string | null {
    for (const dir of dirs) {
      const file = path.join(dir, AGENT_COMMANDS[provider]);
      if (isExecutable(file)) return file;
    }
    return null;
  }

  /** Carpetas del `PATH` de la shell de login. Si no se pudo leer, lo vuelve a intentar la próxima vez. */
  private loginShellDirs(): Promise<string[]> {
    this.shellDirs ??= runAgentCli(this.shell, ['-ilc', `printf '\\n${PATH_MARK}%s${PATH_MARK}\\n' "$PATH"`], {
      name: 'la shell de login',
      timeoutMs: this.options.shellTimeoutMs ?? LOGIN_SHELL_TIMEOUT_MS,
    }).then(({ stdout }) => {
      const value = readShellPath(stdout);
      if (value === undefined) throw new Error('La shell no imprimió su PATH.');
      return pathDirs(value);
    }).catch(() => {
      this.shellDirs = undefined;
      return [];
    });
    return this.shellDirs;
  }
}
