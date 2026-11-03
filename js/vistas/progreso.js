// vistas/progreso.js — Progreso: mapa de calor de 30 días, % del mes, mejor racha,
// puntaje y racha por hábito, y las notas que escribiste.

import { el, icono, iconoHabito } from '../dom.js';
import { t } from '../textos.js';
import { diffDias, fechaLarga, inicioSemana, sumarDias } from '../fechas.js';
import { diaDeHabito, diaGlobal, nivelCalor, porcentajePeriodo } from '../estadisticas.js';
import { fechaCorta, porcentaje, textoRacha } from '../formato.js';
import { calcularInsights } from '../insights.js';
import { abrirRevision } from './semana.js';
import { abrirAnual } from './anual.js';
import { renderJardin } from './jardin.js';

const DIAS = 30;

export function renderProgreso(raiz, ctx) {
  const { modelo } = ctx;
  const hoy = modelo.hoy();
  const habitos = ctx.visibles();
  const vivos = habitos.filter((h) => !h.archivado).sort((a, b) => a.orden - b.orden);

  raiz.append(el('header', { class: 'cabecera' }, el('h1', { class: 'titulo-pantalla' }, t('progreso.titulo'))));
  raiz.append(ctx.contenedorAvisos);

  if (habitos.length === 0) {
    raiz.append(el('div', { class: 'vacio' },
      el('p', { class: 'vacio__titulo' }, t('progreso.vacio.titulo')),
      el('p', { class: 'vacio__texto' }, t('progreso.vacio.texto')),
    ));
    return;
  }

  const inicio = habitos.reduce((m, h) => (h.creado < m ? h.creado : m), hoy);
  const desde = sumarDias(hoy, -(DIAS - 1));
  const pct30 = porcentajePeriodo(habitos, desde < inicio ? inicio : desde, hoy, hoy, modelo.logDe);
  const primeroMes = `${hoy.slice(0, 8)}01`;
  const pctMes = porcentajePeriodo(habitos, primeroMes < inicio ? inicio : primeroMes, hoy, hoy, modelo.logDe);

  // Mejor racha entre todos los hábitos (también los archivados).
  let mejor = null;
  for (const h of habitos) {
    const st = ctx.stats(h);
    if (st.mejor > 0 && (!mejor || st.mejor > mejor.n)) mejor = { n: st.mejor, unidad: st.unidad, nombre: h.nombre };
  }

  // Mapa de calor o Jardín: la misma información, dos formas de mirarla.
  ctx.vistaProgreso ??= 'calor';
  const selector = el('fieldset', { class: 'segmentos vista-progreso' },
    el('legend', { class: 'solo-lector' }, t('progreso.vista')),
    ['calor', 'jardin'].map((v) => el('label', { class: 'segmento' },
      el('input', { type: 'radio', name: 'vista-progreso', value: v, checked: ctx.vistaProgreso === v, data: { foco: `vista-${v}` } }),
      el('span', {}, t(`progreso.vista.${v}`)))));
  selector.addEventListener('change', (e) => { ctx.vistaProgreso = e.target.value; ctx.render(); });
  const principal = el('div', { class: 'vista-progreso__cuerpo' });
  if (ctx.vistaProgreso === 'jardin') renderJardin(principal, ctx, habitos);
  else {
    principal.append(el('div', { class: 'tarjeta' },
      el('div', { class: 'cabecera__fila' },
        el('h2', { class: 'titulo-tarjeta', id: 'titulo-30' }, t('progreso.30dias')),
        el('span', { class: 'cifra__valor' }, pct30 === null ? '—' : porcentaje(pct30)),
      ),
      mapaGlobal(ctx, habitos, hoy, inicio),
      leyenda(),
    ));
  }

  raiz.append(el('section', { class: 'seccion', aria: { label: t(`progreso.vista.${ctx.vistaProgreso}`) } },
    selector,
    principal,
    el('div', { class: 'cifras' },
      el('div', { class: 'cifra tarjeta' },
        el('span', { class: 'cifra__valor' }, pctMes === null ? '—' : porcentaje(pctMes)),
        el('span', { class: 'cifra__etiqueta' }, t('progreso.mes'))),
      el('div', { class: 'cifra tarjeta' },
        el('span', { class: 'cifra__valor' }, mejor ? textoRacha(mejor.n, mejor.unidad) : '—'),
        el('span', { class: 'cifra__etiqueta' }, mejor ? `${t('progreso.mejorRacha')} · ${mejor.nombre}` : t('progreso.mejorRacha'))),
    ),
  ));

  if (vivos.length) {
    raiz.append(el('section', { class: 'seccion', aria: { labelledby: 'titulo-habitos' } },
      el('h2', { class: 'seccion__titulo', id: 'titulo-habitos' }, t('progreso.habitos')),
      el('p', { class: 'texto-ayuda' }, t('progreso.puntaje.ayuda')),
      el('ul', { class: 'tv-lista' }, vivos.map((h) => tarjetaHabito(ctx, h, hoy))),
    ));
  }

  raiz.append(seccionInsights(ctx, habitos, hoy));
  raiz.append(seccionAnual(ctx, hoy));
  raiz.append(seccionSemanas(ctx, hoy));

  const visibles = new Set(habitos.map((h) => h.id));
  const notas = modelo.notas(60).filter((n) => visibles.has(n.habito.id)).slice(0, 30);
  raiz.append(el('section', { class: 'seccion', aria: { labelledby: 'titulo-notas' } },
    el('h2', { class: 'seccion__titulo', id: 'titulo-notas' }, t('progreso.notas')),
    notas.length === 0
      ? el('p', { class: 'texto-ayuda' }, t('progreso.notas.vacio'))
      : el('ul', { class: 'tv-lista' }, notas.map((n) => el('li', {},
        el('button', {
          class: 'nota-item', type: 'button', data: { foco: `nota-${n.habito.id}-${n.fecha}` },
          onclick: () => ctx.abrirDetalle(n.habito.id, n.fecha),
        },
          el('span', { class: 'nota-item__cabecera' },
            el('span', { class: 'nota-item__icono', aria: { hidden: 'true' } }, iconoHabito(n.habito.icono, 'tv-icono--xs')),
            el('span', { class: 'nota-item__habito' }, n.habito.nombre),
            el('span', { class: 'nota-item__fecha' }, fechaCorta(n.fecha))),
          el('span', { class: 'nota-item__texto' }, n.nota))))),
  ));
}

