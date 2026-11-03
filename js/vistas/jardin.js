// vistas/jardin.js — El Jardín anual en Progreso (J3, J4).
// Vista Año (12 macizos) y vista Mes (flores grandes, tocables). Todo se dibuja en el dispositivo
// desde los registros; nada se envía. SVG creado con createElementNS: ningún dato pasa por innerHTML.
// Sin culpa: no hay rojo ni flores marchitas; un día sin flor es tierra que descansa.

import { el, icono, menosMovimiento, vibrar } from '../dom.js';
import { t } from '../textos.js';
import { diffDias, fechaLarga } from '../fechas.js';
import { num } from '../formato.js';
import { abrirHoja, anunciar } from '../ui.js';
import { cumplido, estadoDelDia, tocaEnFecha } from '../calculos.js';
import { contar, diasDelMes, esFlor, jardinDelAnio, umbralDe } from '../jardin.js';
import {
  ALTO, ANCHO, CELDA, estacion, filasDelMes, macizo, nuevaSemilla, posicionEnAnio, posicionLocal, rasgosDelDia,
} from '../jardin-disposicion.js';
import { crearDefs, figuraDe, nodoSvg as nodo } from '../jardin-arte.js';
import { abrirTarjetaJardin } from './jardin-tarjeta.js';

const ID_DEFS = 'jardin-defs';
const REPETICION_MS = 6000;
const MESES_LARGO = () => t('meses.largo');

/** Los símbolos se definen una sola vez en el documento y todas las flores los reutilizan con <use>. */
export function asegurarDefs() {
  if (document.getElementById(ID_DEFS)) return;
  const svg = nodo('svg', { id: ID_DEFS, class: 'jardin-defs', 'aria-hidden': 'true', focusable: 'false', width: 0, height: 0 });
  svg.append(crearDefs());
  document.body.append(svg);
}

/** Celulares modestos o ahorro de datos: jardín estático (sin viento ni repetición animada). */
export function esLigero() {
  const n = globalThis.navigator || {};
  return (n.deviceMemory && n.deviceMemory <= 2) || (n.hardwareConcurrency && n.hardwareConcurrency <= 2)
    || n.connection?.saveData === true || Boolean(globalThis.matchMedia?.('(prefers-reduced-data: reduce)').matches);
}

/** ¿Se puede animar? (preferencia del sistema, ajuste del jardín y equipo). */
const animable = (ctx) => !menosMovimiento() && ctx.modelo.config.jardin.animaciones && !esLigero();

/** Semilla del jardín: si falta, se crea una vez y queda en los ajustes (y en tus respaldos). */
function semillaDe(ctx) {
  const j = ctx.modelo.config.jardin;
  if (j.semilla) return j.semilla;
  if (ctx.modelo.config.idInstalacion) return ctx.modelo.config.idInstalacion; // el id de instalación (0.10)
  const nueva = nuevaSemilla();
  ctx.modelo.setConfig({ jardin: { ...j, semilla: nueva } }, { redibujar: false });
  return nueva;
}

/** Jardín del año visible, con la caché de la sesión. */
export function calcularJardin(ctx, habitos, anio) {
  const { modelo } = ctx;
  return jardinDelAnio(habitos, anio, { hoy: modelo.hoy(), logDe: modelo.logDe, umbral: umbralDe(modelo.config), cache: ctx.cacheJardin });
}

/* ---------- Textos de estado (cálidos, sin culpa) ---------- */

function textoEstado(d) {
  if (d.estado === 'flor_rara') return t('jardin.estado.flor_rara', { n: d.hito });
  return t(`jardin.estado.${d.estado}`);
}

function etiquetaDia(d) {
  const base = `${fechaLarga(d.fecha)}: ${textoEstado(d)}`;
  return d.total > 0 && !['futuro', 'sin_sembrar'].includes(d.estado) ? `${base}, ${t('jardin.hechosDe', { hechos: d.hechos, total: d.total })}` : base;
}

