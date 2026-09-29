import type { TestContext } from 'node:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export interface TempDirOptions {
  /** Directorio base. block-sites.sh solo acepta rutas dentro de /tmp. */
  base?: string;
}

/** Crea un directorio temporal que se elimina al terminar la prueba. */
export function tempDir(t: TestContext, options: TempDirOptions = {}): string {
  const directory = fs.mkdtempSync(path.join(options.base ?? os.tmpdir(), 'ritmo-test-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  return directory;
}
