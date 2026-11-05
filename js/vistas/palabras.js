// vistas/palabras.js — Palabras guía y check-in (Módulo 10).
// La tarjeta "Tu día" (cómo llegas + palabra de hoy), la hoja de una palabra (florece al tocarla),
// el día liviano (solo lo esencial o descanso) y Ajustes > palabras.
// Nada se diagnostica ni sale del dispositivo. Todo es saltable.

import { el, icono, menosMovimiento, vibrar } from '../dom.js';
import { t } from '../textos.js';
import { ESTADOS_ANIMO, SALTADO } from '../esquema.js';
import { abrirHoja, anunciar } from '../ui.js';
import { MAX_IDENTIDAD, PALABRA, PALABRAS, sorpresa, sugerencias, vecina } from '../palabras.js';
import { diasAbrumado, esencialesDeHoy } from '../frases.js';
import { cumplido, estadoDelDia, tocaEnFecha } from '../calculos.js';
import { bloqueFrase, contextoDeHoy, reconsiderarPorAnimo } from './frases.js';
import { observacionSemana } from '../palabras.js';
import { porcentaje } from '../formato.js';

const SVG = 'http://www.w3.org/2000/svg';

/** Pétalos SVG que se abren alrededor de una palabra (decorativos). */
export function petalos() {
  const svg = document.createElementNS(SVG, 'svg');
  svg.setAttribute('viewBox', '0 0 120 120');
  svg.setAttribute('class', 'petalos');
  svg.setAttribute('aria-hidden', 'true');
  for (let i = 0; i < 6; i++) {
    // El giro va en el grupo: la animación CSS del pétalo no lo pisa.
    const g = document.createElementNS(SVG, 'g');
    g.setAttribute('transform', `rotate(${i * 60} 60 60)`);
    const p = document.createElementNS(SVG, 'path');
    p.setAttribute('d', 'M60 52c-6-6-6-16 0-26 6 10 6 20 0 26z');
    p.setAttribute('class', 'petalos__petalo');
    p.style.setProperty('--i', String(i));
    g.append(p);
    svg.append(g);
  }
  return svg;
}

/** Hace florecer un chip (si no se pidió menos movimiento). */
function florecer(nodo) {
  if (menosMovimiento()) return;
  nodo.querySelector('.petalos')?.remove();
  const p = petalos();
  nodo.append(p);
  nodo.dataset.florece = '';
  setTimeout(() => { p.remove(); delete nodo.dataset.florece; }, 900);
}

const palabraDe = (ctx, fecha) => {
  const id = ctx.modelo.palabras.porDia[fecha];
  return id && id !== SALTADO ? PALABRA.get(id) : null;
};
const animoDe = (ctx, fecha) => ctx.modelo.palabras.checkin[fecha] ?? null;

/* ---------- Encabezado de Hoy: la palabra elegida ---------- */

export function chipPalabraHoy(ctx) {
  const p = palabraDe(ctx, ctx.modelo.hoy());
  if (!p) return null;
  return el('button', {
    class: `chip-palabra color-${p.color}`, type: 'button', data: { foco: 'palabra-hoy' },
    aria: { label: t('guia.palabra.elegida', { palabra: p.nombre }) },
    onclick: () => abrirPalabra(ctx, p.id),
  }, el('span', { class: 'chip-palabra__punto', aria: { hidden: 'true' } }), p.nombre);
}

/* ---------- Tarjeta "Tu día" ---------- */

/** Mantener presionado (450 ms) abre "ver más"; un toque normal elige. */
function conPresion(boton, { toque, largo }) {
  let reloj = null, largoHecho = false;
  boton.addEventListener('pointerdown', () => { largoHecho = false; reloj = setTimeout(() => { largoHecho = true; vibrar(8); largo(); }, 450); });
  const cancelar = () => clearTimeout(reloj);
  boton.addEventListener('pointerup', cancelar);
  boton.addEventListener('pointerleave', cancelar);
  boton.addEventListener('pointercancel', cancelar);
  boton.addEventListener('contextmenu', (e) => e.preventDefault());
  boton.addEventListener('click', (e) => { if (largoHecho) { e.preventDefault(); return; } toque(); });
  return boton;
}

