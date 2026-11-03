// jardin-arte.js — Las figuras del jardín (J2): cinco especies propias y la flor insignia de Tavia,
// cada una en brote, capullo y flor, más semilla, hoja y tierra.
// Una sola geometría para dos pinceles: el SVG de la app (símbolos en <defs> y <use>)
// y el canvas de la tarjeta (Path2D). Así la tarjeta se dibuja desde datos, nunca copiando la pantalla.
//
// Cada figura vive en una caja de 20×20; el suelo está en y≈18.5.
// Colores: nunca escritos aquí. Cada parte tiene un rol (pétalo, hoja, centro…) y el CSS
// le pone el color del tema; en <use>, la variante llega como variables CSS heredadas.

import { ESPECIES, INSIGNIA } from './jardin-disposicion.js';

const SVG_NS = 'http://www.w3.org/2000/svg';

/* ---------- Piezas comunes ---------- */
const TALLO = { d: 'M10 18.6V9.4', rol: 'tallo' };
const HOJA_IZQ = { d: 'M10 15.4c-2.5 0-4.3-1.2-4.9-3.3 2.5-.2 4.3.9 4.9 3.3z', rol: 'hoja' };
const HOJA_DER = { d: 'M10 13.8c2.2 0 3.8-1 4.4-2.9-2.2-.2-3.8.8-4.4 2.9z', rol: 'hoja' };
const circulo = (cx, cy, r) => `M${cx} ${cy - r}a${r} ${r} 0 1 0 0 ${2 * r}a${r} ${r} 0 1 0 0 ${-2 * r}z`;
const girar = (parte, grados, cx, cy) => ({ ...parte, giro: [grados, cx, cy] });
const BRILLO = (cx, cy, r) => ({ d: circulo(cx, cy, r), rol: 'brillo' });

/* ---------- Flores abiertas ---------- */
const PETALO_MARGARITA = { d: 'M10 6.9c-.95-1.05-1.05-3.1 0-4.7 1.05 1.6.95 3.65 0 4.7z', rol: 'petalo' };
const PETALO_AMAPOLA = { d: 'M10 6.6C7.9 6.5 6.4 5.1 6.6 3.1c2 .1 3.5 1.5 3.4 3.5z', rol: 'petalo' };
const PETALO_INSIGNIA = { d: 'M10 8.2c-1.7-1.7-1.7-4.4 0-6.8 1.7 2.4 1.7 5.1 0 6.8z', rol: 'petalo' };

