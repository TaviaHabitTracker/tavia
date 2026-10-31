// vistas/hoy.js — La pantalla Hoy: hace una sola cosa, marcar lo de hoy.

import { el, icono } from '../dom.js';
import { t } from '../textos.js';
import { BLOQUES } from '../esquema.js';
import { fechaLarga, inicioSemana, sumarDias } from '../fechas.js';
import { cumplido, enPausa, estadoDelDia, progresoDelDia, tocaEnFecha, vistaDelDia } from '../calculos.js';
import { fraseIdentidad, nombreDelDia, num, resumenFrecuencia, resumenMeta, textoRacha } from '../formato.js';
import { congeladores, puedeCongelar, rachaAntesDe } from '../estadisticas.js';
import { recordatoriosVencidos } from '../recordatorios.js';
import { semanaParaRevisar } from '../insights.js';
import { abrirRitual, pendientesDelBloque } from './ritual.js';
import { abrirRevision } from './semana.js';
import { pedirPin } from './seguridad.js';

const ICONO_ESTADO = { saltado: 'saltado', descanso: 'descanso', congelado: 'congelado' };

export function renderHoy(raiz, ctx) {
  const { modelo } = ctx;
  const hoy = modelo.hoy();
  const fecha = ctx.fechaVista && ctx.fechaVista < hoy ? ctx.fechaVista : hoy;
  // Bóveda: con PIN, los hábitos privados no aparecen (ni en los conteos) hasta mostrarlos.
  const todos = ctx.visibles();
  const vivos = todos.filter((h) => !h.archivado);
  const hayPrivados = Boolean(modelo.config.pinHash) && modelo.habitos().some((h) => h.privado && !h.archivado);

  const vistas = todos.filter((h) => tocaEnFecha(h, fecha)).map((h) => vistaDelDia(h, fecha, modelo.logDe));
  const prog = progresoDelDia(vistas);

  raiz.append(cabecera(ctx, fecha, hoy, prog, vivos.length > 0, hayPrivados));
  raiz.append(ctx.contenedorAvisos);
  if (fecha === hoy) {
    const { manifiesto, manifiestoModo } = modelo.config;
    if (manifiesto && manifiestoModo === 'linea') raiz.append(el('blockquote', { class: 'manifiesto-linea', aria: { label: t('manifiesto.titulo') } }, manifiesto));
    const ajuste = modelo.revisionDe(sumarDias(inicioSemana(hoy), -7))?.ajuste;
    if (ajuste && vivos.length) raiz.append(el('p', { class: 'ajuste-semana' }, icono('lapiz', 'tv-icono--sm'), t('semana.ajusteActual', { ajuste })));
    for (const extra of [tarjetaSemana(ctx, hoy, vivos), tarjetaRecordatorios(ctx), rescates(ctx, hoy)]) if (extra) raiz.append(extra);
  }

  if (vivos.length === 0) {
    raiz.append(vacio(ctx));
    return;
  }
  if (vistas.length === 0) {
    raiz.append(el('p', { class: 'mensaje-dia' }, t('hoy.nadaHoy')));
    return;
  }

  const bloques = el('div', { class: 'bloques' });
  for (const b of BLOQUES) {
    let lista = vistas.filter((v) => v.habito.bloque === b).sort((x, y) => x.habito.orden - y.habito.orden);
    if (lista.length === 0) continue;
    if (modelo.config.hechosAlFinal) {
      lista = [...lista.filter((v) => !cumplido(v.estado)), ...lista.filter((v) => cumplido(v.estado))];
    }
    const p = progresoDelDia(lista);
    const idTitulo = `bloque-${b}`;
    const pendientes = fecha === hoy ? pendientesDelBloque(lista, b) : [];
    bloques.append(el('section', { aria: { labelledby: idTitulo } },
      el('div', { class: 'tv-bloque' },
        el('h2', { class: 'tv-bloque__nombre', id: idTitulo }, t(`bloque.${b}`)),
        el('span', { class: 'tv-bloque__lado' },
          pendientes.length >= 2 ? el('button', {
            class: 'tv-boton tv-boton--sutil tv-boton--chico', type: 'button', data: { foco: `ritual-${b}` },
            aria: { label: t('ritual.aria', { bloque: t(`bloque.${b}`).toLowerCase() }) },
            onclick: () => abrirRitual(ctx, b, pendientes),
          }, icono('ritual', 'tv-icono--sm'), t('ritual.boton')) : null,
          p.total > 0 ? el('span', { class: 'tv-bloque__conteo' }, t('bloque.conteo', p)) : null,
        ),
      ),
      el('ul', { class: 'tv-lista' }, lista.map((v) => fila(ctx, v, fecha, hoy))),
    ));
  }
  raiz.append(bloques);

  if (fecha === hoy && prog.total > 0 && prog.hechos === prog.total) {
    raiz.append(el('p', { class: 'listo' }, t('hoy.todoListo')));
  }
}

