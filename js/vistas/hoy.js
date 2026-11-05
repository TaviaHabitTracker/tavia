// vistas/hoy.js — La pantalla Hoy: hace una sola cosa, marcar lo de hoy.

import { el, icono, iconoHabito, menosMovimiento, simboloTavia } from '../dom.js';
import { dibujarColeccion } from '../coleccion.js';
import { abrirColeccion } from './coleccion.js';
import { t } from '../textos.js';
import { BLOQUES } from '../esquema.js';
import { fechaLarga, inicioSemana, sumarDias } from '../fechas.js';
import { cumplido, enPausa, estadoDelDia, progresoDelDia, tocaEnFecha, vistaDelDia } from '../calculos.js';
import { fraseIdentidad, nombreDelDia, num, resumenFrecuencia, resumenMeta, textoRacha } from '../formato.js';
import { congeladores, puedeCongelar, rachaAntesDe } from '../estadisticas.js';
import { recordatoriosVencidos } from '../recordatorios.js';
import { semanaParaRevisar } from '../insights.js';
import { constancia, porcentajeSemana, rachaGlobal, semanaGlobal } from '../analisis.js';
import { abrirRitual, pendientesDelBloque } from './ritual.js';
import { abrirRevision } from './semana.js';
import { pedirPin } from './seguridad.js';
import { tarjetaCierre, tarjetaFraseDelDia } from './frases.js';
import { bannerMinimo, chipPalabraHoy, minimoDeHoy, palabrasIdentidad, tarjetaGuia } from './palabras.js';

const ICONO_ESTADO = { saltado: 'saltado', descanso: 'descanso', congelado: 'congelado' };

