// vistas/analisis.js — Análisis de un hábito: racha, índice de constancia, historial de rachas,
// día de la semana y una lectura breve. Gráficos en SVG propio, sin librerías.
// El gráfico se recorre con el dedo, el mouse o las flechas del teclado.

import { el, iconoHabito } from '../dom.js';
import { t } from '../textos.js';
import { fechaCorta, num, porcentaje } from '../formato.js';
import { abrirHoja } from '../ui.js';
import { analisisHabito } from '../analisis.js';

const SVG = 'http://www.w3.org/2000/svg';
function s(tag, attrs = {}, padre = null) {
  const n = document.createElementNS(SVG, tag);
  for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v);
  if (padre) padre.append(n);
  return n;
}

export function abrirAnalisis(ctx, id) {
  const { modelo } = ctx;
  const h = modelo.habito(id);
  if (!h) return;
  const hoy = modelo.hoy();
  const st = ctx.stats(h);
  const a = analisisHabito(h, hoy, modelo.logDe);
  const unidad = (n) => t(`analisis.unidad.${a.unidad}`, { n });

  abrirHoja({
    titulo: t('analisis.titulo', { nombre: h.nombre }),
    encabezado: el('span', { class: `tv-habito__icono color-${h.color}`, aria: { hidden: 'true' } }, iconoHabito(h.icono)),
    etiqueta: 'analisis',
    clase: 'tv-hoja--completa tv-hoja--analisis',
    contenido: () => el('div', { class: 'analisis' },
      el('dl', { class: 'analisis__grande' },
        el('div', { class: 'kpi kpi--xl' }, el('dt', { class: 'kpi__etiqueta' }, t('analisis.rachaActual')), el('dd', { class: 'kpi__valor' }, num(st.actual), el('small', {}, ` ${unidad(st.actual)}`))),
        el('div', { class: 'kpi kpi--xl' }, el('dt', { class: 'kpi__etiqueta' }, t('analisis.indice')), el('dd', { class: 'kpi__valor' }, String(Math.round(st.puntaje * 100)))),
      ),
      el('dl', { class: 'analisis__fila' },
        el('div', { class: 'kpi' }, el('dt', { class: 'kpi__etiqueta' }, t('analisis.mejor')), el('dd', { class: 'kpi__valor' }, num(st.mejor), el('small', {}, ` ${unidad(st.mejor)}`))),
        el('div', { class: 'kpi' }, el('dt', { class: 'kpi__etiqueta' }, t('analisis.vuelta')),
          el('dd', { class: 'kpi__valor' }, a.vuelta === null ? el('span', { class: 'kpi__vacio' }, t('analisis.vuelta.vacio')) : [num(Math.round(a.vuelta * 10) / 10), el('small', {}, ` ${t(`analisis.corta.${a.unidad}`)}`)])),
        el('div', { class: 'kpi' }, el('dt', { class: 'kpi__etiqueta' }, t('analisis.pct90')), el('dd', { class: 'kpi__valor' }, a.pct90 === null ? '—' : String(Math.round(a.pct90 * 100)), a.pct90 === null ? null : el('small', {}, '%'))),
      ),
      graficoPuntaje(a.serie),
      historial(a.corridas, unidad),
      a.porDia ? porDia(a.porDia) : null,
      el('p', { class: 'analisis__lectura' }, el('strong', {}, `${t('analisis.lectura')}: `),
        a.lectura.map((f) => t(f.clave, f.clave === 'analisis.lectura.vuelta'
          ? { n: num(f.vars.n), unidad: unidad(f.vars.n) }
          : f.vars)).join(' ')),
      el('p', { class: 'texto-ayuda' }, t('analisis.nota')),
    ),
  });
}

/* ---------- Índice de constancia (línea + área, con cursor) ---------- */

