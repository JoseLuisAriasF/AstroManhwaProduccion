import assert from 'node:assert/strict';
import { adaptacionDe, etiquetaAdaptacion } from './adaptacion.ts';

// Derivación del estado, el único punto con rama.
assert.equal(adaptacionDe(['manhwa', 'novela']), 'ambos');
assert.equal(adaptacionDe(['novela', 'manhwa']), 'ambos'); // orden no importa
assert.equal(adaptacionDe(['manhwa']), 'solo_manhwa');
assert.equal(adaptacionDe(['novela']), 'solo_novela');
assert.equal(adaptacionDe([]), 'desconocido');

// Cada estado tiene frase en los dos idiomas que renderiza la ficha.
for (const a of ['ambos', 'solo_manhwa', 'solo_novela', 'desconocido'] as const) {
  assert.ok(etiquetaAdaptacion(a, 'es').length > 0, `ES vacío: ${a}`);
  assert.ok(etiquetaAdaptacion(a, 'en').length > 0, `EN vacío: ${a}`);
  assert.notEqual(etiquetaAdaptacion(a, 'es'), etiquetaAdaptacion(a, 'en'), `ES=EN: ${a}`);
}

console.log('adaptacion.test.ts OK');