function cabecera(ctx, fecha, hoy, prog, hayHabitos, hayPrivados) {
  const { modelo } = ctx;
  const inicio = modelo.habitos().reduce((m, h) => (h.creado < m ? h.creado : m), hoy);
  const anterior = sumarDias(fecha, -1);
  const pct = prog.total ? Math.round((prog.hechos / prog.total) * 100) : 0;
  const relleno = el('div', { class: 'tv-progreso__relleno' });
  relleno.style.setProperty('width', `${pct}%`); // CSSOM: permitido por la CSP
  const subtitulo = fechaLarga(fecha);

  return el('header', { class: 'cabecera' },
    el('div', { class: 'cabecera__fila' },
      el('h1', { class: 'titulo-pantalla' }, nombreDelDia(fecha, hoy)),
      hayPrivados ? el('button', {
        class: 'tv-boton--icono', type: 'button', data: { foco: 'boveda' },
        aria: { label: t(ctx.verPrivados ? 'privado.ocultar' : 'privado.mostrar'), pressed: ctx.verPrivados ? 'true' : 'false' },
        onclick: async () => {
          if (ctx.verPrivados) { ctx.verPrivados = false; ctx.render(); return; }
          if (await pedirPin(ctx, t('privado.mostrar'))) { ctx.verPrivados = true; ctx.render(); }
        },
      }, icono(ctx.verPrivados ? 'abierto' : 'candado')) : null,
      el('button', {
        class: 'tv-boton--icono tv-boton--redondo', type: 'button', data: { foco: 'crear' },
        aria: { label: t('hoy.crear') }, onclick: () => ctx.abrirEditor(),
      }, icono('agregar')),
    ),
    el('div', { class: 'cabecera__fila' },
      el('p', { class: 'subtitulo' }, subtitulo),
      hayHabitos ? el('div', { class: 'navegar-dia' },
        fecha !== hoy ? el('button', { class: 'tv-boton tv-boton--sutil', type: 'button', data: { foco: 'volver' }, onclick: () => ctx.verFecha(null) }, t('hoy.volverHoy')) : null,
        el('button', {
          class: 'tv-boton--icono', type: 'button', data: { foco: 'dia-ant' }, aria: { label: t('hoy.diaAnterior') },
          disabled: anterior < inicio, onclick: () => ctx.verFecha(anterior),
        }, icono('izquierda')),
        el('button', {
          class: 'tv-boton--icono', type: 'button', data: { foco: 'dia-sig' }, aria: { label: t('hoy.diaSiguiente') },
          disabled: fecha >= hoy, onclick: () => ctx.verFecha(sumarDias(fecha, 1) >= hoy ? null : sumarDias(fecha, 1)),
        }, icono('derecha')),
      ) : null,
    ),
    prog.total > 0 ? el('div', { class: 'tv-progreso' },
      el('p', { class: 'tv-progreso__texto' }, t('hoy.progreso', prog)),
      el('div', { class: 'tv-progreso__barra', role: 'progressbar', aria: { valuemin: 0, valuemax: prog.total, valuenow: prog.hechos, label: t('hoy.progreso', prog) } }, relleno),
    ) : null,
  );
}