function graficoPuntaje(serie) {
  const titulo = el('div', { class: 'analisis__titulo' }, el('h3', {}, t('analisis.grafico')), el('span', {}, t('analisis.grafico.rango', { n: serie.length })));
  if (serie.length < 2) return el('section', { class: 'analisis__bloque' }, titulo, el('p', { class: 'texto-ayuda' }, t('analisis.lectura.pocos')));
  const W = 320, H = 120, top = 8, bot = 104;
  const x = (i) => (i / (serie.length - 1)) * W;
  const y = (v) => bot - (v / 100) * (bot - top);
  const linea = serie.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)} ${y(p.v).toFixed(1)}`).join(' ');

  const svg = s('svg', { viewBox: `0 0 ${W} ${H}`, class: 'grafico', 'aria-hidden': 'true', preserveAspectRatio: 'none' });
  for (const v of [100, 50]) s('line', { x1: 0, x2: W, y1: y(v), y2: y(v), class: 'grafico__guia' }, svg);
  s('line', { x1: 0, x2: W, y1: bot, y2: bot, class: 'grafico__base' }, svg);
  s('path', { d: `${linea} L${W} ${bot} L0 ${bot}Z`, class: 'grafico__area' }, svg);
  s('path', { d: linea, class: 'grafico__linea' }, svg);
  const guia = s('line', { y1: top, y2: bot, class: 'grafico__cursor' }, svg);

  const punto = el('span', { class: 'grafico__punto', aria: { hidden: 'true' } });
  const globo = el('span', { class: 'grafico__globo', aria: { hidden: 'true' } });
  const area = el('div', {
    class: 'grafico__area-toque', tabindex: '0', role: 'slider',
    aria: { label: t('analisis.grafico.aria'), valuemin: 0, valuemax: 100 },
  }, globo, el('div', { class: 'grafico__lienzo' }, svg, punto));

  let i = serie.length - 1;
  const mostrar = (n) => {
    i = Math.max(0, Math.min(serie.length - 1, n));
    const p = serie[i];
    const px = (x(i) / W) * 100;
    const py = (y(p.v) / H) * 100;
    guia.setAttribute('x1', x(i)); guia.setAttribute('x2', x(i));
    punto.style.setProperty('left', `${px}%`); punto.style.setProperty('top', `${py}%`);
    globo.style.setProperty('left', `${Math.min(84, Math.max(16, px))}%`);
    globo.replaceChildren(el('b', {}, String(p.v)), el('span', {}, fechaCorta(p.fecha)));
    area.setAttribute('aria-valuenow', String(p.v));
    area.setAttribute('aria-valuetext', t('analisis.grafico.punto', { fecha: fechaCorta(p.fecha), v: p.v }));
  };
  const desdePuntero = (e) => {
    const r = svg.getBoundingClientRect();
    mostrar(Math.round(((e.clientX - r.left) / r.width) * (serie.length - 1)));
  };
  area.addEventListener('pointerdown', (e) => { area.setPointerCapture?.(e.pointerId); desdePuntero(e); });
  area.addEventListener('pointermove', (e) => { if (e.buttons || e.pointerType === 'mouse') desdePuntero(e); });
  area.addEventListener('keydown', (e) => {
    const paso = { ArrowLeft: -1, ArrowRight: 1, ArrowDown: -1, ArrowUp: 1, PageDown: -7, PageUp: 7, Home: -Infinity, End: Infinity }[e.key];
    if (paso === undefined) return;
    e.preventDefault();
    mostrar(Number.isFinite(paso) ? i + paso : paso < 0 ? 0 : serie.length - 1);
  });
  mostrar(i);
  return el('section', { class: 'analisis__bloque' }, titulo, area);
}

/* ---------- Historial de rachas: barras por corrida ---------- */

function historial(corridas, unidad) {
  const recientes = corridas.slice(-24);
  const titulo = (desde) => el('div', { class: 'analisis__titulo' }, el('h3', {}, t('analisis.historial')), desde ? el('span', {}, t('analisis.historial.desde', { fecha: fechaCorta(desde) })) : null);
  if (!recientes.some((c) => c.tipo === 'ok')) return el('section', { class: 'analisis__bloque' }, titulo(null), el('p', { class: 'texto-ayuda' }, t('analisis.lectura.pocos')));

  const W = 320, H = 46, gap = 3;
  const total = recientes.reduce((n, c) => n + (c.tipo === 'fallo' ? Math.min(c.largo, 2) : c.largo), 0);
  const ancho = (c) => ((c.tipo === 'fallo' ? Math.min(c.largo, 2) : c.largo) / total) * (W - gap * (recientes.length - 1));
  const record = Math.max(...corridas.filter((c) => c.tipo === 'ok').map((c) => c.largo));
  const ultima = recientes.at(-1);

  const svg = s('svg', { viewBox: `0 0 ${W} ${H}`, class: 'historial', 'aria-hidden': 'true' });
  const defs = s('defs', {}, svg);
  const trama = s('pattern', { id: 'trama-neutro', width: 5, height: 5, patternUnits: 'userSpaceOnUse', patternTransform: 'rotate(45)' }, defs);
  s('rect', { width: 5, height: 5, class: 'historial__trama-fondo' }, trama);
  s('line', { x1: 0, y1: 0, x2: 0, y2: 5, class: 'historial__trama-linea' }, trama);

  let cx = 0;
  const etiquetas = [];
  for (const c of recientes) {
    const w = Math.max(ancho(c), 2);
    if (c.tipo === 'ok') {
      s('rect', { x: cx, y: 22, width: w, height: 16, rx: 4, class: `historial__racha${c === ultima ? ' historial__racha--actual' : ''}` }, svg);
      if (c.largo === record || c === ultima) etiquetas.push({ x: cx + w / 2, texto: t(c === ultima ? 'analisis.historial.actual' : 'analisis.historial.record', { n: c.largo }) });
    } else if (c.tipo === 'neutro') {
      s('rect', { x: cx, y: 22, width: w, height: 16, rx: 3, fill: 'url(#trama-neutro)' }, svg);
    } else {
      s('rect', { x: cx, y: 28, width: w, height: 4, rx: 2, class: 'historial__hueco' }, svg);
    }
    cx += w + gap;
  }
  // Etiquetas sobre las barras (sin superponerse).
  let ultimoX = -Infinity;
  for (const e of etiquetas.sort((p, q) => p.x - q.x)) {
    if (e.x - ultimoX < 70) continue;
    const tx = s('text', { x: Math.min(W - 30, Math.max(30, e.x)), y: 14, class: 'historial__etiqueta', 'text-anchor': 'middle' }, svg);
    tx.textContent = e.texto;
    ultimoX = e.x;
  }
  const lista = recientes.filter((c) => c.tipo === 'ok').slice(-5).map((c) => t('analisis.historial.item', { n: c.largo, unidad: unidad(c.largo), fecha: fechaCorta(c.desde) })).join('; ');
  return el('section', { class: 'analisis__bloque' }, titulo(recientes[0].desde),
    el('div', { role: 'img', aria: { label: t('analisis.historial.aria', { lista }) } }, svg),
    el('ul', { class: 'leyenda-analisis' },
      el('li', {}, el('i', { class: 'leyenda-analisis__racha' }), t('analisis.leyenda.racha')),
      el('li', {}, el('i', { class: 'leyenda-analisis__neutro' }), t('analisis.leyenda.neutro')),
      el('li', {}, el('i', { class: 'leyenda-analisis__hueco' }), t('analisis.leyenda.fallo'))));
}

/* ---------- Por día de la semana ---------- */

function porDia(valores) {
  const W = 320, H = 92, base = 70, alto = 60;
  const letras = t('dias.corto');
  const nombres = t('dias.largo');
  const svg = s('svg', { viewBox: `0 0 ${W} ${H}`, class: 'por-dia', 'aria-hidden': 'true' });
  const ancho = 30, paso = W / 7;
  valores.forEach((v, i) => {
    const cx = paso * i + paso / 2;
    const hgt = v === null ? 0 : Math.max(3, v * alto);
    s('rect', { x: cx - ancho / 2, y: base - alto, width: ancho, height: alto, rx: 6, class: 'por-dia__fondo' }, svg);
    if (v !== null) s('rect', { x: cx - ancho / 2, y: base - hgt, width: ancho, height: hgt, rx: 6, class: 'por-dia__barra' }, svg);
    const l = s('text', { x: cx, y: H - 4, 'text-anchor': 'middle', class: 'por-dia__letra' }, svg);
    l.textContent = letras[i];
  });
  const texto = valores.map((v, i) => t('analisis.porDia.aria', { dia: nombres[i], pct: v === null ? '—' : porcentaje(v) })).join(', ');
  return el('section', { class: 'analisis__bloque' },
    el('div', { class: 'analisis__titulo' }, el('h3', {}, t('analisis.porDia')), el('span', {}, t('analisis.porDia.unidad'))),
    el('div', { role: 'img', aria: { label: texto } }, svg));
}