/* ---------- Vista principal ---------- */

export function renderJardin(raiz, ctx, habitos) {
  asegurarDefs();
  const { modelo } = ctx;
  const hoy = modelo.hoy();
  const anio = Number(hoy.slice(0, 4));
  ctx.jardinVista ??= { mes: null };
  const semilla = semillaDe(ctx);
  const jardin = calcularJardin(ctx, habitos, anio);
  const conf = modelo.config.jardin;
  const mes = ctx.jardinVista.mes;
  const animar = animable(ctx);

  const c = contar(jardin.dias);
  const cajaFigura = el('div', { class: 'jardin__lienzo' });
  const herramientas = el('div', { class: 'jardin__herramientas' });
  const pie = el('div', { class: 'jardin__pie' });
  const seccion = el('div', { class: `tarjeta jardin${esLigero() ? ' jardin--ligero' : ''}`, data: { vista: mes ? 'mes' : 'anio' } });

  // Hoy acaba de florecer: la flor brota en su lugar, una sola vez por día (y con la frase si es hito).
  const deHoy = jardin.dias.find((d) => d.fecha === hoy);
  ctx.jardinNacidas ??= new Set();
  const nace = deHoy && esFlor(deHoy.estado) && !ctx.jardinNacidas.has(hoy);
  if (nace) {
    ctx.jardinNacidas.add(hoy);
    if (conf.vibracion) vibrar(18);
    if (conf.sonido) sonar();
  }

  if (mes) {
    const dias = diasDelMes(jardin, mes);
    const cm = contar(dias);
    seccion.append(el('div', { class: 'cabecera__fila' },
      el('button', { class: 'tv-boton tv-boton--sutil tv-boton--chico', type: 'button', data: { foco: 'jardin-anio' }, onclick: () => irMes(ctx, null) },
        icono('izquierda', 'tv-icono--sm'), t('jardin.verAnio', { anio })),
      el('div', { class: 'jardin__nav' },
        el('button', { class: 'tv-boton--icono', type: 'button', disabled: mes === 1, data: { foco: 'jardin-mes-ant' }, aria: { label: t('jardin.mesAnterior') }, onclick: () => irMes(ctx, mes - 1) }, icono('izquierda')),
        el('button', { class: 'tv-boton--icono', type: 'button', disabled: mes === 12, data: { foco: 'jardin-mes-sig' }, aria: { label: t('jardin.mesSiguiente') }, onclick: () => irMes(ctx, mes + 1) }, icono('derecha')))));
    seccion.append(el('h3', { class: 'jardin__titulo' }, `${MESES_LARGO()[mes - 1]} ${anio}`));
    seccion.append(el('p', { class: 'jardin__resumen' }, resumenMes(cm, dias.length, mes, hoy)));
    cajaFigura.append(svgMes(ctx, jardin, mes, semilla, { hoy, animar, nace, hemisferio: conf.hemisferio }));
  } else {
    seccion.append(el('h3', { class: 'jardin__titulo' }, t('jardin.titulo', { anio })));
    seccion.append(el('p', { class: 'jardin__resumen' }, resumenAnio(c)));
    cajaFigura.append(svgAnio(ctx, jardin, semilla, { hoy, animar, nace, hemisferio: conf.hemisferio, c }));
    if (conf.animaciones && !menosMovimiento()) {
      herramientas.append(el('button', { class: 'tv-boton tv-boton--secundario tv-boton--chico', type: 'button', data: { foco: 'jardin-crecer' }, onclick: () => repetir(cajaFigura, herramientas) },
        icono('reproducir', 'tv-icono--sm'), t('jardin.crecer')));
    }
  }
  herramientas.append(el('button', { class: 'tv-boton tv-boton--secundario tv-boton--chico', type: 'button', data: { foco: 'jardin-compartir' }, onclick: () => abrirTarjetaJardin(ctx) },
    icono('compartir', 'tv-icono--sm'), t('jardin.compartir')));

  seccion.append(cajaFigura, leyenda(), herramientas);

  if (deHoy?.estado === 'flor_rara') {
    pie.append(el('figure', { class: 'jardin__frase' },
      el('blockquote', {}, t(`jardin.frase.${deHoy.hito}`)),
      el('figcaption', {}, t('jardin.frase.autor'))));
  }
  pie.append(listaAlternativa(jardin, anio));
  seccion.append(pie);
  raiz.append(seccion);

  if (nace) anunciar(deHoy.estado === 'flor_rara' ? t('jardin.nacioRara', { n: deHoy.hito }) : t('jardin.nacio'));
  activarGestos(ctx, cajaFigura, mes);
}

