// importar/diagnostico.js — Resumen de lo que trae un archivo, sin interpretarlo todavía.
// Sirve para dos cosas: la página «Revisar un archivo» (probar los lectores en un teléfono real)
// y, en I2, mirar las muestras antes de escribir cada importador.
// Solo devuelve estructura: rutas, tamaños, codificación, delimitador, nombres de columnas,
// formatos de fecha y conteos. Nunca el contenido de las celdas.

import { LIMITES_IMPORT } from './errores.js';
import { decodificar } from './texto.js';
import { comoTabla, detectarDecimal, parsearCSV } from './csv.js';
import { esObjetoJSON, parsearJSON } from './json.js';
import { detectarFormatoFecha } from './fechas.js';
import { detectarTipo } from './leer.js';

const MAX_COLUMNAS = 60;
const MAX_CLAVES = 40;
const LARGO_NOMBRE = 60;

/**
 * @param {{ tipo: string, hash: string, entradas: {ruta: string, bytes: Uint8Array}[], rechazadas: number, tamano: number }} c
 * @returns {{ tipo, hash, tamano, rechazadas, archivos: object[] }}
 */
export function diagnosticar(c, { limites = LIMITES_IMPORT } = {}) {
  return {
    tipo: c.tipo,
    hash: c.hash,
    tamano: c.tamano,
    rechazadas: c.rechazadas,
    archivos: c.entradas.map((e) => describirEntrada(e, limites)),
  };
}

function describirEntrada({ ruta, bytes }, limites) {
  const info = { ruta, tamano: bytes.length, tipo: detectarTipo(bytes) };
  try {
    if (info.tipo === 'csv') Object.assign(info, describirCSV(bytes, limites));
    else if (info.tipo === 'json') Object.assign(info, describirJSON(bytes, limites));
  } catch (e) {
    info.error = typeof e?.codigo === 'string' ? e.codigo : 'inesperado';
  }
  return info;
}

function describirCSV(bytes, limites) {
  const { texto, codificacion, bom } = decodificar(bytes);
  const { filas, delimitador, advertencias } = parsearCSV(texto, { limites });
  if (filas.length === 0) return { codificacion, bom, delimitador, filas: 0, columnas: [], advertencias };
  const t = comoTabla(filas);
  const columnas = t.cabecera.slice(0, MAX_COLUMNAS).map((nombre, i) => {
    const valores = [];
    let vacias = 0;
    for (const f of t.filas) {
      const v = f[i].trim();
      if (v) valores.push(v); else vacias++;
    }
    const col = { nombre: nombre.slice(0, LARGO_NOMBRE), vacias };
    const fecha = detectarFormatoFecha(valores);
    const fechasValidas = valores.length - fecha.invalidas;
    if (valores.length && fechasValidas / valores.length >= 0.9 && (fecha.formato || fecha.ambiguo)) {
      col.fecha = { formato: fecha.formato, ambiguo: fecha.ambiguo, conHora: fecha.conHora };
    } else {
      col.distintos = contarDistintos(valores);
      const dec = detectarDecimal(valores);
      if (dec.separador || dec.ambiguo) col.decimal = dec;
    }
    return col;
  });
  return {
    codificacion, bom, delimitador,
    filas: t.filas.length,
    totalColumnas: t.cabecera.length,
    columnas,
    advertencias: [...advertencias, ...t.advertencias],
  };
}

/** Cuántos valores distintos hay (hasta 50): distingue una columna de estados (pocos) de una de notas. */
function contarDistintos(valores) {
  const s = new Set();
  for (const v of valores) { s.add(v); if (s.size > 50) return '50+'; }
  return s.size;
}

function describirJSON(bytes, limites) {
  const { codificacion } = decodificar(bytes);
  const v = parsearJSON(decodificar(bytes).texto, { limites });
  return { codificacion, forma: forma(v, 0) };
}

/** Esqueleto del JSON: tipos y nombres de claves (dos niveles), sin valores. */
function forma(v, nivel) {
  if (Array.isArray(v)) return { tipo: 'lista', largo: v.length, elemento: v.length && nivel < 2 ? forma(v[0], nivel + 1) : null };
  if (esObjetoJSON(v)) {
    const claves = Object.keys(v);
    return {
      tipo: 'objeto',
      claves: claves.slice(0, MAX_CLAVES).map((k) => ({
        nombre: k.slice(0, LARGO_NOMBRE),
        valor: nivel < 2 ? forma(v[k], nivel + 1) : { tipo: tipoDe(v[k]) },
      })),
      totalClaves: claves.length,
    };
  }
  return { tipo: tipoDe(v) };
}

const tipoDe = (v) => (v === null ? 'nulo' : Array.isArray(v) ? 'lista' : typeof v === 'object' ? 'objeto' : typeof v === 'number' ? 'número' : typeof v === 'boolean' ? 'sí/no' : 'texto');
