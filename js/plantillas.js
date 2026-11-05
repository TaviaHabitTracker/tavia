// plantillas.js — Módulo 12: Plantillas y rutinas guiadas.
// Forma del catálogo (data/plantillas_tavia.json), validación y conversión a
// hábitos de Tavia. Sin DOM y sin red: se puede probar en Node.
//
// Todo lo que entra (catálogo de la app o archivo importado) pasa por aquí.
// Lo inválido se descarta con su motivo; nunca se lanza un error hacia afuera.

import { BLOQUES, COLORES, LIMITES as LIM_APP, sanearFrecuencia } from './esquema.js';

export const FORMATO = 1;

export const MOMENTOS = ['manana', 'tarde', 'noche', 'flexible'];
export const NIVELES = ['suave', 'normal'];
export const CATEGORIAS = [
  'manana', 'noche', 'estudio', 'movimiento', 'calma', 'hogar', 'finanzas', 'trabajo', 'cuidado', 'especiales',
];
/** Categorías que siempre muestran «escucha a tu cuerpo…» (el texto vive en textos.js). */
export const CATEGORIAS_CON_AVISO = ['noche', 'movimiento', 'calma'];
/** Categorías que tocan bienestar emocional o salud: sus rutinas van marcadas sensibles. */
export const CATEGORIAS_SENSIBLES = ['noche', 'calma'];

export const TIPOS_PLANTILLA = ['check', 'cantidad', 'tiempo'];
export const MODOS_META = ['al_menos', 'como_maximo', 'libre'];
export const DURACIONES_RETO = [14, 21, 30];
export const FILTROS_MINUTOS = [5, 15, 30]; // el filtro es «hasta N»; la rutina guarda sus minutos reales

/**
 * Íconos permitidos en plantillas. Son emojis con equivalente SVG propio (dom.js).
 * Quedan fuera a propósito 💊 (medicamentos) y 🥗 (comida/dieta).
 * Los marcados «nuevo» reciben su SVG en P2/P3; mientras, se ven como emoji.
 */
export const ICONOS_PLANTILLA = [
  '🌱', '💧', '📖', '🚶', '🏃', '🧘', '💪', '😴', '🦷', '✍️', '🎸', '🧹', '☀️', '📵',
  '💰', '🏠', '💼', '🤍', '🌬️', '🗣️', '🛒', // nuevo
];

export const LIMITES = {
  id: 48, nombre: 48, descripcion: 120, etiqueta: 24, etiquetas: 8,
  pregunta: 90, versionMinima: 90, nota: 140, identidad: LIM_APP.identidad,
  habitosPorRutina: 12, escalera: 8, hitos: 6, textoCierre: 200,
  rutinas: 200, retos: 60, minutos: 120,
  bytesImportar: 64 * 1024, // archivo de rutina propia
};

const CLAVES_PELIGROSAS = new Set(['__proto__', 'constructor', 'prototype']);

/* ---------- Ayudantes ---------- */

const esObjeto = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