export function renderHoy(raiz, ctx) {
  const { modelo } = ctx;
  const hoy = modelo.hoy();
  const fecha = ctx.fechaVista && ctx.fechaVista < hoy ? ctx.fechaVista : hoy;
  // Bóveda: con PIN, los hábitos privados no aparecen (ni en los conteos) hasta mostrarlos.
  const todos = ctx.visibles();
  const vivos = todos.filter((h) => !h.archivado);
  const hayPrivados = Boolean(modelo.config.pinHash) && modelo.habitos().some((h) => h.privado && !h.archivado);

  const todasLasVistas = todos.filter((h) => tocaEnFecha(h, fecha)).map((h) => vistaDelDia(h, fecha, modelo.logDe));
  const prog = progresoDelDia(todasLasVistas);
  // Día liviano: "solo lo esencial" muestra solo esos hábitos (el progreso del día sigue siendo el real).
  const minimo = fecha === hoy && modelo.palabras.minimo === hoy ? minimoDeHoy(ctx) : null;
  const ids = minimo ? new Set(minimo.habitos.map((h) => h.id)) : null;
  const vistas = ids ? todasLasVistas.filter((v) => ids.has(v.habito.id)) : todasLasVistas;

  raiz.append(cabecera(ctx, fecha, hoy, vivos.length > 0, hayPrivados));
  if (vivos.length) raiz.append(panelDia(ctx, fecha, hoy, prog, vivos));
  raiz.append(ctx.contenedorAvisos);
  if (fecha === hoy && vivos.length) {
    const guia = tarjetaGuia(ctx);
    if (guia) raiz.append(guia);
  }
  // Minimalista: arriba solo lo que pide hacer algo ahora (avisos de recordatorios y rescates);
  // la lista de hábitos va enseguida y lo demás (frase, revisión, manifiesto) queda debajo.
  if (fecha === hoy) {
    for (const extra of [tarjetaRecordatorios(ctx), rescates(ctx, hoy)]) if (extra) raiz.append(extra);
    if (minimo) raiz.append(bannerMinimo(ctx, minimo));
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

  if (fecha === hoy) {
    const { manifiesto, manifiestoModo } = modelo.config;
    const ajuste = modelo.revisionDe(sumarDias(inicioSemana(hoy), -7))?.ajuste;
    if (ajuste) raiz.append(el('p', { class: 'ajuste-semana' }, icono('lapiz', 'tv-icono--sm'), t('semana.ajusteActual', { ajuste })));
    const semana = tarjetaSemana(ctx, hoy, vivos);
    if (semana) raiz.append(semana);
    // Frase del día: discreta y cerrable, después de los hábitos.
    const frase = tarjetaFraseDelDia(ctx);
    if (frase) raiz.append(frase);
    if (manifiesto && manifiestoModo === 'linea') raiz.append(el('blockquote', { class: 'manifiesto-linea', aria: { label: t('manifiesto.titulo') } }, manifiesto));
  }

  if (fecha === hoy) {
    const completo = prog.total > 0 && prog.hechos === prog.total;
    const cierre = tarjetaCierre(ctx, { completo });
    if (cierre) raiz.append(cierre);
    else if (completo) raiz.append(el('p', { class: 'listo' }, t('hoy.todoListo')));
    // El día florece también en el jardín: un enlace discreto a su flor.
    if (completo) {
      raiz.append(el('p', { class: 'listo listo--jardin' },
        el('button', { class: 'tv-boton tv-boton--sutil tv-boton--chico', type: 'button', data: { foco: 'ver-flor' }, onclick: () => ctx.verJardin() },
          icono('brote', 'tv-icono--sm'), t('hoy.verFlor'))));
    }
  }
}

function cabecera(ctx, fecha, hoy, hayHabitos, hayPrivados) {
  const { modelo } = ctx;
  const inicio = modelo.habitos().reduce((m, h) => (h.creado < m ? h.creado : m), hoy);
  const anterior = sumarDias(fecha, -1);

  return el('header', { class: 'cabecera' },
    el('div', { class: 'cabecera__fila' },
      el('div', { class: 'cabecera__titulos' },
        el('div', { class: 'cabecera__linea' },
          el('p', { class: 'subtitulo' }, fechaLarga(fecha)),
          fecha === hoy ? chipPalabraHoy(ctx) : null),
        el('h1', { class: 'titulo-pantalla' }, nombreDelDia(fecha, hoy)),
      ),
      el('div', { class: 'cabecera__acciones' },
        hayPrivados ? el('button', {
          class: 'tv-boton--icono tv-boton--marco', type: 'button', data: { foco: 'boveda' },
          aria: { label: t(ctx.verPrivados ? 'privado.ocultar' : 'privado.mostrar'), pressed: ctx.verPrivados ? 'true' : 'false' },
          onclick: async () => {
            if (ctx.verPrivados) { ctx.verPrivados = false; ctx.render(); return; }
            if (await pedirPin(ctx, t('privado.mostrar'))) { ctx.verPrivados = true; ctx.render(); }
          },
        }, icono(ctx.verPrivados ? 'abierto' : 'candado')) : null,
        el('button', {
          class: 'tv-boton--icono tv-boton--marco', type: 'button', data: { foco: 'crear' },
          aria: { label: t('hoy.crear') }, onclick: () => ctx.abrirEditor(),
        }, icono('agregar')),
      ),
    ),
    hayHabitos ? el('div', { class: 'navegar-dia' },
      fecha !== hoy ? el('button', { class: 'tv-boton tv-boton--sutil tv-boton--chico', type: 'button', data: { foco: 'volver' }, onclick: () => ctx.verFecha(null) }, t('hoy.volverHoy')) : null,
      el('button', {
        class: 'tv-boton--icono', type: 'button', data: { foco: 'dia-ant' }, aria: { label: t('hoy.diaAnterior') },
        disabled: anterior < inicio, onclick: () => ctx.verFecha(anterior),
      }, icono('izquierda')),
      el('button', {
        class: 'tv-boton--icono', type: 'button', data: { foco: 'dia-sig' }, aria: { label: t('hoy.diaSiguiente') },
        disabled: fecha >= hoy, onclick: () => ctx.verFecha(sumarDias(fecha, 1) >= hoy ? null : sumarDias(fecha, 1)),
      }, icono('derecha')),
    ) : null,
  );
}

/* ---------- Panel del día: el brote, cuatro cifras y la semana ---------- */

const SVG = 'http://www.w3.org/2000/svg';
function svgNodo(tag, attrs, padre) {
  const n = document.createElementNS(SVG, tag);
  for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v);
  if (padre) padre.append(n);
  return n;
}

