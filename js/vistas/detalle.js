// vistas/detalle.js — Hoja de un hábito en un día: registrar, "Hoy no", descanso,
// congelador, nota del día, estadísticas (puntaje, racha, mejor racha), editar y pausar.

import { el, icono } from '../dom.js';
import { t } from '../textos.js';
import { esFechaValida, sumarDias } from '../fechas.js';
import { estadoDelDia } from '../calculos.js';
import { puedeCongelar } from '../estadisticas.js';
import { abrirHoja } from '../ui.js';
import { nombreDelDia, num, numCampo, porcentaje, resumenMeta, textoRacha } from '../formato.js';

export function abrirDetalle(ctx, id, fecha) {
  const { modelo } = ctx;
  const h = modelo.habito(id);
  if (!h) return;

  abrirHoja({
    titulo: h.nombre,
    etiqueta: 'detalle',
    encabezado: el('span', { class: `tv-habito__icono color-${h.color}`, aria: { hidden: 'true' } }, h.icono),
    contenido: (cerrar) => {
      const cuerpo = el('div', { class: 'form' });
      const dibujar = () => {
        cuerpo.replaceChildren(...contenido(ctx, modelo.habito(id) || h, fecha, cerrar, dibujar));
      };
      dibujar();
      return cuerpo;
    },
  });
}

function contenido(ctx, h, fecha, cerrar, redibujar) {
  const { modelo } = ctx;
  const hoy = modelo.hoy();
  const log = modelo.logDe(h.id, fecha);
  const estado = estadoDelDia(h, log);
  const puede = modelo.puedeMarcar(h, fecha);
  const nodos = [];

  const meta = resumenMeta(h, log);
  nodos.push(el('p', { class: 'subtitulo' }, [nombreDelDia(fecha, hoy), t(`estado.${estado}`), meta].filter(Boolean).join(' · ')));

  if (puede) {
    if (h.tipo === 'cantidad') nodos.push(formCantidad(ctx, h, fecha, log, cerrar));
    else if (h.vecesPorDia > 1) nodos.push(pasoVeces(ctx, h, fecha, log, redibujar));
    else {
      const hecho = estado === 'hecho';
      nodos.push(el('button', {
        class: `tv-boton ${hecho ? 'tv-boton--secundario' : 'tv-boton--principal'} tv-boton--ancho`, type: 'button',
        onclick: () => { ctx.tocar(h.id, fecha); cerrar(); },
      }, icono(hecho ? 'menos' : 'hecho'), t(hecho ? 'detalle.desmarcar' : 'detalle.marcar')));
    }

    // Congelador: cubre un día olvidado de hasta 2 días atrás.
    if (puedeCongelar(h, fecha, hoy, modelo.logDe)) {
      const disp = ctx.stats(h).congeladores.disponibles;
      nodos.push(el('button', {
        class: 'tv-boton tv-boton--secundario tv-boton--ancho tv-boton--miel', type: 'button',
        onclick: () => { ctx.usarCongelador(h.id, fecha); cerrar(); },
      }, icono('congelado'), t('congelar.boton', { n: disp })));
    }

    nodos.push(opcionEstado(ctx, h, fecha, 'saltado', estado, cerrar, fecha === hoy ? 'hoyNo' : 'noLoHice'));
    if (fecha === hoy) nodos.push(opcionEstado(ctx, h, fecha, 'descanso', estado, cerrar, 'descanso'));

    if (log && log.estado !== 'nota' && (log.estado !== 'registrado' || log.valor > 0 || h.tipo === 'cantidad')) {
      nodos.push(el('button', {
        class: 'tv-boton tv-boton--sutil', type: 'button',
        onclick: () => { ctx.quitarLog(h.id, fecha); cerrar(); },
      }, t('detalle.quitar')));
    }

    nodos.push(formNota(ctx, h, fecha, log));
  }

  nodos.push(el('div', { class: 'separador' }));
  nodos.push(estadisticas(ctx, h));
  nodos.push(el('button', {
    class: 'tv-boton tv-boton--secundario tv-boton--ancho', type: 'button',
    onclick: () => { cerrar(); ctx.abrirEditor(h.id); },
  }, icono('lapiz'), t('detalle.editar')));
  if (!h.archivado) nodos.push(formPausa(ctx, h, cerrar));
  return nodos;
}

/** Puntaje, racha, mejor racha y congeladores. */
function estadisticas(ctx, h) {
  const st = ctx.stats(h);
  const c = st.congeladores;
  const tile = (etiqueta, valor) => el('div', { class: 'cifra' },
    el('span', { class: 'cifra__valor' }, valor),
    el('span', { class: 'cifra__etiqueta' }, etiqueta));
  return el('section', { class: 'estadisticas', aria: { label: t('progreso.titulo') } },
    el('div', { class: 'cifras' },
      tile(t('stats.puntaje'), porcentaje(st.puntaje)),
      tile(t('stats.racha'), textoRacha(st.actual, st.unidad)),
      tile(t('stats.mejor'), textoRacha(st.mejor, st.unidad)),
    ),
    el('p', { class: 'texto-ayuda' }, t('progreso.puntaje.ayuda')),
    el('div', { class: 'congeladores' },
      el('span', { class: 'congeladores__puntos', aria: { hidden: 'true' } },
        Array.from({ length: c.maximo }, (_, i) => el('span', { class: 'congeladores__punto', data: { lleno: i < c.disponibles ? '' : null } }))),
      el('div', {},
        el('p', { class: 'congeladores__titulo' }, icono('congelado', 'tv-icono--sm'), t('stats.congeladores', { n: c.disponibles, max: c.maximo })),
        el('p', { class: 'texto-ayuda' }, c.disponibles >= c.maximo ? t('stats.congeladores.lleno') : t('stats.congeladores.proximo', { faltan: c.cada - c.progreso })),
        el('p', { class: 'texto-ayuda' }, t('stats.congeladores.ayuda')),
      ),
    ),
  );
}

