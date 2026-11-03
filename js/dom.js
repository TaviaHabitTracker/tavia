// dom.js — Construcción segura del DOM.
// Nunca usamos innerHTML con datos: todo texto entra con textContent,
// así un hábito llamado "<img onerror=…>" se muestra tal cual y no se ejecuta.

const SVG_NS = 'http://www.w3.org/2000/svg';

/**
 * el('button', { class: 'x', onclick: fn, aria: { label: 'Hola' }, data: { id: 1 } }, 'texto', otroNodo)
 * - Atributos `on*` con función → addEventListener.
 * - `aria` y `data` → aria-* y data-*.
 * - `style` no se acepta: los estilos van en styles.css (la CSP bloquea estilos en línea).
 */
export function el(tag, attrs = {}, ...hijos) {
  const nodo = document.createElement(tag);
  aplicar(nodo, attrs);
  agregar(nodo, hijos);
  return nodo;
}

function aplicar(nodo, attrs) {
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v === null || v === undefined || v === false) continue;
    if (k.startsWith('on') && typeof v === 'function') nodo.addEventListener(k.slice(2), v);
    else if (k === 'aria') for (const [a, b] of Object.entries(v)) { if (b !== null && b !== undefined) nodo.setAttribute(`aria-${a}`, String(b)); }
    else if (k === 'data') for (const [a, b] of Object.entries(v)) { if (b !== null && b !== undefined) nodo.dataset[a] = String(b); }
    else if (k === 'class') nodo.className = v;
    else if (k === 'value' && 'value' in nodo) nodo.value = v;
    else if (k === 'checked' || k === 'disabled' || k === 'selected' || k === 'hidden' || k === 'required') nodo[k] = Boolean(v);
    else if (k === 'style') throw new Error('Usa clases, no estilos en línea');
    else nodo.setAttribute(k, v === true ? '' : String(v));
  }
}

function agregar(nodo, hijos) {
  for (const h of hijos.flat(Infinity)) {
    if (h === null || h === undefined || h === false) continue;
    nodo.append(h instanceof Node ? h : document.createTextNode(String(h)));
  }
}

/** Ícono SVG a partir de trazos conocidos (nunca de texto del usuario). */
export function icono(nombre, clase = '') {
  const cuerpo = ICONOS[nombre];
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('class', `tv-icono ${clase}`.trim());
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  for (const [tag, at] of cuerpo) {
    const n = document.createElementNS(SVG_NS, tag);
    for (const [k, v] of Object.entries(at)) n.setAttribute(k, v);
    svg.append(n);
  }
  return svg;
}

