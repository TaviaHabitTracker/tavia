// tarjeta-desc.js — Tarjeta para compartir un Descubrimiento (M11).
// Privacidad: la imagen solo lleva una frase genérica ("Mi día más constante: el martes").
// Nunca nombres de hábitos, cifras exactas, fechas, tu nombre ni nada de la bóveda.
// Se dibuja en el teléfono con canvas (fillText: nada se interpreta como HTML); un PNG de
// toBlob no lleva metadatos. El nombre del archivo es genérico.

import { TRAZOS_SIMBOLO } from './dom.js';
import { t } from './textos.js';

export const ANCHO = 1080;
export const FORMATOS = { retrato: 1350, historia: 1920 };
export const NOMBRE_ARCHIVO = 'tavia-descubrimiento.png';
const SANS = "'Instrument Sans', system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif";
const M = 96;

/**
 * La frase genérica de un descubrimiento, o null si ese tipo no se comparte
 * (G3 va aparte; una tendencia a la baja no se comparte: es para ti).
 * Solo usa datos sin nombre: día, franja, bloque, palabra o mes.
 */
export function fraseCompartible(x) {
  const p = x?.params || {};
  switch (x?.tipo) {
    case 'g1': return Number.isInteger(p.dia) && p.dia >= 0 && p.dia < 7 ? t('desc.share.g1', { dia: t('dias.largo')[p.dia] }) : null;
    case 'g2': return t('desc.share.g2');
    case 'g4':
    case 'p1': return ['madrugada', 'manana', 'tarde', 'noche'].includes(p.franja) ? t('desc.share.franja', { franja: t(`desc.franja.${p.franja}`) }) : null;
    case 'p2': return t('desc.share.p2');
    case 'p3': return p.sentido === 'sube' ? t('desc.share.p3') : null;
    case 'p4': return t('desc.share.p4');
    case 'p5': return t('desc.share.p5');
    case 'p6': return typeof p.palabra === 'string' && /^[a-z]{2,20}$/.test(p.palabra) ? t('desc.share.p6', { palabra: p.palabra.charAt(0).toUpperCase() + p.palabra.slice(1) }) : null;
    case 'p7': return ['manana', 'tarde', 'noche', 'dia'].includes(p.bloque) ? t('desc.share.p7', { bloque: t(`desc.bloque.${p.bloque}`) }) : null;
    case 'p8': return /^\d{4}-\d{2}$/.test(p.mes || '') ? t('desc.share.p8', { mes: t('meses.largo')[Number(p.mes.slice(5, 7)) - 1].toLowerCase() }) : null;
    default: return null;
  }
}

/** Lo único que viaja a la imagen. */
export function datosTarjetaDesc(x, formato = 'retrato') {
  const frase = fraseCompartible(x);
  if (!frase) return null;
  return {
    frase,
    ceja: t('desc.share.ceja'),
    // Una marca decorativa sin cifras: 7 puntos con el día destacado (solo para G1).
    dia: x.tipo === 'g1' ? x.params.dia : null,
    formato: FORMATOS[formato] ? formato : 'retrato',
  };
}

export function colores(doc = globalThis.document) {
  const cs = getComputedStyle(doc.documentElement);
  const v = (n, x) => cs.getPropertyValue(`--${n}`).trim() || x;
  return {
    fondo: v('fondo', '#F3F3F1'), superficie: v('superficie', '#FFFFFF'), tinta: v('tinta', '#17181B'), suave: v('tinta-suave', '#4A4D53'),
    acento: v('acento', '#A2621A'), acentoTexto: v('acento-texto', '#8A520E'), suaveAcento: v('acento-suave', '#f2e9df'), linea: v('linea', '#DCDCD8'),
  };
}

