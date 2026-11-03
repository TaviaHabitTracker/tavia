// vistas/ajustes.js — Hábitos, apariencia, día, recordatorios, seguridad, datos e instalación.

import { el, icono, iconoHabito } from '../dom.js';
import { APP, t } from '../textos.js';
import { BLOQUEOS, FINES_DE_DIA, HEMISFERIOS, LIMITES, MODOS_MANIFIESTO, TEMAS, UMBRALES_JARDIN } from '../esquema.js';
import { diffDias, fechaLarga } from '../fechas.js';
import { pausaActual } from '../calculos.js';
import { confirmar } from '../ui.js';
import { pedirPermiso } from '../recordatorios.js';
import { configurarPin, quitarPin } from './seguridad.js';
import { exportar, exportarCSV, exportarICS, importar } from './datos.js';
import { paletas, paletaEfectiva } from '../temas.js';
import { abrirManifiesto, sugerirManifiesto } from './manifiesto.js';
import { num } from '../formato.js';
import { seccionFrases } from './frases.js';
import { seccionPalabras } from './palabras.js';
import { seccionAjustesDesc } from './descubrimientos.js';

export function renderAjustes(raiz, ctx) {
  const { modelo } = ctx;
  raiz.append(el('header', { class: 'cabecera' }, el('h1', { class: 'titulo-pantalla' }, t('ajustes.titulo'))));
  raiz.append(ctx.contenedorAvisos);
  raiz.append(seccionHabitos(ctx));
  raiz.append(seccionApariencia(ctx));
  raiz.append(seccionManifiesto(ctx));
  raiz.append(el('section', { class: 'seccion', id: 'frases' },
    el('h2', { class: 'seccion__titulo' }, t('ajustes.frases')),
    seccionFrases(ctx),
    seccionPalabras(ctx)));
  raiz.append(seccionJardin(ctx));
  raiz.append(seccionAjustesDesc(ctx));

  const idFin = 'ajuste-fin-dia';
  const select = el('select', { class: 'entrada entrada--corta', id: idFin, data: { foco: 'fin-dia' } },
    FINES_DE_DIA.map((h) => el('option', { value: h, selected: modelo.config.finDelDia === h }, h)));
  select.addEventListener('change', () => modelo.setConfig({ finDelDia: select.value }));
  raiz.append(el('section', { class: 'seccion' },
    el('h2', { class: 'seccion__titulo' }, t('ajustes.dia')),
    el('div', { class: 'tarjeta' },
      el('div', { class: 'campo' },
        el('label', { class: 'campo__etiqueta', for: idFin }, t('ajustes.finDelDia')),
        select,
        el('p', { class: 'texto-ayuda' }, t('ajustes.finDelDia.ayuda')),
      ),
    ),
  ));

  const idOrden = 'ajuste-hechos-final';
  const interruptor = el('input', { type: 'checkbox', role: 'switch', id: idOrden, checked: modelo.config.hechosAlFinal, data: { foco: 'hechos-final' } });
  interruptor.addEventListener('change', () => modelo.setConfig({ hechosAlFinal: interruptor.checked }));
  raiz.append(el('section', { class: 'seccion' },
    el('h2', { class: 'seccion__titulo' }, t('ajustes.lista')),
    el('div', { class: 'tarjeta' },
      el('label', { class: 'interruptor', for: idOrden }, el('span', {}, t('ajustes.hechosAlFinal')), interruptor),
    ),
  ));

  raiz.append(seccionRecordatorios(ctx));
  raiz.append(seccionSeguridad(ctx));
  raiz.append(seccionDatos(ctx));
  raiz.append(seccionInstalar(ctx));
  raiz.append(el('p', { class: 'nota-pie' }, `${APP.nombreCompleto} · ${t('ajustes.version', { v: APP.version })}`));
}