// Íconos del sistema de marca (grilla 24, trazo redondeado).
const ICONOS = {
  hecho: [['path', { d: 'M6 12.5l4 4 8-9', class: 'tv-trazo' }]],
  saltado: [['path', { d: 'M7 12h10' }]],
  descanso: [['path', { d: 'M19 14.5A7.5 7.5 0 0 1 9.5 5a7.5 7.5 0 1 0 9.5 9.5z' }]],
  congelado: [['path', { d: 'M12 3v18M4.2 7.5l15.6 9M4.2 16.5l15.6-9M9.5 4.5 12 6l2.5-1.5M9.5 19.5 12 18l2.5 1.5' }]],
  hoy: [['path', { d: 'M12 21v-9' }], ['path', { d: 'M12 14c-4 0-6.5-2.4-6.5-6.5 4 0 6.5 2.4 6.5 6.5z' }], ['path', { d: 'M12 12c0-3.6 2.1-5.8 5.8-5.8 0 3.6-2.1 5.8-5.8 5.8z' }]],
  progreso: [['path', { d: 'M4 20h16M7 16.5v-5M12 16.5V6M17 16.5v-8' }]],
  ajustes: [['path', { d: 'M4 7h9M17 7h3M4 17h3M11 17h9' }], ['circle', { cx: 15, cy: 7, r: 2 }], ['circle', { cx: 9, cy: 17, r: 2 }]],
  deshacer: [['path', { d: 'M9 7 5 11l4 4' }], ['path', { d: 'M5 11h9a5 5 0 0 1 0 10h-2' }]],
  agregar: [['path', { d: 'M12 5v14M5 12h14' }]],
  menos: [['path', { d: 'M6 12h12' }]],
  aviso: [['circle', { cx: 12, cy: 12, r: 8.5 }], ['path', { d: 'M12 11v5M12 8h.01' }]],
  izquierda: [['path', { d: 'M14.5 6 8.5 12l6 6' }]],
  derecha: [['path', { d: 'M9.5 6l6 6-6 6' }]],
  cerrar: [['path', { d: 'M6 6l12 12M18 6 6 18' }]],
  pausa: [['path', { d: 'M9 6v12M15 6v12' }]],
  lapiz: [['path', { d: 'M4 20h4L19 9l-4-4L4 16v4z' }], ['path', { d: 'M13.5 6.5l4 4' }]],
  campana: [['path', { d: 'M6 16V11a6 6 0 0 1 12 0v5l1.5 2h-15z' }], ['path', { d: 'M10 20.5a2 2 0 0 0 4 0' }]],
  candado: [['rect', { x: 5, y: 10, width: 14, height: 10, rx: 3 }], ['path', { d: 'M8 10V8a4 4 0 0 1 8 0v2' }]],
  abierto: [['rect', { x: 5, y: 10, width: 14, height: 10, rx: 3 }], ['path', { d: 'M8 10V8a4 4 0 0 1 7.5-2' }]],
  ritual: [['circle', { cx: 12, cy: 12, r: 8.5 }], ['path', { d: 'M10.5 8.8v6.4l5-3.2z', class: 'tv-relleno' }]],
  respaldo: [['path', { d: 'M12 4v11M7.5 10.5 12 15l4.5-4.5M5 19h14' }]],
  subir: [['path', { d: 'M12 15V4M7.5 8.5 12 4l4.5 4.5M5 19h14' }]],
  calendario: [['rect', { x: 4, y: 5, width: 16, height: 15, rx: 3 }], ['path', { d: 'M8 3v4M16 3v4M4 10h16M12 13v4M10 15h4' }]],
  analisis: [['path', { d: 'M4 19h16M7 16v-5M12 16V7M17 16v-3' }]],
  borrar: [['path', { d: 'M9 5h10a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H9l-6-7z' }], ['path', { d: 'M12 9.5l5 5M17 9.5l-5 5' }]],
  brote: [['path', { d: 'M12 21v-9' }], ['path', { d: 'M12 14c-4 0-6.5-2.4-6.5-6.5 4 0 6.5 2.4 6.5 6.5z' }], ['path', { d: 'M12 12c0-3.6 2.1-5.8 5.8-5.8 0 3.6-2.1 5.8-5.8 5.8z' }]],

  /* Íconos de hábito (mismo grosor y estilo). El hábito guarda un emoji; aquí se dibuja su versión propia. */
  'h-gota': [['path', { d: 'M12 3.5c3.2 4 6 7.2 6 10.5a6 6 0 0 1-12 0c0-3.3 2.8-6.5 6-10.5z' }]],
  'h-libro': [['path', { d: 'M4 5.5C6.5 4.5 9.5 4.6 12 6.2c2.5-1.6 5.5-1.7 8-.7v13c-2.5-1-5.5-.9-8 .7-2.5-1.6-5.5-1.7-8-.7z' }], ['path', { d: 'M12 6.2v13' }]],
  'h-caminar': [['circle', { cx: 13, cy: 4.5, r: 1.8 }], ['path', { d: 'M10.5 21l1.8-6.2-2.3-2.6.9-4.2 2.9 2.3 2.7 1M10.9 8.4 7.6 10.6l-.8 3.2M12.3 14.8l2.6 2.4V21' }]],
  'h-correr': [['circle', { cx: 15, cy: 4.5, r: 1.8 }], ['path', { d: 'M5 11.5l3.2-2.6 4.3.4 2.3 3 3.7.9M12.5 9.3l-2.2 5 3.4 2.1-1.4 4.6M10.3 14.3 6 16.2' }]],
  'h-mente': [['circle', { cx: 12, cy: 5.5, r: 2 }], ['path', { d: 'M12 9v4.5M7.5 11.5l4.5 2 4.5-2M5 19.5c2.2-1.6 4.5-2.4 7-2.4s4.8.8 7 2.4M8.5 16.8 12 13.5l3.5 3.3' }]],
  'h-pesa': [['path', { d: 'M3 9.5v5M6 7.5v9M18 7.5v9M21 9.5v5M6 12h12' }]],
  'h-comida': [['path', { d: 'M3.5 12h17a8.5 8.5 0 0 1-17 0z' }], ['path', { d: 'M12 12c0-3.8 2.2-6.5 6-6.5 0 3.8-2.2 6.5-6 6.5' }]],
  'h-sueno': [['path', { d: 'M19 14.5A7.5 7.5 0 0 1 9.5 5a7.5 7.5 0 1 0 9.5 9.5z' }]],
  'h-diente': [['path', { d: 'M7.6 4.5c-2.4 0-3.6 1.9-3.6 4 0 3 1.6 4.1 2.1 6.6.5 2.4.9 4.9 2.4 4.9 1.7 0 1.4-4.2 3.5-4.2s1.8 4.2 3.5 4.2c1.5 0 1.9-2.5 2.4-4.9.5-2.5 2.1-3.6 2.1-6.6 0-2.1-1.2-4-3.6-4-1.9 0-2.9 1-4.4 1s-2.5-1-4.4-1z' }]],
  'h-pastilla': [['path', { d: 'M10.6 19.4a4 4 0 0 1-5.7-5.7l8.8-8.8a4 4 0 0 1 5.7 5.7z' }], ['path', { d: 'M9.3 9.3l5.4 5.4' }]],
  'h-escribir': [['path', { d: 'M4 20l3.6-1 10-10-2.6-2.6-10 10z' }], ['path', { d: 'M13.6 7.6l2.6 2.6M13 20h7' }]],
  'h-musica': [['path', { d: 'M9 18V5.5l10-2V16' }], ['circle', { cx: 6.5, cy: 18, r: 2.5 }], ['circle', { cx: 16.5, cy: 16, r: 2.5 }]],
  'h-orden': [['path', { d: 'M15 3l-3 9' }], ['path', { d: 'M7 12h9l1.5 8.5h-12z' }], ['path', { d: 'M9.5 16v4.5M13 16v4.5' }]],
  'h-sol': [['circle', { cx: 12, cy: 12, r: 4 }], ['path', { d: 'M12 2.5v2.2M12 19.3v2.2M2.5 12h2.2M19.3 12h2.2M5.3 5.3l1.6 1.6M17.1 17.1l1.6 1.6M5.3 18.7l1.6-1.6M17.1 6.9l1.6-1.6' }]],
  'h-pantalla': [['rect', { x: 7, y: 3, width: 10, height: 18, rx: 2.5 }], ['path', { d: 'M4 4l16 16' }]],
};

