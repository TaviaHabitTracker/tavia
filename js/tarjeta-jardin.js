// tarjeta-jardin.js — La tarjeta «Mi jardín» (J5), dibujada en canvas desde DATOS agregados.
// Nunca copia la pantalla. La función que dibuja solo recibe lo que arma datosTarjeta():
// figuras, posiciones dentro de cada mes y, si el usuario lo activa, unas pocas cifras.
// No recibe nombres de hábitos, fechas, notas, ni el id del jardín. El PNG sale del canvas
// (sin EXIF ni metadatos), con un nombre de archivo genérico.

import { contar, esFlor } from './jardin.js';
import { filaEnMes, rasgosDelDia } from './jardin-disposicion.js';
import { figuraDe, pintarFigura } from './jardin-arte.js';
import { diaSemana } from './fechas.js';
import { num } from './formato.js';
import { t } from './textos.js';

export const ANCHO = 1080;
export const FORMATOS = { retrato: 1350, historia: 1920 };
export const NOMBRE_ARCHIVO = 'tavia-jardin.png';
export const OPCIONES_POR_DEFECTO = Object.freeze({ formato: 'retrato', flores: false, racha: false, meses: false, frase: false });

const SANS = "'Instrument Sans', system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif";

/**
 * Lo único que viaja a la tarjeta. Las fechas se convierten aquí en "mes, columna, fila"
 * y se descartan; los hitos se vuelven una figura más. Las cifras solo si el usuario las pidió.
 */
export function datosTarjeta(jardin, semilla, { opciones = OPCIONES_POR_DEFECTO, racha = 0, hitoFrase = null } = {}) {
  const celdas = jardin.dias.map((d) => {
    const r = rasgosDelDia(d.fecha, semilla);
    return {
      m: Number(d.fecha.slice(5, 7)),
      col: diaSemana(d.fecha),
      fila: filaEnMes(d.fecha),
      figura: figuraDe(d.estado, r.especie),
      variante: r.variante,
      dx: r.dx, dy: r.dy, giro: r.giro, escala: r.escala,
    };
  });
  const c = contar(jardin.dias);
  return {
    anio: jardin.anio,
    celdas,
    flores: opciones.flores ? c.flores : null,
    racha: opciones.racha ? racha : null,
    meses: opciones.meses ? t('meses.largo').map((m) => m.slice(0, 3)) : null,
    frase: opciones.frase ? { texto: t(hitoFrase ? `jardin.frase.${hitoFrase}` : 'jardin.frase.base'), autor: t('jardin.frase.autor') } : null,
    formato: FORMATOS[opciones.formato] ? opciones.formato : 'retrato',
  };
}

/** Qué contiene la imagen, en una frase (se muestra antes de guardar o compartir). */
export function textoContenido(datos) {
  const partes = [t('tarjeta.contiene.jardin')];
  if (datos.flores !== null) partes.push(t('tarjeta.contiene.flores'));
  if (datos.racha !== null) partes.push(t('tarjeta.contiene.racha'));
  if (datos.meses) partes.push(t('tarjeta.contiene.meses'));
  if (datos.frase) partes.push(t('tarjeta.contiene.frase'));
  return t('tarjeta.contiene', { lista: partes.join(', ') });
}

/** Texto alternativo de la vista previa. */
export function textoAlternativo(datos) {
  const flores = datos.celdas.filter((c) => c.figura.startsWith('flor-')).length;
  return t('tarjeta.alt', { anio: datos.anio, n: flores });
}

