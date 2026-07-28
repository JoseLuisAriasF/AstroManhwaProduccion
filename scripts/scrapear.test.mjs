import assert from 'node:assert/strict';
import { numeroDe } from './scrapear.mjs';

assert.equal(numeroDe('Chapter 1938'), 1938);
assert.equal(numeroDe('Special Spinoff. Chapter 57 (Hiatus)'), 57);
assert.equal(numeroDe('Capítulo 12 – El regreso'), 12);
assert.equal(numeroDe('Ch. 7'), 7);
assert.equal(numeroDe('Prólogo'), null);
console.log('ok');
