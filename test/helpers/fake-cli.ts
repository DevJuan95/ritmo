import type { TestContext } from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
import { tempDir } from './temp';

export interface FakeCliCall {
  args: string[];
  cwd: string;
}

export interface FakeCli {
  /** Ruta del ejecutable falso. */
  command: string;
  /** Carpeta del ejecutable, donde el script puede dejar archivos (`dir` dentro del script). */
  dir: string;
  /** Llamadas registradas, en orden: argumentos y directorio de trabajo. */
  calls(): FakeCliCall[];
}

/**
 * Crea un ejecutable falso que sustituye a un CLI de agente (`claude`, `codex`). Registra sus
 * argumentos y su directorio de trabajo y después ejecuta `body`, código JavaScript con `fs`,
 * `path`, `childProcess` y `dir` disponibles. Se ejecuta con el mismo Node que las pruebas.
 */
export function fakeCli(t: TestContext, body: string): FakeCli {
  const dir = tempDir(t);
  const command = path.join(dir, 'fake-cli');
  const log = path.join(dir, 'calls.jsonl');
  fs.writeFileSync(command, [
    `#!${process.execPath}`,
    `const fs = require('node:fs'); const path = require('node:path'); const childProcess = require('node:child_process');`,
    `const dir = ${JSON.stringify(dir)};`,
    `fs.appendFileSync(${JSON.stringify(log)}, JSON.stringify({ args: process.argv.slice(2), cwd: process.cwd() }) + '\\n');`,
    body,
  ].join('\n'), { mode: 0o755 });
  return {
    command,
    dir,
    calls: () => fs.existsSync(log) ? fs.readFileSync(log, 'utf8').trim().split('\n').map(line => JSON.parse(line)) : [],
  };
}

/** Espera, con un límite, a que se cumpla una condición de un proceso real. */
export async function waitUntil(condition: () => boolean, timeoutMs = 5000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!condition()) {
    if (Date.now() > deadline) throw new Error('La condición no se cumplió a tiempo.');
    await new Promise(resolve => setTimeout(resolve, 10));
  }
}

/** Si el proceso con ese pid sigue vivo. */
export function isAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}