function irMes(ctx, mes) {
  ctx.jardinVista.mes = mes;
  ctx.render();
  requestAnimationFrame(() => document.querySelector(mes ? '.jardin__mes [tabindex="0"]' : `[data-foco="jardin-macizo-${ctx.jardinVista.ultimoMes || 1}"]`)?.focus({ preventScroll: true }));
  if (mes) ctx.jardinVista.ultimoMes = mes;
}

function resumenAnio(c) {
  if (c.flores === 0) return t('jardin.resumen.vacio');
  return t(c.descansos ? 'jardin.resumen.anio' : 'jardin.resumen.anioSolo', { flores: num(c.flores), n: c.flores, descansos: num(c.descansos), d: c.descansos });
}

function resumenMes(c, total, mes, hoy) {
  const actual = Number(hoy.slice(5, 7)) === mes;
  if (c.flores === 0) return t(c.futuro + c.sin_sembrar === total ? 'jardin.resumen.mesFuturo' : 'jardin.resumen.mesTierra');
  return t(actual ? 'jardin.resumen.esteMes' : 'jardin.resumen.mes', { n: c.flores, flores: num(c.flores) });
}

/* ---------- SVG del año ---------- */

function svgAnio(ctx, jardin, semilla, { hoy, animar, nace, hemisferio, c }) {
  const svg = nodo('svg', {
    viewBox: `0 0 ${ANCHO} ${ALTO}`, class: `jardin__svg jardin__anio estacion-${estacion(Number(hoy.slice(5, 7)), hemisferio)}${animar ? ' jardin--entrada' : ''}`,
    role: 'group', 'aria-label': t('jardin.aria.anio', { anio: jardin.anio, flores: c.flores, descansos: c.descansos }),
  });
  nodo('rect', { x: 0, y: 0, width: ANCHO, height: ALTO, rx: 6, class: 'j-fondo' }, svg);
  nodo('rect', { x: 0, y: 0, width: ANCHO, height: ALTO, rx: 6, class: 'j-ambiente' }, svg);
  const macizos = [];
  const meses = MESES_LARGO();
  const mesHoy = Number(hoy.slice(5, 7));
  for (let mes = 1; mes <= 12; mes++) {
    const m = macizo(mes);
    const dias = diasDelMes(jardin, mes);
    const cm = contar(dias);
    const g = nodo('g', {
      class: `j-macizo estacion-${estacion(mes, hemisferio)}`, role: 'button', tabindex: mes === (ctx.jardinVista.ultimoMes || mesHoy) ? 0 : -1,
      'data-foco': `jardin-macizo-${mes}`, 'aria-label': t('jardin.aria.macizo', { mes: meses[mes - 1], flores: cm.flores }),
    }, svg);
    g.style.setProperty('--i', String(mes - 1));
    const filas = filasDelMes(jardin.anio, mes);
    nodo('rect', { x: m.x - 2, y: m.camaY - 1, width: m.ancho + 4, height: filas * CELDA + 2, rx: 4, class: 'j-cama' }, g);
    const etiqueta = nodo('text', { x: m.x, y: m.etiquetaY, class: 'j-etiqueta' }, g);
    etiqueta.textContent = meses[mes - 1].slice(0, 3);
    for (const d of dias) {
      const r = rasgosDelDia(d.fecha, semilla);
      const p = posicionEnAnio(d.fecha, r);
      const u = flor(d, r, p.cx, p.cy, CELDA * r.escala);
      g.append(d.fecha === hoy ? marcarHoy(g, p.cx, p.cy, CELDA, u, nace) : u);
    }
    g.addEventListener('click', () => irMes(ctx, mes));
    g.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); irMes(ctx, mes); return; }
      const mov = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -3, ArrowDown: 3, Home: -12, End: 12 }[e.key];
      if (mov === undefined) return;
      e.preventDefault();
      const j = Math.min(Math.max(mes - 1 + mov, 0), 11);
      g.tabIndex = -1;
      macizos[j].tabIndex = 0;
      macizos[j].focus();
      ctx.jardinVista.ultimoMes = j + 1;
    });
    macizos.push(g);
  }
  return svg;
}