export function tarjetaGuia(ctx) {
  const { modelo } = ctx;
  const c = modelo.config;
  const hoy = modelo.hoy();
  const animo = animoDe(ctx, hoy);
  const palabra = modelo.palabras.porDia[hoy];
  const preguntarAnimo = c.checkinActivo && !animo;
  const preguntarPalabra = c.palabraDelDia && !palabra;
  const dificil = animo === 'cansado' || animo === 'abrumado';
  const ofrecerLiviano = c.checkinActivo && dificil && modelo.palabras.minimo !== hoy && ctx.livianoResuelto !== hoy;
  if (!preguntarAnimo && !preguntarPalabra && !ofrecerLiviano) return null;

  const filas = [];
  if (preguntarAnimo) {
    filas.push(el('div', { class: 'guia__fila' },
      el('p', { class: 'guia__pregunta', id: 'guia-animo' }, t('guia.animo')),
      el('div', { class: 'guia__chips guia__chips--fila', role: 'group', aria: { labelledby: 'guia-animo' } },
        ESTADOS_ANIMO.map((a) => el('button', {
          class: 'chip-animo', type: 'button', data: { foco: `animo-${a}`, animo: a },
          onclick: () => {
            modelo.fijarCheckin(hoy, a);
            if (a === 'cansado' || a === 'abrumado') reconsiderarPorAnimo(ctx);
          },
        }, t(`animo.${a}`))))));
  } else if (ofrecerLiviano) {
    filas.push(filaLiviano(ctx, hoy, animo));
  }
  if (preguntarPalabra) {
    const { contexto } = contextoDeHoy(ctx);
    const sug = sugerencias(dificil ? 'dia_dificil' : contexto);
    filas.push(el('div', { class: 'guia__fila' },
      el('p', { class: 'guia__pregunta', id: 'guia-palabra' }, t('guia.palabra')),
      el('div', { class: 'guia__chips', role: 'group', aria: { labelledby: 'guia-palabra' } },
        sug.map((p) => conPresion(el('button', {
          class: `chip-guia color-${p.color}`, type: 'button', data: { foco: `palabra-${p.id}` },
          aria: { label: t('guia.palabra.aria', { palabra: p.nombre }), describedby: 'guia-palabra-ayuda' },
        }, el('span', { class: 'chip-guia__texto' }, p.nombre)), {
          toque: () => elegir(ctx, hoy, p),
          largo: () => abrirPalabra(ctx, p.id),
        })),
        el('button', { class: 'chip-guia chip-guia--mas', type: 'button', data: { foco: 'palabra-mas' }, onclick: () => abrirPalabra(ctx, sug[0].id) }, t('guia.palabra.mas'))),
      el('p', { class: 'solo-lector', id: 'guia-palabra-ayuda' }, t('palabra.deslizar'))));
  }
  const saltar = el('button', {
    class: 'tv-boton tv-boton--sutil tv-boton--chico guia__saltar', type: 'button', data: { foco: 'guia-saltar' },
    onclick: () => {
      if (preguntarAnimo) modelo.fijarCheckin(hoy, SALTADO);
      if (preguntarPalabra) modelo.fijarPalabra(hoy, SALTADO);
      if (ofrecerLiviano) { ctx.livianoResuelto = hoy; ctx.render(); }
    },
  }, t('guia.saltar'));
  // Un día difícil: la oferta de un día liviano se muestra abierta (es apoyo, no una pregunta más).
  if (ofrecerLiviano && !preguntarPalabra) return el('section', { class: 'guia', data: { tarjeta: 'guia' }, aria: { label: t('guia.titulo') } }, ...filas, saltar);
  // Minimalista: una sola línea que se abre al tocarla. Los hábitos quedan a la vista.
  const resumen = preguntarAnimo && preguntarPalabra ? t('guia.resumen.ambos') : preguntarAnimo ? t('guia.animo') : t('guia.palabra');
  const tarjeta = el('details', { class: 'guia guia--compacta', data: { tarjeta: 'guia' }, open: ctx.guiaAbierta === hoy },
    el('summary', { class: 'guia__resumen', data: { foco: 'guia-abrir' } },
      icono('chispa', 'tv-icono--sm'), el('span', { class: 'guia__resumen-texto' }, resumen), el('span', { class: 'guia__flecha', aria: { hidden: 'true' } }, '›')),
    el('div', { class: 'guia__cuerpo' }, ...filas, saltar));
  tarjeta.addEventListener('toggle', () => { ctx.guiaAbierta = tarjeta.open ? hoy : null; });
  return tarjeta;
}