/**
 * El brote del día: el anillo avanza con cada hábito; la primera hoja se enciende al empezar,
 * la segunda a mitad del día y la yema se abre en flor al completarlo todo.
 */
export function dibujarBrote(fraccion, { antes = fraccion, clase = 'brote' } = {}) {
  const svg = svgNodo('svg', { viewBox: '0 0 96 96', class: clase, 'aria-hidden': 'true' });
  svgNodo('circle', { cx: 48, cy: 48, r: 45, class: 'brote__pista' }, svg);
  svgNodo('circle', { cx: 48, cy: 48, r: 45, class: 'brote__doble' }, svg); // doble filete (tema Gaceta)
  const anillo = svgNodo('circle', { cx: 48, cy: 48, r: 45, class: 'brote__anillo', pathLength: 100, transform: 'rotate(-90 48 48)', 'stroke-dasharray': `${antes * 100} 100` }, svg);
  svgNodo('circle', { cx: 48, cy: 48, r: 45, class: 'brote__marcas' }, svg); // corta el anillo en 60 marcas (tema Calibre)
  svgNodo('path', { d: 'M48 80V42', class: 'brote__tallo' }, svg);
  const hojas = [
    ['M48 66C40 66 31 62 28 51c10 0 18 5 20 15z', fraccion > 0, antes > 0],
    ['M48 58c8 0 16-4 19-15-10 0-17 5-19 15z', fraccion >= 0.5, antes >= 0.5],
  ];
  for (const [d, on, estaba] of hojas) {
    svgNodo('path', { d, class: `brote__hoja${on ? ' brote__hoja--on' : ''}${on && !estaba ? ' brote__hoja--nueva' : ''}` }, svg);
  }
  const completo = fraccion >= 1;
  if (completo) {
    const flor = svgNodo('g', { class: `brote__flor${antes < 1 ? ' brote__flor--nueva' : ''}` }, svg);
    for (const r of [-38, 0, 38]) svgNodo('path', { d: 'M48 42c-5-5-5-13 0-21 5 8 5 16 0 21z', transform: `rotate(${r} 48 42)` }, flor);
  } else {
    svgNodo('path', { d: 'M48 42c-5-5-5-13 0-21 5 8 5 16 0 21z', class: 'brote__yema' }, svg);
  }
  // El anillo se desliza desde donde estaba (si no se pidió menos movimiento).
  if (antes !== fraccion) {
    if (menosMovimiento()) anillo.setAttribute('stroke-dasharray', `${fraccion * 100} 100`);
    else requestAnimationFrame(() => requestAnimationFrame(() => anillo.setAttribute('stroke-dasharray', `${fraccion * 100} 100`)));
  }
  return svg;
}

/**
 * El brote clásico o, con un tema de colección activo, el dibujo de su nivel (tocable: abre la colección).
 * Al marcar un hábito el anillo avanza suave y el dibujo late una vez; al completar el día, brilla.
 */
