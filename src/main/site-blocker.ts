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

export interface SiteBlockerDeps {
  exec: (file: string, args: string[], options: { timeout: number }) => Promise<unknown>;
  readFile: (file: string) => string;
  platform: NodeJS.Platform;
  helperPath: string;
  installerPath: string;
  installedHelperPath: string;
  account: string;
  hostsPath: string;
}

export function createSiteBlocker(overrides: Partial<SiteBlockerDeps> = {}): SiteBlocker {
  const deps: SiteBlockerDeps = {
    exec: promisify(execFile),
    readFile: file => fs.readFileSync(file, 'utf8'),
    platform: process.platform,
    helperPath: path.join(__dirname, '..', 'block-sites.sh'),
    installerPath: path.join(__dirname, '..', 'install-block-helper.sh'),
    installedHelperPath: INSTALLED_HELPER,
    account: os.userInfo().username,
    hostsPath: '/etc/hosts',
    ...overrides
  };

  function needsInstall(): boolean {
    try { return deps.readFile(deps.helperPath) !== deps.readFile(deps.installedHelperPath); }
    catch { return true; }
  }

  async function installHelper(): Promise<void> {
    try {
      await deps.exec('/usr/bin/osascript', ['-e', appleScript, deps.installerPath, deps.helperPath, deps.account], { timeout: 120000 });
    } catch (error) {
      const detail = error as Error & { stderr?: string };
      if (/User canceled|(-128)/i.test(`${detail.message} ${detail.stderr || ''}`)) throw new Error('Se canceló la autorización de macOS.');
      throw new Error('No se pudo instalar el helper de Ritmo. Revisa los permisos de administrador.');
    }
  }

  function runHelper(action: BlockAction | 'check', domainList: string): Promise<unknown> {
    return deps.exec('/usr/bin/sudo', ['-n', '-k', deps.installedHelperPath, action, domainList], { timeout: 120000 });
  }

  async function canRunHelper(): Promise<boolean> {
    try { await runHelper('check', ''); return true; }
    catch { return false; }
  }

  function blockError(action: BlockAction, cause: unknown): Error {
    return new Error(`No se pudo ${action === 'block' ? 'activar' : 'quitar'} el bloqueo. Revisa la instalación del helper de Ritmo.`, { cause });
  }

  return {
    hasManagedBlock() {
      try { return deps.readFile(deps.hostsPath).includes(BLOCK_MARKER); }
      catch { return false; }
    },

    async changeBlock(action, domains) {
      if (deps.platform !== 'darwin') throw new Error('El bloqueo de sitios de esta versión requiere macOS.');
      const domainList = action === 'block' ? domains.join('\n') : '';
      const installed = needsInstall();
      if (installed) await installHelper();
      try {
        await runHelper(action, domainList);
      } catch (error) {
        // Si se acaba de instalar, reinstalar pediría la contraseña otra vez sin arreglar nada.
        if (installed || await canRunHelper()) throw blockError(action, error);
        await installHelper();
        try { await runHelper(action, domainList); }
        catch (retryError) { throw blockError(action, retryError); }
      }
    }
  };
}
