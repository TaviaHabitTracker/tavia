// vistas/manifiesto.js — Tu manifiesto personal (M8).
// Al abrir la app (una vez al día) aparece unos segundos a pantalla completa. Un toque lo cierra.
// Como esto agrega un toque el primer uso del día, también se puede mostrar como una línea en Hoy.

import { el, menosMovimiento, simboloTavia } from '../dom.js';
import { t } from '../textos.js';

/** Muestra la pantalla del manifiesto si corresponde hoy. */
export function mostrarManifiestoSiToca(ctx) {
  const { modelo } = ctx;
  const c = modelo.config;
  if (ctx.bloqueado || !c.manifiesto || c.manifiestoModo !== 'pantalla') return;
  const hoy = modelo.hoy();
  if (c.manifiestoVisto === hoy) return;
  if (location.hash === '#nuevo' || document.querySelector('dialog[open]')) return; // el usuario vino a hacer otra cosa
  modelo.setConfig({ manifiestoVisto: hoy }, { redibujar: false });
  abrirManifiesto(c.manifiesto);
}

/** Duración: lo justo para leerlo con calma (más tiempo si es largo). */
export function duracionLectura(texto) {
  return Math.min(9000, 2600 + 45 * [...texto].length);
}

/** Pantalla breve con el manifiesto. Se cierra sola, con un toque, con Esc o con el botón. */
export function abrirManifiesto(texto, { alCerrar = () => {} } = {}) {
  const origen = document.activeElement;
  const dialogo = el('dialog', { class: 'manifiesto', aria: { labelledby: 'manifiesto-titulo' }, data: { hoja: 'manifiesto' } },
    el('div', { class: 'manifiesto__caja' },
      simboloTavia('manifiesto__simbolo'),
      el('h2', { class: 'solo-lector', id: 'manifiesto-titulo' }, t('manifiesto.titulo')),
      el('blockquote', { class: 'manifiesto__texto' }, texto),
      el('button', { class: 'tv-boton tv-boton--sutil manifiesto__seguir', type: 'button' }, t('manifiesto.seguir')),
    ),
  );
  let reloj = null;
  const cerrar = () => {
    if (!dialogo.open || dialogo.dataset.saliendo !== undefined) return;
    clearTimeout(reloj);
    if (menosMovimiento()) { dialogo.close(); return; }
    dialogo.dataset.saliendo = '';
    setTimeout(() => dialogo.close(), 260);
  };
  dialogo.addEventListener('click', cerrar); // cualquier toque, en cualquier parte
  dialogo.addEventListener('cancel', (e) => { e.preventDefault(); cerrar(); });
  dialogo.addEventListener('close', () => {
    dialogo.remove();
    if (origen?.isConnected) origen.focus({ preventScroll: true });
    alCerrar();
  });
  document.body.append(dialogo);
  dialogo.showModal();
  dialogo.querySelector('.manifiesto__seguir').focus({ preventScroll: true });
  reloj = setTimeout(cerrar, duracionLectura(texto));
  // Si el usuario pasa el mouse o mueve el foco con teclado, que no se cierre mientras lee.
  dialogo.addEventListener('pointerenter', (e) => { if (e.pointerType === 'mouse') clearTimeout(reloj); });
  dialogo.addEventListener('keydown', (e) => { if (e.key === 'Tab') clearTimeout(reloj); });
  return { cerrar, dialogo };
}

/** Propuesta de manifiesto a partir de las frases de identidad de los hábitos ("Soy una persona que…"). */
export function sugerirManifiesto(habitos) {
  const limpias = habitos
    .filter((h) => !h.archivado && h.identidad)
    .map((h) => h.identidad.trim().replace(/^soy una persona que\s+/i, '').replace(/[.!\s]+$/, ''))
    .filter(Boolean);
  const unicas = [...new Set(limpias)].slice(0, 4);
  // "Soy constante" va como frase propia; "lee cada noche" se une a "Soy una persona que…".
  const propias = unicas.filter((f) => /^soy\b/i.test(f)).map((f) => `${f[0].toUpperCase()}${f.slice(1)}.`);
  const resto = unicas.filter((f) => !/^soy\b/i.test(f));
  const partes = [];
  if (resto.length) {
    const lista = resto.length === 1 ? resto[0] : `${resto.slice(0, -1).join(', ')} y ${resto.at(-1)}`;
    partes.push(t('manifiesto.sugerencia', { lista }));
  }
  partes.push(...propias);
  return partes.length ? `${partes.join(' ')} ${t('manifiesto.cierre')}` : '';
}