function seccionHabitos(ctx) {
  const { modelo } = ctx;
  const hoy = modelo.hoy();
  const lista = [...ctx.visibles()].sort((a, b) => (!!a.archivado - !!b.archivado) || a.orden - b.orden);
  const tarjeta = el('div', { class: 'tarjeta' });
  if (lista.length === 0) tarjeta.append(el('p', { class: 'texto-ayuda' }, t('ajustes.habitos.vacio')));

  for (const h of lista) {
    const pausa = pausaActual(h, hoy);
    const estado = h.archivado ? t('ajustes.archivado') : pausa ? t('ajustes.pausado', { fecha: fechaLarga(pausa.hasta) }) : t('ajustes.activo');
    const acciones = [];
    if (h.archivado) {
      acciones.push(boton(t('ajustes.restaurar'), `restaurar-${h.id}`, () => modelo.restaurar(h.id)));
      acciones.push(boton(t('ajustes.eliminar'), `eliminar-${h.id}`, async () => {
        const ok = await confirmar({
          titulo: t('confirmar.eliminar.titulo', { nombre: h.nombre }),
          texto: t('confirmar.eliminar.texto', { n: modelo.cuantosLogs(h.id) }),
          si: t('confirmar.eliminar.si'),
        });
        if (ok) modelo.eliminar(h.id);
      }));
    } else {
      if (pausa) acciones.push(boton(t('ajustes.reanudar'), `reanudar-${h.id}`, () => modelo.reanudar(h.id)));
      acciones.push(el('button', {
        class: 'tv-boton--icono', type: 'button', data: { foco: `editar-${h.id}` },
        aria: { label: `${t('detalle.editar')}: ${h.nombre}` }, onclick: () => ctx.abrirEditor(h.id),
      }, icono('lapiz')));
    }
    tarjeta.append(el('div', { class: `fila-habito color-${h.color}` },
      el('span', { class: `tv-habito__icono color-${h.color}`, aria: { hidden: 'true' } }, iconoHabito(h.icono)),
      el('div', { class: 'fila-habito__texto' },
        el('span', { class: 'fila-habito__nombre' }, h.nombre),
        el('span', { class: 'fila-habito__estado' }, estado),
      ),
      el('div', { class: 'fila-habito__acciones' }, acciones),
    ));
  }

  return el('section', { class: 'seccion' },
    el('h2', { class: 'seccion__titulo' }, t('ajustes.habitos')),
    tarjeta,
  );
}

function boton(texto, foco, onclick) {
  return el('button', { class: 'tv-boton tv-boton--secundario', type: 'button', data: { foco }, onclick }, texto);
}

/** Cómo instalar Tavia en cada dispositivo (y botón directo donde el navegador lo permite). */
function seccionInstalar(ctx) {
  const pwa = ctx.pwa;
  const tarjeta = el('div', { class: 'tarjeta', id: 'instalar' });
  if (pwa?.instalada) {
    tarjeta.append(el('p', { class: 'texto-ayuda' }, t('instalar.lista')));
  } else {
    if (pwa?.puedeInstalar) {
      tarjeta.append(el('button', {
        class: 'tv-boton tv-boton--principal', type: 'button', data: { foco: 'instalar' },
        onclick: () => pwa.instalar(),
      }, icono('agregar'), t('instalar.boton')));
    }
    const pasos = pwa?.esIOS ? ['instalar.ios'] : ['instalar.android', 'instalar.pc', 'instalar.ios'];
    for (const k of pasos) tarjeta.append(el('p', { class: 'texto-ayuda' }, t(k)));
    if (pwa?.esIOS) tarjeta.append(el('p', { class: 'texto-ayuda texto-ayuda--miel' }, t('aviso.ios')));
  }
  tarjeta.append(el('p', { class: 'texto-ayuda' }, t('instalar.offline')));
  return el('section', { class: 'seccion' }, el('h2', { class: 'seccion__titulo' }, t('instalar.titulo')), tarjeta);
}

function seccion(titulo, ...hijos) {
  return el('section', { class: 'seccion' }, el('h2', { class: 'seccion__titulo' }, titulo), el('div', { class: 'tarjeta' }, ...hijos));
}

