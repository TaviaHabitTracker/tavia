// vistas/frases.js — Frases guía en la interfaz (Módulo 10).
// Tarjeta del día y de cierre en Hoy, colección y favoritas, tarjeta compartible y Ajustes > Frases.
// Todo texto de frases entra con textContent (vía el()), nunca como HTML.

import { el, icono } from '../dom.js';
import { t } from '../textos.js';
import { LIMITES, ROLES_FRASE, ESTILOS_FRASE, FRECUENCIAS_FRASE, CONTEXTOS_FRASE } from '../esquema.js';
import { abrirHoja, anunciar } from '../ui.js';
import { entregarArchivo } from '../respaldo.js';
import { elegirContexto, elegirFrase, senales, tocaMiFrase, tonosPermitidos } from '../frases.js';

/* ---------- Estado del día ---------- */

/** Señales y contexto de hoy (siempre desde los registros). */
export function contextoDeHoy(ctx) {
  const { modelo } = ctx;
  const hoy = modelo.hoy();
  const s = senales({
    habitos: modelo.habitos(), hoy, logDe: modelo.logDe, ahora: new Date(),
    finDelDia: modelo.config.finDelDia, checkin: animoDe(ctx, hoy), hitos: ctx.frases?.reglas.hitos,
  });
  return { s, contexto: elegirContexto(s, ctx.frases?.reglas.prioridad) };
}

const animoDe = (ctx, fecha) => {
  const a = ctx.modelo.palabras.checkin[fecha];
  return a && a !== '-' ? a : null;
};

const frasesListas = (ctx) => Boolean(ctx.frases?.frases.length);
const filtros = (ctx) => ({ roles: ctx.modelo.config.rolesFrases, soloAlta: ctx.modelo.config.soloAlta });

/** ¿Se muestran frases en Hoy? */
function frasesEnHoy(ctx) {
  const c = ctx.modelo.config;
  return c.frasesActivas && c.frecuenciaFrases !== 'revision';
}

/**
 * Asegura la frase del día: se elige al primer abrir del día y queda fija (no cambia al recargar).
 * `forzar`: vuelve a elegir con otro contexto (por ejemplo, tras marcar "abrumado").
 */
export function asegurarFraseDelDia(ctx, { forzarContexto = null } = {}) {
  const { modelo } = ctx;
  if (!frasesEnHoy(ctx)) return null;
  const hoy = modelo.hoy();
  const actual = modelo.frases.delDia;
  if (actual?.fecha === hoy && !forzarContexto) return actual;
  const miFrase = modelo.frases.miFrase;
  if (!frasesListas(ctx) && !miFrase) return null;

  const contexto = forzarContexto || contextoDeHoy(ctx).contexto;
  const tonos = tonosPermitidos(contexto, modelo.config.estiloFrases, animoDe(ctx, hoy), ctx.frases?.reglas);
  const r = frasesListas(ctx) ? elegirFrase({
    datos: ctx.frases, contexto, tonos, ...filtros(ctx), vistas: modelo.frases.vistas, hoy, clave: modelo.config.idInstalacion,
    excluir: actual?.fecha === hoy && actual.id ? [actual.id] : [],
  }) : null;
  if (tocaMiFrase(miFrase, contexto, hoy, Boolean(r))) {
    modelo.fijarFraseDelDia({ fecha: hoy, id: 'propia', contexto, propia: true });
  } else if (r) {
    modelo.fijarFraseDelDia({ fecha: hoy, id: r.frase.id, contexto });
  } else {
    return null;
  }
  return modelo.frases.delDia;
}

/**
 * Tras un check-in "cansado" o "abrumado", si la frase de hoy ya no es del tono permitido,
 * se cambia por una de día difícil. Nunca se muestra una frase dura en un día así.
 */
export function reconsiderarPorAnimo(ctx) {
  const { modelo } = ctx;
  const hoy = modelo.hoy();
  const d = modelo.frases.delDia;
  if (!d || d.fecha !== hoy || d.propia) return;
  const f = ctx.frases?.porId.get(d.id);
  const tonos = tonosPermitidos('dia_dificil', modelo.config.estiloFrases, animoDe(ctx, hoy), ctx.frases?.reglas);
  if (f && !tonos.includes(f.tono)) asegurarFraseDelDia(ctx, { forzarContexto: 'dia_dificil' });
}

