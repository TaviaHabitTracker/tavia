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
// Roles de detalle (0.11.1): vena (nervadura fina del pétalo), sombra (profundidad en la base),
// lustre (brillo en la punta), estambre (puntos oscuros), polen (puntos claros), capsula y raya (amapola).
// Son colores neutros con transparencia: sirven para cualquier variante sin degradados por flor.
const r2 = (n) => Math.round(n * 100) / 100;
const circulo = (cx, cy, r) => `M${r2(cx)} ${r2(cy - r)}a${r} ${r} 0 1 0 0 ${r2(2 * r)}a${r} ${r} 0 1 0 0 ${r2(-2 * r)}z`;
const elipse = (cx, cy, rx, ry) => `M${r2(cx - rx)} ${cy}a${rx} ${ry} 0 1 0 ${r2(2 * rx)} 0a${rx} ${ry} 0 1 0 ${r2(-2 * rx)} 0z`;
const girar = (parte, grados, cx, cy) => ({ ...parte, giro: [grados, cx, cy] });
const BRILLO = (cx, cy, r) => ({ d: circulo(cx, cy, r), rol: 'brillo' });
/** Puntos en anillo (estambres, polen). */
const anillo = (cx, cy, radio, n, r, desfase = 0) => Array.from({ length: n }, (_, k) => {
  const a = desfase + (k * 2 * Math.PI) / n;
  return circulo(cx + radio * Math.cos(a), cy + radio * Math.sin(a), r);
}).join('');

const TALLO = { d: 'M10 18.6V9.4', rol: 'tallo' };
const HOJA_IZQ = { d: 'M10 15.4c-2.5 0-4.3-1.2-4.9-3.3 2.5-.2 4.3.9 4.9 3.3z', rol: 'hoja' };
const NERVIO_IZQ = { d: 'M9.6 15.1C8.2 14.3 6.9 13.3 5.7 12.4', rol: 'nervio' };
const HOJA_DER = { d: 'M10 13.8c2.2 0 3.8-1 4.4-2.9-2.2-.2-3.8.8-4.4 2.9z', rol: 'hoja' };
const NERVIO_DER = { d: 'M10.4 13.5c1.2-.7 2.4-1.5 3.5-2.4', rol: 'nervio' };
const HOJA_LARGA = { d: 'M10 17.2c-2.6-.4-4-2.6-3.8-5.6 2.2.6 3.6 2.8 3.8 5.6z', rol: 'hoja' };
const NERVIO_LARGA = { d: 'M9.7 16.8C8.6 15.3 7.4 13.6 6.5 12', rol: 'nervio' };
const HOJA_CAMP = { d: 'M8.4 15.2c-2.2-.2-3.6-1.4-3.9-3.4 2.1 0 3.5 1.2 3.9 3.4z', rol: 'hoja' };
const NERVIO_CAMP = { d: 'M8.1 14.9C6.9 14 5.8 13 4.9 12.1', rol: 'nervio' };
const NENUFAR = [
  { d: 'M3.6 17.4c1.6-1.6 4-2 6.4-1.4-1.8 1.8-4.4 2.2-6.4 1.4z', rol: 'hoja' },
  { d: 'M4.3 17.2c1.8-.5 3.6-.9 5.4-1.1M6.4 17.5l1-1.1M8 17.1l.7-.8', rol: 'nervio' },
];

