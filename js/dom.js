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
  hoy: [['rect', { x: 4, y: 5, width: 16, height: 15, rx: 3 }], ['path', { d: 'M8 3v4M16 3v4M4 10h16' }], ['circle', { cx: 12, cy: 15, r: 1.6, class: 'tv-relleno' }]],
  progreso: [['rect', { x: 4, y: 4, width: 7, height: 7, rx: 2 }], ['rect', { x: 13, y: 4, width: 7, height: 7, rx: 2 }], ['rect', { x: 4, y: 13, width: 7, height: 7, rx: 2 }], ['rect', { x: 13, y: 13, width: 7, height: 7, rx: 2, class: 'tv-relleno' }]],
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
};

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

/** Símbolo de Tavia (el check dentro del círculo abierto), decorativo. */
export const TRAZOS_SIMBOLO = ['M79.72 38.90A33 33 0 1 1 57.10 16.28', 'M30.5 50.5L42.5 62L78.05 17.95'];
export function simboloTavia(clase = 'vacio__simbolo') {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 96 96');
  svg.setAttribute('class', clase);
  svg.setAttribute('aria-hidden', 'true');
  for (const d of TRAZOS_SIMBOLO) {
    const p = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    p.setAttribute('d', d);
    svg.append(p);
  }
  return svg;
}