/** Emoji del hábito → ícono propio. Los que no están aquí (emojis elegidos a mano) se muestran tal cual. */
export const ICONO_DE_EMOJI = {
  '🌱': 'brote', '💧': 'h-gota', '📖': 'h-libro', '🚶': 'h-caminar', '🏃': 'h-correr', '🧘': 'h-mente',
  '💪': 'h-pesa', '🏋️': 'h-pesa', '🏋': 'h-pesa', '🥗': 'h-comida', '😴': 'h-sueno', '🦷': 'h-diente', '💊': 'h-pastilla',
  '✍️': 'h-escribir', '✍': 'h-escribir', '🎸': 'h-musica', '🎵': 'h-musica', '🧹': 'h-orden', '☀️': 'h-sol', '☀': 'h-sol', '📵': 'h-pantalla',
};

/** Ícono de un hábito: el SVG propio si existe, o el emoji como texto (siempre con textContent). */
export function iconoHabito(emoji, clase = '') {
  const id = ICONO_DE_EMOJI[emoji];
  if (id) return icono(id, clase);
  const s = document.createElement('span');
  s.className = `tv-emoji ${clase}`.trim();
  s.textContent = emoji;
  return s;
}

/** Vacía un nodo. */
export function vaciar(nodo) {
  while (nodo.firstChild) nodo.removeChild(nodo.firstChild);
}

/** Vibración corta si el dispositivo la permite. */
export function vibrar(ms = 12) {
  try { navigator.vibrate?.(ms); } catch { /* sin vibración */ }
}

/** ¿El usuario pidió menos movimiento? */
export const menosMovimiento = () => globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

/* ---------- La flor de Tavia: tres pétalos de vidrio y una perla ámbar ----------
   Laterales de violeta a rosa, central de coral a dorado. Todo SVG propio, sin imágenes.
   Los pétalos laterales giran desde la base (48, 74) con CSS: cerrados ("dormidos") o abiertos. */
const PETALO = 'M48 74C36 63 34 42 48 26C62 42 60 63 48 74Z';
const BRILLO_PETALO = 'M43.5 64C39 56 39.5 45 45.5 35';
let floresCreadas = 0;

function nodoSvg(tag, attrs, padre) {
  const n = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v);
  if (padre) padre.append(n);
  return n;
}

