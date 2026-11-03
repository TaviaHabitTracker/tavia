// vistas/descubrimientos.js — Descubrimientos de tu semana (M11): sección en Progreso, bloque en la
// revisión semanal, hoja «¿Cómo se calculó?», comparador de dos hábitos y ajustes.
// Todo se calcula en el teléfono (js/descubrimientos.js). Nada sale de aquí.
// Seguridad: SVG con createElementNS, textos con textContent (vía el()), sin estilos en línea.

import { el, icono } from '../dom.js';
import { t } from '../textos.js';
import { inicioSemana, sumarDias } from '../fechas.js';
import { abrirHoja, anunciar } from '../ui.js';
import { pedirPermiso } from '../recordatorios.js';
import { prepararFuentes } from '../tarjeta-anual.js';
import { ANCHO, FORMATOS, NOMBRE_ARCHIVO, colores as coloresTarjeta, datosTarjetaDesc, dibujarTarjetaDesc, fraseCompartible } from '../tarjeta-desc.js';
import { fechaCorta, num, porcentaje, textoRacha } from '../formato.js';
import { nuevoId } from '../modelo.js';
import { TIPOS_DESC } from '../esquema.js';
import {
  FRANJAS, PLAN_ACTUAL, aItem, calcularCandidatos, esSensible, firmaBase, resumenSemanal, seleccionar, serieComparador,
} from '../descubrimientos.js';

const SVG = 'http://www.w3.org/2000/svg';
const BLOQUES_DESC = ['manana', 'tarde', 'noche', 'dia'];

/* ---------- Cálculo semanal (una vez por semana, en tiempo ocioso) ---------- */

const enOcio = (fn) => (globalThis.requestIdleCallback ? requestIdleCallback(fn, { timeout: 2000 }) : setTimeout(fn, 50));
let calculando = false;
const esperando = new Set(); // quienes quieren redibujarse cuando termine el cálculo en curso

/** Lunes de la semana cuya selección toca mostrar. Se calcula con los datos hasta ayer. */
const semanaActual = (ctx) => inicioSemana(ctx.modelo.hoy());

/**
 * Si la semana no está calculada, la calcula una sola vez (en tiempo ocioso) y guarda la selección:
 * abrir la app varias veces la misma semana no la cambia.
 */
export function prepararSemana(ctx, alListo = () => {}) {
  const { modelo } = ctx;
  const cfg = modelo.config.descubrimientos;
  const semana = semanaActual(ctx);
  if (!cfg.activado || modelo.descubrimientos.semana === semana) return;
  esperando.add(alListo);
  if (calculando) return;
  calculando = true;
  enOcio(() => {
    try {
      if (modelo.descubrimientos.semana === semana) return;
      const hoy = modelo.hoy();
      const { candidatos } = calcularCandidatos({
        habitos: modelo.habitos(), hoy, logDe: modelo.logDe, ajustes: cfg, plan: PLAN_ACTUAL,
        privadosVisibles: ctx.mostrarPrivados(),
        porDia: modelo.palabras.porDia, palabrasActivas: modelo.config.palabraDelDia,
        recordatoriosDe: modelo.recordatoriosDe,
      });
      const elegidos = seleccionar(candidatos, { semana, historial: modelo.descubrimientos.items, noMostrar: modelo.descubrimientos.noMostrar, plan: PLAN_ACTUAL });
      modelo.fijarSemanaDesc(semana, elegidos.map((c) => aItem(c, semana, nuevoId())));
      if (elegidos.length) avisarSemana(ctx, semana);
    } catch (e) {
      console.warn('Descubrimientos', e); // nunca rompe la app: solo no hay descubrimientos esta vez
    } finally {
      calculando = false;
      // Sin redibujar toda la pantalla (no corta animaciones como la flor del Jardín): solo lo que esperaba.
      const lista = [...esperando];
      esperando.clear();
      for (const fn of lista) { try { fn(); } catch { /* una vista que ya no está */ } }
    }
  });
}

/**
 * Aviso opcional «Tu semana está lista» (apagado de fábrica). Nunca dice qué se descubrió.
 * Solo si la app no está a la vista: si la estás mirando, no hace falta avisar.
 */
async function avisarSemana(ctx, semana) {
  if (!ctx.modelo.config.descubrimientos.notificarRevision) return;
  if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return;
  if (globalThis.document?.visibilityState === 'visible') return;
  const op = { body: t('desc.aviso.cuerpo'), tag: `tavia-semana-${semana}`, icon: 'icons/icon-192.png', badge: 'icons/icon-192.png', data: { url: './#progreso' } };
  try {
    const reg = await navigator.serviceWorker?.getRegistration();
    if (reg) await reg.showNotification(t('desc.aviso.titulo'), op);
    else new Notification(t('desc.aviso.titulo'), op);
  } catch { /* el sistema no dejó mostrar el aviso */ }
}

/* ---------- Qué se muestra ---------- */

