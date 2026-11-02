// vistas/editor.js — Crear y editar hábitos.
// Lo esencial a la vista (nombre, ícono, tipo, frecuencia, momento);
// lo demás en "Más opciones" para no abrumar.

import { el, icono, iconoHabito } from '../dom.js';
import { t } from '../textos.js';
import { COLORES, BLOQUES } from '../esquema.js';
import { abrirHoja } from '../ui.js';
import { numCampo } from '../formato.js';

const ICONOS = ['🌱', '💧', '📖', '🚶', '🏃', '🧘', '💪', '🥗', '😴', '🦷', '💊', '✍️', '🎸', '🧹', '☀️', '📵'];

let secuencia = 0;

export function abrirEditor(ctx, id = null, plantilla = null) {
  const { modelo } = ctx;
  const h = id ? modelo.habito(id) : null;
  const n = ++secuencia;
  const uid = (s) => `ed${n}-${s}`;

  // Valores iniciales: hábito existente, idea elegida o vacío.
  const v = h ? {
    nombre: h.nombre, icono: h.icono, color: h.color, tipo: h.tipo, unidad: h.unidad,
    metaModo: h.meta.min !== null && h.meta.max !== null ? 'rango' : h.meta.min !== null ? 'min' : h.meta.max !== null ? 'max' : 'libre',
    metaMin: h.meta.min, metaMax: h.meta.max, vecesPorDia: h.vecesPorDia,
    frecuencia: h.frecuencia, bloque: h.bloque, identidad: h.identidad, creado: h.creado,
    privado: h.privado, horas: modelo.recordatoriosDe(h.id),
  } : {
    nombre: plantilla?.nombre || '', icono: plantilla?.icono || '🌱', color: plantilla?.color || 'pino',
    tipo: plantilla?.tipo || 'si_no', unidad: plantilla?.unidad || '',
    metaModo: plantilla?.min ? 'min' : 'min', metaMin: plantilla?.min ?? null, metaMax: null,
    vecesPorDia: plantilla?.veces || 1, frecuencia: { tipo: 'diaria' }, bloque: plantilla?.bloque || 'dia',
    identidad: '', creado: modelo.hoy(), privado: false, horas: [],
  };

  abrirHoja({
    titulo: t(h ? 'editor.editar' : 'editor.nuevo'),
    etiqueta: 'editor',
    contenido: (cerrar) => formulario(ctx, h, v, uid, cerrar),
  });
}

/* ---------- Piezas del formulario ---------- */

function radios(nombre, opciones, actual, { clase = '', etiqueta, idLeyenda } = {}) {
  return el('fieldset', { class: `segmentos ${clase}`.trim() },
    etiqueta ? el('legend', { class: 'campo__etiqueta', id: idLeyenda }, etiqueta) : null,
    opciones.map(([valor, texto, extra = {}]) => el('label', { class: `segmento ${extra.clase || ''}`.trim() },
      el('input', { type: 'radio', name: nombre, value: valor, checked: String(actual) === String(valor), aria: extra.aria }),
      el('span', {}, texto),
    )),
  );
}

function paso(nombre, valor, min, max, etiqueta, id) {
  const salida = el('output', { id, aria: { live: 'polite' } }, String(valor));
  const oculto = el('input', { type: 'hidden', name: nombre, value: String(valor) });
  const fijar = (x) => {
    const n = Math.min(Math.max(x, min), max);
    oculto.value = String(n);
    salida.textContent = String(n);
    menos.disabled = n <= min;
    mas.disabled = n >= max;
  };
  const menos = el('button', { class: 'tv-boton--icono', type: 'button', aria: { label: `${etiqueta}: menos` }, onclick: () => fijar(Number(oculto.value) - 1) }, icono('menos'));
  const mas = el('button', { class: 'tv-boton--icono', type: 'button', aria: { label: `${etiqueta}: más` }, onclick: () => fijar(Number(oculto.value) + 1) }, icono('agregar'));
  fijar(valor);
  return el('div', { class: 'campo' },
    el('span', { class: 'campo__etiqueta', id: `${id}-et` }, etiqueta),
    el('div', { class: 'paso', role: 'group', aria: { labelledby: `${id}-et` } }, menos, salida, oculto, mas),
  );
}