function elegir(ctx, hoy, p) {
  vibrar(10);
  const chip = document.querySelector(`[data-foco="palabra-${p.id}"]`);
  if (chip && !menosMovimiento()) {
    florecer(chip);
    setTimeout(() => ctx.modelo.fijarPalabra(hoy, p.id), 520);
  } else {
    ctx.modelo.fijarPalabra(hoy, p.id);
  }
  anunciar(t('guia.palabra.elegida', { palabra: p.nombre }));
}

/** Esenciales de hoy: los marcados; si no hay, los 3 más constantes (por su puntaje). */
export function minimoDeHoy(ctx) {
  const hoy = ctx.modelo.hoy();
  const vivos = ctx.visibles().filter((h) => !h.archivado && tocaEnFecha(h, hoy));
  const marcados = esencialesDeHoy(vivos, hoy);
  if (marcados.length) return { habitos: marcados, propios: true };
  const top = [...vivos].sort((a, b) => ctx.stats(b).puntaje - ctx.stats(a).puntaje).slice(0, 3);
  return { habitos: top, propios: false };
}

function filaLiviano(ctx, hoy, animo) {
  const { modelo } = ctx;
  const abrumado = diasAbrumado(modelo.palabras.checkin, hoy);
  return el('div', { class: 'guia__fila guia__fila--liviano' },
    el('p', { class: 'guia__pregunta' }, t('guia.liviano')),
    el('p', { class: 'texto-ayuda' }, t('guia.liviano.texto')),
    el('div', { class: 'fila-botones' },
      el('button', { class: 'tv-boton tv-boton--secundario tv-boton--chico', type: 'button', data: { foco: 'liviano-minimo' }, onclick: () => modelo.fijarMinimo(hoy) }, t('guia.liviano.minimo')),
      el('button', { class: 'tv-boton tv-boton--secundario tv-boton--chico', type: 'button', data: { foco: 'liviano-descanso' }, onclick: () => descansarHoy(ctx, hoy) }, icono('descanso', 'tv-icono--sm'), t('guia.liviano.descanso')),
      el('button', { class: 'tv-boton tv-boton--sutil tv-boton--chico', type: 'button', data: { foco: 'liviano-normal' }, onclick: () => { ctx.livianoResuelto = hoy; ctx.render(); } }, t('guia.liviano.normal'))),
    animo === 'abrumado' && abrumado >= 3 ? el('p', { class: 'guia__persona' }, t('guia.liviano.persona')) : null);
}

/** Marca descanso en todo lo pendiente de hoy, con un solo Deshacer. */
function descansarHoy(ctx, hoy) {
  const { modelo } = ctx;
  const cambios = [];
  for (const h of ctx.visibles()) {
    if (h.archivado || !tocaEnFecha(h, hoy)) continue;
    const e = estadoDelDia(h, modelo.logDe(h.id, hoy));
    if (cumplido(e) || e === 'descanso' || e === 'congelado') continue;
    const r = modelo.fijarEstado(h.id, hoy, 'descanso');
    if (r) cambios.push([h.id, r.antes]);
  }
  ctx.livianoResuelto = hoy;
  ctx.deshacer(t('guia.liviano.descansoHecho'), () => { for (const [id, antes] of cambios) modelo.restaurarLog(id, hoy, antes); });
  ctx.render();
}