function lineaMeta(ctx, v, fecha, hoy) {
  const h = v.habito;
  if (cumplido(v.estado) && fecha === hoy && ctx.recienCompletados.has(h.id) && h.identidad) {
    return el('p', { class: 'tv-identidad' }, fraseIdentidad(h));
  }
  const partes = [];
  let tono = null;
  if (['saltado', 'descanso', 'congelado', 'excedido'].includes(v.estado)) {
    partes.push(t(`estado.${v.estado}`));
    if (v.estado === 'excedido') tono = 'miel';
  }
  const meta = resumenMeta(h, v.log);
  if (meta) partes.push(meta);
  if (v.semana) {
    partes.push(v.semana.lista && !cumplido(v.estado) ? t('hoy.metaSemanalLista') : t('frec.resumen.semanal', v.semana));
  } else if (!meta || h.frecuencia.tipo !== 'diaria') {
    partes.push(resumenFrecuencia(h));
  }
  if (fecha === hoy) {
    const st = ctx.stats(h);
    if (st.actual >= 2) partes.push(t('stats.rachaDe', { texto: textoRacha(st.actual, st.unidad) }));
  }
  const horas = ctx.modelo.recordatoriosDe(h.id);
  return el('p', { class: 'tv-habito__meta', data: { tono } },
    el('span', { class: 'tv-habito__punto', aria: { hidden: 'true' } }),
    el('span', {}, partes.join(' · ')),
    h.privado ? el('span', { class: 'tv-habito__privado' }, icono('candado', 'tv-icono--xs'), t('privado.marca')) : null,
    horas.length && fecha === hoy && !cumplido(v.estado) ? el('span', { class: 'tv-habito__hora' }, icono('campana', 'tv-icono--xs'), horas.join(', ')) : null);
}

function botonCheck(ctx, v, fecha) {
  const { modelo } = ctx;
  const h = v.habito;
  const puede = modelo.puedeMarcar(h, fecha);
  const valor = v.log?.estado === 'registrado' ? v.log.valor : 0;
  const anim = ctx.animar === `${h.id}|${fecha}` ? '' : null;
  const comunes = { type: 'button', disabled: !puede, data: { estado: v.estado === 'pendiente' ? null : v.estado, foco: `check-${h.id}`, anim } };

  if (h.tipo === 'cantidad') {
    return el('button', {
      ...comunes, class: 'tv-check tv-check--cantidad',
      data: { ...comunes.data, valor: valor > 0 || v.log?.estado === 'registrado' ? valor : null },
      aria: { label: t('aria.registrar', { nombre: h.nombre }) },
      onclick: () => ctx.abrirDetalle(h.id, fecha),
    }, v.log?.estado === 'registrado' ? el('span', { class: 'tv-check__texto' }, num(valor))
      : ICONO_ESTADO[v.estado] ? icono(ICONO_ESTADO[v.estado]) : icono('agregar'));
  }

  if (h.vecesPorDia > 1) {
    const b = el('button', {
      ...comunes, class: 'tv-check tv-check--contador',
      aria: { label: t('aria.sumar', { nombre: h.nombre, valor, n: h.vecesPorDia }) },
      onclick: () => ctx.tocar(h.id, fecha),
    }, v.estado === 'hecho' ? icono('hecho')
      : ICONO_ESTADO[v.estado] ? icono(ICONO_ESTADO[v.estado])
      : el('span', { class: 'tv-check__texto' }, `${valor}/${h.vecesPorDia}`));
    b.style.setProperty('--p', String(Math.min(valor / h.vecesPorDia, 1)));
    return b;
  }

  const hecho = v.estado === 'hecho';
  return el('button', {
    ...comunes, class: 'tv-check',
    aria: { pressed: hecho ? 'true' : 'false', label: t(hecho ? 'aria.desmarcar' : 'aria.marcar', { nombre: h.nombre }) },
    onclick: () => ctx.tocar(h.id, fecha),
  }, icono(ICONO_ESTADO[v.estado] || 'hecho'));
}

