// importar/texto.js — Bytes → texto, detectando la codificación.
// Orden: BOM (UTF-8, UTF-16) → UTF-8 estricto → Windows-1252.
// Nota: para el estándar WHATWG que siguen los navegadores, la etiqueta 'iso-8859-1' ES
// windows-1252 (superconjunto). Por eso no se intenta distinguir las dos: se decodifica con
// windows-1252 y se informa así. Un CSV de Excel en español casi siempre es una de estas.

import { ErrorImport } from './errores.js';

/**
 * @param {Uint8Array} bytes
 * @returns {{ texto: string, codificacion: 'utf-8'|'utf-16le'|'utf-16be'|'windows-1252', bom: boolean }}
 */
export function decodificar(bytes) {
  if (!(bytes instanceof Uint8Array)) throw new ErrorImport('texto_invalido');
  if (bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
    return { texto: utf8Estricto(bytes.subarray(3)), codificacion: 'utf-8', bom: true };
  }
  if (bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xfe) {
    return { texto: limpiarNulos(new TextDecoder('utf-16le').decode(bytes.subarray(2))), codificacion: 'utf-16le', bom: true };
  }
  if (bytes.length >= 2 && bytes[0] === 0xfe && bytes[1] === 0xff) {
    return { texto: limpiarNulos(new TextDecoder('utf-16be').decode(bytes.subarray(2))), codificacion: 'utf-16be', bom: true };
  }
  try {
    return { texto: utf8Estricto(bytes), codificacion: 'utf-8', bom: false };
  } catch (e) {
    if (e?.codigo === 'texto_binario') throw e;
    return { texto: limpiarNulos(new TextDecoder('windows-1252').decode(bytes)), codificacion: 'windows-1252', bom: false };
  }
}

function utf8Estricto(bytes) {
  return limpiarNulos(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
}

/** Un texto con caracteres nulos no es un CSV ni un JSON: es un binario o un archivo dañado. */
function limpiarNulos(texto) {
  if (texto.includes('\u0000')) throw new ErrorImport('texto_binario');
  return texto;
}

/** ¿Parecen texto los primeros bytes? (sin nulos y casi sin caracteres de control) */
export function pareceTexto(bytes, muestra = 4096) {
  const n = Math.min(bytes.length, muestra);
  if (n === 0) return false;
  if (n >= 2 && ((bytes[0] === 0xff && bytes[1] === 0xfe) || (bytes[0] === 0xfe && bytes[1] === 0xff))) return true;
  let raros = 0;
  for (let i = 0; i < n; i++) {
    const b = bytes[i];
    if (b === 0) return false;
    if (b < 0x09 || (b > 0x0d && b < 0x20)) raros++;
  }
  return raros / n < 0.01;
}