/** Aviso arriba de la lista cuando el día es "solo lo esencial". */
export function bannerMinimo(ctx, info) {
  return el('div', { class: 'banner-minimo', role: 'status' },
    el('div', {},
      el('p', { class: 'banner-minimo__titulo' }, t('guia.minimo.banner')),
      info.propios ? null : el('p', { class: 'texto-ayuda' }, `${t('guia.minimo.constantes', { n: info.habitos.length })}. ${t('guia.minimo.ayuda')}`)),
    el('button', { class: 'tv-boton tv-boton--sutil tv-boton--chico', type: 'button', data: { foco: 'minimo-todo' }, onclick: () => ctx.modelo.fijarMinimo(null) }, t('guia.minimo.todo')));
}

/* ---------- Hoja de una palabra ---------- */

export function abrirPalabra(ctx, idInicial) {
  let id = idInicial;
  const hoy = ctx.modelo.hoy();
  abrirHoja({
    titulo: t('palabra.titulo'),
    etiqueta: 'palabra',
    clase: 'tv-hoja--palabra',
    contenido: (cerrar) => {
      const caja = el('div', { class: 'palabra', tabindex: '-1' });
      const dibujar = (dir = 0) => {
        const p = PALABRA.get(id);
        const f = ctx.frases?.porId.get(p.frase);
        const esHoy = ctx.modelo.palabras.porDia[hoy] === p.id;
        const flor = el('div', { class: `palabra__flor color-${p.color}`, data: { dir: dir > 0 ? 'sig' : dir < 0 ? 'ant' : null } },
          el('p', { class: 'palabra__nombre', aria: { live: 'polite' } }, p.nombre));
        caja.replaceChildren(
          el('div', { class: 'palabra__nav' },
            el('button', { class: 'tv-boton--icono', type: 'button', aria: { label: t('palabra.anterior') }, onclick: () => mover(-1) }, icono('izquierda')),
            flor,
            el('button', { class: 'tv-boton--icono', type: 'button', aria: { label: t('palabra.siguiente') }, onclick: () => mover(1) }, icono('derecha'))),
          el('p', { class: 'palabra__significado' }, p.significado),
          f ? bloqueFrase(f, { clase: 'frase--centro' }) : null,
          el('div', { class: 'palabra__acciones' },
            el('button', { class: 'tv-boton tv-boton--secundario', type: 'button', onclick: () => { id = sorpresa(id, `${hoy}|${Date.now()}`).id; dibujar(1); } }, icono('chispa', 'tv-icono--sm'), t('palabra.sorpresa')),
            esHoy
              ? el('button', { class: 'tv-boton tv-boton--sutil', type: 'button', onclick: () => { ctx.modelo.fijarPalabra(hoy, null); dibujar(); } }, t('palabra.quitar'))
              : el('button', { class: 'tv-boton tv-boton--principal', type: 'button', data: { autofoco: '' }, onclick: () => { ctx.modelo.fijarPalabra(hoy, p.id); anunciar(t('guia.palabra.elegida', { palabra: p.nombre })); cerrar(); } }, t('palabra.elegir'))),
          esHoy ? el('p', { class: 'texto-ayuda palabra__hoy' }, t('palabra.esHoy')) : null,
          el('p', { class: 'texto-ayuda' }, t('palabra.deslizar')));
        florecer(flor);
      };
      const mover = (paso) => { id = vecina(id, paso).id; dibujar(paso); };
      // Deslizar con el dedo: más de 50 px en horizontal cambia de palabra.
      let x0 = null;
      caja.addEventListener('pointerdown', (e) => { if (e.pointerType !== 'mouse') x0 = e.clientX; });
      caja.addEventListener('pointerup', (e) => {
        if (x0 === null) return;
        const dx = e.clientX - x0;
        x0 = null;
        if (Math.abs(dx) > 50) mover(dx < 0 ? 1 : -1);
      });
      caja.addEventListener('keydown', (e) => {
        if (e.target.closest('button')) return;
        if (e.key === 'ArrowRight') mover(1);
        if (e.key === 'ArrowLeft') mover(-1);
      });
      dibujar();
      return caja;
    },
  });
}