/** Un descubrimiento se ve solo si sus hábitos siguen permitidos ahora (bóveda, exclusiones, tipos apagados). */
function visible(ctx, x) {
  const cfg = ctx.modelo.config.descubrimientos;
  if (!cfg.activado || cfg.tiposApagados.includes(x.tipo) || x.estado === 'oculto') return false;
  const fuera = new Set(cfg.excluidos), dentro = new Set(cfg.incluidos);
  return x.habitIds.every((id) => {
    const h = ctx.modelo.habito(id);
    if (!h) return x.estado === 'guardado'; // hábito borrado: solo los guardados, sin nombre
    if (fuera.has(id)) return false;
    if (h.privado && !(ctx.mostrarPrivados() && dentro.has(id))) return false;
    if (esSensible(h) && !dentro.has(id)) return false;
    return true;
  });
}

const deEstaSemana = (ctx) => {
  const semana = semanaActual(ctx), hoy = ctx.modelo.hoy();
  return ctx.modelo.descubrimientos.items.filter((x) => x.semana === semana && x.caducaEl > hoy && visible(ctx, x));
};

/* ---------- Textos ---------- */

const nombreDe = (ctx, id) => ctx.modelo.habito(id)?.nombre ?? t('desc.unHabito');
const mesLargo = (ym) => `${t('meses.largo')[Number(ym.slice(5, 7)) - 1]} ${ym.slice(0, 4)}`;

function titulo(x) {
  return x.tipo === 'p3' ? t(`desc.t.p3.${x.params.sentido === 'sube' ? 'sube' : 'baja'}`) : t(`desc.t.${x.tipo}`);
}

/** La frase cálida de cada tipo. Los nombres entran como texto (textContent), nunca como HTML. */
export function frase(ctx, x) {
  const p = x.params;
  const h = x.habitIds[0] ? ctx.modelo.habito(x.habitIds[0]) : null;
  switch (x.tipo) {
    case 'g1': return x.habitIds.length
      ? t('desc.g1.habito', { dia: t('desc.diasPlural')[p.dia], nombre: nombreDe(ctx, x.habitIds[0]), x: p.x, n: p.n })
      : t('desc.g1.global', { dia: t('desc.diasPlural')[p.dia], x: p.x, n: p.n });
    case 'g2': return t('desc.g2', {
      nombre: nombreDe(ctx, x.habitIds[0]),
      racha: textoRacha(p.racha, p.unidad || 'dias'),
      retomar: p.retomar <= 1 ? t('desc.g2.uno') : t('desc.g2.varios', { n: textoRacha(p.retomar, p.unidad || 'dias') }),
    });
    case 'g4': return t('desc.g4', { franja: t(`desc.franja.${p.franja}`), x: p.x, n: p.n });
    case 'p1': return t('desc.p1', { nombre: nombreDe(ctx, x.habitIds[0]), franja: t(`desc.franja.${p.franja}`), x: p.x, n: p.n });
    case 'p2': return t('desc.p2', { a: nombreDe(ctx, x.habitIds[0]), b: nombreDe(ctx, x.habitIds[1]), con: p.con, sin: p.sin });
    case 'p3': return p.sentido === 'sube' ? t('desc.p3.sube', { ahora: p.ahora, antes: p.antes }) : t('desc.p3.baja');
    case 'p4': return t('desc.p4', { x: p.x, n: p.n });
    case 'p5': {
      const base = p.meta
        ? t('desc.p5.meta', { nombre: nombreDe(ctx, x.habitIds[0]), x: p.x, n: p.n, prom: num(p.prom), unidad: h?.unidad || '' })
        : t('desc.p5.registro', { nombre: nombreDe(ctx, x.habitIds[0]), dias: p.dias, prom: num(p.prom), unidad: h?.unidad || '' });
      return p.mejorSemana ? `${base.trim()} ${t('desc.p5.mejor', { fecha: fechaCorta(p.mejorSemana) })}` : base.trim();
    }
    case 'p6': return t('desc.p6', { palabra: palabraBonita(p.palabra), con: p.con, sin: p.sin });
    case 'p7': return t('desc.p7', { bloque: t(`desc.bloque.${p.bloque}`), x: p.x, n: p.n });
    case 'p8': return t('desc.p8', { mes: mesLargo(p.mes), x: p.x, n: p.n });
    default: return '';
  }
}

const palabraBonita = (id) => (id ? id.charAt(0).toUpperCase() + id.slice(1) : '');

/* ---------- Gráfico (SVG accesible) ---------- */

function etiquetas(ctx, g) {
  const n = g.barras.length;
  switch (g.eje) {
    case 'dias': return t('dias.corto').slice(0, n);
    case 'bloques': return BLOQUES_DESC.slice(0, n).map((b) => t(`bloque.${b}`));
    case 'franjas': return FRANJAS.slice(0, n).map(([f]) => t(`desc.franja.${f}`));
    case 'par': return [t('desc.eje.par.0'), t('desc.eje.par.1')];
    case 'descanso': return [t('desc.eje.descanso.0'), t('desc.eje.descanso.1')];
    case 'meses': return (g.meses || []).map((m) => t('meses.corto')[Number(m.slice(5, 7)) - 1]);
    // Muchas barras: en el eje basta el número; el texto equivalente lleva la etiqueta completa.
    case 'semanas': return g.barras.map((_, i) => String(i + 1));
    case 'rachas': return g.barras.map((_, i) => String(i + 1));
    default: return g.barras.map((_, i) => String(i + 1));
  }
}

