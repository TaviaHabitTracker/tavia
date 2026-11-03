// importar/zip.js — Lector mínimo de zip, sin dependencias.
// Solo lo necesario para archivos exportados por apps: métodos 0 (stored) y 8 (deflate),
// un solo disco, sin cifrado, sin ZIP64. Descomprime con DecompressionStream('deflate-raw').
//
// Defensas (el archivo es entrada hostil):
// - Directorio central dentro del archivo, entradas que no se pisan (bomba por superposición).
// - Límite de entradas, de tamaño por entrada y total, y de relación de compresión.
// - Los tamaños declarados no se creen: la descompresión se corta al pasar el declarado o el límite.
// - CRC-32 verificado al terminar cada entrada.
// - Rutas con '..', absolutas, con letra de unidad o caracteres de control se rechazan (zip slip),
//   aunque aquí nunca se escriba en disco.

import { ErrorImport, LIMITES_IMPORT, revisarCancelacion } from './errores.js';

const FIRMA_EOCD = 0x06054b50;
const FIRMA_CENTRAL = 0x02014b50;
const FIRMA_LOCAL = 0x04034b50;

/** ¿Este navegador puede descomprimir zip? (si no, la interfaz ofrece elegir la carpeta) */
export function soportaZip() {
  if (typeof DecompressionStream === 'undefined') return false;
  try {
    new DecompressionStream('deflate-raw');
    return true;
  } catch {
    return false;
  }
}

/* ---------- CRC-32 ---------- */

let TABLA_CRC;
export function crc32(bytes) {
  if (!TABLA_CRC) {
    TABLA_CRC = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      TABLA_CRC[n] = c >>> 0;
    }
  }
  let crc = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) crc = TABLA_CRC[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

/* ---------- Directorio ---------- */

/**
 * Lee el directorio central y valida todo lo que se puede validar sin descomprimir.
 * @returns {{ entradas: Entrada[], rechazadas: number }}
 * Entrada = { ruta, metodo, crc, comprimido, tamano, inicio } (inicio = primer byte de datos)
 */
export function listarZip(bytes, { limites = LIMITES_IMPORT } = {}) {
  if (!(bytes instanceof Uint8Array)) throw new ErrorImport('zip_invalido');
  const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const eocd = buscarEOCD(v);
  const disco = v.getUint16(eocd + 4, true);
  const discoCD = v.getUint16(eocd + 6, true);
  const enDisco = v.getUint16(eocd + 8, true);
  const total = v.getUint16(eocd + 10, true);
  const tamCD = v.getUint32(eocd + 12, true);
  const inicioCD = v.getUint32(eocd + 16, true);
  if (disco !== 0 || discoCD !== 0 || enDisco !== total) throw new ErrorImport('zip_multidisco');
  if (total === 0xffff || tamCD === 0xffffffff || inicioCD === 0xffffffff) throw new ErrorImport('zip64');
  if (total > limites.entradas) throw new ErrorImport('zip_muchas_entradas', { max: limites.entradas });
  if (inicioCD + tamCD > eocd) throw new ErrorImport('zip_corrupto');

  const entradas = [];
  let rechazadas = 0;
  let p = inicioCD;
  let declarado = 0;
  for (let k = 0; k < total; k++) {
    if (p + 46 > eocd || v.getUint32(p, true) !== FIRMA_CENTRAL) throw new ErrorImport('zip_corrupto');
    const flags = v.getUint16(p + 8, true);
    const metodo = v.getUint16(p + 10, true);
    const crc = v.getUint32(p + 16, true);
    const comprimido = v.getUint32(p + 20, true);
    const tamano = v.getUint32(p + 24, true);
    const largoNombre = v.getUint16(p + 28, true);
    const largoExtra = v.getUint16(p + 30, true);
    const largoComentario = v.getUint16(p + 32, true);
    const offsetLocal = v.getUint32(p + 42, true);
    const finNombre = p + 46 + largoNombre;
    if (finNombre + largoExtra + largoComentario > eocd) throw new ErrorImport('zip_corrupto');
    const ruta = decodificarNombre(bytes.subarray(p + 46, finNombre), (flags & 0x0800) !== 0);
    p = finNombre + largoExtra + largoComentario;

    if (comprimido === 0xffffffff || tamano === 0xffffffff || offsetLocal === 0xffffffff) throw new ErrorImport('zip64');
    if (ruta === null) { rechazadas++; continue; } // ruta peligrosa: se ignora y se cuenta
    if (ruta.endsWith('/')) continue; // carpeta
    if (flags & 0x0001) throw new ErrorImport('zip_cifrado');
    if (metodo !== 0 && metodo !== 8) throw new ErrorImport('zip_metodo');
    if (metodo === 0 && comprimido !== tamano) throw new ErrorImport('zip_corrupto');
    if (tamano > limites.entrada) throw new ErrorImport('zip_entrada_grande', { max: limites.entrada });
    if (tamano >= limites.ratioDesde && tamano > comprimido * limites.ratio) throw new ErrorImport('zip_bomba');
    declarado += tamano;
    if (declarado > limites.descomprimido) throw new ErrorImport('zip_grande', { max: limites.descomprimido });

    // Cabecera local: su nombre y su extra pueden medir distinto que en el directorio central.
    if (offsetLocal + 30 > inicioCD || v.getUint32(offsetLocal, true) !== FIRMA_LOCAL) throw new ErrorImport('zip_corrupto');
    const inicio = offsetLocal + 30 + v.getUint16(offsetLocal + 26, true) + v.getUint16(offsetLocal + 28, true);
    if (inicio + comprimido > inicioCD) throw new ErrorImport('zip_corrupto');
    entradas.push({ ruta, metodo, crc, comprimido, tamano, inicio, offsetLocal });
  }

  // Ninguna entrada puede compartir bytes con otra (así se arman las bombas de zip "planas").
  const orden = [...entradas].sort((a, b) => a.offsetLocal - b.offsetLocal);
  for (let k = 1; k < orden.length; k++) {
    if (orden[k].offsetLocal < orden[k - 1].inicio + orden[k - 1].comprimido) throw new ErrorImport('zip_superpuesto');
  }
  const rutas = new Set();
  for (const e of entradas) {
    const clave = e.ruta.toLowerCase();
    if (rutas.has(clave)) throw new ErrorImport('zip_ruta_repetida');
    rutas.add(clave);
  }
  return { entradas: entradas.map(({ offsetLocal, ...e }) => e), rechazadas };
}

function buscarEOCD(v) {
  const n = v.byteLength;
  if (n < 22) throw new ErrorImport('zip_corrupto');
  const desde = Math.max(0, n - 22 - 0xffff);
  for (let i = n - 22; i >= desde; i--) {
    if (v.getUint32(i, true) === FIRMA_EOCD && i + 22 + v.getUint16(i + 20, true) === n) return i;
  }
  throw new ErrorImport('zip_corrupto');
}

/**
 * Nombre de entrada → ruta con '/' o null si es peligrosa.
 * Sin la marca UTF-8 el estándar dice CP437; en la práctica los nombres que importan son ASCII
 * o UTF-8 sin marca, así que se lee como UTF-8 tolerante.
 */
function decodificarNombre(crudo, _utf8) {
  const nombre = new TextDecoder('utf-8').decode(crudo).replace(/\\/g, '/');
  return rutaSegura(nombre);
}

export function rutaSegura(nombre) {
  if (!nombre || nombre.length > 512) return null;
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u001f\u007f]/.test(nombre)) return null;
  if (nombre.startsWith('/') || /^[a-zA-Z]:/.test(nombre)) return null;
  const partes = nombre.split('/');
  if (partes.some((s) => s === '..' || s === '.')) return null;
  if (partes.slice(0, -1).some((s) => s === '')) return null; // 'a//b'
  return nombre;
}