/** Mapa de calor global: semanas de lunes a domingo, del día −29 a hoy. */
function mapaGlobal(ctx, habitos, hoy, inicio) {
  const desde = sumarDias(hoy, -(DIAS - 1));
  const lunes = inicioSemana(desde);
  const fin = sumarDias(inicioSemana(hoy), 6);
  const grid = el('div', { class: 'mapa', role: 'group', aria: { label: t('progreso.30dias') } });
  for (const d of t('dias.corto')) grid.append(el('span', { class: 'mapa__dia', aria: { hidden: 'true' } }, d));

  const celdas = [];
  for (let d = lunes; d <= fin; d = sumarDias(d, 1)) {
    if (d < desde) { grid.append(el('span', { class: 'celda', data: { nivel: 'fuera' }, aria: { hidden: 'true' } })); continue; }
    if (d > hoy) { grid.append(el('span', { class: 'celda', data: { nivel: 'futuro' }, aria: { hidden: 'true' } })); continue; }
    const p = diaGlobal(habitos, d, ctx.modelo.logDe);
    const nivel = d < inicio ? 'antes' : nivelCalor(p);
    const larga = fechaLarga(d);
    const etiqueta = p.total ? t('progreso.celda', { fecha: larga, hechos: p.hechos, total: p.total }) : t('progreso.celdaVacia', { fecha: larga });
    const celda = el('button', {
      class: 'celda', type: 'button', tabindex: '-1',
      data: { nivel: nivel === null ? 'vacio' : String(nivel), hoy: d === hoy ? '' : null, fecha: d, foco: `celda-${d}` },
      aria: { label: `${etiqueta}. ${t('progreso.verDia', { fecha: larga })}` },
      title: etiqueta,
      disabled: d < inicio,
      onclick: () => ctx.verFecha(d === hoy ? null : d),
    });
    celdas.push(celda);
    grid.append(celda);
  }

  // Teclado: una sola parada de tabulación; flechas para moverse entre días.
  const activas = celdas.filter((c) => !c.disabled);
  if (activas.length) activas[activas.length - 1].tabIndex = 0;
  grid.addEventListener('keydown', (e) => {
    const mov = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7, Home: -99, End: 99 }[e.key];
    if (mov === undefined) return;
    const i = activas.indexOf(document.activeElement);
    if (i < 0) return;
    e.preventDefault();
    const j = Math.min(Math.max(i + mov, 0), activas.length - 1);
    activas[i].tabIndex = -1;
    activas[j].tabIndex = 0;
    activas[j].focus();
  });
  return grid;
}