/** Etiquetas largas para el texto equivalente (días y meses completos). */
function etiquetasLargas(ctx, g) {
  if (g.eje === 'dias') return t('dias.largo');
  if (g.eje === 'meses') return (g.meses || []).map(mesLargo);
  if (g.eje === 'semanas') return g.barras.map((_, i) => t('desc.eje.semana', { n: i + 1 }));
  if (g.eje === 'rachas') return g.barras.map((_, i) => t('desc.eje.racha', { n: i + 1 }));
  return etiquetas(ctx, g);
}

const valorTexto = (g, [x, n]) => (g.eje === 'descanso' && n === 1000 ? porcentaje(x / n) : `${num(x)} / ${num(n)}`);

export function grafico(ctx, g) {
  if (!g || !g.barras.length) return null;
  const cortas = etiquetas(ctx, g), largas = etiquetasLargas(ctx, g);
  const texto = g.barras.map((b, i) => `${largas[i] ?? i + 1}: ${valorTexto(g, b)}`).join('; ');
  const W = 280, H = 96, base = 76, alto = 64;
  const ancho = W / g.barras.length;
  const svg = document.createElementNS(SVG, 'svg');
  svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
  svg.setAttribute('class', 'desc-grafico__svg');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  const nodo = (tag, at, txt) => {
    const n = document.createElementNS(SVG, tag);
    for (const [k, v] of Object.entries(at)) n.setAttribute(k, String(v));
    if (txt !== undefined) n.textContent = txt;
    svg.append(n);
    return n;
  };
  nodo('line', { x1: 0, x2: W, y1: base + 0.5, y2: base + 0.5, class: 'desc-grafico__base' });
  const mostrarEtiquetas = g.barras.length <= 14;
  g.barras.forEach(([x, n], i) => {
    const p = n > 0 ? Math.min(1, x / n) : 0;
    const h = Math.max(2, Math.round(p * alto));
    const cx = i * ancho + ancho / 2;
    const w = Math.max(3, Math.min(28, ancho * 0.62));
    const marcada = i === g.resaltado;
    nodo('rect', { x: (cx - w / 2).toFixed(1), y: base - h, width: w.toFixed(1), height: h, rx: 3, class: `desc-grafico__barra${marcada ? ' desc-grafico__barra--marcada' : ''}` });
    // Marca que no depende del color: un punto sobre la barra destacada.
    if (marcada) nodo('circle', { cx: cx.toFixed(1), cy: Math.max(5, base - h - 7), r: 3, class: 'desc-grafico__marca' });
    if (mostrarEtiquetas) nodo('text', { x: cx.toFixed(1), y: H - 4, 'text-anchor': 'middle', class: `desc-grafico__eje${marcada ? ' desc-grafico__eje--marcado' : ''}` }, cortas[i] ?? '');
  });
  const tabla = el('details', { class: 'desc-tabla' },
    el('summary', {}, t('desc.tabla')),
    el('table', {},
      el('thead', {}, el('tr', {}, el('th', { scope: 'col' }, t('desc.tabla.grupo')), el('th', { scope: 'col' }, t('desc.tabla.valor')))),
      el('tbody', {}, g.barras.map((b, i) => el('tr', { data: { marcada: i === g.resaltado ? '' : null } },
        el('th', { scope: 'row' }, largas[i] ?? String(i + 1)), el('td', {}, valorTexto(g, b)))))));
  return el('figure', { class: 'desc-grafico' },
    el('div', { role: 'img', aria: { label: t('desc.aria.grafico', { texto }) } }, svg),
    tabla);
}

/* ---------- Tarjeta ---------- */

function etiquetaPista(x) {
  const clara = x.evidencia?.clara === true;
  return el('span', { class: `desc-pista${clara ? ' desc-pista--clara' : ''}` }, t(clara ? 'desc.clara' : 'desc.inicial'));
}

