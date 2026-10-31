// tarjeta-anual.js — Dibuja "Tu año en Tavia" en un canvas de 1080×1920 (formato historia).
// Usa los colores de la paleta activa (los lee de las variables CSS), así la imagen combina con tu tema.
// Solo texto dibujado con fillText: nada del usuario se interpreta como HTML.

import { TRAZOS_SIMBOLO } from './dom.js';
import { fraseIdentidad, num, porcentaje } from './formato.js';
import { sumarDias } from './fechas.js';
import { t } from './textos.js';

export const ANCHO = 1080;
export const ALTO = 1920;
const M = 88; // margen

const SERIF = "'Fraunces Soft', Georgia, serif";
const SANS = "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif";

/** Lee los colores actuales del tema. */
function colores() {
  const cs = getComputedStyle(document.documentElement);
  const v = (n, x) => cs.getPropertyValue(`--${n}`).trim() || x;
  return {
    fondo: v('fondo', '#f6f3ec'), superficie: v('superficie', '#fffdf8'), tinta: v('tinta', '#1c2420'),
    suave: v('tinta-suave', '#5b635d'), acento: v('pino', '#2e6b5c'), miel: v('miel', '#d9a03f'),
    calor: [0, 1, 2, 3, 4].map((i) => v(`calor-${i}`, '#ebe6dc')),
    linea: v('linea', '#e3ddd1'),
  };
}

/** Espera la fuente de la marca (si no carga, se usa Georgia: la imagen sale igual). */
export async function prepararFuentes() {
  try {
    await Promise.race([
      Promise.all([document.fonts.load(`540 100px ${SERIF}`), document.fonts.load(`600 40px ${SERIF}`)]),
      new Promise((r) => setTimeout(r, 1500)),
    ]);
  } catch { /* seguimos con la de respaldo */ }
}

function redondeado(c, x, y, w, h, r) {
  c.beginPath();
  c.moveTo(x + r, y);
  c.arcTo(x + w, y, x + w, y + h, r);
  c.arcTo(x + w, y + h, x, y + h, r);
  c.arcTo(x, y + h, x, y, r);
  c.arcTo(x, y, x + w, y, r);
  c.closePath();
}

/** Corta un texto en líneas que caben en `ancho` (máximo `max` líneas, con "…"). */
export function cortarLineas(c, texto, ancho, max = 3) {
  const palabras = String(texto).split(/\s+/).filter(Boolean);
  const lineas = [];
  let actual = '';
  for (const p of palabras) {
    const prueba = actual ? `${actual} ${p}` : p;
    if (c.measureText(prueba).width <= ancho || !actual) actual = prueba;
    else { lineas.push(actual); actual = p; }
  }
  if (actual) lineas.push(actual);
  if (lineas.length > max) {
    lineas.length = max;
    let ultima = lineas[max - 1];
    while (ultima.length > 1 && c.measureText(`${ultima}…`).width > ancho) ultima = ultima.slice(0, -1);
    lineas[max - 1] = `${ultima.replace(/[\s,.;:]+$/, '')}…`;
  }
  return lineas;
}

/** Texto que no se sale de un ancho: achica la letra hasta `minimo`, y si igual no cabe, lo recorta. */
function textoAjustado(c, texto, x, y, ancho, { tam, minimo = tam * 0.6, peso = 600, familia = SERIF }) {
  let s = tam;
  c.font = `${peso} ${s}px ${familia}`;
  while (s > minimo && c.measureText(texto).width > ancho) { s -= 2; c.font = `${peso} ${s}px ${familia}`; }
  const [linea] = cortarLineas(c, texto, ancho, 1);
  c.fillText(linea, x, y);
}

function simbolo(c, x, y, tam, color) {
  c.save();
  c.translate(x, y);
  c.scale(tam / 96, tam / 96);
  c.strokeStyle = color;
  c.lineWidth = 7;
  c.lineCap = 'round';
  c.lineJoin = 'round';
  for (const d of TRAZOS_SIMBOLO) c.stroke(new Path2D(d));
  c.restore();
}