/**
 * Frase de cierre: al completar el día o al alcanzar un hito. Una vez al día.
 * Devuelve { frase, contexto, hito } o null.
 */
export function asegurarCierre(ctx, { completo }) {
  const { modelo } = ctx;
  const c = modelo.config;
  if (!c.frasesActivas || c.frecuenciaFrases !== 'cierre' || !frasesListas(ctx)) return null;
  const hoy = modelo.hoy();
  const previo = modelo.frases.cierre;
  if (previo?.fecha === hoy) {
    const frase = ctx.frases.porId.get(previo.id);
    // El cierre de "día completo" se oculta si se desmarca algo; el de un hito queda.
    if (!frase || (previo.contexto === 'dia_completo' && !completo)) return null;
    return { frase, contexto: previo.contexto, hito: previo.contexto === 'hito' ? hitoPrincipal(ctx) : null };
  }
  const { s } = contextoDeHoy(ctx);
  const vistos = new Set(modelo.frases.hitosVistos);
  const nuevos = s.hitos.filter((h) => !vistos.has(h.clave));
  if (!nuevos.length && !completo) return null;
  const contexto = nuevos.length ? 'hito' : 'dia_completo';
  const tonos = tonosPermitidos(contexto, c.estiloFrases, animoDe(ctx, hoy), ctx.frases.reglas);
  const delDia = modelo.frases.delDia?.fecha === hoy ? modelo.frases.delDia.id : null;
  const r = elegirFrase({ datos: ctx.frases, contexto, tonos, ...filtros(ctx), vistas: modelo.frases.vistas, hoy, clave: `${c.idInstalacion}|cierre`, excluir: delDia ? [delDia] : [] });
  if (!r) return null;
  modelo.fijarCierre({ fecha: hoy, id: r.frase.id, contexto }, nuevos.map((h) => h.clave));
  return { frase: r.frase, contexto, hito: nuevos[0] || null };
}

function hitoPrincipal(ctx) {
  const { s } = contextoDeHoy(ctx);
  return s.hitos[0] || null;
}

function textoHito(ctx, h) {
  if (!h) return t('frase.ctx.hito');
  if (h.tipo === 'habito') return t('frase.hito.habito', { n: h.n, nombre: ctx.modelo.habito(h.habitId)?.nombre ?? '' });
  if (h.tipo === 'mes') return t('frase.hito.mes');
  return t('frase.hito.global', { n: h.n });
}

/* ---------- Piezas ---------- */

/** Texto entre comillas tipográficas españolas. */
const entreComillas = (s) => `«${s}»`;

/**
 * Bloque de una frase: cita en serif, autor atenuado, fuente y marcas discretas.
 * `marcas`: muestra "fuente por confirmar" (solo en colección y Ajustes, no en la tarjeta principal).
 */
export function bloqueFrase(f, { marcas = false, clase = '' } = {}) {
  return el('figure', { class: `frase ${clase}`.trim(), lang: 'es' },
    el('blockquote', { class: 'frase__texto' }, entreComillas(f.texto)),
    el('figcaption', { class: 'frase__pie' },
      el('span', { class: 'frase__autor' }, f.autor),
      el('span', { class: 'frase__fuente' }, f.fuente),
      f.tipo === 'adaptada' || (marcas && f.confianza === 'Media')
        ? el('span', { class: 'frase__marcas' },
          f.tipo === 'adaptada' ? el('span', { class: 'frase__marca', title: t('frase.adaptada.ayuda') }, t('frase.adaptada')) : null,
          marcas && f.confianza === 'Media' ? el('span', { class: 'frase__marca frase__marca--miel' }, t('frase.porConfirmar')) : null)
        : null,
    ),
  );
}

function botonFavorita(ctx, f, foco) {
  const es = ctx.modelo.frases.favoritas.includes(f.id);
  return el('button', {
    class: 'tv-boton--icono frase__accion', type: 'button', data: { foco, activa: es ? '' : null },
    aria: { label: t(es ? 'frase.quitarFavorita' : 'frase.favorita'), pressed: es ? 'true' : 'false' },
    onclick: () => { ctx.modelo.alternarFavorita(f.id); anunciar(t(es ? 'frase.quitadaFav' : 'frase.guardadaFav')); },
  }, icono(es ? 'estrella-llena' : 'estrella', 'tv-icono--sm'));
}

