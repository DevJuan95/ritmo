import path from 'node:path';

/** Raíz del repositorio; las pruebas se ejecutan compiladas desde dist/test/. */
export const repoRoot = path.resolve(__dirname, '../../..');
export const distRoot = path.join(repoRoot, 'dist');
