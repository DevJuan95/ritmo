import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeDomain, normalizeDomains } from '../../../../src/shared/blocking/contract';

test('normaliza dominios sin aceptar comandos ni rutas', () => {
  assert.equal(normalizeDomain(' HTTPS://LinkedIn.com/jobs '), 'linkedin.com');
  assert.equal(normalizeDomain('news.ycombinator.com:443'), 'news.ycombinator.com');
  assert.deepEqual(normalizeDomains(['X.com', 'x.com', 'facebook.com']), ['x.com', 'facebook.com']);
  for (const invalid of ['localhost', 'evil.com;id', 'a..com', '-bad.com', '', null, 'https://bad.com\n0.0.0.0 bank.com']) {
    assert.throws(() => normalizeDomain(invalid), /dominio válido/);
  }
});

test('limita la lista de dominios a un arreglo de 50 elementos', () => {
  assert.throws(() => normalizeDomains('x.com'), /no es válida/);
  assert.throws(() => normalizeDomains(Array.from({ length: 51 }, (_, i) => `sitio${i}.com`)), /no es válida/);
  assert.equal(normalizeDomains(Array.from({ length: 50 }, (_, i) => `sitio${i}.com`)).length, 50);
});