/** Mapa del año: 12 filas (meses) × 31 columnas (días). */
function mapaAnual(c, r, col, x, y, ancho) {
  const etiqueta = 44;
  const gap = 5;
  const celda = Math.floor((ancho - etiqueta - gap * 30) / 31);
  const meses = t('meses.corto');
  c.font = `600 22px ${SANS}`;
  c.textBaseline = 'middle';
  for (let m = 0; m < 12; m++) {
    const fy = y + m * (celda + gap);
    c.fillStyle = col.suave;
    c.textAlign = 'left';
    c.fillText(meses[m], x, fy + celda / 2);
    for (let d = 1; d <= 31; d++) {
      const fecha = `${r.anio}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      if (sumarDias(fecha, 0) !== fecha) continue; // 30 de febrero y similares no existen
      const fx = x + etiqueta + (d - 1) * (celda + gap);
      const nivel = r.mapa.get(fecha);
      if (fecha < r.desde || fecha > r.hasta || nivel === undefined) {
        c.strokeStyle = col.linea;
        c.lineWidth = 2;
        redondeado(c, fx + 1, fy + 1, celda - 2, celda - 2, 5);
        c.stroke();
        continue;
      }
      c.fillStyle = col.calor[nivel ?? 0];
      redondeado(c, fx, fy, celda, celda, 5);
      c.fill();
    }
  }
  c.textBaseline = 'alphabetic';
  return 12 * celda + 11 * gap;
}

function panel(c, col, x, y, w, h, valor, etiqueta) {
  c.fillStyle = col.superficie;
  redondeado(c, x, y, w, h, 28);
  c.fill();
  c.textAlign = 'left';
  c.fillStyle = col.tinta;
  textoAjustado(c, valor, x + 32, y + 98, w - 64, { tam: 64, minimo: 36, peso: 540 });
  c.fillStyle = col.suave;
  c.font = `500 28px ${SANS}`;
  const lineas = cortarLineas(c, etiqueta, w - 64, 2);
  lineas.forEach((l, i) => c.fillText(l, x + 32, y + 146 + i * 36));
}

/** Frase final: la identidad del hábito más constante, o una frase de la marca. */
export function fraseFinal(r) {
  return (r.constante && fraseIdentidad(r.constante.habito)) || t('anual.frase');
}

/** Datos de los cuatro paneles (también se usan como texto alternativo). */
export function paneles(r) {
  const out = [
    [num(r.marcas), t('anual.marcas')],
    [t('anual.dias', { n: r.rachaDias }), t('anual.racha')],
  ];
  if (r.mejorMes) out.push([t('meses.largo')[r.mejorMes.mes], t('anual.mejorMes', { pct: porcentaje(r.mejorMes.pct) })]);
  else if (r.pct !== null) out.push([porcentaje(r.pct), t('anual.cumplido')]);
  if (r.constante) out.push([`${r.constante.habito.icono} ${r.constante.habito.nombre}`, t('anual.constante', { pct: porcentaje(r.constante.pct) })]);
  else if (r.mejorDia) out.push([t('dias.largo')[r.mejorDia.dia], t('anual.mejorDia')]);
  return out;
}

/** Dibuja la tarjeta completa. */
export function dibujarTarjeta(lienzo, r) {
  lienzo.width = ANCHO;
  lienzo.height = ALTO;
  const c = lienzo.getContext('2d');
  const col = colores();
  const ancho = ANCHO - 2 * M;

  c.fillStyle = col.fondo;
  c.fillRect(0, 0, ANCHO, ALTO);

  // Encabezado: símbolo + Tavia · año
  simbolo(c, M, 104, 64, col.acento);
  c.fillStyle = col.tinta;
  c.textAlign = 'left';
  c.font = `600 46px ${SERIF}`;
  c.fillText('Tavia', M + 84, 152);
  c.textAlign = 'right';
  c.fillStyle = col.suave;
  c.font = `600 34px ${SANS}`;
  c.fillText(String(r.anio), ANCHO - M, 150);

  // Cifra principal
  c.textAlign = 'left';
  c.fillStyle = col.acento;
  c.font = `700 30px ${SANS}`;
  c.fillText(t('anual.etiqueta', { anio: r.anio }).toUpperCase(), M, 300);
  c.fillStyle = col.tinta;
  c.font = `540 260px ${SERIF}`;
  c.fillText(num(r.diasConRegistro), M - 8, 540);
  c.fillStyle = col.suave;
  c.font = `500 40px ${SANS}`;
  cortarLineas(c, t('anual.diasCon', { n: r.diasConRegistro }), ancho, 2).forEach((l, i) => c.fillText(l, M, 610 + i * 52));

  // Mapa del año
  const altoMapa = mapaAnual(c, r, col, M, 720, ancho);

  // Paneles 2×2
  const top = 720 + altoMapa + 64;
  const gap = 24;
  const pw = (ancho - gap) / 2;
  const ph = 212;
  paneles(r).slice(0, 4).forEach(([valor, etiqueta], i) => {
    panel(c, col, M + (i % 2) * (pw + gap), top + Math.floor(i / 2) * (ph + gap), pw, ph, valor, etiqueta);
  });

  // Frase
  const yFrase = top + 2 * ph + gap + 96;
  c.fillStyle = col.tinta;
  c.textAlign = 'center';
  c.font = `440 46px ${SERIF}`;
  cortarLineas(c, fraseFinal(r), ancho - 40, 3).forEach((l, i) => c.fillText(l, ANCHO / 2, yFrase + i * 60));

  // Pie
  c.fillStyle = col.suave;
  c.font = `500 26px ${SANS}`;
  c.fillText(t('anual.pie'), ANCHO / 2, ALTO - 88);
  return lienzo;
}

/** Descripción en texto de la tarjeta (para lectores de pantalla). */
export function textoAlternativo(r) {
  const p = paneles(r).map(([v, e]) => `${v}: ${e}`).join('. ');
  return `${t('anual.etiqueta', { anio: r.anio })}. ${num(r.diasConRegistro)} ${t('anual.diasCon', { n: r.diasConRegistro })}. ${p}. ${fraseFinal(r)}`;
}