function leyenda() {
  return el('div', { class: 'leyenda', aria: { hidden: 'true' } },
    t('progreso.menos'),
    ['0', '1', '2', '3', '4'].map((n) => el('span', { class: 'celda', data: { nivel: n } })),
    t('progreso.mas'));
}

/** Tarjeta de un hábito: puntaje, racha, congeladores y sus últimos 30 días. */
function tarjetaHabito(ctx, h, hoy) {
  const st = ctx.stats(h);
  const barra = el('div', { class: 'barra-puntaje__relleno' });
  barra.style.setProperty('width', `${Math.round(st.puntaje * 100)}%`);
  const tira = el('div', { class: 'tira', aria: { hidden: 'true' } });
  for (let i = DIAS - 1; i >= 0; i--) {
    const d = sumarDias(hoy, -i);
    tira.append(el('span', { class: 'tira__dia', data: { estado: diaDeHabito(h, d, hoy, ctx.modelo.logDe) } }));
  }
  const c = st.congeladores;
  const dias = Math.max(0, diffDias(h.creado, hoy) + 1);
  return el('li', {},
    el('button', {
      class: `tarjeta-habito color-${h.color}`, type: 'button', data: { foco: `prog-${h.id}` },
      aria: { label: `${h.nombre}: ${t('stats.puntaje')} ${porcentaje(st.puntaje)}, ${t('stats.racha')} ${textoRacha(st.actual, st.unidad)}, ${t('stats.mejor')} ${textoRacha(st.mejor, st.unidad)}` },
      onclick: () => ctx.abrirAnalisis(h.id),
    },
      el('span', { class: 'tarjeta-habito__cabecera' },
        el('span', { class: `tv-habito__icono color-${h.color}`, aria: { hidden: 'true' } }, iconoHabito(h.icono)),
        el('span', { class: 'tarjeta-habito__nombre' }, h.nombre),
        el('span', { class: 'cifra__valor cifra__valor--chica' }, porcentaje(st.puntaje)),
      ),
      el('span', { class: 'barra-puntaje' }, barra),
      el('span', { class: 'tarjeta-habito__meta' },
        `${t('stats.racha')} ${textoRacha(st.actual, st.unidad)} · ${t('stats.mejor')} ${textoRacha(st.mejor, st.unidad)}`,
        el('span', { class: 'congeladores__mini', title: t('stats.congeladores', { n: c.disponibles, max: c.maximo }) },
          icono('congelado', 'tv-icono--xs'), `${c.disponibles}/${c.maximo}`),
      ),
      dias > 0 ? tira : null,
    ),
  );
}