function degradado(defs, id, tipo, paradas, attrs = {}) {
  const g = nodoSvg(tipo, { id, ...attrs }, defs);
  for (const [offset, color, opacidad = 1] of paradas) nodoSvg('stop', { offset, 'stop-color': color, 'stop-opacity': opacidad }, g);
}

function petalo(padre, clase, relleno) {
  const g = nodoSvg('g', { class: clase }, padre);
  nodoSvg('path', { d: PETALO, fill: `url(#${relleno})`, class: 'flor__vidrio' }, g);
  nodoSvg('path', { d: BRILLO_PETALO, class: 'flor__brillo' }, g);
  return g;
}

/**
 * Dibuja la flor. `prefijo` da las clases de estado (brote__hoja--on, brote__yema, brote__flor…)
 * que usan los estilos y las pruebas. `laterales`: [izq, der] abiertos o no; `centro`: 'flor' | 'yema'.
 */
export function flor({ clase, prefijo = 'flor', laterales = [true, true], nuevas = [false, false], centro = 'flor', centroNuevo = false, halo = false } = {}) {
  const id = `tv-flor-${++floresCreadas}`;
  const svg = nodoSvg('svg', { viewBox: '0 0 96 96', class: clase, 'aria-hidden': 'true', focusable: 'false' });
  const defs = nodoSvg('defs', {}, svg);
  degradado(defs, `${id}-l`, 'linearGradient', [['0', '#7E5BEF', 0.92], ['.55', '#B07CF6', 0.86], ['1', '#FF9BC6', 0.9]], { x1: '0', y1: '1', x2: '0', y2: '0' });
  degradado(defs, `${id}-c`, 'linearGradient', [['0', '#FF7A59', 0.95], ['.6', '#FFA05E', 0.92], ['1', '#FFD38A', 0.95]], { x1: '0', y1: '1', x2: '0', y2: '0' });
  degradado(defs, `${id}-p`, 'radialGradient', [['0', '#FFE3B3'], ['.55', '#F2B66D'], ['1', '#C47A2C']], { cx: '.38', cy: '.35', r: '.7' });
  degradado(defs, `${id}-h`, 'radialGradient', [['0', '#F2B66D', 0.45], ['.6', '#FF7A59', 0.12], ['1', '#9B6BFF', 0]]);
  if (halo) nodoSvg('circle', { cx: 48, cy: 52, r: 44, fill: `url(#${id}-h)`, class: 'flor__halo' }, svg);

  ['izq', 'der'].forEach((lado, i) => {
    const on = laterales[i];
    const c = [`${prefijo}__hoja`, `flor__lat`, `flor__lat--${lado}`];
    if (on) c.push(`${prefijo}__hoja--on`);
    if (on && nuevas[i]) c.push(`${prefijo}__hoja--nueva`);
    petalo(svg, c.join(' '), `${id}-l`);
  });

  if (centro === 'flor') {
    const g = nodoSvg('g', { class: `${prefijo}__flor${centroNuevo ? ` ${prefijo}__flor--nueva` : ''}` }, svg);
    petalo(g, 'flor__centro', `${id}-c`);
  } else {
    petalo(svg, `${prefijo}__yema flor__centro flor__centro--yema`, `${id}-c`);
  }

  const perla = nodoSvg('g', { class: 'flor__perla' }, svg);
  nodoSvg('circle', { cx: 48, cy: 75, r: 7, fill: `url(#${id}-p)` }, perla);
  nodoSvg('circle', { cx: 45.6, cy: 72.6, r: 2, class: 'flor__perla-luz' }, perla);
  return svg;
}

/** Trazos del símbolo antiguo: los usa solo la tarjeta anual (dibujo en canvas). */
export const TRAZOS_SIMBOLO = [
  'M77 34A33 33 0 1 1 62 18.5',
  'M48 78V42',
  'M48 64C40 64 31 60 28 49c10 0 18 5 20 15z',
  'M48 56c8 0 16-4 19-15-10 0-17 5-19 15z',
  'M48 42c-5-5-5-13 0-21 5 8 5 16 0 21z',
];
/** Símbolo de Tavia: la flor abierta con su halo. Decorativo. `dormida` la muestra en calma (bloqueo). */
export function simboloTavia(clase = 'vacio__simbolo', { dormida = false } = {}) {
  return flor({ clase: `simbolo ${clase}${dormida ? ' simbolo--dormida' : ''}`, prefijo: 'simbolo', halo: true });
}