function botonCompartir(ctx, f, foco) {
  return el('button', {
    class: 'tv-boton--icono frase__accion', type: 'button', data: { foco }, aria: { label: t('frase.compartir') },
    onclick: () => abrirTarjeta(ctx, f),
  }, icono('compartir', 'tv-icono--sm'));
}

/* ---------- Hoy: tarjeta del día y de cierre ---------- */

export function tarjetaFraseDelDia(ctx) {
  const d = asegurarFraseDelDia(ctx);
  if (!d || d.cerrada) return null;
  const { modelo } = ctx;
  const propia = d.propia;
  const f = propia ? null : ctx.frases?.porId.get(d.id);
  if (!propia && !f) return null;
  const cerrar = el('button', {
    class: 'tv-boton--icono frase__accion', type: 'button', data: { foco: 'frase-cerrar' }, aria: { label: t('frase.cerrar') },
    onclick: () => { const volver = modelo.cerrarFraseDelDia(); ctx.deshacer(t('frase.cerrada'), volver); },
  }, icono('cerrar', 'tv-icono--sm'));

  const cuerpo = propia
    ? el('figure', { class: 'frase', lang: 'es' },
      el('blockquote', { class: 'frase__texto' }, entreComillas(modelo.frases.miFrase)),
      el('figcaption', { class: 'frase__pie' }, el('span', { class: 'frase__autor' }, t('frase.miFrase'))))
    : bloqueFrase(f);
  return el('section', { class: 'tarjeta-frase', data: { tarjeta: 'frase', contexto: d.contexto }, aria: { label: t(propia ? 'frase.miFrase' : `frase.ctx.${d.contexto}`) } },
    el('div', { class: 'tarjeta-frase__cabecera' },
      el('p', { class: 'tarjeta-frase__ceja' }, icono('comillas', 'tv-icono--xs'), t(propia ? 'frase.miFrase' : `frase.ctx.${d.contexto}`)),
      el('div', { class: 'tarjeta-frase__acciones' },
        f ? botonFavorita(ctx, f, 'frase-fav') : null,
        f ? botonCompartir(ctx, f, 'frase-compartir') : null,
        cerrar)),
    cuerpo);
}

/** Cierre del día: reemplaza el "Todo listo por hoy" con una frase serena (o celebra el hito, sin confeti). */
export function tarjetaCierre(ctx, { completo }) {
  const r = asegurarCierre(ctx, { completo });
  if (!r) return null;
  return el('section', { class: 'tarjeta-frase tarjeta-frase--cierre', data: { tarjeta: 'cierre', contexto: r.contexto }, aria: { live: 'polite', label: t(`frase.ctx.${r.contexto}`) } },
    el('div', { class: 'tarjeta-frase__cabecera' },
      el('p', { class: 'tarjeta-frase__ceja' }, icono('brote', 'tv-icono--xs'), r.contexto === 'hito' ? textoHito(ctx, r.hito) : t('frase.ctx.dia_completo')),
      el('div', { class: 'tarjeta-frase__acciones' }, botonFavorita(ctx, r.frase, 'cierre-fav'), botonCompartir(ctx, r.frase, 'cierre-compartir'))),
    bloqueFrase(r.frase));
}

/* ---------- Revisión semanal ---------- */

/** Frase para la revisión: determinista por semana, no cuenta como "vista" del día. */
export function fraseRevision(ctx, lunes, contexto = 'revision') {
  const { modelo } = ctx;
  if (!modelo.config.frasesActivas || !frasesListas(ctx)) return null;
  const tonos = tonosPermitidos(contexto, modelo.config.estiloFrases, null, ctx.frases.reglas);
  return elegirFrase({ datos: ctx.frases, contexto, tonos, ...filtros(ctx), vistas: [], hoy: lunes, clave: `${modelo.config.idInstalacion}|semana` })?.frase || null;
}