/** Parte un texto en líneas que caben en `ancho` con la fuente actual. */
export function lineas(c, texto, ancho) {
  const out = [];
  let actual = '';
  for (const palabra of texto.split(/\s+/)) {
    const prueba = actual ? `${actual} ${palabra}` : palabra;
    if (c.measureText(prueba).width <= ancho || !actual) actual = prueba;
    else { out.push(actual); actual = palabra; }
  }
  if (actual) out.push(actual);
  return out;
}

export function dibujarTarjetaDesc(lienzo, datos, col) {
  const alto = FORMATOS[datos.formato] || FORMATOS.retrato;
  lienzo.width = ANCHO;
  lienzo.height = alto;
  const c = lienzo.getContext('2d');

  c.fillStyle = col.fondo;
  c.fillRect(0, 0, ANCHO, alto);
  // Un halo suave del color de acento arriba a la derecha.
  if (c.createRadialGradient) {
    const g = c.createRadialGradient(ANCHO - 120, 140, 20, ANCHO - 120, 140, 700);
    g.addColorStop(0, col.suaveAcento);
    g.addColorStop(1, col.fondo);
    c.fillStyle = g;
    c.fillRect(0, 0, ANCHO, alto);
  }

  // Ceja
  c.textAlign = 'left';
  c.textBaseline = 'alphabetic';
  c.fillStyle = col.acentoTexto;
  c.font = `600 30px ${SANS}`;
  if ('letterSpacing' in c) c.letterSpacing = '4px';
  c.fillText(datos.ceja.toUpperCase(), M, M + 40);
  if ('letterSpacing' in c) c.letterSpacing = '0px';

  // Frase: tamaño que se ajusta para que quepa en hasta 5 líneas.
  const anchoTexto = ANCHO - 2 * M;
  let tam = 92, ls;
  do {
    c.font = `560 ${tam}px ${SANS}`;
    ls = lineas(c, datos.frase, anchoTexto);
    if (ls.length <= 5) break;
    tam -= 6;
  } while (tam > 48);
  const alturaLinea = Math.round(tam * 1.18);
  const bloque = ls.length * alturaLinea;
  let y = Math.round(alto * 0.46 - bloque / 2) + tam;
  c.fillStyle = col.tinta;
  for (const l of ls) { c.fillText(l, M, y); y += alturaLinea; }

  // Marca de G1: siete puntos, el día destacado (sin cifras).
  if (Number.isInteger(datos.dia)) {
    const iniciales = t('dias.corto');
    const paso = 96, r = 18, y0 = y + 70;
    iniciales.forEach((d, i) => {
      const cx = M + r + i * paso;
      c.beginPath();
      c.arc(cx, y0, i === datos.dia ? r + 6 : r, 0, Math.PI * 2);
      c.fillStyle = i === datos.dia ? col.acento : col.linea;
      c.fill();
      c.fillStyle = i === datos.dia ? col.tinta : col.suave;
      c.font = `${i === datos.dia ? 700 : 500} 28px ${SANS}`;
      c.textAlign = 'center';
      c.fillText(d, cx, y0 + 70);
    });
    c.textAlign = 'left';
  }

  // Pie: símbolo y marca
  const yPie = alto - M;
  c.save();
  c.translate(M, yPie - 64);
  c.scale(0.72, 0.72);
  c.lineWidth = 6;
  c.lineCap = 'round';
  c.lineJoin = 'round';
  TRAZOS_SIMBOLO.forEach((d, i) => {
    const p = new Path2D(d);
    c.strokeStyle = i === 1 ? col.suave : col.acento;
    c.stroke(p);
    if (i >= 2) { c.fillStyle = col.acento; c.fill(p); }
  });
  c.restore();
  c.fillStyle = col.tinta;
  c.font = `600 40px ${SANS}`;
  c.fillText('Tavia', M + 84, yPie - 16);
  c.fillStyle = col.suave;
  c.font = `500 28px ${SANS}`;
  c.textAlign = 'right';
  c.fillText(t('desc.share.pie'), ANCHO - M, yPie - 18);
  c.textAlign = 'left';
}