/** Lo que dicen tus datos: mejor día, hábito ancla y hora fuerte. */
function seccionInsights(ctx, habitos, hoy) {
  const i = calcularInsights(habitos, hoy, ctx.modelo.logDe);
  const dias = t('dias.largo');
  const items = [];
  if (i?.mejorDia) items.push(t('insights.dia', { dia: dias[i.mejorDia.dia], pct: porcentaje(i.mejorDia.pct), promedio: porcentaje(i.mejorDia.promedio), peor: dias[i.mejorDia.peorDia] }));
  if (i?.ancla) items.push(t('insights.ancla', { nombre: i.ancla.habito.nombre, con: porcentaje(i.ancla.con), sin: porcentaje(i.ancla.sin) }));
  if (i?.hora) items.push(t('insights.hora', { franja: t(`insights.franja.${i.hora.franja}`), pct: porcentaje(i.hora.pct), hora: String(i.hora.pico).padStart(2, '0') }));
  return el('section', { class: 'seccion', aria: { labelledby: 'titulo-insights' } },
    el('h2', { class: 'seccion__titulo', id: 'titulo-insights' }, t('insights.titulo')),
    items.length
      ? el('div', { class: 'tarjeta' }, el('ul', { class: 'insights' }, items.map((x) => el('li', {}, x))), el('p', { class: 'texto-ayuda' }, t('insights.nota')))
      : el('p', { class: 'texto-ayuda' }, t('insights.pocos')));
}

/** Tu año en Tavia (M8): la tarjeta anual para guardar o compartir. */
function seccionAnual(ctx, hoy) {
  const anio = Number(hoy.slice(0, 4));
  const listo = ctx.diasRegistrados() >= 7;
  // En diciembre (y los primeros días de enero, para el año que terminó) se destaca.
  const mes = Number(hoy.slice(5, 7));
  const dia = Number(hoy.slice(8, 10));
  const anterior = mes === 1 && dia <= 15;
  const destacado = listo && (mes === 12 || anterior);
  const anioVer = anterior && ctx.modelo.habitos().some((h) => h.creado < `${anio}-01-01`) ? anio - 1 : anio;
  return el('section', { class: 'seccion', aria: { labelledby: 'titulo-anual' } },
    el('h2', { class: 'seccion__titulo', id: 'titulo-anual' }, t('anual.seccion')),
    listo
      ? el('div', { class: `tarjeta anual-entrada${destacado ? ' anual-entrada--destacada' : ''}` },
        el('p', { class: 'texto-ayuda' }, t(destacado ? 'anual.listo' : 'anual.descripcion', { anio: anioVer })),
        el('button', { class: 'tv-boton tv-boton--secundario', type: 'button', data: { foco: 'anual' }, onclick: () => abrirAnual(ctx, anioVer) },
          icono('calendario', 'tv-icono--sm'), t('anual.ver', { anio: anioVer })))
      : el('p', { class: 'texto-ayuda' }, t('anual.pocosDias')));
}

/** Revisión de la semana en curso y las anteriores. */
function seccionSemanas(ctx, hoy) {
  const lunes = inicioSemana(hoy);
  const previas = [...ctx.modelo.revisiones()].reverse().slice(0, 8);
  return el('section', { class: 'seccion', aria: { labelledby: 'titulo-semana' } },
    el('h2', { class: 'seccion__titulo', id: 'titulo-semana' }, t('semana.verRevision')),
    el('button', { class: 'tv-boton tv-boton--secundario', type: 'button', data: { foco: 'revision' }, onclick: () => abrirRevision(ctx, lunes) }, t('semana.abrir')),
    previas.length ? el('ul', { class: 'tv-lista' }, previas.map((r) => el('li', {},
      el('button', { class: 'nota-item', type: 'button', data: { foco: `rev-${r.semana}` }, onclick: () => abrirRevision(ctx, r.semana) },
        el('span', { class: 'nota-item__cabecera' }, el('span', { class: 'nota-item__habito' }, t('semana.rango', { desde: fechaCorta(r.semana), hasta: fechaCorta(sumarDias(r.semana, 6)) }))),
        r.ajuste ? el('span', { class: 'nota-item__texto' }, r.ajuste) : null,
        r.funciono ? el('span', { class: 'texto-ayuda' }, r.funciono) : null)))) : null,
  );
}