function broteDelDia(ctx, fraccion, antes) {
  const col = ctx.coleccion?.();
  if (!col) return dibujarBrote(fraccion, { antes });
  const svg = dibujarColeccion(col.id, col.nivel, { progreso: antes });
  const cambio = antes !== fraccion;
  const florece = fraccion >= 1 && antes < 1;
  const boton = el('button', {
    class: `panel-dia__coleccion${cambio ? (florece ? ' panel-dia__coleccion--florece' : ' panel-dia__coleccion--late') : ''}`,
    type: 'button', data: { foco: 'abrir-coleccion' },
    aria: { label: t('coleccion.verNivel', { tema: t(`coleccion.${col.id}`), nombre: t(`coleccion.${col.id}.${col.nivel}`), nivel: col.nivel }) },
    onclick: () => abrirColeccion(ctx),
  }, svg);
  if (cambio) {
    const anillo = svg.querySelector('.coleccion-arte__anillo');
    if (menosMovimiento()) anillo.setAttribute('stroke-dasharray', `${fraccion * 100} 100`);
    else requestAnimationFrame(() => requestAnimationFrame(() => anillo.setAttribute('stroke-dasharray', `${fraccion * 100} 100`)));
  }
  return boton;
}

function cifra(valor, etiqueta, { sufijo = null, extra = null, clase = '' } = {}) {
  return el('div', { class: `kpi ${clase}`.trim() },
    el('dt', { class: 'kpi__etiqueta' }, etiqueta, extra),
    el('dd', { class: 'kpi__valor' }, valor, sufijo ? el('small', {}, sufijo) : null));
}

function panelDia(ctx, fecha, hoy, prog, vivos) {
  const { modelo } = ctx;
  const fraccion = prog.total ? prog.hechos / prog.total : 0;
  // Para animar: el progreso que se mostró la última vez para esta fecha.
  ctx.progresoMostrado ??= new Map();
  const antes = ctx.animar ? (ctx.progresoMostrado.get(fecha) ?? fraccion) : fraccion;
  ctx.progresoMostrado.set(fecha, fraccion);

  const racha = rachaGlobal(vivos, hoy, modelo.logDe);
  const indice = constancia(vivos, hoy, modelo.logDe);
  const dias = semanaGlobal(vivos, hoy, modelo.logDe);
  const pctSemana = porcentajeSemana(dias, hoy);
  const letras = t('dias.corto');
  const nombres = t('dias.largo');

  const cambio = indice?.cambio;
  const semana = el('div', { class: 'semana-barras', role: 'group', aria: { label: t('hoy.semana') } },
    dias.map((d, i) => {
      const alto = d.pct === null ? 0 : Math.round(d.pct * 100);
      const barra = el('span', { class: 'semana-barras__barra', aria: { hidden: 'true' } });
      barra.style.setProperty('--h', `${alto}%`);
      const etiqueta = d.futuro ? nombres[i] : d.pct === null ? t('hoy.semana.libre', { dia: nombres[i] }) : t('hoy.semana.dia', { dia: nombres[i], hechos: d.hechos, total: d.total });
      return el('button', {
        class: 'semana-barras__dia', type: 'button', disabled: d.futuro,
        data: { hoy: d.fecha === hoy ? '' : null, vista: d.fecha === fecha ? '' : null, foco: `semana-${d.fecha}` },
        aria: { label: etiqueta, current: d.fecha === fecha ? 'date' : null },
        onclick: () => ctx.verFecha(d.fecha === hoy ? null : d.fecha),
      }, barra, el('span', { class: 'semana-barras__letra', aria: { hidden: 'true' } }, letras[i]));
    }));

  const completo = prog.total > 0 && prog.hechos === prog.total;
  return el('section', { class: `panel-dia${completo && antes < 1 ? ' panel-dia--florece' : ''}`, aria: { label: t('hoy.resumen') } },
    el('div', { class: 'panel-dia__fila' },
      el('div', {
        class: 'panel-dia__brote', role: 'progressbar',
        aria: { valuemin: 0, valuemax: prog.total, valuenow: prog.hechos, label: t('hoy.progreso', prog) },
      }, broteDelDia(ctx, fraccion, antes)),
      el('dl', { class: 'kpis' },
        cifra(String(prog.hechos), t(fecha === hoy ? 'hoy.kpi.hoy' : 'hoy.kpi.dia'), { sufijo: `/${prog.total}`, clase: 'tv-progreso__texto' }),
        cifra(num(racha), t('hoy.kpi.racha', { n: racha })),
        cifra(indice ? String(indice.valor) : '—', t('hoy.kpi.constancia'), {
          extra: cambio ? el('span', { class: `kpi__cambio${cambio < 0 ? ' kpi__cambio--baja' : ''}` }, ` ${cambio > 0 ? '+' : '−'}${Math.abs(cambio)}`) : null,
        }),
        cifra(pctSemana === null ? '—' : String(Math.round(pctSemana * 100)), t('hoy.kpi.semana'), { sufijo: pctSemana === null ? null : '%' }),
      ),
    ),
    semana,
  );
}