/* ---------- Pétalos ---------- */
// Margarita: pétalo fino desde el centro (10,6.9) hacia arriba, con nervadura y brillo en la punta.
const C_MARG = [10, 6.9];
const P_MARG = 'M10 6.9c-.8-1-.95-3.2 0-4.9.95 1.7.8 3.9 0 4.9z';
const petaloMargarita = (g, rol) => [
  girar({ d: P_MARG, rol }, g, ...C_MARG),
  girar({ d: 'M10 6.3V2.8', rol: 'vena' }, g, ...C_MARG),
  girar({ d: elipse(9.78, 3.3, 0.2, 0.55), rol: 'lustre' }, g, ...C_MARG),
];
// Amapola: pétalo ancho y arrugado, con dos nervaduras.
const C_AMAP = [10, 6.6];
const P_AMAP = 'M10 6.6C7.6 6.6 5.9 5 6.2 2.7c.7-.2 1.7-.1 2.4.3.9.6 1.4 1.8 1.4 3.6z';
const petaloAmapola = (g, rol, detalle) => [
  girar({ d: P_AMAP, rol }, g, ...C_AMAP),
  ...(detalle ? [
    girar({ d: 'M9.8 6.3C8.8 5.6 7.8 4.6 7.2 3.4M9.6 6.5C8.6 6.3 7.4 5.6 6.7 4.7M9.9 6C9.5 5.1 9.1 4 8.5 3.2', rol: 'vena' }, g, ...C_AMAP),
    girar({ d: elipse(7.2, 3.6, 0.38, 0.3), rol: 'lustre' }, g, ...C_AMAP),
  ] : []),
];
// Insignia: pétalo de la marca, con nervadura y brillo.
const C_INS = [10, 8.2];
const P_INS = 'M10 8.2c-1.7-1.7-1.7-4.4 0-6.8 1.7 2.4 1.7 5.1 0 6.8z';
const petaloInsignia = (g, rol) => [
  girar({ d: P_INS, rol }, g, ...C_INS),
  girar({ d: 'M10 7.6V2.3', rol: 'vena' }, g, ...C_INS),
  girar({ d: elipse(9.55, 3.6, 0.24, 0.8), rol: 'lustre' }, g, ...C_INS),
];