export function tarjeta(ctx, x, { compacta = false } = {}) {
  const { modelo } = ctx;
  const guardado = x.estado === 'guardado';
  const id = `desc-${x.id}`;
  const menu = el('details', { class: 'desc-menu' },
    el('summary', { class: 'tv-boton--icono desc-menu__boton', aria: { label: t('desc.mas') }, data: { foco: `${id}-menu` } }, el('span', { aria: { hidden: 'true' } }, '⋯')),
    el('div', { class: 'desc-menu__lista' },
      el('button', { class: 'tv-boton tv-boton--sutil', type: 'button', onclick: () => ocultarTipo(ctx, x) }, t('desc.ocultarTipo')),
      el('button', { class: 'tv-boton tv-boton--sutil', type: 'button', onclick: () => noMostrar(ctx, x) }, t('desc.noMostrar'))));
  const acciones = el('div', { class: 'desc-tarjeta__acciones' },
    el('button', { class: 'tv-boton tv-boton--sutil tv-boton--chico', type: 'button', data: { foco: `${id}-como` }, onclick: () => abrirComo(ctx, x) }, t('desc.como')),
    el('button', {
      class: 'tv-boton tv-boton--sutil tv-boton--chico', type: 'button', aria: { pressed: guardado ? 'true' : 'false' }, data: { foco: `${id}-guardar` },
      onclick: () => {
        const volver = modelo.estadoDesc(x.id, guardado ? 'visto' : 'guardado');
        if (!guardado && volver) ctx.deshacer(t('desc.guardadoAviso'), volver);
      },
    }, icono('estrella', 'tv-icono--sm'), guardado ? t('desc.guardado') : t('desc.guardar')),
    fraseCompartible(x) ? el('button', { class: 'tv-boton tv-boton--sutil tv-boton--chico', type: 'button', data: { foco: `${id}-compartir` }, onclick: () => abrirCompartir(ctx, x) },
      icono('compartir', 'tv-icono--sm'), t('desc.compartir')) : null);
  return el('article', { class: 'tarjeta desc-tarjeta', aria: { labelledby: `${id}-t` }, data: { tipo: x.tipo, desc: x.id } },
    el('header', { class: 'desc-tarjeta__cabecera' },
      el('span', { class: 'tarjeta-frase__ceja' }, icono('chispa', 'tv-icono--xs'), titulo(x)),
      x.estado === 'nuevo' ? el('span', { class: 'desc-nuevo' }, t('desc.nuevo')) : null,
      etiquetaPista(x),
      compacta ? null : menu),
    el('p', { class: 'desc-tarjeta__frase', id: `${id}-t` }, frase(ctx, x)),
    compacta ? null : grafico(ctx, x.grafico),
    compacta ? null : accionOpcional(ctx, x),
    acciones);
}

/** Acciones opcionales de un toque, siempre con Deshacer. */
function accionOpcional(ctx, x) {
  const { modelo } = ctx;
  if (x.tipo === 'p1' && x.accion?.tipo === 'recordatorio' && !x.accion.hecha) {
    const h = modelo.habito(x.habitIds[0]);
    const horas = h ? modelo.recordatoriosDe(h.id) : [];
    if (!h || !horas.includes(x.accion.desde)) return null;
    return el('div', { class: 'desc-accion' },
      el('p', { class: 'texto-ayuda' }, t('desc.p1.accion', { hora: x.accion.hora })),
      el('button', {
        class: 'tv-boton tv-boton--secundario tv-boton--chico', type: 'button',
        onclick: () => {
          const antes = [...horas];
          modelo.fijarRecordatorios(h.id, horas.map((hh) => (hh === x.accion.desde ? x.accion.hora : hh)));
          modelo.accionDescHecha(x.id, true);
          ctx.deshacer(t('desc.p1.movido', { nombre: h.nombre, hora: x.accion.hora }), () => { modelo.fijarRecordatorios(h.id, antes); modelo.accionDescHecha(x.id, false); });
        },
      }, t('desc.p1.mover', { hora: x.accion.hora })));
  }
  if (x.tipo === 'p3' && x.params.sentido !== 'sube') {
    const hoy = modelo.hoy();
    if (modelo.palabras.minimo === hoy) return null;
    return el('div', { class: 'desc-accion' },
      el('button', {
        class: 'tv-boton tv-boton--secundario tv-boton--chico', type: 'button',
        onclick: () => {
          const antes = modelo.palabras.minimo;
          modelo.fijarMinimo(hoy);
          ctx.deshacer(t('desc.p3.minimoHecho'), () => modelo.fijarMinimo(antes));
        },
      }, t('desc.p3.minimo')));
  }
  return null;
}

function ocultarTipo(ctx, x) {
  const cfg = ctx.modelo.config.descubrimientos;
  const antes = cfg.tiposApagados;
  ctx.modelo.setConfig({ descubrimientos: { ...cfg, tiposApagados: [...antes, x.tipo] } });
  ctx.deshacer(t('desc.ocultadoTipo'), () => ctx.modelo.setConfig({ descubrimientos: { ...ctx.modelo.config.descubrimientos, tiposApagados: antes } }));
}

function noMostrar(ctx, x) {
  const volver = ctx.modelo.noMostrarDesc(x.id, firmaBase(x));
  if (volver) ctx.deshacer(t('desc.ocultado'), volver);
}

/* ---------- Compartir (tarjeta sin nombres ni cifras) ---------- */

