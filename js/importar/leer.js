// importar/leer.js — Etapas 1 y 2 de la tubería: LEER y EXTRAER.
// Lee el archivo elegido (o la carpeta descomprimida) en memoria con límites, detecta su tipo
// por el CONTENIDO (nunca por la extensión), calcula su huella SHA-256 y devuelve las entradas
// listas para que cada fuente (Loop, HabitNow, …) las normalice.
// Nada sale del dispositivo. El nombre del archivo no se guarda en ningún lado.

import { ErrorImport, LIMITES_IMPORT, revisarCancelacion } from './errores.js';
import { pareceTexto } from './texto.js';
import { leerZip, rutaSegura } from './zip.js';

const SQLITE = 'SQLite format 3\u0000';

/**
 * @param {Uint8Array} bytes
 * @returns {'zip'|'sqlite'|'json'|'csv'|'desconocido'}
 */
export function detectarTipo(bytes) {
  if (!(bytes instanceof Uint8Array) || bytes.length === 0) return 'desconocido';
  if (bytes.length >= 4 && bytes[0] === 0x50 && bytes[1] === 0x4b
    && ((bytes[2] === 3 && bytes[3] === 4) || (bytes[2] === 5 && bytes[3] === 6))) return 'zip';
  if (bytes.length >= 16 && [...SQLITE].every((c, i) => bytes[i] === c.charCodeAt(0))) return 'sqlite';
  if (!pareceTexto(bytes)) return 'desconocido';
  // Primer carácter significativo (salta BOM UTF-8 y espacios).
  let i = bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf ? 3 : 0;
  while (i < bytes.length && (bytes[i] === 0x20 || bytes[i] === 0x09 || bytes[i] === 0x0a || bytes[i] === 0x0d)) i++;
  if (bytes[i] === 0x7b || bytes[i] === 0x5b) return 'json'; // { o [
  return 'csv';
}

/** Huella SHA-256 en hexadecimal (para "este archivo ya se importó"). */
export async function huella(bytes) {
  const h = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(h)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Lee un archivo (File/Blob) y lo abre.
 * @returns {Promise<Contenedor>}
 * Contenedor = { tipo, hash, entradas: {ruta, bytes}[], rechazadas, tamano }
 *  - zip: una entrada por archivo interno (rutas ya validadas)
 *  - csv / json: una sola entrada con ruta ''
 *  - sqlite: sin entradas (I2: se pide el CSV; ver el plan)
 */
export async function abrirArchivo(archivo, { senal, limites = LIMITES_IMPORT, alProgreso } = {}) {
  if (!archivo || typeof archivo.size !== 'number' || typeof archivo.arrayBuffer !== 'function') {
    throw new ErrorImport('archivo_invalido');
  }
  if (archivo.size === 0) throw new ErrorImport('archivo_vacio');
  if (archivo.size > limites.archivo) throw new ErrorImport('archivo_grande', { max: limites.archivo });
  revisarCancelacion(senal);
  const bytes = new Uint8Array(await archivo.arrayBuffer());
  // El tamaño real manda (un Blob raro podría declarar otro).
  if (bytes.length > limites.archivo) throw new ErrorImport('archivo_grande', { max: limites.archivo });
  return abrirBytes(bytes, { senal, limites, alProgreso });
}

/** Igual que abrirArchivo pero con los bytes ya en memoria (pruebas, worker). */
export async function abrirBytes(bytes, { senal, limites = LIMITES_IMPORT, alProgreso } = {}) {
  if (bytes.length === 0) throw new ErrorImport('archivo_vacio');
  const tipo = detectarTipo(bytes);
  const hash = await huella(bytes);
  revisarCancelacion(senal);
  if (tipo === 'desconocido') throw new ErrorImport('archivo_desconocido');
  if (tipo === 'sqlite') return { tipo, hash, entradas: [], rechazadas: 0, tamano: bytes.length };
  if (tipo === 'zip') {
    const { entradas, rechazadas } = await leerZip(bytes, { senal, limites, alProgreso });
    if (entradas.length === 0) throw new ErrorImport('zip_vacio');
    return { tipo, hash, entradas, rechazadas, tamano: bytes.length };
  }
  return { tipo, hash, entradas: [{ ruta: '', bytes }], rechazadas: 0, tamano: bytes.length };
}

/**
 * Alternativa sin zip: el usuario elige la carpeta ya descomprimida (input webkitdirectory)
 * o varios CSV sueltos. Mismos límites que un zip. La huella se calcula sobre el contenido
 * ordenado por ruta, así la misma carpeta da siempre la misma huella.
 * @param {ArrayLike<File>} archivos
 */
export async function abrirCarpeta(archivos, { senal, limites = LIMITES_IMPORT } = {}) {
  const lista = Array.from(archivos ?? []);
  if (lista.length === 0) throw new ErrorImport('archivo_vacio');
  if (lista.length > limites.entradas) throw new ErrorImport('zip_muchas_entradas', { max: limites.entradas });
  let total = 0, rechazadas = 0;
  const entradas = [];
  const rutas = new Set();
  for (const a of lista) {
    revisarCancelacion(senal);
    const ruta = rutaSegura(String(a.webkitRelativePath || a.name || '').replace(/\\/g, '/'));
    if (!ruta) { rechazadas++; continue; }
    if (a.size > limites.entrada) throw new ErrorImport('zip_entrada_grande', { max: limites.entrada });
    total += a.size;
    if (total > limites.descomprimido) throw new ErrorImport('zip_grande', { max: limites.descomprimido });
    if (rutas.has(ruta.toLowerCase())) continue;
    rutas.add(ruta.toLowerCase());
    entradas.push({ ruta, bytes: new Uint8Array(await a.arrayBuffer()) });
  }
  if (entradas.length === 0) throw new ErrorImport('archivo_vacio');
  entradas.sort((x, y) => (x.ruta < y.ruta ? -1 : x.ruta > y.ruta ? 1 : 0));
  const enc = new TextEncoder();
  const partes = entradas.flatMap((e) => [enc.encode(`${e.ruta}\u0000${e.bytes.length}\u0000`), e.bytes]);
  const unido = new Uint8Array(partes.reduce((s, p) => s + p.length, 0));
  let p = 0;
  for (const x of partes) { unido.set(x, p); p += x.length; }
  return { tipo: 'carpeta', hash: await huella(unido), entradas, rechazadas, tamano: total };
}