function lineaMeta(ctx, v, fecha, hoy) {
  const h = v.habito;
  if (cumplido(v.estado) && fecha === hoy && ctx.recienCompletados.has(h.id) && h.identidad) {
    return el('p', { class: 'tv-identidad' }, el('span', {}, fraseIdentidad(h)), palabrasIdentidad(ctx));
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
  let racha = null;
  if (fecha === hoy) {
    const st = ctx.stats(h);
    if (st.actual >= 2) racha = el('span', { class: 'tv-habito__racha' }, t('stats.rachaDe', { texto: textoRacha(st.actual, st.unidad) }));
  }
  const horas = ctx.modelo.recordatoriosDe(h.id);
  return el('p', { class: 'tv-habito__meta', data: { tono } },
    horas.length && fecha === hoy && !cumplido(v.estado) ? el('span', { class: 'tv-habito__hora' }, icono('campana', 'tv-icono--xs'), horas.join(', ')) : null,
    el('span', {}, partes.join(' · ')),
    racha,
    h.privado ? el('span', { class: 'tv-habito__privado' }, icono('candado', 'tv-icono--xs'), t('privado.marca')) : null);
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
      el('span', { class: 'tv-habito__icono', aria: { hidden: 'true' } }, iconoHabito(h.icono)),
      el('span', { class: 'tv-habito__texto' },
        el('span', { class: 'tv-habito__nombre' }, h.nombre),
        lineaMeta(ctx, v, fecha, hoy),
      ),
    ),
    botonCheck(ctx, v, fecha),
  );
}

function vacio(ctx) {
  const svg = simboloTavia();
  const ideas = t('ideas');
  return el('div', { class: 'vacio' },
    svg,
    el('h2', { class: 'vacio__titulo' }, t('hoy.vacio.titulo')),
    el('p', { class: 'vacio__texto' }, t('hoy.vacio.texto')),
    el('button', { class: 'tv-boton tv-boton--principal', type: 'button', data: { foco: 'crear-vacio' }, onclick: () => ctx.abrirEditor() }, icono('agregar'), t('hoy.crear')),
    el('p', { class: 'texto-ayuda' }, t('hoy.vacio.ideas')),
    el('div', { class: 'ideas' }, ideas.map((idea, i) => el('button', {
      class: 'idea', type: 'button', data: { foco: `idea-${i}` }, onclick: () => ctx.abrirEditor(null, idea),
    }, el('span', { aria: { hidden: 'true' } }, iconoHabito(idea.icono, 'tv-icono--sm')), idea.nombre))),
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
        el('span', { class: `tv-habito__icono color-${h.color}`, aria: { hidden: 'true' } }, iconoHabito(h.icono)),
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
      el('ul', { class: 'lista-simple' }, unicos.map((v) => el('li', {}, `${v.habito.nombre} · ${v.hora}`)))),
    el('button', {
      class: 'tv-boton--icono', type: 'button', aria: { label: t('detalle.cerrar') },
      onclick: () => { for (const v of vencidos) ctx.recordatoriosDescartados.add(v.clave); ctx.render(); },
    }, icono('cerrar', 'tv-icono--sm')),
  );
}