function formCantidad(ctx, h, fecha, log, cerrar) {
  const idEntrada = `valor-${h.id}`;
  const error = el('p', { class: 'error-campo', role: 'alert', hidden: true });
  const entrada = el('input', {
    class: 'entrada entrada--numero', id: idEntrada, name: 'valor', type: 'text',
    inputmode: 'decimal', autocomplete: 'off', enterkeyhint: 'done',
    value: log?.estado === 'registrado' ? numCampo(log.valor) : '',
    placeholder: h.meta.min !== null ? num(h.meta.min) : '0',
    'data-autofoco': '',
  });
  const form = el('form', { class: 'form', novalidate: true },
    el('div', { class: 'campo' },
      el('label', { class: 'campo__etiqueta', for: idEntrada }, h.unidad ? `${t('detalle.valor')} (${h.unidad})` : t('detalle.valor')),
      entrada,
      error,
    ),
    el('button', { class: 'tv-boton tv-boton--principal tv-boton--ancho', type: 'submit' }, t('detalle.guardar')),
  );
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const texto = entrada.value.trim();
    if (texto === '') { ctx.quitarLog(h.id, fecha); cerrar(); return; }
    const r = ctx.fijarValor(h.id, fecha, texto);
    if (r?.error) {
      error.textContent = t(r.error);
      error.hidden = false;
      entrada.setAttribute('aria-invalid', 'true');
      entrada.focus();
      return;
    }
    cerrar();
  });
  return form;
}

function pasoVeces(ctx, h, fecha, log, redibujar) {
  const valor = log?.estado === 'registrado' ? log.valor : 0;
  const cambiar = (n) => { ctx.fijarValor(h.id, fecha, String(Math.max(0, n)), { silencioso: true }); redibujar(); };
  return el('div', { class: 'paso-valor' },
    el('button', { class: 'tv-boton--icono tv-boton--secundario', type: 'button', aria: { label: t('detalle.menos') }, disabled: valor <= 0, onclick: () => cambiar(valor - 1), 'data-autofoco': '' }, icono('menos')),
    el('output', { class: 'paso-valor__numero', aria: { live: 'polite' } }, `${valor}/${h.vecesPorDia}`),
    el('button', { class: 'tv-boton--icono tv-boton--redondo', type: 'button', aria: { label: t('detalle.mas') }, onclick: () => cambiar(valor + 1) }, icono('agregar')),
  );
}

function opcionEstado(ctx, h, fecha, estado, actual, cerrar, clave) {
  const activo = actual === estado;
  return el('button', {
    class: 'opcion-estado', type: 'button', aria: { pressed: activo ? 'true' : 'false' },
    onclick: () => {
      if (activo) ctx.quitarLog(h.id, fecha);
      else ctx.fijarEstado(h.id, fecha, estado);
      cerrar();
    },
  },
    el('span', { class: 'tv-check', data: { estado } }, icono(estado)),
    el('span', { class: 'opcion-estado__texto' },
      el('span', { class: 'opcion-estado__titulo' }, t(`detalle.${clave}`)),
      el('span', { class: 'opcion-estado__ayuda' }, t(`detalle.${clave}.ayuda`)),
    ),
  );
}

/** Nota del día: qué ayudó o qué lo hizo difícil. Se guarda con el registro. */
function formNota(ctx, h, fecha, log) {
  const id = `nota-${h.id}`;
  const area = el('textarea', { class: 'entrada entrada--area', id, name: 'nota', rows: '3', maxlength: '500', placeholder: t('nota.ph') });
  area.value = log?.nota || '';
  const estado = el('p', { class: 'texto-ayuda', aria: { live: 'polite' } });
  const form = el('form', { class: 'form', novalidate: true },
    el('div', { class: 'campo' }, el('label', { class: 'campo__etiqueta', for: id }, t('nota.titulo')), area),
    el('button', { class: 'tv-boton tv-boton--secundario', type: 'submit' }, t('nota.guardar')),
    estado,
  );
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    if (ctx.fijarNota(h.id, fecha, area.value)) estado.textContent = t('nota.guardada');
  });
  return el('details', { class: 'mas', open: log?.nota ? true : null }, el('summary', {}, t('nota.titulo')), el('div', { class: 'campos' }, form));
}

function formPausa(ctx, h, cerrar) {
  const hoy = ctx.modelo.hoy();
  const id = `pausa-${h.id}`;
  const entrada = el('input', { class: 'entrada', type: 'date', id, min: hoy, value: sumarDias(hoy, 7) });
  const form = el('form', { class: 'form', novalidate: true },
    el('div', { class: 'campo' },
      el('label', { class: 'campo__etiqueta', for: id }, t('detalle.pausarHasta')),
      entrada,
    ),
    el('button', { class: 'tv-boton tv-boton--secundario tv-boton--ancho', type: 'submit' }, icono('pausa'), t('detalle.pausarConfirmar')),
  );
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    if (!esFechaValida(entrada.value) || entrada.value < hoy) { entrada.setAttribute('aria-invalid', 'true'); return; }
    ctx.pausar(h.id, entrada.value);
    cerrar();
  });
  return el('details', { class: 'mas' }, el('summary', {}, t('detalle.pausar')), el('div', { class: 'campos' }, form));
}