export function bloqueRevision(ctx, f) {
  if (!f) return null;
  return el('div', { class: 'frase-revision' }, bloqueFrase(f), el('div', { class: 'frase-revision__acciones' }, botonFavorita(ctx, f, `rev-fav-${f.id}`)));
}

/* ---------- Colección ---------- */

export function abrirColeccion(ctx) {
  let pestana = ctx.modelo.frases.favoritas.length ? 'favoritas' : 'todas';
  abrirHoja({
    titulo: t('frase.coleccion'),
    etiqueta: 'coleccion',
    clase: 'tv-hoja--coleccion',
    contenido: () => {
      const caja = el('div', { class: 'coleccion' });
      const dibujar = () => {
        caja.replaceChildren();
        const { modelo } = ctx;
        if (!frasesListas(ctx)) { caja.append(el('p', { class: 'texto-ayuda' }, t('frase.coleccion.sinArchivo'))); return; }
        const tabs = el('div', { class: 'segmentos', role: 'radiogroup', aria: { label: t('frase.coleccion') } },
          [['favoritas', `${modelo.frases.favoritas.length} ${t('frase.coleccion.favs', { n: modelo.frases.favoritas.length })}`], ['todas', t('frase.coleccion.todas')]].map(([id, txt]) => el('label', { class: 'segmento' },
            el('input', { type: 'radio', name: 'coleccion', value: id, checked: pestana === id, onchange: () => { pestana = id; dibujar(); caja.querySelector(`input[value="${id}"]`)?.focus(); } }),
            el('span', {}, txt))));
        caja.append(tabs);
        const item = (f) => el('li', { class: 'coleccion__item' }, bloqueFrase(f, { marcas: true }),
          el('div', { class: 'coleccion__acciones' }, botonFavorita(ctx, f, `col-fav-${f.id}`), botonCompartir(ctx, f, `col-comp-${f.id}`)));
        if (pestana === 'favoritas') {
          const lista = modelo.frases.favoritas.map((id) => ctx.frases.porId.get(id)).filter(Boolean);
          caja.append(lista.length ? el('ul', { class: 'coleccion__lista' }, lista.map(item)) : el('p', { class: 'texto-ayuda' }, t('frase.coleccion.vacia')));
          return;
        }
        const total = ctx.frases.frases.length;
        const medias = ctx.frases.frases.filter((f) => f.confianza === 'Media').length;
        caja.append(el('p', { class: 'texto-ayuda' }, t('frase.coleccion.resumen', { n: total, m: medias })));
        for (const c of CONTEXTOS_FRASE) {
          const lista = ctx.frases.frases.filter((f) => f.contexto === c);
          if (!lista.length) continue;
          caja.append(el('h3', { class: 'coleccion__grupo' }, t(`frase.ctx.${c}`)), el('ul', { class: 'coleccion__lista' }, lista.map(item)));
        }
      };
      // Al marcar favoritas el modelo pide redibujar la app; la hoja se redibuja sola.
      ctx.alCambiarGuia = dibujar;
      dibujar();
      return caja;
    },
    alCerrar: () => { ctx.alCambiarGuia = null; },
  });
}

/* ---------- Tarjeta compartible (canvas, sin librerías ni fuentes externas) ---------- */

export const TARJETA = { ancho: 1080, alto: 1350 };
const SERIF = "'Fraunces', Georgia, 'Times New Roman', serif";
const SANS = "'Instrument Sans', system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif";

function colores() {
  const cs = getComputedStyle(document.documentElement);
  const v = (n, x) => cs.getPropertyValue(`--${n}`).trim() || x;
  return { fondo: v('fondo', '#F3F3F1'), tinta: v('tinta', '#17181B'), suave: v('tinta-suave', '#4A4D53'), acento: v('acento', '#A2621A'), linea: v('linea', '#DCDCD8') };
}

/** Líneas que caben en `ancho` sin cortar ni una palabra de la frase. */
export function lineasCompletas(c, texto, ancho) {
  const lineas = [];
  let actual = '';
  for (const p of String(texto).split(/\s+/).filter(Boolean)) {
    const prueba = actual ? `${actual} ${p}` : p;
    if (c.measureText(prueba).width <= ancho || !actual) actual = prueba;
    else { lineas.push(actual); actual = p; }
  }
  if (actual) lineas.push(actual);
  return lineas;
}

