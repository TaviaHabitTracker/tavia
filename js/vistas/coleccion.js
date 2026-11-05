// vistas/coleccion.js — Colección de temas (Pro, en prueba): los 10 temas con sus 5 niveles,
// lo ganado y lo que viene (como «próximo», nunca como castigo), y la pantalla sobria al subir de nivel.

import { el, vaciar } from '../dom.js';
import { t } from '../textos.js';
import { num } from '../formato.js';
import { abrirHoja, anunciar } from '../ui.js';
import { COLECCIONES, UMBRALES, dibujarColeccion, fondoDe, nivelDe, proximoNivel } from '../coleccion.js';

const PRUEBA_MAX = 200;

/** Una baldosa de nivel: con su color si está ganada; punteada y en gris si es la próxima. */
function baldosa(tema, nivel, ganada) {
  const caja = el('span', { class: `coleccion-baldosa${ganada ? '' : ' coleccion-baldosa--proxima'}`, aria: { hidden: 'true' } },
    dibujarColeccion(tema, nivel));
  if (ganada) caja.style.setProperty('--baldosa', fondoDe(tema, nivel));
  return el('span', { class: 'coleccion-nivel' }, caja,
    el('span', { class: 'coleccion-nivel__nombre' }, ganada ? t(`coleccion.${tema}.${nivel}`) : t('coleccion.dias', { n: UMBRALES[nivel - 1] })));
}

export function abrirColeccion(ctx) {
  const { modelo } = ctx;
  const cuerpo = el('div', { class: 'coleccion' });

  function pintar() {
    vaciar(cuerpo);
    const reales = ctx.diasRegistrados();
    const prueba = modelo.config.coleccionPrueba;
    const dias = prueba ?? reales;
    const nivel = nivelDe(dias);
    const proximo = proximoNivel(dias);
    const activo = modelo.config.coleccion;

    // Resumen: los días cuentan para todos los temas a la vez.
    cuerpo.append(el('div', { class: 'tarjeta coleccion-resumen' },
      el('p', { class: 'coleccion-resumen__cifra' }, el('strong', {}, num(dias)), ' ', t(prueba === null ? 'coleccion.diasReales' : 'coleccion.diasSimulados')),
      el('p', { class: 'texto-ayuda' }, t('coleccion.ayuda')),
      proximo ? el('p', { class: 'texto-ayuda' }, t('coleccion.proximo', { nivel: proximo.nivel, dias: proximo.dias, faltan: proximo.faltan })) : el('p', { class: 'texto-ayuda' }, t('coleccion.completa')),
    ));

    // Modo prueba: simular días para ver los 5 niveles sin esperar meses.
    const idRango = 'coleccion-prueba-dias';
    const interruptor = el('input', { type: 'checkbox', role: 'switch', id: 'coleccion-prueba', checked: prueba !== null, data: { foco: 'coleccion-prueba' } });
    interruptor.addEventListener('change', () => {
      modelo.setConfig({ coleccionPrueba: interruptor.checked ? Math.min(reales, PRUEBA_MAX) : null });
      pintar();
    });
    const caja = el('div', { class: 'tarjeta coleccion-prueba' },
      el('label', { class: 'interruptor', for: 'coleccion-prueba' }, el('span', {}, t('coleccion.prueba')), interruptor),
      el('p', { class: 'texto-ayuda' }, t('coleccion.prueba.ayuda')));
    if (prueba !== null) {
      const rango = el('input', { type: 'range', class: 'coleccion-rango', id: idRango, min: '0', max: String(PRUEBA_MAX), step: '1', value: String(prueba), data: { foco: 'coleccion-rango' } });
      const etiqueta = el('label', { class: 'campo__etiqueta', for: idRango }, t('coleccion.prueba.dias', { n: prueba }));
      rango.addEventListener('input', () => { etiqueta.textContent = t('coleccion.prueba.dias', { n: Number(rango.value) }); });
      rango.addEventListener('change', () => {
        const antes = nivelDe(modelo.config.coleccionPrueba ?? 0);
        const nuevo = Number(rango.value);
        modelo.setConfig({ coleccionPrueba: nuevo });
        pintar();
        document.getElementById(idRango)?.focus({ preventScroll: true });
        const despues = nivelDe(nuevo);
        if (activo && despues > antes) abrirSubida(ctx, activo, despues, nuevo);
      });
      const saltos = el('div', { class: 'fila-botones' }, UMBRALES.map((u, i) => el('button', {
        class: 'tv-boton tv-boton--secundario tv-boton--chico', type: 'button', data: { foco: `coleccion-salto-${i + 1}` },
        onclick: () => {
          const antes = nivelDe(modelo.config.coleccionPrueba ?? 0);
          modelo.setConfig({ coleccionPrueba: u });
          pintar();
          if (activo && i + 1 > antes) abrirSubida(ctx, activo, i + 1, u);
        },
      }, t('coleccion.prueba.nivel', { n: i + 1 }))));
      caja.append(el('div', { class: 'campo' }, etiqueta, rango), saltos);
    }
    cuerpo.append(caja);

    // Elegir tema: ninguno (el estilo de siempre) o uno de los 10.
    const lista = el('fieldset', { class: 'coleccion-lista' },
      el('legend', { class: 'campo__etiqueta' }, t('coleccion.elegir')),
      el('label', { class: 'paleta-opcion' },
        el('input', { type: 'radio', name: 'coleccion', value: '', checked: !activo, data: { foco: 'coleccion-ninguno' } }),
        el('span', { class: 'paleta-opcion__texto' },
          el('span', { class: 'paleta-opcion__nombre' }, t('coleccion.ninguno')),
          el('span', { class: 'paleta-opcion__estado' }, t('coleccion.ninguno.desc')))),
      COLECCIONES.map((id) => el('label', { class: 'coleccion-tema' },
        el('input', { type: 'radio', name: 'coleccion', value: id, checked: activo === id, data: { foco: `coleccion-${id}` } }),
        el('span', { class: 'coleccion-tema__cabeza' },
          el('span', { class: 'coleccion-tema__nombre' }, t(`coleccion.${id}`)),
          activo === id ? el('span', { class: 'coleccion-tema__uso' }, t('coleccion.enUso')) : null,
          el('span', { class: 'coleccion-tema__cuenta' }, t('coleccion.cuenta', { n: nivel }))),
        el('span', { class: 'coleccion-tema__desc' }, t(`coleccion.${id}.desc`)),
        el('span', { class: 'coleccion-tema__niveles' }, [1, 2, 3, 4, 5].map((n) => baldosa(id, n, n <= nivel))),
      )));
    lista.addEventListener('change', (e) => {
      modelo.setConfig({ coleccion: e.target.value });
      anunciar(e.target.value ? t('coleccion.usando', { tema: t(`coleccion.${e.target.value}`) }) : t('coleccion.ninguno'));
      pintar();
      document.querySelector(`[data-foco="coleccion-${e.target.value || 'ninguno'}"]`)?.focus({ preventScroll: true });
    });
    cuerpo.append(lista, el('p', { class: 'texto-ayuda' }, t('coleccion.pro')));
  }

  pintar();
  abrirHoja({ titulo: t('coleccion.titulo'), etiqueta: 'coleccion', clase: 'tv-hoja--completa', contenido: () => cuerpo });
}