function fila(ctx, v, fecha, hoy) {
  const h = v.habito;
  return el('li', {
    class: `tv-habito color-${h.color}`,
    data: { estado: v.estado, opcional: v.requerido ? null : '', habito: h.id },
  },
    el('button', {
      class: 'tv-habito__abrir', type: 'button', data: { foco: `abrir-${h.id}` },
      aria: { label: t('aria.abrir', { nombre: h.nombre }) },
      onclick: () => ctx.abrirDetalle(h.id, fecha),
    },
      el('span', { class: 'tv-habito__icono', aria: { hidden: 'true' } }, h.icono),
      el('span', { class: 'tv-habito__texto' },
        el('span', { class: 'tv-habito__nombre' }, h.nombre),
        lineaMeta(ctx, v, fecha, hoy),
      ),
    ),
    botonCheck(ctx, v, fecha),
  );
}

function vacio(ctx) {
  // Símbolo de Tavia: anillo abierto con check.
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('viewBox', '0 0 96 96');
  svg.setAttribute('class', 'vacio__simbolo');
  svg.setAttribute('aria-hidden', 'true');
  for (const d of ['M79.72 38.90A33 33 0 1 1 57.10 16.28', 'M30.5 50.5L42.5 62L78.05 17.95']) {
    const p = document.createElementNS(ns, 'path');
    p.setAttribute('d', d);
    svg.append(p);
  }
  const ideas = t('ideas');
  return el('div', { class: 'vacio' },
    svg,
    el('h2', { class: 'vacio__titulo' }, t('hoy.vacio.titulo')),
    el('p', { class: 'vacio__texto' }, t('hoy.vacio.texto')),
    el('button', { class: 'tv-boton tv-boton--principal', type: 'button', data: { foco: 'crear-vacio' }, onclick: () => ctx.abrirEditor() }, icono('agregar'), t('hoy.crear')),
    el('p', { class: 'texto-ayuda' }, t('hoy.vacio.ideas')),
    el('div', { class: 'ideas' }, ideas.map((idea, i) => el('button', {
      class: 'idea', type: 'button', data: { foco: `idea-${i}` }, onclick: () => ctx.abrirEditor(null, idea),
    }, el('span', { aria: { hidden: 'true' } }, idea.icono), idea.nombre))),
  );
}

/**
 * Tarjetas de rescate: un día de hace 1 o 2 días quedó sin marcar y había una racha.
 * Ofrece marcarlo (si sí lo hiciste) o usar un congelador. Se pueden cerrar.
 */
function rescates(ctx, hoy) {
  const { modelo } = ctx;
  const tarjetas = [];
  for (const h of ctx.visibles()) {
    if (h.archivado || h.frecuencia.tipo === 'semanal_n' || enPausa(h, hoy)) continue;
    // Primero el hueco más antiguo: al rescatarlo, aparece el siguiente.
    for (const atras of [2, 1]) {
      const d = sumarDias(hoy, -atras);
      const clave = `${h.id}|${d}`;
      if (ctx.rescatesDescartados.has(clave) || !tocaEnFecha(h, d) || estadoDelDia(h, modelo.logDe(h.id, d)) !== 'pendiente') continue;
      const racha = rachaAntesDe(h, d, hoy, modelo.logDe);
      if (racha < 2) continue;
      const st = ctx.stats(h);
      const puede = puedeCongelar(h, d, hoy, modelo.logDe);
      const rachaTxt = textoRacha(racha, st.unidad);
      tarjetas.push(el('div', { class: 'tv-aviso tv-aviso--rescate', role: 'note', data: { rescate: h.id } },
        el('span', { class: `tv-habito__icono color-${h.color}`, aria: { hidden: 'true' } }, h.icono),
        el('div', { class: 'tv-aviso__texto' },
          el('p', { class: 'tv-aviso__titulo' }, t('rescate.texto', { nombre: h.nombre, cuando: t(atras === 1 ? 'rescate.ayer' : 'rescate.anteayer') })),
          el('p', {}, t(puede ? 'rescate.conCongelador' : 'rescate.sinCongelador', { racha: rachaTxt })),
          el('div', { class: 'tv-aviso__acciones' },
            el('button', {
              class: 'tv-boton tv-boton--secundario', type: 'button', data: { foco: `rescate-si-${h.id}` },
              onclick: () => {
                if (h.tipo === 'si_no') ctx.fijarValor(h.id, d, String(h.vecesPorDia));
                else ctx.abrirDetalle(h.id, d);
              },
            }, icono('hecho'), t('rescate.loHice')),
            puede ? el('button', {
              class: 'tv-boton tv-boton--secundario', type: 'button', data: { foco: `rescate-cong-${h.id}` },
              onclick: () => ctx.usarCongelador(h.id, d),
            }, icono('congelado'), `${t('rescate.congelar')} (${congeladores(h, hoy, modelo.logDe).disponibles})`) : null,
          ),
        ),
        el('button', {
          class: 'tv-boton--icono', type: 'button', aria: { label: t('detalle.cerrar') },
          onclick: () => { ctx.rescatesDescartados.add(clave); ctx.render(); },
        }, icono('cerrar', 'tv-icono--sm')),
      ));
      break; // una tarjeta por hábito a la vez
    }
    if (tarjetas.length >= 3) break;
  }
  return tarjetas.length ? el('div', { class: 'avisos' }, tarjetas) : null;
}