/** Tema: automático, claro u oscuro. */
function seccionApariencia(ctx) {
  const { modelo } = ctx;
  const grupo = el('fieldset', { class: 'segmentos' },
    el('legend', { class: 'solo-lector' }, t('ajustes.apariencia')),
    TEMAS.map((v) => el('label', { class: 'segmento' },
      el('input', { type: 'radio', name: 'tema', value: v, checked: modelo.config.tema === v, data: { foco: `tema-${v}` } }),
      el('span', {}, t(`tema.${v}`)))));
  grupo.addEventListener('change', (e) => modelo.setConfig({ tema: e.target.value }));

  // Paletas exclusivas: se ganan con días registrados (seguidos o no) y se eligen aquí.
  const dias = ctx.diasRegistrados();
  const actual = paletaEfectiva(modelo.config.paleta, dias);
  const lista = el('fieldset', { class: 'paletas' },
    el('legend', { class: 'campo__etiqueta' }, t('paleta.titulo')),
    paletas(dias).map((p) => el('label', { class: 'paleta-opcion', data: { bloqueada: p.ganada ? null : '' } },
      el('input', { type: 'radio', name: 'paleta', value: p.id, checked: actual === p.id, disabled: !p.ganada, data: { foco: `paleta-${p.id}` } }),
      el('span', { class: `muestra muestra--${p.id}`, aria: { hidden: 'true' } }),
      el('span', { class: 'paleta-opcion__texto' },
        el('span', { class: 'paleta-opcion__nombre' }, t(`paleta.${p.id}`)),
        el('span', { class: 'paleta-opcion__estado' }, p.ganada ? t(p.dias ? 'paleta.ganadaCon' : 'paleta.base', { n: p.dias }) : t('paleta.faltan', { n: p.dias, faltan: p.faltan }))),
    )));
  lista.addEventListener('change', (e) => modelo.setConfig({ paleta: e.target.value }));
  return seccion(t('ajustes.apariencia'), grupo, el('p', { class: 'texto-ayuda' }, t('tema.ayuda')),
    el('div', { class: 'separador' }), lista, el('p', { class: 'texto-ayuda' }, t('paleta.ayuda', { n: num(dias) })));
}

/** Manifiesto personal: unas líneas propias que se muestran al abrir (o arriba en Hoy). */
function seccionManifiesto(ctx) {
  const { modelo } = ctx;
  const id = 'ajuste-manifiesto';
  const area = el('textarea', {
    class: 'entrada entrada--area', id, rows: '4', maxlength: String(LIMITES.manifiesto),
    placeholder: t('manifiesto.ph'), data: { foco: 'manifiesto' }, aria: { describedby: `${id}-ayuda` },
  });
  area.value = modelo.config.manifiesto;
  // Se guarda sin redibujar: así el toque en "Ver cómo se ve" no se pierde y el cursor queda donde estaba.
  const guardar = () => { if (area.value.trim() !== modelo.config.manifiesto) modelo.setConfig({ manifiesto: area.value }, { redibujar: false }); };
  area.addEventListener('change', guardar);

  const modos = el('fieldset', { class: 'segmentos segmentos--columna' },
    el('legend', { class: 'campo__etiqueta' }, t('manifiesto.modo')),
    MODOS_MANIFIESTO.map((m) => el('label', { class: 'segmento' },
      el('input', { type: 'radio', name: 'manifiesto-modo', value: m, checked: modelo.config.manifiestoModo === m, data: { foco: `manifiesto-${m}` } }),
      el('span', {}, t(`manifiesto.modo.${m}`)))));
  modos.addEventListener('change', (e) => modelo.setConfig({ manifiestoModo: e.target.value }));

  const sugerencia = sugerirManifiesto(ctx.visibles());
  return seccion(t('manifiesto.titulo'),
    el('div', { class: 'campo' },
      el('label', { class: 'campo__etiqueta', for: id }, t('manifiesto.etiqueta')),
      area,
      el('p', { class: 'texto-ayuda', id: `${id}-ayuda` }, t('manifiesto.ayuda', { max: LIMITES.manifiesto })),
    ),
    el('div', { class: 'fila-botones' },
      sugerencia ? el('button', { class: 'tv-boton tv-boton--secundario tv-boton--chico', type: 'button', data: { foco: 'manifiesto-sugerir' }, onclick: () => { area.value = sugerencia; guardar(); area.focus(); } }, t('manifiesto.sugerir')) : null,
      el('button', { class: 'tv-boton tv-boton--secundario tv-boton--chico', type: 'button', data: { foco: 'manifiesto-ver' }, onclick: () => { guardar(); if (area.value.trim()) abrirManifiesto(area.value.trim()); else area.focus(); } }, t('manifiesto.ver')),
    ),
    el('div', { class: 'separador' }),
    modos,
    el('p', { class: 'texto-ayuda' }, t('manifiesto.modo.ayuda')),
  );
}