function texto(v, max) {
  if (typeof v !== 'string') return '';
  return v.replace(/[\u0000-\u001F\u007F\u2028\u2029]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
}

const idValido = (v) => typeof v === 'string' && /^[a-z0-9][a-z0-9-]{0,47}$/.test(v);

const enteroEn = (v, min, max) => (Number.isInteger(v) && v >= min && v <= max ? v : null);

const horaValida = (v) => typeof v === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(v);

/** ¿Hay alguna clave peligrosa en cualquier nivel? (además de lo que JSON.parse ya crea como propia) */
export function tieneClavePeligrosa(v, prof = 0) {
  if (prof > 12) return true; // anidación absurda: se trata como peligrosa
  if (Array.isArray(v)) return v.some((x) => tieneClavePeligrosa(x, prof + 1));
  if (v !== null && typeof v === 'object') {
    for (const k of Object.keys(v)) {
      if (CLAVES_PELIGROSAS.has(k)) return true;
      if (tieneClavePeligrosa(v[k], prof + 1)) return true;
    }
  }
  return false;
}

/* ---------- Hábito de plantilla ---------- */

/**
 * Frecuencia: usa las que la app ya soporta. Si no calza, toma la más cercana y avisa.
 * Devuelve { frecuencia, aproximada }.
 */
export function frecuenciaPlantilla(f) {
  if (!esObjeto(f)) return { frecuencia: { tipo: 'diaria' }, aproximada: f !== undefined };
  const s = sanearFrecuencia(f);
  let aproximada = s.tipo !== f.tipo;
  if (f.tipo === 'semanal_n' && f.n !== s.n) aproximada = true;
  if (f.tipo === 'cada_n_dias' && f.n !== s.n) aproximada = true;
  if (f.tipo === 'dias_fijos' && s.tipo === 'dias_fijos' && s.dias.length !== (f.dias || []).length) aproximada = true;
  // Atajos frecuentes que no existen en la app:
  if (f.tipo === 'semanal' || f.tipo === 'una_vez_semana') return { frecuencia: { tipo: 'semanal_n', n: 1 }, aproximada: true };
  if (f.tipo === 'dias_habiles' || f.tipo === 'lunes_a_viernes') return { frecuencia: { tipo: 'dias_fijos', dias: [1, 2, 3, 4, 5] }, aproximada: true };
  return { frecuencia: s, aproximada };
}

function sanearMetaPlantilla(tipo, m) {
  if (tipo === 'check') return { modo: 'libre', valor: null, unidad: '' };
  const unidad = tipo === 'tiempo' ? 'min' : texto(m?.unidad, LIM_APP.unidad);
  if (!esObjeto(m) || !MODOS_META.includes(m.modo) || m.modo === 'libre') return { modo: 'libre', valor: null, unidad };
  const valor = typeof m.valor === 'number' && Number.isFinite(m.valor) && m.valor > 0 && m.valor <= 10_000 ? Math.round(m.valor * 100) / 100 : null;
  if (valor === null) return { modo: 'libre', valor: null, unidad };
  return { modo: m.modo, valor, unidad };
}

/** Sanea un hábito de plantilla. Devuelve { habito, motivos[], avisos[] } (habito = null si no sirve). */
export function sanearHabitoPlantilla(h) {
  const motivos = [];
  const avisos = [];
  if (!esObjeto(h)) return { habito: null, motivos: ['habito.no_es_objeto'], avisos };
  const nombre = texto(h.nombre, LIMITES.nombre);
  if (!nombre) motivos.push('habito.sin_nombre');
  const versionMinima = texto(h.versionMinima, LIMITES.versionMinima);
  if (!versionMinima) motivos.push('habito.sin_version_minima');
  const tipo = TIPOS_PLANTILLA.includes(h.tipo) ? h.tipo : null;
  if (!tipo) motivos.push('habito.tipo');
  if (motivos.length) return { habito: null, motivos, avisos };

  let icono = typeof h.icono === 'string' ? h.icono : '';
  if (!ICONOS_PLANTILLA.includes(icono)) { if (icono) avisos.push('habito.icono_reemplazado'); icono = '🌱'; }
  const { frecuencia, aproximada } = frecuenciaPlantilla(h.frecuencia);
  if (aproximada) avisos.push('habito.frecuencia_aproximada');

  return {
    habito: {
      nombre,
      icono,
      tipo,
      meta: sanearMetaPlantilla(tipo, h.meta),
      frecuencia,
      bloque: BLOQUES.includes(h.bloque) ? h.bloque : 'dia',
      horaSugerida: horaValida(h.horaSugerida) ? h.horaSugerida : null,
      identidad: texto(h.identidad, LIMITES.identidad),
      pregunta: texto(h.pregunta, LIMITES.pregunta),
      versionMinima,
      nota: texto(h.nota, LIMITES.nota),
    },
    motivos,
    avisos,
  };
}

/* ---------- Rutina ---------- */

function sanearEtiquetas(e) {
  if (!Array.isArray(e)) return [];
  return [...new Set(e.map((x) => texto(x, LIMITES.etiqueta).toLowerCase()).filter(Boolean))].slice(0, LIMITES.etiquetas);
}

function sanearEscalera(e) {
  if (!Array.isArray(e)) return [];
  const pasos = e.map((x) => enteroEn(x, 1, LIMITES.minutos)).filter((x) => x !== null).slice(0, LIMITES.escalera);
  // Siempre ascendente y sin repetidos; si no, se descarta entera (es solo una sugerencia).
  for (let i = 1; i < pasos.length; i++) if (pasos[i] <= pasos[i - 1]) return [];
  return pasos;
}

/** Sanea una rutina. Devuelve { rutina | null, motivos[], avisos[] }. */
export function sanearRutina(r) {
  const motivos = [];
  const avisos = [];
  if (!esObjeto(r)) return { rutina: null, motivos: ['rutina.no_es_objeto'], avisos };
  if (!idValido(r.id)) motivos.push('rutina.id');
  const nombre = texto(r.nombre, LIMITES.nombre);
  if (!nombre) motivos.push('rutina.sin_nombre');
  if (!CATEGORIAS.includes(r.categoria)) motivos.push('rutina.categoria');
  const minutosPorDia = enteroEn(r.minutosPorDia, 1, LIMITES.minutos);
  if (minutosPorDia === null) motivos.push('rutina.minutos');
  if (!Array.isArray(r.habitos) || r.habitos.length === 0) motivos.push('rutina.sin_habitos');
  else if (r.habitos.length > LIMITES.habitosPorRutina) motivos.push('rutina.demasiados_habitos');
  if (motivos.length) return { rutina: null, motivos, avisos };

  const habitos = [];
  r.habitos.forEach((h, i) => {
    const s = sanearHabitoPlantilla(h);
    s.avisos.forEach((a) => avisos.push(`${a}#${i}`));
    if (s.habito) habitos.push(s.habito);
    else s.motivos.forEach((m) => avisos.push(`${m}#${i}`));
  });
  if (habitos.length === 0) return { rutina: null, motivos: ['rutina.sin_habitos_validos'], avisos };

  return {
    rutina: {
      id: r.id,
      nombre,
      descripcion: texto(r.descripcion, LIMITES.descripcion),
      objetivo: texto(r.objetivo, LIMITES.etiqueta).toLowerCase(),
      momento: MOMENTOS.includes(r.momento) ? r.momento : 'flexible',
      minutosPorDia,
      nivel: NIVELES.includes(r.nivel) ? r.nivel : 'suave',
      categoria: r.categoria,
      etiquetas: sanearEtiquetas(r.etiquetas),
      sensible: r.sensible === true || CATEGORIAS_SENSIBLES.includes(r.categoria),
      avisoCuerpo: r.avisoCuerpo === true || CATEGORIAS_CON_AVISO.includes(r.categoria),
      palabraGuia: texto(r.palabraGuia, 24).toLowerCase() || null,
      habitos,
      escalera: sanearEscalera(r.escalera),
    },
    motivos,
    avisos,
  };
}

/* ---------- Reto ---------- */

export function sanearReto(r) {
  const motivos = [];
  const avisos = [];
  if (!esObjeto(r)) return { reto: null, motivos: ['reto.no_es_objeto'], avisos };
  if (!idValido(r.id)) motivos.push('reto.id');
  const nombre = texto(r.nombre, LIMITES.nombre);
  if (!nombre) motivos.push('reto.sin_nombre');
  if (!DURACIONES_RETO.includes(r.duracionDias)) motivos.push('reto.duracion');
  const h = sanearHabitoPlantilla(r.habito);
  if (!h.habito) motivos.push(...h.motivos.map((m) => `reto.${m}`));
  if (motivos.length) return { reto: null, motivos, avisos };
  avisos.push(...h.avisos);

  const hitos = Array.isArray(r.hitos)
    ? [...new Set(r.hitos.filter((d) => Number.isInteger(d) && d >= 1 && d < r.duracionDias))].sort((a, b) => a - b).slice(0, LIMITES.hitos)
    : [];
  const categoria = CATEGORIAS.includes(r.categoria) ? r.categoria : 'especiales';
  return {
    reto: {
      id: r.id,
      nombre,
      descripcion: texto(r.descripcion, LIMITES.descripcion),
      duracionDias: r.duracionDias,
      categoria,
      habito: h.habito,
      hitos,
      textoCierre: texto(r.textoCierre, LIMITES.textoCierre),
      sensible: r.sensible === true || CATEGORIAS_SENSIBLES.includes(categoria),
      avisoCuerpo: r.avisoCuerpo === true || CATEGORIAS_CON_AVISO.includes(categoria),
    },
    motivos,
    avisos,
  };
}

/* ---------- Catálogo completo ---------- */

/**
 * Valida el catálogo de la app. Nunca lanza.
 * Devuelve { version, rutinas, retos, descartadas: [{ id, motivos }], avisos: [{ id, aviso }] }.
 */
export function validarCatalogo(raw) {
  const vacio = (motivo) => ({ version: 0, rutinas: [], retos: [], descartadas: [{ id: '*', motivos: [motivo] }], avisos: [] });
  if (!esObjeto(raw)) return vacio('catalogo.no_es_objeto');
  if (tieneClavePeligrosa(raw)) return vacio('catalogo.clave_peligrosa');
  if (raw.formato !== FORMATO) return vacio('catalogo.formato');

  const descartadas = [];
  const avisos = [];
  const ids = new Set();
  const recorrer = (lista, sanear, clave, max) => {
    const out = [];
    for (const x of Array.isArray(lista) ? lista.slice(0, max) : []) {
      const r = sanear(x);
      const id = esObjeto(x) && typeof x.id === 'string' ? x.id.slice(0, LIMITES.id) : '?';
      if (!r[clave]) { descartadas.push({ id, motivos: r.motivos }); continue; }
      if (ids.has(r[clave].id)) { descartadas.push({ id, motivos: ['id_repetido'] }); continue; }
      ids.add(r[clave].id);
      r.avisos.forEach((aviso) => avisos.push({ id, aviso }));
      out.push(r[clave]);
    }
    return out;
  };
  const rutinas = recorrer(raw.rutinas, sanearRutina, 'rutina', LIMITES.rutinas);
  const retos = recorrer(raw.retos, sanearReto, 'reto', LIMITES.retos);
  const version = Number.isInteger(raw.version) && raw.version > 0 ? raw.version : 0;
  return { version, rutinas, retos, descartadas, avisos };
}

/**
 * Lee un archivo de rutina propia (texto). Limita tamaño, número de hábitos y claves.
 * Devuelve { ok: true, rutina, avisos } o { ok: false, error }.
 */
export function leerArchivoRutina(textoArchivo) {
  if (typeof textoArchivo !== 'string') return { ok: false, error: 'importar.no_es_texto' };
  if (new TextEncoder().encode(textoArchivo).length > LIMITES.bytesImportar) return { ok: false, error: 'importar.muy_grande' };
  let raw;
  try { raw = JSON.parse(textoArchivo); } catch { return { ok: false, error: 'importar.no_es_json' }; }
  if (!esObjeto(raw) || raw.tipo !== 'tavia-rutina' || raw.formato !== FORMATO) return { ok: false, error: 'importar.formato' };
  if (tieneClavePeligrosa(raw)) return { ok: false, error: 'importar.clave_peligrosa' };
  if (Array.isArray(raw.rutina?.habitos) && raw.rutina.habitos.length > LIMITES.habitosPorRutina) return { ok: false, error: 'importar.demasiados_habitos' };
  const r = sanearRutina(raw.rutina);
  if (!r.rutina) return { ok: false, error: 'importar.rutina_invalida', motivos: r.motivos };
  return { ok: true, rutina: r.rutina, avisos: r.avisos };
}

/**
 * Archivo para exportar una rutina propia: solo la plantilla.
 * Sin registros, notas, fechas ni datos de la persona.
 */
export function archivoRutina(rutina) {
  const r = sanearRutina(rutina).rutina;
  if (!r) return null;
  return JSON.stringify({ tipo: 'tavia-rutina', formato: FORMATO, rutina: r }, null, 2);
}

/* ---------- De plantilla a hábito de Tavia ---------- */

/**
 * Convierte un hábito de plantilla (más lo que la persona cambió al personalizar)
 * en la entrada que espera modelo.crearHabito() / validarEntrada().
 */
export function aEntradaHabito(h, cambios = {}) {
  const tipo = h.tipo === 'check' ? 'si_no' : 'cantidad';
  const meta = cambios.meta || h.meta;
  const metaModo = meta.modo === 'al_menos' ? 'min' : meta.modo === 'como_maximo' ? 'max' : 'ninguna';
  const nombre = texto(cambios.nombre, LIM_APP.nombre) || h.nombre;
  const icono = typeof cambios.icono === 'string' && cambios.icono ? cambios.icono : h.icono;
  return {
    nombre,
    icono,
    color: COLORES.includes(cambios.color) ? cambios.color : 'pino',
    tipo,
    unidad: tipo === 'cantidad' ? (h.tipo === 'tiempo' ? 'min' : meta.unidad || h.meta.unidad) : '',
    metaModo,
    metaMin: metaModo === 'min' ? meta.valor : null,
    metaMax: metaModo === 'max' ? meta.valor : null,
    vecesPorDia: 1,
    frecuencia: cambios.frecuencia ? frecuenciaPlantilla(cambios.frecuencia).frecuencia : h.frecuencia,
    bloque: BLOQUES.includes(cambios.bloque) ? cambios.bloque : h.bloque,
    identidad: h.identidad,
  };
}
