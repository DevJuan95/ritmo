import { execFile } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const helperPath = path.join(__dirname, '..', 'block-sites.sh');
const appleScript = `on run argv
  set helperPath to item 1 of argv
  set actionName to item 2 of argv
  set domainList to item 3 of argv
  do shell script "/bin/sh " & quoted form of helperPath & " " & quoted form of actionName & " " & quoted form of domainList with administrator privileges
end run`;

export function hasManagedBlock(): boolean {
  try { return fs.readFileSync('/etc/hosts', 'utf8').includes('# >>> RITMO FOCUS BLOCK >>>'); }
  catch { return false; }
}

export async function changeBlock(action: 'block' | 'unblock', domains: string[]): Promise<void> {
  if (process.platform !== 'darwin') throw new Error('El bloqueo de sitios de esta versión requiere macOS.');
  const domainList = action === 'block' ? domains.join('\n') : '';
  try {
    await execFileAsync('/usr/bin/osascript', ['-e', appleScript, helperPath, action, domainList], { timeout: 120000 });
  } catch (error) {
    const detail = error as Error & { stderr?: string };
    if (/User canceled|(-128)/i.test(`${detail.message} ${detail.stderr || ''}`)) throw new Error('Se canceló la autorización de macOS.');
    throw new Error(`No se pudo ${action === 'block' ? 'activar' : 'quitar'} el bloqueo. Revisa los permisos de administrador.`);
  }
}