export const FIGURAS = {
  'flor-margarita': [
    TALLO, HOJA_IZQ,
    ...[0, 45, 90, 135, 180, 225, 270, 315].map((g, i) => girar({ ...PETALO_MARGARITA, rol: i % 2 ? 'petalo2' : 'petalo' }, g, 10, 6.9)),
    { d: circulo(10, 6.9, 1.45), rol: 'centro' },
    BRILLO(9.4, 6.3, 0.7),
  ],
  'flor-tulipan': [
    { d: 'M10 18.6V10', rol: 'tallo' },
    { d: 'M10 17.2c-2.6-.4-4-2.6-3.8-5.6 2.2.6 3.6 2.8 3.8 5.6z', rol: 'hoja' },
    { d: 'M6.3 3.4C6 7 7.5 9.7 10 10c2.5-.3 4-3 3.7-6.6-1 .9-2.1 1.6-3.7 1.6S7.3 4.3 6.3 3.4z', rol: 'petalo' },
    { d: 'M10 2.4c-1.5 1.5-2.1 3.6-1.7 5.7.4 1.1 1 1.7 1.7 1.8.7-.1 1.3-.7 1.7-1.8.4-2.1-.2-4.2-1.7-5.7z', rol: 'petalo2' },
    BRILLO(8.4, 5, 0.9),
  ],
  'flor-campanilla': [
    { d: 'M8.4 18.6V9c0-2.6 1.9-4.6 4.4-4.6', rol: 'tallo' },
    { d: 'M8.4 15.2c-2.2-.2-3.6-1.4-3.9-3.4 2.1 0 3.5 1.2 3.9 3.4z', rol: 'hoja' },
    { d: 'M11 6.4c0-1.6 1-2.6 2.2-2.6s2.2 1 2.2 2.6v2.3l1 1.3H10l1-1.3z', rol: 'petalo' },
    { d: 'M11.6 8.7h3.2l.8 1.3h-4.8z', rol: 'petalo2' },
    { d: circulo(13.2, 10.9, 0.55), rol: 'centro' },
    BRILLO(12.3, 5.6, 0.6),
  ],
  'flor-amapola': [
    TALLO, HOJA_DER,
    ...[0, 90, 180, 270].map((g, i) => girar({ ...PETALO_AMAPOLA, rol: i % 2 ? 'petalo2' : 'petalo' }, g, 10, 6.6)),
    { d: circulo(10, 6.6, 1.15), rol: 'centro-oscuro' },
    BRILLO(8.4, 4.9, 0.8),
  ],
  'flor-loto': [
    { d: 'M10 18.6v-6.6', rol: 'tallo' },
    { d: 'M3.6 17.4c1.6-1.6 4-2 6.4-1.4-1.8 1.8-4.4 2.2-6.4 1.4z', rol: 'hoja' },
    { d: 'M10 9.4C7 9.2 4.5 7.4 4 5.2c2.3-.2 4.6.8 6 4.2z', rol: 'petalo2' },
    { d: 'M10 9.4c3-.2 5.5-2 6-4.2-2.3-.2-4.6.8-6 4.2z', rol: 'petalo2' },
    { d: 'M10 9.6c-1.9-1-2.7-3.1-2.3-5.6 1.5.8 2.3 2.7 2.3 5.6z', rol: 'petalo' },
    { d: 'M10 9.6c1.9-1 2.7-3.1 2.3-5.6-1.5.8-2.3 2.7-2.3 5.6z', rol: 'petalo' },
    { d: 'M10 9.6c-.95-1.7-.95-4.2 0-6.3.95 2.1.95 4.6 0 6.3z', rol: 'petalo2' },
    BRILLO(9.2, 5.6, 0.7),
  ],
  'flor-insignia': [
    { d: circulo(10, 9.6, 8.6), rol: 'aro' },
    TALLO, HOJA_IZQ, HOJA_DER,
    girar(PETALO_INSIGNIA, -38, 10, 8.2), girar({ ...PETALO_INSIGNIA, rol: 'petalo2' }, 38, 10, 8.2), PETALO_INSIGNIA,
    { d: circulo(10, 8.3, 1.25), rol: 'perla' },
    BRILLO(9.6, 7.9, 0.45),
  ],

  /* ---------- Capullos: cerrados, cada especie a su manera ---------- */
  'capullo-margarita': [TALLO, HOJA_IZQ,
    { d: 'M10 9.4c-1.5 0-2.1-1.3-1.7-2.7.4-1.1 1-1.7 1.7-1.7s1.3.6 1.7 1.7c.4 1.4-.2 2.7-1.7 2.7z', rol: 'petalo' },
    { d: 'M8.3 8.4c.6.9 1 1.1 1.7 1.1s1.1-.2 1.7-1.1c-.4.7-1 1-1.7 1s-1.3-.3-1.7-1z', rol: 'hoja' }],
  'capullo-tulipan': [{ d: 'M10 18.6V10', rol: 'tallo' }, { d: 'M10 17.2c-2.6-.4-4-2.6-3.8-5.6 2.2.6 3.6 2.8 3.8 5.6z', rol: 'hoja' },
    { d: 'M10 3.4c-1.7 1.3-2.3 3.1-1.9 5 .3 1 1 1.6 1.9 1.6s1.6-.6 1.9-1.6c.4-1.9-.2-3.7-1.9-5z', rol: 'petalo' }],
  'capullo-campanilla': [{ d: 'M8.4 18.6V9c0-2.6 1.9-4.6 4.4-4.6', rol: 'tallo' },
    { d: 'M8.4 15.2c-2.2-.2-3.6-1.4-3.9-3.4 2.1 0 3.5 1.2 3.9 3.4z', rol: 'hoja' },
    { d: 'M12.8 4.6c.9 0 1.5.8 1.5 2s-.6 2.3-1.5 2.6c-.9-.3-1.5-1.4-1.5-2.6s.6-2 1.5-2z', rol: 'petalo' }],
  'capullo-amapola': [{ d: 'M10 18.6V10c0-1.2-.6-2-1.4-2.6', rol: 'tallo' }, HOJA_DER,
    { d: 'M8.6 8.2c-1.3-.1-2-1.3-1.6-2.5.3-.8 1-1.2 1.6-1.2s1.2.4 1.5 1.2c.4 1.2-.3 2.4-1.5 2.5z', rol: 'hoja' },
    { d: 'M8.6 4.5c.5 0 1 .3 1.2.8-.5-.1-.9 0-1.2.3-.3-.3-.7-.4-1.2-.3.2-.5.7-.8 1.2-.8z', rol: 'petalo' }],
  'capullo-loto': [{ d: 'M10 18.6v-6.6', rol: 'tallo' },
    { d: 'M3.6 17.4c1.6-1.6 4-2 6.4-1.4-1.8 1.8-4.4 2.2-6.4 1.4z', rol: 'hoja' },
    { d: 'M10 10c-1.7-.8-2.4-3-1.5-5.4.6.4 1.1 1 1.5 1.6.4-.6.9-1.2 1.5-1.6.9 2.4.2 4.6-1.5 5.4z', rol: 'petalo' }],

  /* ---------- Etapas sin especie ---------- */
  brote: [
    { d: 'M10 18.6v-5.4', rol: 'tallo' },
    { d: 'M10 14.4c-1.9 0-3.2-1-3.6-2.8 1.9 0 3.2 1 3.6 2.8z', rol: 'hoja' },
    { d: 'M10 13.5c1.7 0 3-.9 3.4-2.6-1.7 0-3 .9-3.4 2.6z', rol: 'hoja' },
  ],
  tierra: [
    { d: 'M4.8 18.8c1.3-1.7 3.1-2.5 5.2-2.5s3.9.8 5.2 2.5z', rol: 'tierra' },
    { d: 'M10 16.7c-.5 0-.8-.3-.8-.7s.4-.8.8-.9c.4.1.8.5.8.9s-.3.7-.8.7z', rol: 'semilla' },
  ],
  hoja: [
    { d: 'M4.4 17.8c2.6-3.7 7.6-4.7 11.1-3.3-1.7 3.5-6.8 4.7-11.1 3.3z', rol: 'hoja-descanso' },
    { d: 'M5.2 17.4c3.1-1.4 6.2-2.3 9.4-2.7', rol: 'nervio' },
  ],
  hojita: [
    { d: 'M7 17.9c1.6-2.2 4.5-2.8 6.5-2-1 2.1-4.1 2.8-6.5 2z', rol: 'hoja-descanso' },
  ],
  punto: [{ d: circulo(10, 17.9, 0.75), rol: 'punto' }],
};

