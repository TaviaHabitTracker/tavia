// vistas/anual.js — Hoja "Tu año en Tavia": la tarjeta (canvas), el resumen en texto y Guardar imagen.
// La imagen se crea en el dispositivo; no se sube a ningún lado.

import { el, icono } from '../dom.js';
import { t } from '../textos.js';
import { abrirHoja, anunciar } from '../ui.js';
import { aniosDisponibles, resumenAnual, resumenListo } from '../anual.js';
import { ALTO, ANCHO, dibujarTarjeta, paneles, prepararFuentes, textoAlternativo, fraseFinal } from '../tarjeta-anual.js';
import { entregarArchivo } from '../respaldo.js';
import { num } from '../formato.js';

export async function abrirAnual(ctx, anio = Number(ctx.modelo.hoy().slice(0, 4))) {
  const { modelo } = ctx;
  const hoy = modelo.hoy();
  const habitos = ctx.visibles();
  const anios = aniosDisponibles(habitos, hoy);
  await prepararFuentes();

  abrirHoja({
    titulo: t('anual.titulo', { anio }),
    etiqueta: 'anual',
    clase: 'tv-hoja--anual',
    contenido: (cerrar) => {
      const r = resumenAnual(habitos, anio, hoy, modelo.logDe, { revisiones: modelo.revisiones() });
      const hijos = [];

      if (anios.length > 1) {
        const id = 'anual-anio';
        const select = el('select', { class: 'entrada', id, onchange: () => { cerrar(); abrirAnual(ctx, Number(select.value)); } },
          ...anios.map((a) => el('option', { value: String(a), selected: a === anio }, String(a))));
        hijos.push(el('div', { class: 'campo' }, el('label', { class: 'campo__etiqueta', for: id }, t('anual.elegir')), select));
      }

      if (!resumenListo(r)) {
        hijos.push(el('p', { class: 'texto-ayuda' }, t('anual.pocos')));
        return hijos;
      }

      const lienzo = el('canvas', { class: 'anual__lienzo', width: String(ANCHO), height: String(ALTO), role: 'img', aria: { label: textoAlternativo(r) } });
      dibujarTarjeta(lienzo, r);

      const guardar = el('button', { class: 'tv-boton tv-boton--principal tv-boton--ancho', type: 'button', data: { foco: 'anual-guardar' } },
        icono('respaldo', 'tv-icono--sm'), t('anual.guardar'));
      guardar.addEventListener('click', async () => {
        guardar.disabled = true;
        try {
          const blob = await new Promise((ok, mal) => lienzo.toBlob((b) => (b ? ok(b) : mal(new Error('vacío'))), 'image/png'));
          if (await entregarArchivo(`tavia-${anio}.png`, blob, 'image/png')) anunciar(t('anual.guardada'));
        } catch {
          ctx.mostrarError(t('anual.error'));
        } finally {
          guardar.disabled = false;
        }
      });

      const privados = Boolean(modelo.config.pinHash) && !ctx.mostrarPrivados() && modelo.habitos().some((h) => h.privado);
      hijos.push(
        el('div', { class: 'anual__marco' }, lienzo),
        guardar,
        el('p', { class: 'texto-ayuda' }, t('anual.local')),
        privados ? el('p', { class: 'texto-ayuda' }, t('anual.privados')) : null,
        // El mismo resumen en texto: se lee mejor con lector de pantalla y sirve si la imagen no carga.
        el('ul', { class: 'lista-simple anual__lista' },
          el('li', {}, `${num(r.diasConRegistro)} ${t('anual.diasCon', { n: r.diasConRegistro })}`),
          ...paneles(r).map(([v, e]) => el('li', {}, `${v} · ${e}`)),
          r.congelados ? el('li', {}, t('anual.congelados', { n: r.congelados })) : null,
          r.revisiones ? el('li', {}, t('anual.revisiones', { n: r.revisiones })) : null,
          el('li', {}, fraseFinal(r)),
        ),
      );
      return hijos;
    },
  });
}