/** Subiste de nivel: una pantalla sobria, sin confeti ni sonido. */
export function abrirSubida(ctx, tema, nivel, dias = UMBRALES[nivel - 1]) {
  abrirHoja({
    titulo: t(`coleccion.${tema}.${nivel}`),
    etiqueta: 'subida',
    clase: 'tv-hoja--subida',
    encabezado: el('p', { class: 'subida__ceja' }, t('coleccion.subida.ceja', { tema: t(`coleccion.${tema}`) })),
    contenido: (cerrar) => {
      const arte = el('div', { class: 'subida__arte' }, dibujarColeccion(tema, nivel));
      arte.style.setProperty('--baldosa', fondoDe(tema, nivel));
      return [
        arte,
        el('p', { class: 'subida__nivel' }, t('coleccion.subida.nivel', { n: nivel })),
        el('p', { class: 'subida__texto' }, t('coleccion.subida.texto', { n: num(dias) })),
        el('div', { class: 'tv-hoja__acciones' },
          el('button', { class: 'tv-boton tv-boton--principal', type: 'button', 'data-autofoco': '', onclick: () => { cerrar(); if (!document.querySelector('[data-hoja="coleccion"]')) abrirColeccion(ctx); } }, t('coleccion.subida.ver')),
          el('button', { class: 'tv-boton tv-boton--secundario', type: 'button', onclick: cerrar }, t('coleccion.subida.seguir'))),
      ];
    },
  });
}