/* ---------- Ajustes ---------- */

export function seccionPalabras(ctx) {
  const { modelo } = ctx;
  const c = modelo.config;
  const interruptor = (id, clave, texto, ayuda) => {
    const input = el('input', { type: 'checkbox', role: 'switch', id, checked: c[clave], data: { foco: id } });
    input.addEventListener('change', () => modelo.setConfig({ [clave]: input.checked }));
    return [el('label', { class: 'interruptor', for: id }, el('span', {}, texto), input), el('p', { class: 'texto-ayuda' }, ayuda)];
  };
  const elegidas = modelo.palabras.identidad;
  const aviso = el('p', { class: 'texto-ayuda texto-ayuda--miel', hidden: true, aria: { live: 'polite' } }, t('ajustes.palabras.identidad.max'));
  const grupo = el('fieldset', { class: 'chips-opcion' },
    el('legend', { class: 'campo__etiqueta' }, t('ajustes.palabras.identidad')),
    PALABRAS.map((p) => el('label', { class: `chip-opcion color-${p.color}` },
      el('input', { type: 'checkbox', value: p.id, checked: elegidas.includes(p.id), data: { foco: `identidad-${p.id}` } }),
      el('span', {}, p.nombre))));
  grupo.addEventListener('change', (e) => {
    const marcadas = [...grupo.querySelectorAll('input:checked')].map((x) => x.value);
    if (marcadas.length > MAX_IDENTIDAD) { e.target.checked = false; aviso.hidden = false; return; }
    aviso.hidden = true;
    modelo.fijarPalabrasIdentidad(marcadas);
  });
  return el('div', { class: 'tarjeta' },
    ...interruptor('palabra-dia', 'palabraDelDia', t('ajustes.palabras.dia'), t('ajustes.palabras.dia.ayuda')),
    ...interruptor('checkin', 'checkinActivo', t('ajustes.palabras.checkin'), t('ajustes.palabras.checkin.ayuda')),
    el('div', { class: 'separador' }),
    grupo,
    el('p', { class: 'texto-ayuda' }, t('ajustes.palabras.identidad.ayuda')),
    aviso);
}

/** Palabras de identidad junto a "Soy una persona que…" al completar un hábito. */
export function palabrasIdentidad(ctx) {
  const ids = ctx.modelo.palabras.identidad;
  if (!ids.length) return null;
  return el('span', { class: 'identidad-palabras' }, ids.map((id) => PALABRA.get(id)).filter(Boolean).map((p) => el('span', { class: `identidad-palabras__p color-${p.color}` }, p.nombre)));
}

/* ---------- Revisión semanal ---------- */

export function bloquePalabrasSemana(ctx, lunes) {
  const { modelo } = ctx;
  if (!modelo.config.palabraDelDia && !Object.keys(modelo.palabras.porDia).length) return null;
  const o = observacionSemana({ porDia: modelo.palabras.porDia, lunes, hoy: modelo.hoy(), habitos: ctx.visibles(), logDe: modelo.logDe });
  return el('section', { class: 'semana-palabras' },
    el('h3', { class: 'campo__etiqueta' }, t('semana.palabras')),
    o.usadas.length
      ? el('ul', { class: 'semana-palabras__lista' }, o.usadas.map(({ palabra: p, dias }) => el('li', { class: `chip-palabra chip-palabra--estatico color-${p.color}` },
        el('span', { class: 'chip-palabra__punto', aria: { hidden: 'true' } }), `${p.nombre} · ${dias} ${t('semana.palabras.dias', { n: dias })}`)))
      : el('p', { class: 'texto-ayuda' }, t('semana.palabras.vacio')),
    o.destacada ? el('p', { class: 'semana-palabras__obs' }, t('semana.palabras.obs', { palabra: o.destacada.palabra.nombre, pct: porcentaje(o.destacada.pct), resto: porcentaje(o.destacada.pctResto) })) : null);
}
