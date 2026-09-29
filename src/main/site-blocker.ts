import { execFile } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { promisify } from 'node:util';
import type { BlockAction, SiteBlocker } from './ports';

export const BLOCK_MARKER = '# >>> RITMO FOCUS BLOCK >>>';
const appleScript = `on run argv
  set helperPath to item 1 of argv
  set actionName to item 2 of argv
  set domainList to item 3 of argv
  do shell script "/bin/sh " & quoted form of helperPath & " " & quoted form of actionName & " " & quoted form of domainList with administrator privileges
end run`;

export interface SiteBlockerDeps {
  exec: (file: string, args: string[], options: { timeout: number }) => Promise<unknown>;
  readFile: (file: string) => string;
  platform: NodeJS.Platform;
  helperPath: string;
  hostsPath: string;
}

export function createSiteBlocker(overrides: Partial<SiteBlockerDeps> = {}): SiteBlocker {
  const deps: SiteBlockerDeps = {
    exec: promisify(execFile),
    readFile: file => fs.readFileSync(file, 'utf8'),
    platform: process.platform,
    helperPath: path.join(__dirname, '..', 'block-sites.sh'),
    hostsPath: '/etc/hosts',
    ...overrides
  };

  return {
    hasManagedBlock() {
      try { return deps.readFile(deps.hostsPath).includes(BLOCK_MARKER); }
      catch { return false; }
    },

    async changeBlock(action, domains) {
      if (deps.platform !== 'darwin') throw new Error('El bloqueo de sitios de esta versión requiere macOS.');
      const domainList = action === 'block' ? domains.join('\n') : '';
      try {
        await deps.exec('/usr/bin/osascript', ['-e', appleScript, deps.helperPath, action, domainList], { timeout: 120000 });
      } catch (error) {
        const detail = error as Error & { stderr?: string };
        if (/User canceled|(-128)/i.test(`${detail.message} ${detail.stderr || ''}`)) throw new Error('Se canceló la autorización de macOS.');
        throw new Error(`No se pudo ${action === 'block' ? 'activar' : 'quitar'} el bloqueo. Revisa los permisos de administrador.`);
      }
    }
  };
}