function campoTexto({ id, etiqueta, nombre, valor, ph, max, extra = {}, ayuda }) {
  return el('div', { class: 'campo' },
    el('label', { class: 'campo__etiqueta', for: id }, etiqueta),
    el('input', { class: 'entrada', id, name: nombre, type: 'text', value: valor ?? '', placeholder: ph, maxlength: max, autocomplete: 'off', ...extra }),
    ayuda ? el('p', { class: 'texto-ayuda' }, ayuda) : null,
  );
}

function formulario(ctx, h, v, uid, cerrar) {
  const { modelo } = ctx;
  const error = el('p', { class: 'error-campo', role: 'alert', hidden: true });
  const diasCortos = t('dias.corto');
  const diasLargos = t('dias.largo');
  const iconoPropio = !ICONOS.includes(v.icono) ? v.icono : '';

  const nombre = campoTexto({ id: uid('nombre'), etiqueta: t('editor.nombre'), nombre: 'nombre', valor: v.nombre, ph: t('editor.nombre.ph'), max: 60, extra: { required: true, enterkeyhint: 'next', ...(h ? {} : { 'data-autofoco': '' }) } });

  const iconos = el('div', { class: 'campo' },
    el('span', { class: 'campo__etiqueta', id: uid('icono-et') }, t('editor.icono')),
    el('div', { class: 'iconos', role: 'radiogroup', aria: { labelledby: uid('icono-et') } },
      ICONOS.map((i, n) => el('label', { class: 'segmento' },
        el('input', { type: 'radio', name: 'iconoLista', value: i, checked: !iconoPropio && v.icono === i, aria: { label: t('editor.iconos')[n] } }),
        el('span', { aria: { hidden: 'true' } }, iconoHabito(i))))),
    campoTexto({ id: uid('icono-otro'), etiqueta: t('editor.icono.otro'), nombre: 'iconoOtro', valor: iconoPropio, ph: '', max: 16, extra: { class: 'entrada entrada--corta' } }),
  );

  const colores = el('fieldset', { class: 'segmentos colores' },
    el('legend', { class: 'campo__etiqueta' }, t('editor.color')),
    COLORES.map((c) => el('label', { class: `segmento color-${c}` },
      el('input', { type: 'radio', name: 'color', value: c, checked: v.color === c, aria: { label: c } }),
      el('span', {}))),
  );

  const tipo = radios('tipo', [['si_no', t('tipo.si_no')], ['cantidad', t('tipo.cantidad')]], v.tipo, { etiqueta: t('editor.tipo') });

  const seccionSiNo = el('div', { class: 'form', data: { seccion: 'si_no' } },
    paso('vecesPorDia', v.vecesPorDia, 1, 50, t('editor.veces'), uid('veces')));

  const metaMin = campoTexto({ id: uid('min'), etiqueta: t('editor.metaMin'), nombre: 'metaMin', valor: numCampo(v.metaMin), ph: '20', max: 12, extra: { inputmode: 'decimal', class: 'entrada entrada--corta entrada--numero' } });
  const metaMax = campoTexto({ id: uid('max'), etiqueta: t('editor.metaMax'), nombre: 'metaMax', valor: numCampo(v.metaMax), ph: '2', max: 12, extra: { inputmode: 'decimal', class: 'entrada entrada--corta entrada--numero' } });
  const seccionCantidad = el('div', { class: 'form', data: { seccion: 'cantidad' } },
    campoTexto({ id: uid('unidad'), etiqueta: t('editor.unidad'), nombre: 'unidad', valor: v.unidad, ph: t('editor.unidad.ph'), max: 16 }),
    radios('metaModo', [['min', t('meta.min')], ['max', t('meta.max')], ['rango', t('meta.rango')], ['libre', t('meta.libre')]], v.metaModo, { etiqueta: t('editor.meta') }),
    el('div', { class: 'fila-campos' }, metaMin, metaMax),
  );

  const f = v.frecuencia;
  const frecuencia = radios('frecuencia', FREC.map((k) => [k, t(`frec.${k}`)]), f.tipo, { etiqueta: t('editor.frecuencia') });
  const seccionDias = el('fieldset', { class: 'segmentos segmentos--dias', data: { seccion: 'dias_fijos' } },
    el('legend', { class: 'campo__etiqueta' }, t('editor.dias')),
    diasCortos.map((d, i) => el('label', { class: 'segmento' },
      el('input', { type: 'checkbox', name: 'dias', value: String(i), checked: f.tipo === 'dias_fijos' ? f.dias.includes(i) : i < 5, aria: { label: diasLargos[i] } }),
      el('span', { aria: { hidden: 'true' } }, d))),
  );
  const seccionSemanal = el('div', { data: { seccion: 'semanal_n' } }, paso('nSemana', f.tipo === 'semanal_n' ? f.n : 3, 1, 7, t('editor.vecesSemana'), uid('nsem')));
  const seccionCada = el('div', { data: { seccion: 'cada_n_dias' } },
    campoTexto({ id: uid('cada'), etiqueta: t('editor.cadaN'), nombre: 'nCada', valor: f.tipo === 'cada_n_dias' ? String(f.n) : '2', ph: '2', max: 4, extra: { inputmode: 'numeric', class: 'entrada entrada--corta entrada--numero' } }));

  const bloque = radios('bloque', BLOQUES.map((b) => [b, t(`bloque.${b}`)]), v.bloque, { etiqueta: t('editor.bloque') });

  // Recordatorios: hasta 5 horas por hábito.
  const listaHoras = el('div', { class: 'horas' });
  const agregarHora = (valor = '') => {
    if (listaHoras.children.length >= 5) return;
    const id = uid(`hora-${listaHoras.children.length}-${Math.random().toString(36).slice(2, 6)}`);
    const entrada = el('input', { class: 'entrada entrada--corta', type: 'time', id, name: 'hora', value: valor, aria: { label: t('recordatorios.editor') } });
    const fila = el('div', { class: 'hora' }, entrada,
      el('button', { class: 'tv-boton--icono', type: 'button', aria: { label: t('recordatorios.quitar', { hora: valor || '' }) }, onclick: () => { fila.remove(); botonHora.disabled = false; } }, icono('cerrar', 'tv-icono--sm')));
    listaHoras.append(fila);
    botonHora.disabled = listaHoras.children.length >= 5;
    return entrada;
  };
  const botonHora = el('button', { class: 'tv-boton tv-boton--sutil', type: 'button', onclick: () => agregarHora()?.focus() }, icono('campana', 'tv-icono--sm'), t('recordatorios.agregar'));
  for (const hh of v.horas) agregarHora(hh);
  const seccionHoras = el('fieldset', { class: 'segmentos segmentos--columna' },
    el('legend', { class: 'campo__etiqueta' }, t('recordatorios.editor')), listaHoras, botonHora,
    el('p', { class: 'texto-ayuda' }, t('recordatorios.max')));

  const tienePin = Boolean(modelo.config.pinHash);
  const idPrivado = uid('privado');
  const privado = el('div', { class: 'campo' },
    el('label', { class: 'interruptor', for: idPrivado },
      el('span', {}, icono('candado', 'tv-icono--sm'), ' ', t('privado.etiqueta')),
      el('input', { type: 'checkbox', role: 'switch', id: idPrivado, name: 'privado', checked: v.privado && tienePin, disabled: !tienePin })),
    el('p', { class: 'texto-ayuda' }, t(tienePin ? 'privado.ayuda' : 'privado.sinPin')));

  const mas = el('details', { class: 'mas', open: h && (v.identidad || v.creado < modelo.hoy() || v.horas.length || v.privado) ? true : null },
    el('summary', {}, t('editor.mas')),
    el('div', { class: 'campos' },
      seccionHoras,
      colores,
      campoTexto({ id: uid('identidad'), etiqueta: t('editor.identidad'), nombre: 'identidad', valor: v.identidad, ph: t('editor.identidad.ph'), max: 120, ayuda: t('editor.identidad.ayuda') }),
      el('div', { class: 'campo' },
        el('label', { class: 'campo__etiqueta', for: uid('inicio') }, t('editor.inicio')),
        el('input', { class: 'entrada', id: uid('inicio'), name: 'creado', type: 'date', value: v.creado, max: modelo.hoy() }),
        el('p', { class: 'texto-ayuda' }, t('editor.inicio.ayuda')),
      ),
      privado,
    ),
  );

  const acciones = el('div', { class: 'tv-hoja__acciones' },
    el('button', { class: 'tv-boton tv-boton--principal tv-boton--ancho', type: 'submit' }, t('editor.guardar')),
    h && !h.archivado ? el('button', {
      class: 'tv-boton tv-boton--sutil', type: 'button',
      onclick: () => { cerrar(); ctx.archivar(h.id); },
    }, t('editor.archivar')) : null,
  );

  const form = el('form', { class: 'form', novalidate: true },
    nombre, iconos, tipo, seccionSiNo, seccionCantidad, frecuencia, seccionDias, seccionSemanal, seccionCada, bloque, mas, error, acciones);

  // Mostrar solo las secciones que aplican.
  const actualizar = () => {
    const tipoSel = form.elements.tipo.value;
    seccionSiNo.hidden = tipoSel !== 'si_no';
    seccionCantidad.hidden = tipoSel !== 'cantidad';
    const modo = form.elements.metaModo.value;
    metaMin.hidden = !(modo === 'min' || modo === 'rango');
    metaMax.hidden = !(modo === 'max' || modo === 'rango');
    const fr = form.elements.frecuencia.value;
    seccionDias.hidden = fr !== 'dias_fijos';
    seccionSemanal.hidden = fr !== 'semanal_n';
    seccionCada.hidden = fr !== 'cada_n_dias';
  };
  form.addEventListener('change', (e) => {
    if (e.target.name === 'iconoLista') form.elements.iconoOtro.value = '';
    actualizar();
  });
  actualizar();

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    for (const x of form.querySelectorAll('[aria-invalid]')) x.removeAttribute('aria-invalid');
    const E = form.elements;
    const fr = E.frecuencia.value;
    const entrada = {
      nombre: E.nombre.value,
      icono: E.iconoOtro.value.trim() || E.iconoLista.value || '🌱',
      color: E.color.value,
      tipo: E.tipo.value,
      unidad: E.unidad.value,
      metaModo: E.metaModo.value,
      metaMin: E.metaMin.value.trim(),
      metaMax: E.metaMax.value.trim(),
      vecesPorDia: E.vecesPorDia.value,
      frecuencia: fr === 'dias_fijos'
        ? { tipo: fr, dias: [...form.querySelectorAll('input[name="dias"]:checked')].map((x) => Number(x.value)) }
        : fr === 'semanal_n' ? { tipo: fr, n: Number(E.nSemana.value) }
        : fr === 'cada_n_dias' ? { tipo: fr, n: Number(E.nCada.value) }
        : { tipo: 'diaria' },
      bloque: E.bloque.value,
      identidad: E.identidad.value,
      creado: E.creado.value,
      privado: Boolean(E.privado?.checked),
    };
    if (fr === 'cada_n_dias' && !(Number.isInteger(entrada.frecuencia.n) && entrada.frecuencia.n >= 1 && entrada.frecuencia.n <= 3650)) {
      return mostrarError(form, error, 'editor.error.numero', E.nCada);
    }
    const r = h ? modelo.editarHabito(h.id, entrada) : modelo.crearHabito(entrada);
    if (!r.ok) {
      const campo = r.campo === 'nombre' ? E.nombre
        : r.campo === 'meta' ? (E.metaMin.closest('.campo').hidden ? E.metaMax : E.metaMin)
        : r.campo === 'dias' ? form.querySelector('input[name="dias"]') : null;
      return mostrarError(form, error, r.error, campo);
    }
    const horas = [...form.querySelectorAll('input[name="hora"]')].map((x) => x.value).filter(Boolean);
    modelo.fijarRecordatorios(r.habito.id, horas);
    cerrar();
    ctx.alGuardarHabito(r.habito, !h);
  });

  return form;
}

const FREC = ['diaria', 'dias_fijos', 'semanal_n', 'cada_n_dias'];

function mostrarError(form, error, clave, campo) {
  error.textContent = t(clave);
  error.hidden = false;
  if (campo) {
    campo.setAttribute('aria-invalid', 'true');
    campo.focus();
  }
}