async function abrirCompartir(ctx, x) {
  await prepararFuentes();
  let formato = 'retrato';
  abrirHoja({
    titulo: t('desc.share.hoja'),
    etiqueta: 'desc-compartir',
    clase: 'tv-hoja--anual',
    contenido: () => {
      const lienzo = el('canvas', { class: 'anual__lienzo desc-share__lienzo', width: String(ANCHO), height: String(FORMATOS.retrato), role: 'img' });
      const dibujar = () => {
        const d = datosTarjetaDesc(x, formato);
        dibujarTarjetaDesc(lienzo, d, coloresTarjeta());
        lienzo.setAttribute('aria-label', t('desc.share.alt', { frase: d.frase }));
        lienzo.dataset.formato = formato;
      };
      const grupo = el('fieldset', { class: 'segmentos' },
        el('legend', { class: 'campo__etiqueta' }, t('tarjeta.formato')),
        Object.keys(FORMATOS).map((f) => el('label', { class: 'segmento' },
          el('input', { type: 'radio', name: 'desc-formato', value: f, checked: f === formato }),
          el('span', {}, t(`tarjeta.formato.${f}`)))));
      grupo.addEventListener('change', (e) => { formato = e.target.value; dibujar(); });
      const png = () => new Promise((ok, mal) => lienzo.toBlob((b) => (b ? ok(b) : mal(new Error('vacío'))), 'image/png'));
      const puede = typeof File !== 'undefined' && navigator.canShare?.({ files: [new File([''], NOMBRE_ARCHIVO, { type: 'image/png' })] });
      const compartir = el('button', { class: 'tv-boton tv-boton--principal tv-boton--ancho', type: 'button' }, icono('compartir', 'tv-icono--sm'), t('tarjeta.compartir'));
      compartir.addEventListener('click', async () => {
        compartir.disabled = true;
        try { await navigator.share({ files: [new File([await png()], NOMBRE_ARCHIVO, { type: 'image/png' })] }); } catch (e) { if (e?.name !== 'AbortError') ctx.mostrarError(t('anual.error')); } finally { compartir.disabled = false; }
      });
      const descargar = el('button', { class: 'tv-boton tv-boton--secundario tv-boton--ancho', type: 'button', data: { foco: 'desc-descargar' } }, icono('respaldo', 'tv-icono--sm'), t('tarjeta.descargar'));
      descargar.addEventListener('click', async () => {
        descargar.disabled = true;
        try {
          const url = URL.createObjectURL(await png());
          const a = el('a', { href: url, download: NOMBRE_ARCHIVO, rel: 'noopener' });
          document.body.append(a);
          a.click();
          a.remove();
          setTimeout(() => URL.revokeObjectURL(url), 10_000);
          anunciar(t('tarjeta.lista'));
        } catch { ctx.mostrarError(t('anual.error')); } finally { descargar.disabled = false; }
      });
      dibujar();
      return [
        el('div', { class: 'anual__marco' }, lienzo),
        el('p', { class: 'texto-ayuda' }, t('desc.share.nunca')),
        grupo,
        puede ? compartir : null,
        descargar,
        el('p', { class: 'texto-ayuda' }, t('anual.local')),
      ];
    },
  });
}

/* ---------- ¿Cómo se calculó? ---------- */

const pct = (v) => (typeof v === 'number' ? porcentaje(v) : '—');
const pValor = (p) => (p < 0.001 ? '< 0,001' : num(Math.round(p * 1000) / 1000));

export function lineasComo(ctx, x) {
  const e = x.evidencia || {}, p = x.params || {};
  const lineas = [];
  lineas.push(e.ventana >= 365 ? t('desc.como.anio') : t('desc.como.ventana', { n: e.ventana }));
  const base = { x: e.x, n: e.n, x0: e.x0, n0: e.n0, global: pct(e.global) };
  switch (x.tipo) {
    case 'g1': lineas.push(t('desc.como.g1', { ...base, dia: t('desc.diasPlural')[p.dia], resto: p.resto })); break;
    case 'g2': lineas.push(t('desc.como.g2', { rachas: e.rachas, interrupciones: e.interrupciones })); break;
    case 'g4': lineas.push(t('desc.como.g4', { ...base, franja: t(`desc.franja.${p.franja}`) })); break;
    case 'p1': lineas.push(t('desc.como.p1', { ...base, franja: t(`desc.franja.${p.franja}`) })); break;
    case 'p2': lineas.push(t('desc.como.p2', { ...base, a: nombreDe(ctx, x.habitIds[0]), b: nombreDe(ctx, x.habitIds[1]) })); break;
    case 'p3': lineas.push(t('desc.como.p3', base)); break;
    case 'p4': lineas.push(t('desc.como.p4', base)); break;
    case 'p5': lineas.push(t('desc.como.p5', { registros: e.registros, promedio: num(e.promedio), media7: num(e.media7) })); break;
    case 'p6': lineas.push(t('desc.como.p6', { ...base, palabra: palabraBonita(p.palabra) })); break;
    case 'p7': lineas.push(t('desc.como.p7', { ...base, bloque: t(`desc.bloque.${p.bloque}`) })); break;
    case 'p8': lineas.push(t('desc.como.p8', { ...base, mes: mesLargo(p.mes), meses: e.meses })); break;
    default: break;
  }
  if (typeof e.bajo === 'number' && typeof e.alto === 'number') lineas.push(t('desc.como.intervalo', { bajo: pct(e.bajo), alto: pct(e.alto) }));
  if (typeof e.pValor === 'number') lineas.push(t('desc.como.p', { p: pValor(e.pValor), m: e.pares, corte: pValor(e.corte) }));
  if (typeof e.umbrales === 'string' && e.umbrales.includes('mitades')) lineas.push(t('desc.como.mitades'));
  return lineas;
}