/** Domingo y lunes: invitación a la revisión semanal (si no está hecha). */
function tarjetaSemana(ctx, hoy, vivos) {
  const lunes = semanaParaRevisar(hoy);
  if (!lunes || !vivos.length || ctx.modelo.revisionDe(lunes) || ctx.semanaDescartada === lunes) return null;
  if (vivos.every((h) => h.creado > sumarDias(lunes, 6))) return null;
  return el('div', { class: 'tv-aviso tv-aviso--pino', role: 'note', data: { tarjeta: 'semana' } },
    icono('progreso'),
    el('div', { class: 'tv-aviso__texto' },
      el('p', { class: 'tv-aviso__titulo' }, t('semana.tarjeta')),
      el('p', {}, t('semana.tarjeta.texto')),
      el('div', { class: 'tv-aviso__acciones' },
        el('button', { class: 'tv-boton tv-boton--secundario', type: 'button', data: { foco: 'semana-abrir' }, onclick: () => abrirRevision(ctx, lunes) }, t('semana.abrir')))),
    el('button', { class: 'tv-boton--icono', type: 'button', aria: { label: t('detalle.cerrar') }, onclick: () => { ctx.semanaDescartada = lunes; ctx.render(); } }, icono('cerrar', 'tv-icono--sm')),
  );
}

/** Recordatorios cuya hora ya pasó y siguen pendientes (el "recordatorio al abrir"). */
function tarjetaRecordatorios(ctx) {
  const vencidos = recordatoriosVencidos(ctx.modelo, new Date(), { incluirPrivados: ctx.mostrarPrivados() })
    .filter((v) => !ctx.recordatoriosDescartados.has(v.clave));
  if (!vencidos.length) return null;
  const unicos = [...new Map(vencidos.map((v) => [v.habito.id, v])).values()];
  return el('div', { class: 'tv-aviso tv-aviso--pino', role: 'note', data: { tarjeta: 'recordatorios' } },
    icono('campana'),
    el('div', { class: 'tv-aviso__texto' },
      el('p', { class: 'tv-aviso__titulo' }, t('recordatorios.pendientes')),
      el('ul', { class: 'lista-simple' }, unicos.map((v) => el('li', {}, `${v.habito.icono} ${v.habito.nombre} · ${v.hora}`)))),
    el('button', {
      class: 'tv-boton--icono', type: 'button', aria: { label: t('detalle.cerrar') },
      onclick: () => { for (const v of vencidos) ctx.recordatoriosDescartados.add(v.clave); ctx.render(); },
    }, icono('cerrar', 'tv-icono--sm')),
  );
}