/** Dibuja la frase completa: si no cabe, achica la letra (nunca la recorta). */
export function dibujarTarjetaFrase(lienzo, f) {
  const { ancho: W, alto: H } = TARJETA;
  const c = lienzo.getContext('2d');
  const k = colores();
  const M = 110;
  c.fillStyle = k.fondo;
  c.fillRect(0, 0, W, H);
  // Comilla grande de acento y una línea fina: sobrio, de marca.
  c.fillStyle = k.acento;
  c.font = `400 220px ${SERIF}`;
  c.textBaseline = 'alphabetic';
  c.fillText('«', M - 12, 300);

  const anchoTexto = W - M * 2;
  let tam = 70, lineas, alto;
  for (; tam >= 30; tam -= 2) {
    c.font = `420 ${tam}px ${SERIF}`;
    lineas = lineasCompletas(c, f.texto, anchoTexto);
    alto = lineas.length * tam * 1.3;
    if (alto <= H - 640) break;
  }
  c.fillStyle = k.tinta;
  let y = 360 + tam;
  for (const l of lineas) { c.fillText(l, M, y); y += tam * 1.3; }

  y += 40;
  c.fillStyle = k.acento;
  c.fillRect(M, y, 64, 3);
  y += 70;
  c.fillStyle = k.tinta;
  c.font = `600 38px ${SANS}`;
  for (const l of lineasCompletas(c, f.autor, anchoTexto)) { c.fillText(l, M, y); y += 48; }
  c.fillStyle = k.suave;
  c.font = `400 30px ${SANS}`;
  const fuente = f.tipo === 'adaptada' ? `${f.fuente} · ${t('frase.adaptada')}` : f.fuente;
  for (const l of lineasCompletas(c, fuente, anchoTexto)) { c.fillText(l, M, y); y += 40; }

  c.fillStyle = k.suave;
  c.font = `600 28px ${SANS}`;
  c.fillText('Tavia', M, H - M + 10);
}

export async function prepararFuenteSerif() {
  try {
    await Promise.race([document.fonts.load(`420 60px ${SERIF}`), new Promise((r) => setTimeout(r, 1500))]);
  } catch { /* se usa Georgia */ }
}

export function abrirTarjeta(ctx, f) {
  abrirHoja({
    titulo: t('frase.tarjeta.titulo'),
    etiqueta: 'tarjeta-frase',
    contenido: () => {
      const lienzo = el('canvas', { class: 'frase-lienzo', width: String(TARJETA.ancho), height: String(TARJETA.alto), role: 'img', aria: { label: `${f.texto} — ${f.autor}, ${f.fuente}` } });
      prepararFuenteSerif().then(() => dibujarTarjetaFrase(lienzo, f));
      dibujarTarjetaFrase(lienzo, f);
      const guardar = el('button', { class: 'tv-boton tv-boton--principal tv-boton--ancho', type: 'button', data: { foco: 'frase-guardar' } }, icono('compartir', 'tv-icono--sm'), t('frase.tarjeta.guardar'));
      guardar.addEventListener('click', async () => {
        guardar.disabled = true;
        try {
          const blob = await new Promise((ok, mal) => lienzo.toBlob((b) => (b ? ok(b) : mal(new Error('vacío'))), 'image/png'));
          if (await entregarArchivo(`tavia-frase-${f.id}.png`, blob, 'image/png')) anunciar(t('frase.tarjeta.lista'));
        } catch {
          ctx.mostrarError(t('frase.tarjeta.error'));
        } finally {
          guardar.disabled = false;
        }
      });
      return [el('div', { class: 'frase-lienzo__marco' }, lienzo), guardar, el('p', { class: 'texto-ayuda' }, t('frase.tarjeta.local'))];
    },
  });
}

/* ---------- Ajustes > Frases ---------- */