function abrirComo(ctx, x) {
  abrirHoja({
    titulo: t('desc.como'),
    etiqueta: 'desc-como',
    contenido: () => el('div', { class: 'form desc-como' },
      el('p', { class: 'desc-tarjeta__frase' }, frase(ctx, x)),
      etiquetaPista(x),
      lineasComo(ctx, x).map((l) => el('p', {}, l)),
      x.evidencia?.umbrales ? el('div', {},
        el('h3', { class: 'campo__etiqueta' }, t('desc.como.reglas')),
        el('p', { class: 'texto-ayuda' }, x.evidencia.umbrales)) : null,
      el('p', { class: 'texto-ayuda' }, t('desc.como.cierre')),
      el('p', { class: 'texto-ayuda' }, t('desc.como.privado'))),
  });
}

/* ---------- Progreso: la sección ---------- */

function resumenG3(ctx) {
  const { modelo } = ctx;
  const r = resumenSemanal({ habitos: modelo.habitos(), hoy: modelo.hoy(), logDe: modelo.logDe, ajustes: modelo.config.descubrimientos, privadosVisibles: ctx.mostrarPrivados() });
  if (!r) return null;
  const texto = r.tono === 'positivo' ? t(r.cuando === 'pasada' ? 'desc.g3.positivo.pasada' : 'desc.g3.positivo', { flores: r.flores }) : t('desc.g3.neutro');
  return el('div', { class: 'desc-resumen', data: { tono: r.tono } }, icono('brote', 'tv-icono--sm'), el('p', {}, texto));
}

export function seccionDescubrimientos(ctx) {
  const { modelo } = ctx;
  const cfg = modelo.config.descubrimientos;
  const cab = el('div', { class: 'cabecera__fila' },
    el('h2', { class: 'seccion__titulo', id: 'titulo-desc' }, t('desc.titulo')),
    el('button', { class: 'tv-boton tv-boton--sutil tv-boton--chico', type: 'button', data: { foco: 'desc-anteriores' }, onclick: () => abrirAnteriores(ctx) }, t('desc.verAnteriores')));
  const seccion = el('section', { class: 'seccion desc', aria: { labelledby: 'titulo-desc' } }, cab);
  if (!cfg.activado) {
    seccion.append(el('p', { class: 'texto-ayuda' }, t('desc.apagados')));
    return seccion;
  }
  prepararSemana(ctx, () => { if (seccion.isConnected) seccion.replaceWith(seccionDescubrimientos(ctx)); });
  seccion.append(el('p', { class: 'texto-ayuda' }, t('desc.intro')));
  const g3 = cfg.tiposApagados.includes('g3') ? null : resumenG3(ctx);
  if (g3) seccion.append(g3);
  const items = deEstaSemana(ctx);
  if (items.length) {
    seccion.append(el('div', { class: 'desc-lista' }, items.map((x) => tarjeta(ctx, x))));
    // Al mostrarse, dejan de ser "nuevos" (sin redibujar: la etiqueta se va la próxima vez).
    modelo.marcarVistosDesc(items.map((x) => x.id));
  } else if (modelo.descubrimientos.semana === semanaActual(ctx)) {
    const hay = modelo.habitos().some((h) => !h.archivado);
    seccion.append(el('p', { class: 'texto-ayuda desc-vacio' }, hay && tieneHistoria(ctx) ? t('desc.nadaNuevo') : t('desc.pocos')));
  } else {
    seccion.append(el('p', { class: 'texto-ayuda desc-vacio' }, t('desc.pocos')));
  }
  seccion.append(comparador(ctx));
  return seccion;
}

const tieneHistoria = (ctx) => ctx.modelo.habitos().some((h) => h.creado <= sumarDias(ctx.modelo.hoy(), -14));

/** Guardados y semanas anteriores (lo vencido se archiva, no se borra). */
function abrirAnteriores(ctx) {
  abrirHoja({
    titulo: t('desc.verAnteriores'),
    etiqueta: 'desc-anteriores',
    contenido: () => {
      const todos = ctx.modelo.descubrimientos.items.filter((x) => visible(ctx, x));
      const guardados = todos.filter((x) => x.estado === 'guardado').reverse();
      const semana = semanaActual(ctx);
      const previos = todos.filter((x) => x.estado !== 'guardado' && x.semana < semana).reverse();
      const porSemana = new Map();
      for (const x of previos) { if (!porSemana.has(x.semana)) porSemana.set(x.semana, []); porSemana.get(x.semana).push(x); }
      return el('div', { class: 'form' },
        el('h3', { class: 'campo__etiqueta' }, t('desc.guardados')),
        guardados.length ? el('div', { class: 'desc-lista' }, guardados.map((x) => tarjeta(ctx, x, { compacta: true }))) : el('p', { class: 'texto-ayuda' }, '—'),
        el('h3', { class: 'campo__etiqueta' }, t('desc.anteriores')),
        porSemana.size
          ? [...porSemana.entries()].slice(0, 12).map(([s, xs]) => el('div', { class: 'desc-lista' },
            el('p', { class: 'subtitulo' }, t('desc.semanaDe', { fecha: fechaCorta(s) })),
            xs.map((x) => tarjeta(ctx, x, { compacta: true }))))
          : el('p', { class: 'texto-ayuda' }, t('desc.anteriores.vacio')));
    },
  });
}