/** Qué figura corresponde a un estado (y especie). */
export function figuraDe(estado, especie) {
  switch (estado) {
    case 'flor_rara': return `flor-${INSIGNIA}`;
    case 'flor': return `flor-${especie}`;
    case 'capullo': return `capullo-${especie}`;
    case 'brote': return 'brote';
    case 'tierra': case 'pendiente': return 'tierra';
    case 'descanso': return 'hoja';
    case 'sin_habitos': return 'hojita';
    default: return 'punto'; // futuro, sin_sembrar
  }
}

/* ---------- Pincel SVG ---------- */

function nodo(tag, attrs, padre) {
  const n = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) if (v !== null && v !== undefined) n.setAttribute(k, String(v));
  if (padre) padre.append(n);
  return n;
}
export { nodo as nodoSvg };

/**
 * <defs> con un <symbol> por figura y los degradados compartidos (brillo interior y luz ambiente).
 * Sin filtros: así 366 flores siguen fluidas en un celular modesto.
 */
export function crearDefs() {
  const defs = nodo('defs', {});
  const brillo = nodo('radialGradient', { id: 'j-brillo', cx: '35%', cy: '35%', r: '65%' }, defs);
  nodo('stop', { offset: '0', class: 'j-stop-brillo' }, brillo);
  nodo('stop', { offset: '1', class: 'j-stop-brillo j-stop-brillo--fin' }, brillo);
  const ambiente = nodo('radialGradient', { id: 'j-ambiente', cx: '50%', cy: '0%', r: '90%' }, defs);
  nodo('stop', { offset: '0', class: 'j-stop-ambiente' }, ambiente);
  nodo('stop', { offset: '1', class: 'j-stop-ambiente j-stop-ambiente--fin' }, ambiente);
  for (const [id, partes] of Object.entries(FIGURAS)) {
    const s = nodo('symbol', { id: `j-${id}`, viewBox: '0 0 20 20', overflow: 'visible' }, defs);
    for (const p of partes) {
      nodo('path', { d: p.d, class: `j-${p.rol}`, transform: p.giro ? `rotate(${p.giro.join(' ')})` : null }, s);
    }
  }
  return defs;
}

/* ---------- Pincel canvas (tarjeta) ---------- */

const RUTAS = new Map();
const ruta = (d) => { if (!RUTAS.has(d)) RUTAS.set(d, new Path2D(d)); return RUTAS.get(d); };

/**
 * Dibuja una figura en un canvas. `colores` trae un color por rol;
 * `variante` trae { petalo, petalo2, centro } de la variante del día.
 */
export function pintarFigura(c, id, { x, y, tam, giro = 0, colores, variante }) {
  const partes = FIGURAS[id];
  if (!partes) return;
  c.save();
  c.translate(x, y);
  if (giro) c.rotate((giro * Math.PI) / 180);
  c.scale(tam / 20, tam / 20);
  c.translate(-10, -10);
  for (const p of partes) {
    c.save();
    if (p.giro) {
      const [g, cx, cy] = p.giro;
      c.translate(cx, cy); c.rotate((g * Math.PI) / 180); c.translate(-cx, -cy);
    }
    const r = ruta(p.d);
    switch (p.rol) {
      case 'tallo': case 'nervio':
        c.strokeStyle = colores[p.rol]; c.lineWidth = p.rol === 'tallo' ? 0.9 : 0.4; c.lineCap = 'round'; c.stroke(r); break;
      case 'aro':
        c.strokeStyle = colores.aro; c.lineWidth = 0.35; c.stroke(r); break;
      case 'brillo':
        c.fillStyle = colores.brillo; c.globalAlpha = 0.5; c.fill(r); break;
      case 'petalo': case 'petalo2': case 'centro':
        c.fillStyle = variante[p.rol]; c.fill(r);
        c.strokeStyle = colores.luz; c.lineWidth = 0.3; c.stroke(r); break;
      default:
        c.fillStyle = colores[p.rol] || colores.hoja; c.fill(r);
    }
    c.restore();
  }
  c.restore();
}

export { ESPECIES };
