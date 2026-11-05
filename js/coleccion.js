// coleccion.js — Temas de colección (Pro, en prueba): 10 temas × 5 niveles.
// Los niveles se ganan con días registrados acumulados (seguidos o no). Nada baja ni se pierde.
// Un solo contador para los 10 temas. Cada nivel trae su fondo, su acento y su dibujo del brote.

import { ARTE } from './coleccion-arte.js';
import { COLECCIONES_IDS } from './esquema.js';

/** Días registrados para cada nivel (1 a 5). */
export const UMBRALES = [0, 10, 30, 75, 150];

/** Fondo y acento de cada nivel. El resto de los colores se calcula con contraste AA. */
const PALETAS = {
  minas: [['#1F2023', '#C9C2B4'], ['#141416', '#9FB0C0'], ['#1E2126', '#D5DAE0'], ['#18150F', '#E2B65A'], ['#090C12', '#CFE6FF']],
  condor: [['#F1EDE5', '#9A5B33'], ['#ECE6DB', '#8B5A34'], ['#E6DFD3', '#5E4636'], ['#262A33', '#E4DED2'], ['#12141A', '#E2B866']],
  cielo: [['#1E2540', '#F0B47A'], ['#1B2240', '#DDE2F2'], ['#111731', '#C9D3F5'], ['#0D1124', '#E3A35A'], ['#06080F', '#E9D9B0']],
  oceano: [['#0F2A3A', '#7FD0DE'], ['#0E2636', '#7FD0DE'], ['#0B2230', '#8FCB9A'], ['#0A1C2A', '#9FD8E3'], ['#061420', '#CFEFF2']],
  araucaria: [['#EEF0E8', '#5E6B48'], ['#E8EBE0', '#3F6B3B'], ['#DFE4D4', '#355E35'], ['#2C382B', '#A9C796'], ['#121A14', '#D9C487']],
  cumbre: [['#E9ECEE', '#3E4A55'], ['#DDE3E8', '#8A5212'], ['#2B3A48', '#E6EEF3'], ['#1E2A36', '#F2B66D'], ['#0F1822', '#F2B66D']],
  origami: [['#F3F1EC', '#6E675C'], ['#F0EDE6', '#6E675C'], ['#ECE8DF', '#5F5848'], ['#E8E3D8', '#5F5848'], ['#1A1A1C', '#C9A458']],
  arquitectura: [['#F2F1EC', '#5E5A52'], ['#1D3A5C', '#FFFFFF'], ['#DCD8CE', '#5C564C'], ['#D9D4CA', '#5C564C'], ['#121216', '#E9C77A']],
  navegante: [['#F0EEE8', '#3E4A5C'], ['#E9E4D6', '#5C5240'], ['#1C2B44', '#C8A35A'], ['#14213A', '#F2D9A0'], ['#0A1222', '#E6C47E']],
  panal: [['#F4EFE4', '#9A5A14'], ['#F1EADB', '#9A5A14'], ['#EDE4D2', '#8A5212'], ['#2A2116', '#E0A44A'], ['#17130B', '#F6CF7E']],
};

export const COLECCIONES = COLECCIONES_IDS;

/**
 * Acceso: los temas de colección son Pro. Durante la beta son gratis para todos.
 * Cuando exista Pro, basta con poner `gratisEnBeta: false` y revisar `disponible()`.
 */
export const ACCESO = { pro: true, gratisEnBeta: true };
export const disponible = (esPro = false) => !ACCESO.pro || ACCESO.gratisEnBeta || esPro;

/**
 * Animación al subir de nivel (dura menos de 2 s, sin sonido ni confeti; quieta con «reducir movimiento»).
 * brillo: la luz cruza las facetas · alas: se abren desde el cuerpo · estrellas: aparecen una a una ·
 * burbujas: sube y se mece · crecer: crece desde la raíz · ruta: se arma de abajo hacia la cima ·
 * plegar: se pliega en tres movimientos · trazar: las líneas se trazan y entra la luz ·
 * girar: la aguja da la vuelta y apunta al sur · llenar: las celdas se llenan una a una.
 */
export const ANIMACION = {
  minas: 'brillo', condor: 'alas', cielo: 'estrellas', oceano: 'burbujas', araucaria: 'crecer',
  cumbre: 'ruta', origami: 'plegar', arquitectura: 'trazar', navegante: 'girar', panal: 'llenar',
};

/** Nivel (1 a 5) que corresponde a una cantidad de días registrados. */
export function nivelDe(dias) {
  let n = 1;
  UMBRALES.forEach((u, i) => { if (dias >= u) n = i + 1; });
  return n;
}

/** El próximo nivel por ganar: { nivel, dias, faltan } o null si ya están los 5. */
export function proximoNivel(dias) {
  const n = nivelDe(dias);
  if (n >= UMBRALES.length) return null;
  return { nivel: n + 1, dias: UMBRALES[n], faltan: UMBRALES[n] - dias };
}

/* ---------- Colores ---------- */

const hexRgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const rgbHex = (c) => `#${c.map((v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0')).join('')}`;
/** Mezcla a con b: p = 0 da a, p = 1 da b. */
export const mezclar = (a, b, p) => { const x = hexRgb(a); const y = hexRgb(b); return rgbHex(x.map((v, i) => v + (y[i] - v) * p)); };
function luminancia(h) {
  return hexRgb(h).map((v) => { const s = v / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; })
    .reduce((acc, v, i) => acc + v * [0.2126, 0.7152, 0.0722][i], 0);
}
export function contraste(a, b) {
  const [x, y] = [luminancia(a), luminancia(b)].sort((m, n) => n - m);
  return (x + 0.05) / (y + 0.05);
}
/** Acerca `color` a `hacia` hasta que contraste `minimo` contra `fondo`. */
function asegurar(color, fondo, hacia, minimo) {
  let c = color;
  for (let p = 0.08; contraste(c, fondo) < minimo && p <= 1; p += 0.08) c = mezclar(color, hacia, p);
  return c;
}

const cachePaleta = new Map();
/** Todas las variables de color de un nivel (las mismas que usa styles.css). */
export function paletaDe(tema, nivel) {
  const clave = `${tema}|${nivel}`;
  if (cachePaleta.has(clave)) return cachePaleta.get(clave);
  const [fondo, acentoBase] = PALETAS[tema][nivel - 1];
  const oscuro = luminancia(fondo) < 0.2;
  const tinta = oscuro ? '#F0EEE8' : '#17181B';
  const sup = (p) => mezclar(fondo, tinta, p);
  const acento = asegurar(acentoBase, fondo, tinta, 3);
  const superficie = oscuro ? sup(0.06) : mezclar(fondo, '#FFFFFF', 0.55);
  const acentoTexto = asegurar(acentoBase, superficie, tinta, 4.5);
  const sobreAcento = contraste('#17181B', acento) >= contraste('#FFFFFF', acento) ? '#17181B' : '#FFFFFF';
  const capa = sup(0.1);
  const v = {
    oscuro,
    '--fondo': fondo,
    '--superficie': superficie,
    '--hundido': oscuro ? mezclar(fondo, '#000000', 0.25) : sup(0.05),
    '--capa': capa,
    '--linea': sup(0.16),
    '--linea-fuerte': asegurar(sup(0.42), fondo, tinta, 3),
    '--tinta': tinta,
    '--tinta-suave': asegurar(sup(0.72), superficie, tinta, 4.5),
    '--tinta-tenue': asegurar(sup(0.64), superficie, tinta, 4.5),
    '--principal': tinta,
    '--sobre-principal': fondo,
    '--acento': acento,
    '--acento-texto': acentoTexto,
    '--acento-fuerte': mezclar(acento, tinta, 0.2),
    '--acento-suave': mezclar(fondo, acento, 0.16),
    '--sobre-acento': sobreAcento,
    '--calor-0': capa,
    '--calor-1': mezclar(capa, acento, 0.25),
    '--calor-2': mezclar(capa, acento, 0.5),
    '--calor-3': mezclar(capa, acento, 0.75),
    '--calor-4': acento,
  };
  cachePaleta.set(clave, v);
  return v;
}

/* ---------- Dibujos ---------- */

const SVG = 'http://www.w3.org/2000/svg';
let instancia = 0;

function armar(nodo, padre, sufijo) {
  const [tag, attrs, hijos = []] = nodo;
  const n = document.createElementNS(SVG, tag);
  for (const [k, v] of Object.entries(attrs)) {
    // Cada dibujo lleva ids propios: así varios dibujos en la misma pantalla no se pisan los degradados.
    n.setAttribute(k, k === 'id' ? `${v}-${sufijo}` : v.replace(/url\(#([\w-]+)\)/g, `url(#$1-${sufijo})`));
  }
  for (const h of hijos) armar(h, n, sufijo);
  padre.append(n);
}

/**
 * El dibujo de un nivel. Con `progreso` (0 a 1) suma por fuera un anillo fino con el avance del día.
 */
export function dibujarColeccion(tema, nivel, { progreso = null, clase = 'coleccion-arte' } = {}) {
  const svg = document.createElementNS(SVG, 'svg');
  const conAnillo = progreso !== null;
  svg.setAttribute('viewBox', conAnillo ? '-6 -6 112 112' : '0 0 100 100');
  svg.setAttribute('class', clase);
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  const sufijo = `c${++instancia}`;
  for (const nodo of ARTE[tema][nivel - 1]) armar(nodo, svg, sufijo);
  if (conAnillo) {
    const pista = document.createElementNS(SVG, 'circle');
    for (const [k, v] of Object.entries({ cx: 50, cy: 50, r: 51.5, class: 'coleccion-arte__pista' })) pista.setAttribute(k, v);
    const anillo = document.createElementNS(SVG, 'circle');
    for (const [k, v] of Object.entries({ cx: 50, cy: 50, r: 51.5, class: 'coleccion-arte__anillo', pathLength: 100, transform: 'rotate(-90 50 50)', 'stroke-dasharray': `${progreso * 100} 100` })) anillo.setAttribute(k, v);
    svg.prepend(pista);
    svg.append(anillo);
  }
  return svg;
}

/** Fondo de una baldosa (para la colección y la celebración). */
export const fondoDe = (tema, nivel) => PALETAS[tema][nivel - 1][0];
