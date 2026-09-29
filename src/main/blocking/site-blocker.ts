import { PublicError } from '../../shared/contracts';
import { execFile } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import type { BlockAction, SiteBlocker } from './ports';

export const BLOCK_MARKER = '# >>> RITMO FOCUS BLOCK >>>';
const appleScript = `on run argv
  set installerPath to item 1 of argv
  set helperPath to item 2 of argv
  set accountName to item 3 of argv
  do shell script "/bin/sh " & quoted form of installerPath & " " & quoted form of helperPath & " " & quoted form of accountName with administrator privileges
end run`;
const INSTALLED_HELPER = '/Library/PrivilegedHelperTools/ritmo-block-sites';
/** El diálogo de administrador espera al usuario; `sudo -n` nunca pregunta y el helper es inmediato. */
export const INSTALL_TIMEOUT_MS = 120000;
export const HELPER_TIMEOUT_MS = 10000;

export interface SiteBlockerDeps {
  exec: (file: string, args: string[], options: { timeout: number; signal?: AbortSignal }) => Promise<unknown>;
  readFile: (file: string) => string;
  platform: NodeJS.Platform;
  helperPath: string;
  installerPath: string;
  installedHelperPath: string;
  account: string;
  hostsPath: string;
}

/** `resourcesPath` es la carpeta `resources/` de la app, donde están el helper y su instalador. */
export function createSiteBlocker(resourcesPath: string, overrides: Partial<SiteBlockerDeps> = {}): SiteBlocker {
  const deps: SiteBlockerDeps = {
    exec: promisify(execFile),
    readFile: file => fs.readFileSync(file, 'utf8'),
    platform: process.platform,
    helperPath: path.join(resourcesPath, 'block-sites.sh'),
    installerPath: path.join(resourcesPath, 'install-block-helper.sh'),
    installedHelperPath: INSTALLED_HELPER,
    account: os.userInfo().username,
    hostsPath: '/etc/hosts',
    ...overrides
  };

  function needsInstall(): boolean {
    try { return deps.readFile(deps.helperPath) !== deps.readFile(deps.installedHelperPath); }
    catch { return true; }
  }

  async function installHelper(signal?: AbortSignal): Promise<void> {
    try {
      await deps.exec('/usr/bin/osascript', ['-e', appleScript, deps.installerPath, deps.helperPath, deps.account], { timeout: INSTALL_TIMEOUT_MS, signal });
    } catch (error) {
      if (signal?.aborted) throw cancelled(error);
      const detail = error as Error & { stderr?: string };
      if (/User canceled|(-128)/i.test(`${detail.message} ${detail.stderr || ''}`)) throw new PublicError('Se canceló la autorización de macOS.', { cause: error });
      throw new PublicError('No se pudo preparar el bloqueo de sitios. Revisa los permisos de administrador.', { cause: error });
    }
  }

  function runHelper(action: BlockAction | 'check', domainList: string, signal?: AbortSignal): Promise<unknown> {
    return deps.exec('/usr/bin/sudo', ['-n', '-k', deps.installedHelperPath, action, domainList], { timeout: HELPER_TIMEOUT_MS, signal });
  }

  async function canRunHelper(): Promise<boolean> {
    try { await runHelper('check', ''); return true; }
    catch { return false; }
  }

  function cancelled(cause: unknown): Error {
    return new PublicError('Se canceló el cambio del bloqueo de sitios.', { cause });
  }

  function blockError(action: BlockAction, cause: unknown): Error {
    return new PublicError(`No se pudo ${action === 'block' ? 'activar' : 'quitar'} el bloqueo de sitios. Inténtalo de nuevo.`, { cause });
  }

  return {
    hasManagedBlock() {
      try { return deps.readFile(deps.hostsPath).includes(BLOCK_MARKER); }
      catch { return false; }
    },

    async changeBlock(action, domains, { authorize = true, signal } = {}) {
      if (deps.platform !== 'darwin') throw new PublicError('El bloqueo de sitios de esta versión requiere macOS.');
      const domainList = action === 'block' ? domains.join('\n') : '';
      const installed = needsInstall();
      if (installed && !authorize) throw blockError(action, new Error('Hay que reinstalar el helper y no se puede pedir autorización.'));
      if (installed) await installHelper(signal);
      try {
        await runHelper(action, domainList, signal);
      } catch (error) {
        if (signal?.aborted) throw cancelled(error);
        // Si se acaba de instalar, reinstalar pediría la contraseña otra vez sin arreglar nada.
        if (installed || !authorize || await canRunHelper()) throw blockError(action, error);
        await installHelper(signal);
        try { await runHelper(action, domainList, signal); }
        catch (retryError) { throw signal?.aborted ? cancelled(retryError) : blockError(action, retryError); }
      }
    }
  };
}