/** Una flor (o semilla, hoja, tierra…) como <use> del símbolo, con su variante de color. */
function flor(d, r, cx, cy, tam) {
  const u = nodo('use', {
    href: `#j-${figuraDe(d.estado, r.especie)}`, x: cx - tam / 2, y: cy - tam / 2, width: tam, height: tam,
    class: `j-dia-figura v${r.variante} j-${d.estado}`,
    transform: r.giro ? `rotate(${r.giro} ${cx} ${cy + tam * 0.4})` : null,
  });
  return u;
}

/** Halo suave en el día de hoy. Si acaba de florecer, la flor crece (envuelta: su giro queda intacto). */
function marcarHoy(padre, cx, cy, tam, figura, nace) {
  nodo('circle', { cx, cy: cy + tam * 0.1, r: tam * 0.62, class: 'j-halo' }, padre);
  if (!nace) return figura;
  const envoltura = nodo('g', { class: 'j-nace' });
  envoltura.append(figura);
  return envoltura;
}

/* ---------- SVG del mes: flores grandes y tocables ---------- */

function svgMes(ctx, jardin, mes, semilla, { hoy, animar, nace, hemisferio }) {
  const filas = filasDelMes(jardin.anio, mes);
  const cab = 6;
  const ancho = 7 * CELDA + 2;
  const alto = cab + filas * CELDA + 1;
  const svg = nodo('svg', {
    viewBox: `-1 0 ${ancho} ${alto}`, class: `jardin__svg jardin__mes estacion-${estacion(mes, hemisferio)}${animar ? ' jardin--entrada jardin--viento' : ''}`,
    role: 'group', 'aria-label': t('jardin.aria.mes', { mes: MESES_LARGO()[mes - 1] }),
  });
  nodo('rect', { x: -1, y: 0, width: ancho, height: alto, rx: 2, class: 'j-fondo' }, svg);
  nodo('rect', { x: -1, y: 0, width: ancho, height: alto, rx: 2, class: 'j-ambiente' }, svg);
  t('dias.corto').forEach((l, i) => {
    const tx = nodo('text', { x: i * CELDA + CELDA / 2, y: 4, class: 'j-etiqueta j-etiqueta--dia', 'aria-hidden': 'true' }, svg);
    tx.textContent = l;
  });
  nodo('rect', { x: -0.5, y: cab - 0.5, width: ancho - 1, height: filas * CELDA + 1, rx: 1.5, class: 'j-cama' }, svg);

  const dias = diasDelMes(jardin, mes);
  const botones = [];
  dias.forEach((d, i) => {
    const r = rasgosDelDia(d.fecha, semilla);
    const p = posicionLocal(d.fecha, r);
    const x0 = p.col * CELDA;
    const y0 = cab + p.fila * CELDA;
    const tocable = d.estado !== 'futuro';
    const g = nodo('g', {
      class: 'j-dia', role: tocable ? 'button' : 'img', tabindex: tocable ? -1 : null,
      'aria-label': etiquetaDia(d), 'data-foco': `jardin-dia-${d.fecha}`, 'aria-disabled': tocable ? null : 'true',
    }, svg);
    g.style.setProperty('--i', String(i));
    nodo('rect', { x: x0, y: y0, width: CELDA, height: CELDA, rx: 1.4, class: 'j-celda' }, g);
    const numero = nodo('text', { x: x0 + 0.8, y: y0 + 2.1, class: 'j-numero', 'aria-hidden': 'true' }, g);
    numero.textContent = String(Number(d.fecha.slice(8, 10)));
    const cx = x0 + CELDA / 2 + r.dx * CELDA * 0.4;
    const cy = y0 + CELDA / 2 + r.dy * CELDA * 0.4;
    const u = flor(d, r, cx, cy, CELDA * 0.96 * r.escala);
    const figura = d.fecha === hoy ? marcarHoy(g, cx, cy, CELDA * 0.86, u, nace) : u;
    const balanceo = nodo('g', { class: esFlor(d.estado) || d.estado === 'capullo' ? 'j-balanceo' : null }, g);
    balanceo.style.setProperty('--d', String((i * 37) % 9));
    balanceo.append(figura);
    if (tocable) {
      g.addEventListener('click', () => abrirDia(ctx, d));
      g.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); abrirDia(ctx, d); }
      });
      botones.push(g);
    }
  });

  // Teclado: una sola parada de tabulación; flechas entre días (±1 día, ±1 semana).
  const inicial = botones.find((b) => b.dataset.foco === `jardin-dia-${hoy}`) || botones[botones.length - 1];
  if (inicial) inicial.tabIndex = 0;
  svg.addEventListener('keydown', (e) => {
    const mov = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7, Home: -99, End: 99 }[e.key];
    if (mov === undefined) return;
    const i = botones.indexOf(document.activeElement);
    if (i < 0) return;
    e.preventDefault();
    const j = Math.min(Math.max(i + mov, 0), botones.length - 1);
    botones[i].tabIndex = -1;
    botones[j].tabIndex = 0;
    botones[j].focus();
  });

  // El viento solo corre mientras el jardín se ve (y nunca con menos movimiento).
  if (animar && 'IntersectionObserver' in globalThis) {
    const io = new IntersectionObserver(([e]) => svg.classList.toggle('jardin--quieto', !e.isIntersecting));
    io.observe(svg);
  }
  return svg;
}