export const FIGURAS = {
  'flor-margarita': [
    TALLO, HOJA_IZQ, NERVIO_IZQ,
    // Dos coronas: la de atrás (más clara) asoma entre los pétalos de adelante.
    ...[0, 1, 2, 3, 4, 5, 6, 7].flatMap((k) => [girar({ d: P_MARG, rol: 'petalo2' }, 22.5 + k * 45, ...C_MARG)]),
    ...[0, 1, 2, 3, 4, 5, 6, 7].flatMap((k) => petaloMargarita(k * 45, 'petalo')),
    { d: circulo(10, 6.9, 2), rol: 'sombra' },
    { d: circulo(10, 6.9, 1.5), rol: 'centro' },
    { d: anillo(10, 6.9, 1.05, 12, 0.15), rol: 'estambre' },
    { d: circulo(10.3, 7.2, 0.7), rol: 'sombra' },
    { d: anillo(9.6, 6.5, 0.45, 4, 0.12, 0.4), rol: 'polen' },
    BRILLO(9.45, 6.35, 0.45),
  ],
  'flor-tulipan': [
    { d: 'M10 18.6V10.2', rol: 'tallo' },
    HOJA_LARGA, NERVIO_LARGA,
    { d: 'M5.9 4.2C5.6 7.6 7.4 10.3 10 10.4c2.6-.1 4.4-2.8 4.1-6.2-1.1 1-2.4 1.5-4.1 1.5S7 5.2 5.9 4.2z', rol: 'petalo2' },
    { d: 'M10 2.3C8.5 3.8 7.9 6 8.3 8.1c.4 1.2 1 1.9 1.7 2 .7-.1 1.3-.8 1.7-2 .4-2.1-.2-4.3-1.7-5.8z', rol: 'petalo2' },
    { d: 'M10 9.5V3.6', rol: 'vena' },
    { d: 'M10 10.4C7.6 10.1 6.1 7.9 6.4 4.4 8.3 5.4 9.6 7.4 10 10.4z', rol: 'petalo' },
    { d: 'M10 10.4c2.4-.3 3.9-2.5 3.6-6-1.9 1-3.2 3-3.6 6z', rol: 'petalo' },
    { d: 'M9.6 9.8C8.5 8.6 7.6 7 7.1 5.2M10.4 9.8c1.1-1.2 2-2.8 2.5-4.6', rol: 'vena' },
    { d: 'M7.3 8.6c.8 1.2 1.7 1.8 2.7 1.8s1.9-.6 2.7-1.8c-.9.5-1.8.7-2.7.7s-1.8-.2-2.7-.7z', rol: 'sombra' },
    { d: elipse(7.35, 6, 0.28, 1.05), rol: 'lustre' },
    { d: elipse(9.55, 4.1, 0.18, 0.6), rol: 'lustre' },
    BRILLO(8.1, 5.2, 0.6),
  ],
  'flor-campanilla': [
    { d: 'M8.4 18.6V9c0-2.6 1.9-4.6 4.4-4.6', rol: 'tallo' },
    HOJA_CAMP, NERVIO_CAMP,
    // Un capullito colgando del mismo tallo.
    { d: 'M8.4 10.6c-.6-.5-1.3-.7-2-.6', rol: 'tallo' },
    { d: elipse(6.1, 10.9, 0.7, 0.95), rol: 'petalo2' },
    { d: 'M11 6.4c0-1.6 1-2.6 2.2-2.6s2.2 1 2.2 2.6v2.3l1 1.3H10l1-1.3z', rol: 'petalo' },
    { d: 'M12.4 4.3c-.4.9-.6 2.6-.7 4.4M13.2 4v4.7M14 4.3c.4.9.6 2.6.7 4.4', rol: 'vena' },
    { d: 'M10 10l.9-1.3h4.6l.9 1.3-.85.55-.75-.5-.8.6-.8-.6-.8.6-.75-.5z', rol: 'petalo2' },
    { d: elipse(13.2, 10.15, 2.1, 0.3), rol: 'sombra' },
    { d: 'M13.2 10.3v.8', rol: 'vena' },
    { d: circulo(13.2, 11.3, 0.38), rol: 'centro' },
    { d: 'M12.3 4.2c.3-.5.6-.7.9-.7s.6.2.9.7c-.3.1-.6.2-.9.2s-.6-.1-.9-.2z', rol: 'hoja' },
    { d: elipse(12.05, 6, 0.24, 1.1), rol: 'lustre' },
    BRILLO(12.3, 5.4, 0.45),
  ],
  'flor-amapola': [
    { d: 'M10 18.6V9.4c0-.5.2-1 .4-1.4', rol: 'tallo' },
    HOJA_DER, NERVIO_DER,
    ...[45, 135, 225, 315].flatMap((g) => petaloAmapola(g, 'petalo2', false)),
    ...[0, 90, 180, 270].flatMap((g) => petaloAmapola(g, 'petalo', true)),
    { d: circulo(10, 6.6, 2.1), rol: 'sombra' },
    { d: circulo(10, 6.6, 1.35), rol: 'centro-oscuro' },
    { d: anillo(10, 6.6, 1.55, 14, 0.17), rol: 'estambre' },
    { d: circulo(10, 6.6, 0.75), rol: 'capsula' },
    { d: 'M10 6v1.2M9.4 6.6h1.2M9.58 6.18l.84.84M10.42 6.18l-.84.84', rol: 'raya' },
    BRILLO(8.3, 4.8, 0.55),
  ],
  'flor-loto': [
    { d: 'M10 18.6v-6.6', rol: 'tallo' },
    ...NENUFAR,
    { d: 'M10 9.4C7 9.2 4.5 7.4 4 5.2c2.3-.2 4.6.8 6 4.2z', rol: 'petalo2' },
    { d: 'M10 9.4c3-.2 5.5-2 6-4.2-2.3-.2-4.6.8-6 4.2z', rol: 'petalo2' },
    { d: 'M9.6 9.2C8 8.5 6.1 7.1 5 5.6M10.4 9.2c1.6-.7 3.5-2.1 4.6-3.6', rol: 'vena' },
    { d: 'M10 9.6c-1.9-1-2.7-3.1-2.3-5.6 1.5.8 2.3 2.7 2.3 5.6z', rol: 'petalo' },
    { d: 'M10 9.6c1.9-1 2.7-3.1 2.3-5.6-1.5.8-2.3 2.7-2.3 5.6z', rol: 'petalo' },
    { d: 'M9.8 9.3C9.1 8 8.5 6.4 8.2 4.7M10.2 9.3c.7-1.3 1.3-2.9 1.6-4.6', rol: 'vena' },
    { d: 'M10 9.6c-.95-1.7-.95-4.2 0-6.3.95 2.1.95 4.6 0 6.3z', rol: 'petalo2' },
    { d: 'M10 9.1V4', rol: 'vena' },
    { d: 'M7.2 9.1c.8.5 1.8.8 2.8.8s2-.3 2.8-.8c-.8.1-1.8.2-2.8.2s-2-.1-2.8-.2z', rol: 'sombra' },
    { d: elipse(8.2, 5.3, 0.2, 0.6), rol: 'lustre' },
    { d: elipse(5.4, 6, 0.35, 0.2), rol: 'lustre' },
    BRILLO(9.2, 5.6, 0.5),
  ],
  'flor-insignia': [
    { d: circulo(10, 9.6, 8.6), rol: 'aro' },
    TALLO, HOJA_IZQ, NERVIO_IZQ, HOJA_DER, NERVIO_DER,
    ...petaloInsignia(-38, 'petalo'), ...petaloInsignia(38, 'petalo2'), ...petaloInsignia(0, 'petalo'),
    { d: circulo(10, 8.3, 1.8), rol: 'sombra' },
    { d: circulo(10, 8.3, 1.25), rol: 'perla' },
    { d: anillo(10, 8.3, 2.25, 6, 0.13, -Math.PI / 2), rol: 'polen' },
    BRILLO(9.6, 7.9, 0.45),
  ],

  /* ---------- Capullos: cerrados, cada especie a su manera ---------- */
  'capullo-margarita': [TALLO, HOJA_IZQ, NERVIO_IZQ,
    { d: 'M10 9.4c-1.5 0-2.1-1.3-1.7-2.7.4-1.1 1-1.7 1.7-1.7s1.3.6 1.7 1.7c.4 1.4-.2 2.7-1.7 2.7z', rol: 'petalo' },
    { d: 'M10 9.1V5.4M9.2 8.9c-.4-1-.4-2.2 0-3.1M10.8 8.9c.4-1 .4-2.2 0-3.1', rol: 'vena' },
    { d: elipse(9.4, 6.6, 0.18, 0.55), rol: 'lustre' },
    { d: 'M8.3 8.4c.6.9 1 1.1 1.7 1.1s1.1-.2 1.7-1.1c-.4.7-1 1-1.7 1s-1.3-.3-1.7-1z', rol: 'hoja' }],
  'capullo-tulipan': [{ d: 'M10 18.6V10', rol: 'tallo' }, HOJA_LARGA, NERVIO_LARGA,
    { d: 'M10 3.4c-1.7 1.3-2.3 3.1-1.9 5 .3 1 1 1.6 1.9 1.6s1.6-.6 1.9-1.6c.4-1.9-.2-3.7-1.9-5z', rol: 'petalo' },
    { d: 'M10 9.6V4.1M9.2 9.1C8.7 7.8 8.6 6.1 9 4.9', rol: 'vena' },
    { d: 'M8.4 8.6c.4.9 1 1.3 1.6 1.3s1.2-.4 1.6-1.3c-.5.3-1 .4-1.6.4s-1.1-.1-1.6-.4z', rol: 'sombra' },
    { d: elipse(9.05, 6, 0.2, 0.8), rol: 'lustre' }],
  'capullo-campanilla': [{ d: 'M8.4 18.6V9c0-2.6 1.9-4.6 4.4-4.6', rol: 'tallo' }, HOJA_CAMP, NERVIO_CAMP,
    { d: 'M12.8 4.6c.9 0 1.5.8 1.5 2s-.6 2.3-1.5 2.6c-.9-.3-1.5-1.4-1.5-2.6s.6-2 1.5-2z', rol: 'petalo' },
    { d: 'M12.8 5v3.9M12.1 5.4c-.2.9-.2 1.9.2 2.9M13.5 5.4c.2.9.2 1.9-.2 2.9', rol: 'vena' },
    { d: 'M12.2 4.6c.2-.3.4-.5.6-.5s.4.2.6.5c-.2.1-.4.1-.6.1s-.4 0-.6-.1z', rol: 'hoja' },
    { d: elipse(12.2, 6.3, 0.17, 0.6), rol: 'lustre' }],
  'capullo-amapola': [{ d: 'M10 18.6V10c0-1.2-.6-2-1.4-2.6', rol: 'tallo' }, HOJA_DER, NERVIO_DER,
    { d: 'M8.6 8.2c-1.3-.1-2-1.3-1.6-2.5.3-.8 1-1.2 1.6-1.2s1.2.4 1.5 1.2c.4 1.2-.3 2.4-1.5 2.5z', rol: 'hoja' },
    { d: 'M8.6 7.9V5.2M7.8 7.4c-.3-.6-.3-1.3 0-1.9M9.4 7.4c.3-.6.3-1.3 0-1.9', rol: 'nervio' },
    { d: 'M8.6 4.5c.5 0 1 .3 1.2.8-.5-.1-.9 0-1.2.3-.3-.3-.7-.4-1.2-.3.2-.5.7-.8 1.2-.8z', rol: 'petalo' },
    { d: elipse(7.9, 6.2, 0.16, 0.5), rol: 'lustre' }],
  'capullo-loto': [{ d: 'M10 18.6v-6.6', rol: 'tallo' }, ...NENUFAR,
    { d: 'M10 10c-1.7-.8-2.4-3-1.5-5.4.6.4 1.1 1 1.5 1.6.4-.6.9-1.2 1.5-1.6.9 2.4.2 4.6-1.5 5.4z', rol: 'petalo' },
    { d: 'M10 9.6V6.4M9.4 9.4C8.9 8.3 8.7 6.7 8.9 5.4M10.6 9.4c.5-1.1.7-2.7.5-4', rol: 'vena' },
    { d: 'M8.7 9c.4.5.8.9 1.3 1 .5-.1.9-.5 1.3-1-.4.2-.9.3-1.3.3s-.9-.1-1.3-.3z', rol: 'sombra' },
    { d: elipse(9.05, 6.8, 0.17, 0.6), rol: 'lustre' }],

  /* ---------- Etapas sin especie ---------- */
  brote: [
    { d: 'M10 18.6v-5.4', rol: 'tallo' },
    { d: 'M10 14.4c-1.9 0-3.2-1-3.6-2.8 1.9 0 3.2 1 3.6 2.8z', rol: 'hoja' },
    { d: 'M10 13.5c1.7 0 3-.9 3.4-2.6-1.7 0-3 .9-3.4 2.6z', rol: 'hoja' },
    { d: 'M9.6 14.1C8.6 13.5 7.6 12.7 6.9 11.9M10.4 13.2c.9-.5 1.8-1.2 2.5-2', rol: 'nervio' },
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
      case 'tallo': case 'nervio': case 'vena': case 'raya':
        c.strokeStyle = colores[p.rol] || colores.nervio;
        c.lineWidth = { tallo: 0.9, nervio: 0.25, vena: 0.18, raya: 0.16 }[p.rol];
        c.lineCap = 'round'; c.stroke(r); break;
      case 'aro':
        c.strokeStyle = colores.aro; c.lineWidth = 0.35; c.stroke(r); break;
      case 'brillo':
        c.fillStyle = colores.brillo; c.globalAlpha = 0.5; c.fill(r); break;
      case 'petalo': case 'petalo2': case 'centro':
        c.fillStyle = variante[p.rol]; c.fill(r);
        c.strokeStyle = colores.luz; c.lineWidth = 0.2; c.stroke(r); break;
      default:
        c.fillStyle = colores[p.rol] || colores.hoja; c.fill(r);
    }
    c.restore();
  }
  c.restore();
}

export { ESPECIES };