export function seccionFrases(ctx) {
  const { modelo } = ctx;
  const c = modelo.config;
  const tarjeta = el('div', { class: 'tarjeta' });
  const interruptor = (id, clave, texto, ayuda) => {
    const input = el('input', { type: 'checkbox', role: 'switch', id, checked: c[clave], data: { foco: id } });
    input.addEventListener('change', () => modelo.setConfig({ [clave]: input.checked }));
    return [el('label', { class: 'interruptor', for: id }, el('span', {}, texto), input), ayuda ? el('p', { class: 'texto-ayuda' }, ayuda) : null];
  };
  const segmentos = (nombre, valores, actual, clave, etiqueta, columna = false) => {
    const g = el('fieldset', { class: `segmentos${columna ? ' segmentos--columna' : ''}` },
      el('legend', { class: 'campo__etiqueta' }, etiqueta),
      valores.map((v) => el('label', { class: 'segmento' },
        el('input', { type: 'radio', name: nombre, value: v, checked: actual === v, data: { foco: `${nombre}-${v}` } }),
        el('span', {}, t(`ajustes.frases.${nombre}.${v}`)))));
    g.addEventListener('change', (e) => modelo.setConfig({ [clave]: e.target.value }));
    return g;
  };

  tarjeta.append(...interruptor('frases-activas', 'frasesActivas', t('ajustes.frases.activas'), t('ajustes.frases.activas.ayuda')));
  if (c.frasesActivas) {
    const roles = el('fieldset', { class: 'chips-opcion' },
      el('legend', { class: 'campo__etiqueta' }, t('ajustes.frases.autores')),
      ROLES_FRASE.map((r) => el('label', { class: 'chip-opcion' },
        el('input', { type: 'checkbox', value: r, checked: c.rolesFrases.includes(r), data: { foco: `rol-${r}` } }),
        el('span', {}, t(`ajustes.frases.rol.${r}`)))));
    roles.addEventListener('change', () => modelo.setConfig({ rolesFrases: [...roles.querySelectorAll('input:checked')].map((x) => x.value) }));

    const total = ctx.frases?.frases.length || 0;
    const medias = ctx.frases?.frases.filter((f) => f.confianza === 'Media').length || 0;
    const nFav = modelo.frases.favoritas.length;
    tarjeta.append(
      el('div', { class: 'separador' }),
      segmentos('estilo', ESTILOS_FRASE, c.estiloFrases, 'estiloFrases', t('ajustes.frases.estilo')),
      el('p', { class: 'texto-ayuda' }, t('ajustes.frases.estilo.ayuda')),
      segmentos('cuando', FRECUENCIAS_FRASE, c.frecuenciaFrases, 'frecuenciaFrases', t('ajustes.frases.cuando'), true),
      el('div', { class: 'separador' }),
      roles,
      ...interruptor('frases-alta', 'soloAlta', t('ajustes.frases.soloAlta'), total ? t('ajustes.frases.soloAlta.ayuda', { m: medias, n: total }) : null),
      el('button', { class: 'tv-boton tv-boton--secundario', type: 'button', data: { foco: 'coleccion' }, onclick: () => abrirColeccion(ctx) },
        icono('estrella', 'tv-icono--sm'), t('frase.coleccion.abrir'), nFav ? el('span', { class: 'insignia' }, String(nFav)) : null),
      el('div', { class: 'separador' }),
      campoMiFrase(ctx),
    );
  }
  return tarjeta;
}

function campoMiFrase(ctx) {
  const { modelo } = ctx;
  const id = 'ajuste-mi-frase';
  const area = el('textarea', { class: 'entrada entrada--area', id, rows: '2', maxlength: String(LIMITES.miFrase), placeholder: t('ajustes.frases.miFrase.ph'), data: { foco: 'mi-frase' }, aria: { describedby: `${id}-ayuda` } });
  area.value = modelo.frases.miFrase;
  const contador = el('span', { class: 'contador', aria: { hidden: 'true' } });
  const contar = () => { contador.textContent = `${[...area.value].length}/${LIMITES.miFrase}`; };
  contar();
  area.addEventListener('input', contar);
  area.addEventListener('change', () => { if (area.value.trim() !== modelo.frases.miFrase) modelo.fijarMiFrase(area.value); });
  return el('div', { class: 'campo' },
    el('div', { class: 'campo__fila' }, el('label', { class: 'campo__etiqueta', for: id }, t('ajustes.frases.miFrase')), contador),
    area,
    el('p', { class: 'texto-ayuda', id: `${id}-ayuda` }, t('ajustes.frases.miFrase.ayuda', { max: LIMITES.miFrase })));
}
