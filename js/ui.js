// ui.js — Piezas de interfaz compartidas: hojas (dialog), confirmación,
// aviso de Deshacer, avisos de almacenamiento y anuncios para lectores de pantalla.

import { el, icono, vaciar } from './dom.js';
import { t } from './textos.js';

let contador = 0;
const idUnico = (p) => `${p}-${++contador}`;

/**
 * Abre una hoja inferior (en PC, un diálogo centrado).
 * `contenido(cerrar)` devuelve los nodos del cuerpo.
 * Se cierra con Escape, tocando fuera o llamando a cerrar().
 */
export function abrirHoja({ titulo, encabezado = null, contenido, alCerrar = () => {}, etiqueta = 'hoja', clase = '' }) {
  const idTitulo = idUnico('titulo');
  const dialogo = el('dialog', { class: `tv-hoja ${clase}`.trim(), aria: { labelledby: idTitulo }, data: { hoja: etiqueta } });
  const cerrar = () => { if (dialogo.open) dialogo.close(); };
  const cuerpo = el('div', { class: 'tv-hoja__cuerpo' },
    el('div', { class: 'tv-hoja__cabecera' },
      encabezado,
      el('h2', { class: 'tv-hoja__titulo', id: idTitulo, tabindex: '-1' }, titulo),
      el('button', { class: 'tv-boton--icono', type: 'button', aria: { label: t('detalle.cerrar') }, onclick: cerrar, data: { foco: 'cerrar-hoja' } }, icono('cerrar')),
    ),
    contenido(cerrar),
  );
  dialogo.append(cuerpo);
  // Tocar fuera del contenido (el fondo oscurecido) cierra la hoja.
  dialogo.addEventListener('click', (e) => { if (e.target === dialogo) cerrar(); });
  // Al cerrar, el foco vuelve al botón que abrió la hoja (aunque la lista se haya redibujado).
  const origen = document.activeElement?.closest?.('[data-foco]')?.dataset.foco;
  dialogo.addEventListener('close', () => {
    dialogo.remove();
    alCerrar();
    if (origen) setTimeout(() => document.querySelector(`[data-foco="${CSS.escape(origen)}"]`)?.focus({ preventScroll: true }), 0);
  });
  document.body.append(dialogo);
  dialogo.showModal();
  // Foco inicial: el primer elemento marcado con autofocus, o el título (no abre el teclado).
  const auto = dialogo.querySelector('[data-autofoco]');
  (auto || dialogo.querySelector(`#${idTitulo}`)).focus();
  return { cerrar, dialogo };
}

/** Diálogo de confirmación para acciones que no se pueden deshacer. */
export function confirmar({ titulo, texto, si, no = t('confirmar.cancelar') }) {
  return new Promise((resolver) => {
    let respuesta = false;
    abrirHoja({
      titulo,
      etiqueta: 'confirmar',
      alCerrar: () => resolver(respuesta),
      contenido: (cerrar) => [
        el('p', { class: 'texto-ayuda' }, texto),
        el('div', { class: 'tv-hoja__acciones tv-hoja__acciones--fila' },
          el('button', { class: 'tv-boton tv-boton--secundario', type: 'button', onclick: cerrar, 'data-autofoco': '' }, no),
          el('button', { class: 'tv-boton tv-boton--principal', type: 'button', onclick: () => { respuesta = true; cerrar(); } }, si),
        ),
      ],
    });
  });
}

/** Aviso flotante con botón Deshacer. Uno a la vez; dura 5 s (8 s si tiene el foco o el cursor). */
export function crearDeshacer(zona) {
  let temporizador = null;
  let actual = null;
  const ocultar = () => { clearTimeout(temporizador); vaciar(zona); actual = null; };
  const programar = (ms) => { clearTimeout(temporizador); temporizador = setTimeout(ocultar, ms); };
  return {
    /** Sin función `deshacer`, es solo un mensaje breve (por ejemplo, un error amable). */
    mostrar(texto, deshacer = null) {
      ocultar();
      const caja = el('div', { class: 'tv-deshacer', role: 'status' },
        el('span', { class: 'tv-deshacer__texto' }, texto),
        deshacer ? el('button', {
          class: 'tv-deshacer__accion', type: 'button', data: { foco: 'deshacer' },
          onclick: () => { ocultar(); deshacer(); },
        }, icono('deshacer', 'tv-icono--sm'), t('deshacer.boton')) : null,
      );
      caja.addEventListener('pointerenter', () => clearTimeout(temporizador));
      caja.addEventListener('pointerleave', () => programar(3000));
      caja.addEventListener('focusin', () => programar(8000));
      zona.append(caja);
      actual = caja;
      programar(5000);
    },
    ocultar,
    get visible() { return actual !== null; },
  };
}

/**
 * Lista de avisos (almacenamiento, actualización, iPhone).
 * `avisos` es un Map: clave de texto → { accion?: { texto, fn } }.
 */
export function renderAvisos(contenedor, avisos, alCerrar) {
  vaciar(contenedor);
  for (const [clave, op] of avisos) {
    contenedor.append(el('div', { class: 'tv-aviso', role: 'note', data: { aviso: clave } },
      icono('aviso'),
      el('div', { class: 'tv-aviso__texto' },
        el('p', {}, t(clave, op?.vars)),
        op?.accion ? el('button', { class: 'tv-enlace', type: 'button', onclick: op.accion.fn }, op.accion.texto) : null,
      ),
      el('button', { class: 'tv-boton--icono', type: 'button', aria: { label: t('detalle.cerrar') }, onclick: () => alCerrar(clave) }, icono('cerrar', 'tv-icono--sm')),
    ));
  }
}

/** Mensaje para lectores de pantalla. */
export function anunciar(texto) {
  const zona = document.getElementById('anuncio');
  if (!zona) return;
  zona.textContent = '';
  setTimeout(() => { zona.textContent = texto; }, 30);
}
