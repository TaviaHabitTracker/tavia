// importar/json.js — JSON de entrada hostil.
// - Profundidad y tamaño acotados ANTES de parsear (un JSON muy anidado revienta la pila).
// - Rechaza las claves __proto__, constructor y prototype en cualquier nivel.
// - Todos los objetos resultantes son sin prototipo (Object.create(null)): ni siquiera un
//   spread o un Object.assign posterior puede contaminar Object.prototype.

import { ErrorImport, LIMITES_IMPORT } from './errores.js';

const PROHIBIDAS = new Set(['__proto__', 'constructor', 'prototype']);

/**
 * @param {string} texto
 * @param {{ limites?: object }} [op]
 * @returns {unknown} valor con objetos sin prototipo
 */
export function parsearJSON(texto, { limites = LIMITES_IMPORT } = {}) {
  if (typeof texto !== 'string') throw new ErrorImport('json_invalido');
  if (texto.charCodeAt(0) === 0xfeff) texto = texto.slice(1);
  if (texto.length > limites.archivo) throw new ErrorImport('archivo_grande', { max: limites.archivo });
  revisarProfundidad(texto, limites.jsonProfundidad);
  let nodos = 0;
  let valor;
  try {
    valor = JSON.parse(texto, function (clave, v) {
      if (++nodos > limites.jsonNodos) throw new ErrorImport('json_grande', { max: limites.jsonNodos });
      if (PROHIBIDAS.has(clave)) throw new ErrorImport('json_clave_prohibida');
      if (v !== null && typeof v === 'object' && !Array.isArray(v)) {
        const limpio = Object.create(null);
        for (const k of Object.keys(v)) {
          if (PROHIBIDAS.has(k)) throw new ErrorImport('json_clave_prohibida');
          limpio[k] = v[k];
        }
        return limpio;
      }
      return v;
    });
  } catch (e) {
    if (e instanceof ErrorImport) throw e;
    throw new ErrorImport('json_invalido');
  }
  return valor;
}

/**
 * Recorre el texto contando corchetes y llaves fuera de strings. O(n), sin recursión.
 * JSON.parse no crea la clave "__proto__" como prototipo, pero el reviver se ejecuta de abajo
 * hacia arriba: con 100 000 niveles la pila revienta antes. Por eso se mira primero.
 */
function revisarProfundidad(texto, max) {
  let prof = 0, enString = false;
  for (let i = 0; i < texto.length; i++) {
    const c = texto.charCodeAt(i);
    if (enString) {
      if (c === 92) i++; // barra invertida: salta el carácter escapado
      else if (c === 34) enString = false;
      continue;
    }
    if (c === 34) enString = true;
    else if (c === 123 || c === 91) { if (++prof > max) throw new ErrorImport('json_profundo', { max }); }
    else if (c === 125 || c === 93) prof--;
  }
}

/** ¿Es un objeto (de los que devuelve parsearJSON) y no un arreglo ni null? */
export const esObjetoJSON = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