/* ---------- Revisión semanal ---------- */

export function bloqueRevisionDesc(ctx) {
  const cfg = ctx.modelo.config.descubrimientos;
  if (!cfg.activado) return null;
  const items = deEstaSemana(ctx);
  if (!items.length) return null;
  return el('section', { class: 'desc-revision' },
    el('h3', { class: 'campo__etiqueta' }, t('desc.revision')),
    items.map((x) => el('p', { class: 'texto-ayuda' }, frase(ctx, x))));
}

/* ---------- P9: comparador de dos hábitos ---------- */

function comparador(ctx) {
  const { modelo } = ctx;
  const cfg = modelo.config.descubrimientos;
  const fuera = new Set(cfg.excluidos), dentro = new Set(cfg.incluidos);
  // Sin sensibles (salvo incluidos) y sin privados con la bóveda cerrada.
  const lista = ctx.visibles().filter((h) => !h.archivado && !fuera.has(h.id) && (!esSensible(h) || dentro.has(h.id)) && (!h.privado || dentro.has(h.id)))
    .sort((a, b) => a.orden - b.orden);
  const cuerpo = el('div', { class: 'desc-comparador__cuerpo' });
  const detalles = el('details', { class: 'tarjeta desc-comparador' }, el('summary', { class: 'desc-comparador__titulo' }, t('desc.comparador')), cuerpo);
  if (lista.length < 2) {
    cuerpo.append(el('p', { class: 'texto-ayuda' }, t('desc.comparador.pocos')));
    return detalles;
  }
  const opciones = (sel) => lista.map((h) => el('option', { value: h.id, selected: h.id === sel }, h.nombre));
  const selA = el('select', { class: 'entrada', id: 'comp-a' }, opciones(lista[0].id));
  const selB = el('select', { class: 'entrada', id: 'comp-b' }, opciones(lista[1].id));
  const zona = el('div', {});
  const dibujar = () => {
    zona.replaceChildren();
    const ha = modelo.habito(selA.value), hb = modelo.habito(selB.value);
    if (!ha || !hb) return;
    const r = serieComparador([ha, hb], modelo.hoy(), modelo.logDe);
    zona.append(lineas(r, ha, hb));
  };
  selA.addEventListener('change', dibujar);
  selB.addEventListener('change', dibujar);
  // Se dibuja al abrir (no cuesta nada si nadie lo abre).
  detalles.addEventListener('toggle', () => { if (detalles.open && !zona.firstChild) dibujar(); });
  cuerpo.append(
    el('p', { class: 'texto-ayuda' }, t('desc.comparador.ayuda')),
    el('div', { class: 'desc-comparador__campos' },
      el('div', { class: 'campo' }, el('label', { class: 'campo__etiqueta', for: 'comp-a' }, t('desc.comparador.a')), selA),
      el('div', { class: 'campo' }, el('label', { class: 'campo__etiqueta', for: 'comp-b' }, t('desc.comparador.b')), selB)),
    zona);
  return detalles;
}

function lineas(r, ha, hb) {
  const W = 280, H = 110, arriba = 8, abajo = 92;
  const svg = document.createElementNS(SVG, 'svg');
  svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
  svg.setAttribute('class', 'desc-grafico__svg');
  svg.setAttribute('aria-hidden', 'true');
  const nodo = (tag, at, txt) => {
    const n = document.createElementNS(SVG, tag);
    for (const [k, v] of Object.entries(at)) n.setAttribute(k, String(v));
    if (txt !== undefined) n.textContent = txt;
    svg.append(n);
    return n;
  };
  const k = r.semanas.length;
  const xDe = (i) => 8 + (i * (W - 16)) / Math.max(1, k - 1);
  const yDe = (p) => abajo - p * (abajo - arriba);
  nodo('line', { x1: 0, x2: W, y1: abajo + 0.5, y2: abajo + 0.5, class: 'desc-grafico__base' });
  r.series.forEach((s, j) => {
    const pts = s.serie.map((v, i) => (v ? `${xDe(i).toFixed(1)},${yDe(v.p).toFixed(1)}` : null)).filter(Boolean);
    if (pts.length > 1) nodo('polyline', { points: pts.join(' '), class: `desc-linea desc-linea--${j}` });
    // Marcas distintas (círculo / cuadrado) para no depender del color.
    s.serie.forEach((v, i) => {
      if (!v) return;
      if (j === 0) nodo('circle', { cx: xDe(i).toFixed(1), cy: yDe(v.p).toFixed(1), r: 2.6, class: 'desc-punto desc-punto--0' });
      else nodo('rect', { x: (xDe(i) - 2.4).toFixed(1), y: (yDe(v.p) - 2.4).toFixed(1), width: 4.8, height: 4.8, class: 'desc-punto desc-punto--1' });
    });
  });
  nodo('text', { x: 8, y: H - 4, class: 'desc-grafico__eje' }, fechaCorta(r.semanas[0]));
  nodo('text', { x: W - 8, y: H - 4, 'text-anchor': 'end', class: 'desc-grafico__eje' }, fechaCorta(r.semanas[k - 1]));
  const v = (x) => (x ? porcentaje(x.p) : t('desc.comparador.sinDatos'));
  const texto = r.semanas.map((s, i) => t('desc.comparador.fila', { semana: fechaCorta(s), a: v(r.series[0].serie[i]), b: v(r.series[1].serie[i]) })).join('; ');
  return el('figure', { class: 'desc-grafico' },
    el('div', { role: 'img', aria: { label: t('desc.aria.grafico', { texto: `${ha.nombre} / ${hb.nombre}. ${texto}` }) } }, svg),
    el('p', { class: 'desc-leyenda' },
      el('span', { class: 'desc-leyenda__item desc-leyenda__item--0' }, `● ${ha.nombre}`),
      el('span', { class: 'desc-leyenda__item desc-leyenda__item--1' }, `■ ${hb.nombre}`)),
    el('details', { class: 'desc-tabla' },
      el('summary', {}, t('desc.tabla')),
      el('table', {},
        el('thead', {}, el('tr', {}, el('th', { scope: 'col' }, ''), el('th', { scope: 'col' }, ha.nombre), el('th', { scope: 'col' }, hb.nombre))),
        el('tbody', {}, r.semanas.map((s, i) => el('tr', {}, el('th', { scope: 'row' }, fechaCorta(s)), el('td', {}, v(r.series[0].serie[i])), el('td', {}, v(r.series[1].serie[i]))))))));
}

