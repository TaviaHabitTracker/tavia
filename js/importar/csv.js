// importar/csv.js — Parser CSV propio (RFC 4180) y ayudantes de números.
// - Comillas dobles, comillas escapadas ("") y saltos de línea dentro de campos.
// - Fin de línea CRLF, LF o CR.
// - Delimitador detectado: coma, punto y coma (Excel con configuración regional latina) o tabulación.
// - Una comilla en medio de un campo sin comillas se toma literal (como hace Excel), con advertencia.
// - Una comilla que nunca se cierra es un archivo dañado: se rechaza, no se adivina.
// Las filas son arreglos de strings: nunca se crean objetos con claves que vengan del archivo.

import { ErrorImport, LIMITES_IMPORT } from './errores.js';

export const DELIMITADORES = [',', ';', '\t'];

/**
 * @param {string} texto
 * @param {{ delimitador?: string, limites?: object, maxFilas?: number }} [op]
 * @returns {{ filas: string[][], delimitador: string, advertencias: {codigo: string, n: number}[] }}
 */
export function parsearCSV(texto, { delimitador, limites = LIMITES_IMPORT, maxFilas } = {}) {
  if (typeof texto !== 'string') throw new ErrorImport('csv_invalido');
  if (texto.charCodeAt(0) === 0xfeff) texto = texto.slice(1);
  const d = delimitador ?? detectarDelimitador(texto);
  if (!DELIMITADORES.includes(d)) throw new ErrorImport('csv_delimitador');
  const tope = Math.min(maxFilas ?? Infinity, limites.filas);
  const filas = [];
  const avisos = new Map();
  const avisar = (c) => avisos.set(c, (avisos.get(c) || 0) + 1);

  let fila = [];
  let campo = '';
  let enComillas = false;
  let campoConComillas = false; // el campo empezó con comilla
  let i = 0;
  const n = texto.length;

  const cerrarCampo = () => {
    if (campo.length > limites.celda) throw new ErrorImport('csv_celda_larga', { max: limites.celda });
    fila.push(campo);
    if (fila.length > limites.columnas) throw new ErrorImport('csv_muchas_columnas', { max: limites.columnas });
    campo = '';
    campoConComillas = false;
  };
  const cerrarFila = () => {
    const conComillas = campoConComillas;
    cerrarCampo();
    // Una línea vacía (un solo campo vacío sin comillas) no es una fila.
    if (!(fila.length === 1 && fila[0] === '' && !conComillas)) {
      if (filas.length >= tope) return false;
      filas.push(fila);
    }
    fila = [];
    return true;
  };

  while (i < n) {
    const c = texto[i];
    if (enComillas) {
      if (c === '"') {
        if (texto[i + 1] === '"') { campo += '"'; i += 2; continue; }
        enComillas = false; i++;
        // Tras cerrar comillas solo puede venir delimitador o fin de línea; otra cosa se pega (con aviso).
        const sig = texto[i];
        if (i < n && sig !== d && sig !== '\n' && sig !== '\r') avisar('csv_texto_tras_comillas');
        continue;
      }
      campo += c;
      if (campo.length > limites.celda) throw new ErrorImport('csv_celda_larga', { max: limites.celda });
      i++;
      continue;
    }
    if (c === '"') {
      if (campo === '' && !campoConComillas) { enComillas = true; campoConComillas = true; i++; continue; }
      avisar('csv_comilla_suelta');
      campo += c; i++;
      continue;
    }
    if (c === d) { cerrarCampo(); i++; continue; }
    if (c === '\r' || c === '\n') {
      if (c === '\r' && texto[i + 1] === '\n') i++;
      i++;
      if (!cerrarFila()) { avisar('csv_filas_recortadas'); return resultado(); }
      continue;
    }
    campo += c;
    if (campo.length > limites.celda) throw new ErrorImport('csv_celda_larga', { max: limites.celda });
    i++;
  }
  if (enComillas) throw new ErrorImport('csv_comilla_abierta');
  if (campo !== '' || fila.length > 0 || campoConComillas) {
    if (!cerrarFila()) avisar('csv_filas_recortadas');
  }
  return resultado();

  function resultado() {
    if (maxFilas === undefined && filas.length >= limites.filas && i < n) {
      throw new ErrorImport('csv_muchas_filas', { max: limites.filas });
    }
    return { filas, delimitador: d, advertencias: [...avisos].map(([codigo, cant]) => ({ codigo, n: cant })) };
  }
}

/**
 * Elige el delimitador con las primeras líneas: el que da más filas con el mismo número de
 * columnas (y más de una columna). Empate → el orden de DELIMITADORES (coma primero).
 */