/* ---------- Ficha de un día ---------- */

function abrirDia(ctx, d) {
  const { modelo } = ctx;
  const hoy = modelo.hoy();
  // Nombres y notas: solo de hábitos visibles y no privados (la bóveda nunca aparece en el jardín).
  const habitos = ctx.visibles().filter((h) => !h.privado && tocaEnFecha(h, d.fecha));
  const reciente = d.fecha <= hoy && diffDias(d.fecha, hoy) <= 30;
  const sembrable = reciente && ['tierra', 'brote', 'capullo', 'pendiente'].includes(d.estado);
  abrirHoja({
    titulo: fechaLarga(d.fecha),
    etiqueta: 'jardin-dia',
    contenido: (cerrar) => {
      const hijos = [el('p', { class: 'jardin-dia__estado' }, textoEstado(d))];
      if (d.total > 0) hijos.push(el('p', { class: 'texto-ayuda' }, t('jardin.hechosDe', { hechos: d.hechos, total: d.total })));
      if (d.estado === 'flor_rara') {
        hijos.push(el('figure', { class: 'jardin__frase' }, el('blockquote', {}, t(`jardin.frase.${d.hito}`)), el('figcaption', {}, t('jardin.frase.autor'))));
      }
      if (habitos.length) {
        hijos.push(el('ul', { class: 'jardin-dia__lista' }, habitos.map((h) => {
          const log = modelo.logDe(h.id, d.fecha);
          const hecho = cumplido(estadoDelDia(h, log));
          return el('li', { class: hecho ? 'jardin-dia__hecho' : null },
            el('span', { class: 'jardin-dia__marca', aria: { hidden: 'true' } }, hecho ? icono('hecho', 'tv-icono--xs') : null),
            el('span', {}, h.nombre, hecho ? el('span', { class: 'solo-lector' }, ` · ${t('jardin.hecho')}`) : null),
            log?.nota ? el('span', { class: 'jardin-dia__nota' }, log.nota) : null);
        })));
      }
      if (sembrable) {
        hijos.push(el('p', { class: 'texto-ayuda' }, t(d.fecha === hoy ? 'jardin.sembrarHoy' : 'jardin.sembrarTexto')),
          el('button', { class: 'tv-boton tv-boton--principal', type: 'button', 'data-autofoco': '', onclick: () => { cerrar(); ctx.verFecha(d.fecha === hoy ? null : d.fecha); } },
            icono('brote', 'tv-icono--sm'), t(d.fecha === hoy ? 'jardin.irHoy' : 'jardin.sembrar')));
      }
      return hijos;
    },
  });
}

