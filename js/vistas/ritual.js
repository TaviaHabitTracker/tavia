// vistas/ritual.js — Modo Ritual: los hábitos pendientes de un bloque, uno por uno,
// a pantalla completa. Sin prisa: "Después" deja el hábito para más tarde sin marcarlo.

import { el, icono } from '../dom.js';
import { t } from '../textos.js';
import { cumplido, estadoDelDia } from '../calculos.js';
import { abrirHoja } from '../ui.js';
import { fraseIdentidad, num, numCampo, resumenMeta } from '../formato.js';

/** Hábitos pendientes del bloque hoy (los ya decididos o hechos no entran). */
export function pendientesDelBloque(vistas, bloque) {
  return vistas
    .filter((v) => v.habito.bloque === bloque && v.requerido && ['pendiente', 'parcial'].includes(v.estado))
    .sort((a, b) => a.habito.orden - b.habito.orden)
    .map((v) => v.habito);
}

export function abrirRitual(ctx, bloque, habitos) {
  if (!habitos.length) return;
  const fecha = ctx.modelo.hoy();
  let i = 0;
  let hechos = 0;
  abrirHoja({
    titulo: t('ritual.titulo', { bloque: t(`bloque.${bloque}`).toLowerCase() }),
    etiqueta: 'ritual',
    clase: 'tv-hoja--completa',
    contenido: (cerrar) => {
      const caja = el('div', { class: 'ritual' });
      const avanzar = (cumplio) => { if (cumplio) hechos++; i++; dibujar(); };
      const dibujar = () => {
        if (i >= habitos.length) {
          caja.replaceChildren(
            el('div', { class: 'ritual__centro' },
              el('p', { class: 'ritual__icono', aria: { hidden: 'true' } }, '✓'),
              el('h3', { class: 'ritual__nombre', tabindex: '-1', 'data-foco-ritual': '' }, t('ritual.fin.titulo')),
              el('p', { class: 'texto-ayuda' }, t('ritual.fin.texto', { hechos, total: habitos.length }))),
            el('button', { class: 'tv-boton tv-boton--principal tv-boton--ancho', type: 'button', onclick: cerrar }, t('ritual.cerrar')),
          );
          caja.querySelector('[data-foco-ritual]').focus();
          return;
        }
        const h = ctx.modelo.habito(habitos[i].id);
        caja.replaceChildren(paso(ctx, h, fecha, i, habitos.length, avanzar));
        caja.querySelector('[data-foco-ritual]')?.focus();
      };
      dibujar();
      return caja;
    },
  });
}

function paso(ctx, h, fecha, i, total, avanzar) {
  const log = ctx.modelo.logDe(h.id, fecha);
  const identidad = fraseIdentidad(h);
  const meta = resumenMeta(h, log);
  const acciones = el('div', { class: 'ritual__acciones' });

  if (h.tipo === 'cantidad') {
    const id = `ritual-valor-${h.id}`;
    const entrada = el('input', { class: 'entrada entrada--numero entrada--grande', id, type: 'text', inputmode: 'decimal', autocomplete: 'off', value: log?.estado === 'registrado' ? numCampo(log.valor) : '', placeholder: h.meta.min !== null ? num(h.meta.min) : '0' });
    const error = el('p', { class: 'error-campo', role: 'alert' });
    const form = el('form', { class: 'form', novalidate: true },
      el('label', { class: 'campo__etiqueta', for: id }, h.unidad ? `${t('detalle.valor')} (${h.unidad})` : t('detalle.valor')),
      entrada, error,
      el('button', { class: 'tv-boton tv-boton--principal tv-boton--ancho tv-boton--grande', type: 'submit' }, icono('hecho'), t('detalle.guardar')));
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      if (!entrada.value.trim()) { entrada.focus(); return; }
      const r = ctx.fijarValor(h.id, fecha, entrada.value, { silencioso: true });
      if (r?.error) { error.textContent = t(r.error); entrada.focus(); return; }
      avanzar(cumplido(estadoDelDia(h, ctx.modelo.logDe(h.id, fecha))));
    });
    acciones.append(form);
  } else {
    const valor = log?.estado === 'registrado' ? log.valor : 0;
    acciones.append(el('button', {
      class: 'tv-boton tv-boton--principal tv-boton--ancho tv-boton--grande', type: 'button', 'data-foco-ritual': '',
      onclick: () => {
        ctx.tocar(h.id, fecha);
        const ahora = estadoDelDia(h, ctx.modelo.logDe(h.id, fecha));
        if (cumplido(ahora)) avanzar(true);
        else avanzarParcial();
      },
    }, icono(h.vecesPorDia > 1 ? 'agregar' : 'hecho'), h.vecesPorDia > 1 ? `${t('ritual.hecho')} (${valor}/${h.vecesPorDia})` : t('ritual.hecho')));
    // Con N veces al día, cada toque suma; el paso se queda hasta completar o pasar.
    function avanzarParcial() {
      const nodo = acciones.closest('.ritual');
      nodo.replaceChildren(paso(ctx, ctx.modelo.habito(h.id), fecha, i, total, avanzar));
      nodo.querySelector('[data-foco-ritual]')?.focus();
    }
  }

  acciones.append(el('div', { class: 'tv-hoja__acciones tv-hoja__acciones--fila' },
    el('button', { class: 'tv-boton tv-boton--secundario', type: 'button', onclick: () => avanzar(false) }, t('ritual.despues')),
    el('button', { class: 'tv-boton tv-boton--secundario', type: 'button', onclick: () => { ctx.fijarEstado(h.id, fecha, 'saltado', { silencioso: true }); avanzar(false); } }, t('ritual.hoyNo')),
  ));

  return el('div', { class: `ritual__paso color-${h.color}` },
    el('p', { class: 'ritual__progreso' }, t('ritual.progreso', { n: i + 1, total })),
    el('div', { class: 'ritual__centro' },
      el('p', { class: 'ritual__icono', aria: { hidden: 'true' } }, h.icono),
      el('h3', { class: 'ritual__nombre', tabindex: '-1', ...(h.tipo === 'cantidad' ? { 'data-foco-ritual': '' } : {}) }, h.nombre),
      meta ? el('p', { class: 'texto-ayuda' }, meta) : null,
      identidad ? el('p', { class: 'tv-identidad' }, identidad) : null,
    ),
    acciones,
  );
}