/* ---------- Contenido ---------- */

/**
 * Descomprime una entrada con tope de tamaño y verifica su CRC.
 * @param {Uint8Array} bytes  el zip completo
 * @param {object} entrada    una de listarZip().entradas
 * @param {{ senal?: AbortSignal, limites?: object }} [op]
 * @returns {Promise<Uint8Array>}
 */
export async function extraerEntrada(bytes, entrada, { senal, limites = LIMITES_IMPORT } = {}) {
  revisarCancelacion(senal);
  const datos = bytes.subarray(entrada.inicio, entrada.inicio + entrada.comprimido);
  let salida;
  if (entrada.metodo === 0) salida = datos.slice();
  else salida = await inflar(datos, Math.min(entrada.tamano, limites.entrada), senal);
  if (salida.length !== entrada.tamano || crc32(salida) !== entrada.crc) throw new ErrorImport('zip_corrupto');
  return salida;
}

async function inflar(datos, tope, senal) {
  if (!soportaZip()) throw new ErrorImport('zip_sin_soporte');
  const ds = new DecompressionStream('deflate-raw');
  const escritor = ds.writable.getWriter();
  // La escritura falla en paralelo si los datos están dañados; el error real llega por el lector.
  escritor.write(datos).then(() => escritor.close()).catch(() => {});
  const lector = ds.readable.getReader();
  const trozos = [];
  let total = 0;
  try {
    for (;;) {
      revisarCancelacion(senal);
      const { value, done } = await lector.read();
      if (done) break;
      total += value.length;
      if (total > tope) throw new ErrorImport('zip_bomba');
      trozos.push(value);
    }
  } catch (e) {
    lector.cancel().catch(() => {});
    if (e instanceof ErrorImport) throw e;
    throw new ErrorImport('zip_corrupto');
  }
  const salida = new Uint8Array(total);
  let p = 0;
  for (const t of trozos) { salida.set(t, p); p += t.length; }
  return salida;
}

/**
 * Lista y extrae todas las entradas (o las que pase el filtro), respetando el total descomprimido.
 * @returns {Promise<{ entradas: {ruta: string, bytes: Uint8Array}[], rechazadas: number }>}
 */
export async function leerZip(bytes, { filtro = () => true, senal, limites = LIMITES_IMPORT, alProgreso } = {}) {
  const { entradas, rechazadas } = listarZip(bytes, { limites });
  const elegidas = entradas.filter((e) => filtro(e.ruta));
  const salida = [];
  let total = 0;
  for (let k = 0; k < elegidas.length; k++) {
    const contenido = await extraerEntrada(bytes, elegidas[k], { senal, limites });
    total += contenido.length;
    if (total > limites.descomprimido) throw new ErrorImport('zip_grande', { max: limites.descomprimido });
    salida.push({ ruta: elegidas[k].ruta, bytes: contenido });
    alProgreso?.((k + 1) / elegidas.length);
  }
  return { entradas: salida, rechazadas };
}