/** Colores del tema actual (variables CSS del jardín). En pruebas se pasan a mano. */
export function coloresDelTema(doc = globalThis.document) {
  const cs = getComputedStyle(doc.documentElement);
  const v = (n, x) => cs.getPropertyValue(`--${n}`).trim() || x;
  const variantes = {};
  const sonda = doc.createElement('span');
  sonda.className = 'jardin-sonda';
  doc.body.append(sonda);
  for (let i = 1; i <= 5; i++) {
    sonda.className = `jardin-sonda v${i}`;
    const s = getComputedStyle(sonda);
    variantes[i] = {
      petalo: s.getPropertyValue('--petalo').trim() || '#c99bbd',
      petalo2: s.getPropertyValue('--petalo2').trim() || '#e7c9de',
      centro: s.getPropertyValue('--centro').trim() || '#d9a03f',
    };
  }
  sonda.remove();
  return {
    fondo: v('fondo', '#F3F3F1'), tinta: v('tinta', '#17181B'), suave: v('tinta-suave', '#4A4D53'), acento: v('acento', '#A2621A'),
    ambiente: v('j-ambiente', 'rgba(255,255,255,.6)'), cama: v('j-cama', '#E9E5DC'),
    roles: {
      tallo: v('j-tallo', '#7E8F6E'), hoja: v('j-hoja', '#7E9A72'), 'hoja-descanso': v('j-hoja-descanso', '#A8B79B'), nervio: v('j-nervio', '#F3F3F1'),
      tierra: v('j-tierra', '#D9D2C3'), semilla: v('j-semilla', '#A8946F'), punto: v('j-punto', '#CFCBC2'),
      perla: v('j-perla', '#E9A23B'), aro: v('j-aro', '#E9A23B'), luz: v('j-luz', 'rgba(255,255,255,.7)'), brillo: v('j-brillo', '#FFFFFF'),
      'centro-oscuro': v('j-centro-oscuro', '#3B2E2A'),
    },
    variantes,
  };
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

/**
 * Dibuja la tarjeta. `datos` viene de datosTarjeta(); `colores` de coloresDelTema().
 * Todo texto entra con fillText (nada se interpreta como HTML).
 */
export function dibujarTarjetaJardin(lienzo, datos, colores) {
  const alto = FORMATOS[datos.formato] || FORMATOS.retrato;
  lienzo.width = ANCHO;
  lienzo.height = alto;
  const c = lienzo.getContext('2d');
  const M = 88;

  // Fondo y luz ambiente
  c.fillStyle = colores.fondo;
  c.fillRect(0, 0, ANCHO, alto);
  if (c.createRadialGradient) {
    const g = c.createRadialGradient(ANCHO / 2, 0, 40, ANCHO / 2, 0, alto * 0.9);
    g.addColorStop(0, colores.ambiente);
    g.addColorStop(1, colores.fondo); // al color del fondo (no a negro transparente: dejaría una banda gris)
    c.fillStyle = g;
    c.fillRect(0, 0, ANCHO, alto);
  }

  // Título
  c.textAlign = 'left';
  c.textBaseline = 'alphabetic';
  c.fillStyle = colores.tinta;
  c.font = `560 68px ${SANS}`;
  c.fillText(t('tarjeta.titulo'), M, M + 64);
  c.fillStyle = colores.suave;
  c.font = `500 34px ${SANS}`;
  c.fillText(String(datos.anio), M, M + 116);

  // Pie: cifras y frase (solo si el usuario las activó)
  const lineas = [];
  if (datos.flores !== null) lineas.push(t('tarjeta.flores', { n: datos.flores, flores: num(datos.flores) }));
  if (datos.racha !== null) lineas.push(t('tarjeta.racha', { n: datos.racha, dias: num(datos.racha) }));
  const altoFrase = datos.frase ? 150 : 0;
  const altoPie = 70 + lineas.length * 52 + altoFrase;

  // Jardín: 3 columnas × 4 filas de macizos, centrado en lo que queda
  const arriba = M + 170;
  const disponibleAlto = alto - arriba - altoPie - M;
  const gapX = 40, gapY = 30;
  const etiqueta = datos.meses ? 34 : 10;
  const s = Math.floor(Math.min((ANCHO - 2 * M - 2 * gapX) / 21, (disponibleAlto - 3 * gapY - 4 * etiqueta) / 24));
  const anchoJardin = 21 * s + 2 * gapX;
  const x0 = (ANCHO - anchoJardin) / 2;
  const altoMacizo = etiqueta + 6 * s;
  const y0 = arriba + Math.max(0, (disponibleAlto - (4 * altoMacizo + 3 * gapY)) / 2);

  for (let mes = 1; mes <= 12; mes++) {
    const col = (mes - 1) % 3;
    const fila = Math.floor((mes - 1) / 3);
    const mx = x0 + col * (7 * s + gapX);
    const my = y0 + fila * (altoMacizo + gapY);
    const celdas = datos.celdas.filter((x) => x.m === mes);
    const filas = celdas.reduce((m, x) => Math.max(m, x.fila + 1), 4);
    c.fillStyle = colores.cama;
    redondeado(c, mx - 6, my + etiqueta - 4, 7 * s + 12, filas * s + 8, 14);
    c.fill();
    if (datos.meses) {
      c.fillStyle = colores.suave;
      c.font = `600 24px ${SANS}`;
      c.fillText(datos.meses[mes - 1], mx, my + 22);
    }
    for (const x of celdas) {
      const cx = mx + (x.col + 0.5 + x.dx) * s;
      const cy = my + etiqueta + (x.fila + 0.5 + x.dy) * s;
      pintarFigura(c, x.figura, {
        x: cx, y: cy, tam: s * x.escala, giro: x.giro,
        colores: colores.roles, variante: colores.variantes[x.variante] || colores.variantes[1],
      });
    }
  }

  // Cifras y frase
  let y = alto - M - altoFrase - lineas.length * 52;
  c.fillStyle = colores.tinta;
  c.font = `560 40px ${SANS}`;
  for (const l of lineas) { c.fillText(l, M, y); y += 52; }
  if (datos.frase) {
    c.fillStyle = colores.tinta;
    c.font = `italic 500 36px ${SANS}`;
    const lineasFrase = cortar(c, `“${datos.frase.texto}”`, ANCHO - 2 * M, 2);
    lineasFrase.forEach((l, i) => c.fillText(l, M, y + 20 + i * 46));
    c.fillStyle = colores.suave;
    c.font = `500 28px ${SANS}`;
    c.fillText(`— ${datos.frase.autor}`, M, y + 20 + lineasFrase.length * 46 + 6);
  }

  // Marca (sin enlaces, sin QR)
  c.fillStyle = colores.acento;
  c.font = `600 28px ${SANS}`;
  c.textAlign = 'right';
  c.fillText(t('tarjeta.marca'), ANCHO - M, alto - M + 40);
  c.textAlign = 'left';
}

function cortar(c, texto, ancho, max) {
  const palabras = texto.split(/\s+/);
  const out = [];
  let linea = '';
  for (const p of palabras) {
    const prueba = linea ? `${linea} ${p}` : p;
    if (c.measureText(prueba).width > ancho && linea) {
      out.push(linea);
      linea = p;
      if (out.length === max) break;
    } else linea = prueba;
  }
  if (out.length < max && linea) out.push(linea);
  return out.slice(0, max);
}

/** Cuántas flores tiene la tarjeta (para pruebas y el texto alternativo). */
export const floresEn = (jardin) => jardin.dias.filter((d) => esFlor(d.estado)).length;