/** Recordatorios: avisos del navegador (con la app abierta) y archivo para el calendario. */
function seccionRecordatorios(ctx) {
  const { modelo } = ctx;
  const soporte = typeof Notification !== 'undefined';
  const permiso = soporte ? Notification.permission : 'no-soportado';
  const id = 'ajuste-avisos';
  const interruptor = el('input', { type: 'checkbox', role: 'switch', id, checked: modelo.config.notificaciones && permiso === 'granted', disabled: !soporte || permiso === 'denied', data: { foco: 'avisos' } });
  interruptor.addEventListener('change', async () => {
    if (!interruptor.checked) { modelo.setConfig({ notificaciones: false }); return; }
    const r = await pedirPermiso();
    modelo.setConfig({ notificaciones: r === 'granted' });
  });
  const hay = modelo.config.recordatorios.length > 0;
  return seccion(t('recordatorios.titulo'),
    el('label', { class: 'interruptor', for: id }, el('span', {}, t('recordatorios.avisos')), interruptor),
    el('p', { class: 'texto-ayuda' }, permiso === 'denied' ? t('recordatorios.bloqueados') : !soporte ? t('recordatorios.noSoportado') : t('recordatorios.avisos.ayuda')),
    el('div', { class: 'separador' }),
    el('p', { class: 'texto-ayuda' }, t('recordatorios.honesto')),
    el('button', { class: 'tv-boton tv-boton--secundario', type: 'button', disabled: !hay, data: { foco: 'ics' }, onclick: () => exportarICS(ctx) }, icono('calendario', 'tv-icono--sm'), t('recordatorios.ics')),
    el('p', { class: 'texto-ayuda' }, t(hay ? 'recordatorios.ics.ayuda' : 'recordatorios.ics.vacio')),
  );
}

/** PIN, bloqueo automático y explicación honesta. */
function seccionSeguridad(ctx) {
  const { modelo } = ctx;
  const tiene = Boolean(modelo.config.pinHash);
  const hijos = [el('p', {}, t(tiene ? 'seguridad.pin.activo' : 'seguridad.pin.inactivo'))];
  if (tiene) {
    const id = 'ajuste-bloqueo';
    const etiqueta = (s) => (s === 0 ? t('seguridad.bloqueo.0') : s < 60 ? t('seguridad.bloqueo.s', { n: s }) : s === 60 ? t('seguridad.bloqueo.1m') : t('seguridad.bloqueo.m', { n: s / 60 }));
    const select = el('select', { class: 'entrada', id, data: { foco: 'bloqueo' } }, BLOQUEOS.map((s) => el('option', { value: String(s), selected: modelo.config.bloqueoSegundos === s }, etiqueta(s))));
    select.addEventListener('change', () => modelo.setConfig({ bloqueoSegundos: Number(select.value) }));
    hijos.push(el('div', { class: 'campo' }, el('label', { class: 'campo__etiqueta', for: id }, t('seguridad.bloqueo')), select));
    hijos.push(el('div', { class: 'fila-botones' },
      el('button', { class: 'tv-boton tv-boton--secundario', type: 'button', data: { foco: 'pin-cambiar' }, onclick: () => configurarPin(ctx) }, t('seguridad.pin.cambiar')),
      el('button', { class: 'tv-boton tv-boton--sutil', type: 'button', data: { foco: 'pin-quitar' }, onclick: () => quitarPin(ctx) }, t('seguridad.pin.quitar'))));
  } else {
    hijos.push(el('button', { class: 'tv-boton tv-boton--principal', type: 'button', data: { foco: 'pin-activar' }, onclick: () => configurarPin(ctx) }, icono('candado', 'tv-icono--sm'), t('seguridad.pin.activar')));
  }
  hijos.push(el('p', { class: 'texto-ayuda' }, t('seguridad.honesto')));
  return seccion(t('seguridad.titulo'), ...hijos);
}