/* ---------- Leyenda (siempre visible) y alternativa en lista ---------- */

const LEYENDA = [['flor', 'margarita'], ['capullo', 'tulipan'], ['brote'], ['tierra'], ['descanso'], ['sin_habitos'], ['flor_rara'], ['sin_sembrar']];

function leyenda() {
  return el('ul', { class: 'jardin__leyenda', aria: { label: t('jardin.leyenda') } },
    LEYENDA.map(([e, esp]) => {
      const s = nodo('svg', { viewBox: '2 2 16 17', class: 'jardin__leyenda-figura', 'aria-hidden': 'true' });
      nodo('use', { href: `#j-${figuraDe(e, esp || 'margarita')}`, x: 0, y: 0, width: 20, height: 20, class: `v1 j-${e}` }, s);
      return el('li', {}, s, t(`jardin.leyenda.${e}`));
    }));
}

function listaAlternativa(jardin, anio) {
  const meses = MESES_LARGO();
  const filas = [];
  for (let mes = 1; mes <= 12; mes++) {
    const c = contar(diasDelMes(jardin, mes));
    if (c.futuro + c.sin_sembrar === diasDelMes(jardin, mes).length) continue;
    filas.push(el('tr', {},
      el('th', { scope: 'row' }, meses[mes - 1]),
      el('td', {}, num(c.flores)), el('td', {}, num(c.capullo + c.brote)), el('td', {}, num(c.descansos)), el('td', {}, num(c.tierra))));
  }
  return el('details', { class: 'mas jardin__lista' },
    el('summary', {}, t('jardin.lista')),
    filas.length
      ? el('table', { class: 'jardin__tabla' },
        el('caption', { class: 'solo-lector' }, t('jardin.titulo', { anio })),
        el('thead', {}, el('tr', {}, ['mes', 'flores', 'creciendo', 'descanso', 'tierra'].map((k) => el('th', { scope: 'col' }, t(`jardin.tabla.${k}`))))),
        el('tbody', {}, filas))
      : el('p', { class: 'texto-ayuda' }, t('jardin.resumen.vacio')));
}

/* ---------- «Ver cómo creció»: el año en unos 6 segundos ---------- */