export function detectarDelimitador(texto, lineas = 50) {
  let mejor = ',', puntaje = -1;
  for (const d of DELIMITADORES) {
    let filas;
    try {
      filas = parsearCSV(texto, { delimitador: d, maxFilas: lineas }).filas;
    } catch {
      continue;
    }
    if (filas.length === 0) continue;
    const cuentas = new Map();
    for (const f of filas) cuentas.set(f.length, (cuentas.get(f.length) || 0) + 1);
    let moda = 1, veces = 0;
    for (const [k, v] of cuentas) if (v > veces || (v === veces && k > moda)) { moda = k; veces = v; }
    if (moda < 2) continue;
    const p = veces / filas.length + moda / 1000; // consistencia primero, columnas como desempate
    if (p > puntaje) { puntaje = p; mejor = d; }
  }
  return mejor;
}

/** Cabecera comparable: minúsculas, sin tildes, espacios simples. */
export function normalizarClave(s) {
  return String(s ?? '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/\s+/g, ' ').trim();
}

/**
 * Filas → tabla con cabecera. Rellena las filas cortas con '' y recorta las largas (avisando).
 * @returns {{ cabecera: string[], claves: string[], filas: string[][], advertencias: {codigo: string, n: number}[] }}
 */
export function comoTabla(filas) {
  if (!Array.isArray(filas) || filas.length === 0) throw new ErrorImport('csv_vacio');
  const cabecera = filas[0].map((c) => c.trim());
  const claves = cabecera.map(normalizarClave);
  const ancho = cabecera.length;
  let cortas = 0, largas = 0;
  const cuerpo = [];
  for (let k = 1; k < filas.length; k++) {
    const f = filas[k];
    if (f.length < ancho) { cortas++; cuerpo.push([...f, ...Array(ancho - f.length).fill('')]); }
    else if (f.length > ancho) {
      // Columnas sobrantes vacías (p. ej. un ';' final de Excel) no merecen aviso.
      if (f.slice(ancho).some((v) => v.trim() !== '')) largas++;
      cuerpo.push(f.slice(0, ancho));
    } else cuerpo.push(f);
  }
  const advertencias = [];
  if (cortas) advertencias.push({ codigo: 'csv_columnas_faltantes', n: cortas });
  if (largas) advertencias.push({ codigo: 'csv_columnas_sobrantes', n: largas });
  return { cabecera, claves, filas: cuerpo, advertencias };
}

/* ---------- Números ---------- */

const RE_COMA = /^[-+]?\d+,\d+$/; // 12,5
const RE_PUNTO = /^[-+]?\d+\.\d+$/; // 12.5
const RE_MILES_PUNTO_COMA = /^[-+]?\d{1,3}(\.\d{3})+(,\d+)?$/; // 1.234,5
const RE_MILES_COMA_PUNTO = /^[-+]?\d{1,3}(,\d{3})+(\.\d+)?$/; // 1,234.5

/**
 * Detecta el separador decimal mirando valores numéricos de una columna.
 * '1,234' solo (tres decimales) es ambiguo: no decide nada.
 * @returns {{ separador: ','|'.'|null, ambiguo: boolean }}
 */
export function detectarDecimal(valores) {
  let coma = 0, punto = 0, ambiguos = 0;
  for (const bruto of valores) {
    const v = String(bruto ?? '').trim();
    if (!v || /^[-+]?\d+$/.test(v)) continue;
    // '1,234' o '1.234' puede ser miles o decimales; '0,125' no (nadie escribe miles con 0 adelante).
    const tres = /[.,]\d{3}$/.test(v) && !/[.,].*[.,]/.test(v) && !/^[-+]?0[.,]/.test(v);
    if (tres) { ambiguos++; continue; }
    if (RE_COMA.test(v) || (RE_MILES_PUNTO_COMA.test(v) && v.includes(','))) coma++;
    else if (RE_PUNTO.test(v) || (RE_MILES_COMA_PUNTO.test(v) && v.includes('.'))) punto++;
  }
  if (coma && !punto) return { separador: ',', ambiguo: false };
  if (punto && !coma) return { separador: '.', ambiguo: false };
  if (coma && punto) return { separador: null, ambiguo: true };
  return { separador: null, ambiguo: ambiguos > 0 };
}

/**
 * Convierte un texto en número finito con el separador decimal indicado. null si no es un número.
 * Con separador null solo acepta enteros y números con punto sin miles.
 */
export function parsearNumero(bruto, separador = '.') {
  const v = String(bruto ?? '').trim().replace(/\s/g, '');
  if (!v || v.length > 40) return null;
  let limpio;
  if (/^[-+]?\d+$/.test(v)) limpio = v;
  else if (separador === ',') {
    if (RE_COMA.test(v)) limpio = v.replace(',', '.');
    else if (RE_MILES_PUNTO_COMA.test(v)) limpio = v.replace(/\./g, '').replace(',', '.');
    else return null;
  } else {
    if (RE_PUNTO.test(v)) limpio = v;
    else if (separador === '.' && RE_MILES_COMA_PUNTO.test(v)) limpio = v.replace(/,/g, '');
    else return null;
  }
  const num = Number(limpio);
  return Number.isFinite(num) ? num : null;
}