/** Exportar, importar, último respaldo y protección del almacenamiento. */
function seccionDatos(ctx) {
  const { modelo } = ctx;
  const u = modelo.config.ultimoRespaldo;
  const dias = u ? diffDias(u, modelo.hoy()) : null;
  const cuando = dias === null ? null : dias === 0 ? t('datos.ultimo.hoy') : t('datos.ultimo.dias', { n: dias });
  const estadoPersistencia = el('p', { class: 'texto-ayuda', aria: { live: 'polite' } });
  const botonPersistir = el('button', { class: 'tv-boton tv-boton--sutil', type: 'button', hidden: true, onclick: async () => { await ctx.almacen.pedirPersistencia(); revisar(); } }, t('datos.persistente.pedir'));
  const revisar = async () => {
    let p = false;
    try { p = await navigator.storage?.persisted?.(); } catch { /* sin soporte */ }
    estadoPersistencia.textContent = t(p ? 'datos.persistente.si' : 'datos.persistente.no');
    botonPersistir.hidden = Boolean(p) || !navigator.storage?.persist;
  };
  revisar();
  const lugar = el('p', { class: 'texto-ayuda' }, t(`datos.motor.${ctx.almacen.motor ?? 'memoria'}`));
  ctx.almacen.espacioUsado().then((b) => {
    if (b !== null && ctx.almacen.motor) lugar.textContent = `${t(`datos.motor.${ctx.almacen.motor}`)} ${t('datos.espacio', { kb: num(Math.max(1, Math.round(b / 1024))) })}`;
  });
  return seccion(t('datos.titulo'),
    el('p', {}, t('ajustes.datos.ok')),
    lugar,
    el('p', { class: dias !== null && dias <= 14 ? 'texto-ayuda' : 'texto-ayuda texto-ayuda--miel' }, cuando ? t('datos.ultimo', { cuando }) : t('datos.ultimo.nunca')),
    el('button', { class: 'tv-boton tv-boton--principal', type: 'button', data: { foco: 'exportar' }, onclick: () => exportar(ctx) }, icono('respaldo', 'tv-icono--sm'), t('datos.exportar')),
    el('button', { class: 'tv-boton tv-boton--secundario', type: 'button', data: { foco: 'exportar-cifrado' }, onclick: () => exportar(ctx, { cifrado: true }) }, icono('candado', 'tv-icono--sm'), t('datos.exportarCifrado')),
    el('button', { class: 'tv-boton tv-boton--secundario', type: 'button', data: { foco: 'csv' }, onclick: () => exportarCSV(ctx) }, t('datos.csv')),
    el('p', { class: 'texto-ayuda' }, t('datos.exportar.aviso')),
    el('button', { class: 'tv-boton tv-boton--secundario', type: 'button', data: { foco: 'importar' }, onclick: () => importar(ctx) }, icono('subir', 'tv-icono--sm'), t('datos.importar')),
    el('div', { class: 'separador' }),
    estadoPersistencia,
    botonPersistir,
    el('p', { class: 'texto-ayuda' }, t('datos.persistente.ayuda')),
  );
}

/** Jardín anual: estaciones, cuándo florece un día, movimiento, vibración y sonido. */
function seccionJardin(ctx) {
  const { modelo } = ctx;
  const j = modelo.config.jardin;
  const fijar = (cambio) => modelo.setConfig({ jardin: { ...modelo.config.jardin, ...cambio } });

  const hemisferio = el('fieldset', { class: 'segmentos' },
    el('legend', { class: 'campo__etiqueta' }, t('jardin.ajustes.hemisferio')),
    HEMISFERIOS.map((v) => el('label', { class: 'segmento' },
      el('input', { type: 'radio', name: 'jardin-hemisferio', value: v, checked: j.hemisferio === v, data: { foco: `jardin-hem-${v}` } }),
      el('span', {}, t(`jardin.ajustes.hemisferio.${v}`)))));
  hemisferio.addEventListener('change', (e) => fijar({ hemisferio: e.target.value }));

  const idUmbral = 'jardin-umbral';
  const umbral = el('select', { class: 'entrada entrada--corta', id: idUmbral, data: { foco: 'jardin-umbral' } },
    UMBRALES_JARDIN.map((n) => el('option', { value: String(n), selected: j.umbral === n }, n === 100 ? t('jardin.ajustes.umbral.todo') : t('jardin.ajustes.umbral.op', { n }))));
  umbral.addEventListener('change', () => fijar({ umbral: Number(umbral.value) }));

  const interruptor = (clave) => {
    const id = `jardin-${clave}`;
    const input = el('input', { type: 'checkbox', role: 'switch', id, checked: j[clave], data: { foco: id } });
    input.addEventListener('change', () => fijar({ [clave]: input.checked }));
    return el('label', { class: 'interruptor', for: id }, el('span', {}, t(`jardin.ajustes.${clave}`)), input);
  };

  return seccion(t('jardin.ajustes'),
    hemisferio,
    el('div', { class: 'campo' },
      el('label', { class: 'campo__etiqueta', for: idUmbral }, t('jardin.ajustes.umbral')),
      umbral,
      el('p', { class: 'texto-ayuda' }, t('jardin.ajustes.umbral.ayuda'))),
    interruptor('animaciones'), interruptor('vibracion'), interruptor('sonido'),
    el('p', { class: 'texto-ayuda' }, t('jardin.ajustes.ayuda')));
}