function repetir(caja, herramientas) {
  const svg = caja.querySelector('svg');
  if (!svg || svg.dataset.repitiendo) return;
  const figuras = [...svg.querySelectorAll('.j-dia-figura')];
  const orden = figuras.map((f, i) => [f, i]);
  svg.dataset.repitiendo = '';
  svg.classList.remove('jardin--entrada');
  svg.classList.add('jardin--repitiendo');
  for (const f of figuras) f.classList.add('j-oculta');
  let inicio = performance.now();
  let pausado = false;
  let acumulado = 0;
  let marco = 0;
  const controles = el('div', { class: 'jardin__controles', role: 'group', aria: { label: t('jardin.crecer') } });
  const btnPausa = el('button', { class: 'tv-boton tv-boton--secundario tv-boton--chico', type: 'button', aria: { pressed: 'false' } }, icono('pausa', 'tv-icono--sm'), t('jardin.pausa'));
  const btnSaltar = el('button', { class: 'tv-boton tv-boton--secundario tv-boton--chico', type: 'button' }, icono('saltar', 'tv-icono--sm'), t('jardin.saltar'));
  controles.append(btnPausa, btnSaltar);
  herramientas.prepend(controles);
  const terminar = () => {
    cancelAnimationFrame(marco);
    for (const f of figuras) f.classList.remove('j-oculta');
    svg.classList.remove('jardin--repitiendo');
    delete svg.dataset.repitiendo;
    controles.remove();
  };
  const paso = (ahora) => {
    if (!svg.isConnected) return;
    const tt = acumulado + (pausado ? 0 : ahora - inicio);
    const n = Math.min(orden.length, Math.floor((tt / REPETICION_MS) * orden.length));
    for (let i = 0; i < n; i++) orden[i][0].classList.remove('j-oculta');
    if (n >= orden.length) { terminar(); return; }
    marco = requestAnimationFrame(paso);
  };
  btnPausa.addEventListener('click', () => {
    if (pausado) { pausado = false; inicio = performance.now(); btnPausa.setAttribute('aria-pressed', 'false'); }
    else { acumulado += performance.now() - inicio; pausado = true; btnPausa.setAttribute('aria-pressed', 'true'); }
  });
  btnSaltar.addEventListener('click', terminar);
  marco = requestAnimationFrame(paso);
}

/* ---------- Pellizcar para acercar ---------- */

function activarGestos(ctx, caja, mes) {
  const punteros = new Map();
  let distancia0 = null;
  let mesBajoDedos = null;
  caja.addEventListener('pointerdown', (e) => { if (e.pointerType === 'touch') punteros.set(e.pointerId, e); });
  caja.addEventListener('pointermove', (e) => {
    if (!punteros.has(e.pointerId)) return;
    punteros.set(e.pointerId, e);
    if (punteros.size !== 2) return;
    const [a, b] = [...punteros.values()];
    const dist = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
    if (distancia0 === null) {
      distancia0 = dist;
      const objetivo = document.elementFromPoint((a.clientX + b.clientX) / 2, (a.clientY + b.clientY) / 2)?.closest?.('.j-macizo');
      mesBajoDedos = objetivo ? Number(objetivo.dataset.foco.split('-').pop()) : null;
      return;
    }
    const escala = dist / distancia0;
    if (!mes && escala > 1.35 && mesBajoDedos) { punteros.clear(); distancia0 = null; irMes(ctx, mesBajoDedos); }
    else if (mes && escala < 0.75) { punteros.clear(); distancia0 = null; irMes(ctx, null); }
  });
  const soltar = (e) => { punteros.delete(e.pointerId); if (punteros.size < 2) distancia0 = null; };
  caja.addEventListener('pointerup', soltar);
  caja.addEventListener('pointercancel', soltar);
}

/* ---------- Sonido discreto (apagado por defecto): un tono suave, sin archivos ---------- */

let audio = null;
function sonar() {
  try {
    audio ??= new (globalThis.AudioContext || globalThis.webkitAudioContext)();
    const o = audio.createOscillator();
    const g = audio.createGain();
    const ahora = audio.currentTime;
    o.type = 'sine';
    o.frequency.setValueAtTime(660, ahora);
    o.frequency.exponentialRampToValueAtTime(990, ahora + 0.18);
    g.gain.setValueAtTime(0.0001, ahora);
    g.gain.exponentialRampToValueAtTime(0.05, ahora + 0.03);
    g.gain.exponentialRampToValueAtTime(0.0001, ahora + 0.35);
    o.connect(g).connect(audio.destination);
    o.start(ahora);
    o.stop(ahora + 0.4);
  } catch { /* sin audio: no pasa nada */ }
}