/* ---------- Ajustes ---------- */

export function seccionAjustesDesc(ctx) {
  const { modelo } = ctx;
  const cfg = modelo.config.descubrimientos;
  // Los interruptores ya muestran el cambio: solo se redibuja al encender o apagar todo (así no se cierran las listas).
  const fijar = (cambios, redibujar = false) => modelo.setConfig({ descubrimientos: { ...modelo.config.descubrimientos, ...cambios } }, { redibujar });
  const interruptor = (id, texto, checked, alCambiar, foco) => {
    const input = el('input', { type: 'checkbox', role: 'switch', id, checked, data: { foco: foco || id } });
    input.addEventListener('change', () => alCambiar(input.checked));
    return el('label', { class: 'interruptor', for: id }, el('span', {}, texto), input);
  };
  const hijos = [
    interruptor('desc-activado', t('ajustes.desc.activado'), cfg.activado, (v) => fijar({ activado: v }, true)),
    el('p', { class: 'texto-ayuda' }, t('ajustes.desc.ayuda')),
  ];
  if (cfg.activado) {
    const aviso = el('p', { class: 'texto-ayuda', role: 'status' }, t('ajustes.desc.aviso.ayuda'));
    hijos.push(interruptor('desc-aviso', t('ajustes.desc.aviso'), cfg.notificarRevision && globalThis.Notification?.permission === 'granted', async (v) => {
      if (!v) { fijar({ notificarRevision: false }); return; }
      const permiso = await pedirPermiso();
      if (permiso === 'granted') { fijar({ notificarRevision: true }); return; }
      const casilla = document.getElementById('desc-aviso');
      if (casilla) casilla.checked = false;
      aviso.textContent = t('ajustes.desc.aviso.denegado');
    }), aviso);
    hijos.push(el('details', { class: 'desc-ajustes' },
      el('summary', { class: 'campo__etiqueta' }, t('ajustes.desc.tipos')),
      TIPOS_DESC.map((tipo) => interruptor(`desc-tipo-${tipo}`, t(`ajustes.desc.tipo.${tipo}`), !cfg.tiposApagados.includes(tipo), (v) => {
        const actual = modelo.config.descubrimientos.tiposApagados.filter((x) => x !== tipo);
        fijar({ tiposApagados: v ? actual : [...actual, tipo] });
      }))));
    const habitos = ctx.visibles().filter((h) => !h.archivado).sort((a, b) => a.orden - b.orden);
    if (habitos.length) {
      hijos.push(el('details', { class: 'desc-ajustes' },
        el('summary', { class: 'campo__etiqueta' }, t('ajustes.desc.habitos')),
        el('p', { class: 'texto-ayuda' }, t('ajustes.desc.habitos.ayuda')),
        habitos.map((h) => {
          const especial = h.privado || esSensible(h);
          const dentro = especial ? cfg.incluidos.includes(h.id) : !cfg.excluidos.includes(h.id);
          const marca = [h.privado ? t('ajustes.desc.privado') : null, esSensible(h) ? t('ajustes.desc.sensible') : null].filter(Boolean).join(' · ');
          return interruptor(`desc-h-${h.id}`, marca ? `${h.nombre} (${marca})` : h.nombre, dentro, (v) => {
            const c = modelo.config.descubrimientos;
            if (especial) fijar({ incluidos: v ? [...c.incluidos, h.id] : c.incluidos.filter((x) => x !== h.id) });
            else fijar({ excluidos: v ? c.excluidos.filter((x) => x !== h.id) : [...c.excluidos, h.id] });
          });
        })));
    }
  }
  return el('section', { class: 'seccion', id: 'descubrimientos' },
    el('h2', { class: 'seccion__titulo' }, t('ajustes.desc')),
    el('div', { class: 'tarjeta' }, hijos));
}
