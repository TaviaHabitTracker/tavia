// esquema.js — Forma de los datos, valores por defecto, migraciones y saneamiento.
// Todo dato que entra (desde localStorage hoy, desde un archivo importado en el M5)
// pasa por aquí antes de tocar la app: tipos, rangos, tamaños y fechas válidas.

import { esFechaValida } from './fechas.js';

export const SCHEMA_VERSION = 2;

export const COLORES = ['pino', 'lago', 'ciruela', 'arcilla', 'musgo', 'miel'];
export const BLOQUES = ['manana', 'tarde', 'noche', 'dia'];
export const TIPOS = ['si_no', 'cantidad'];
export const FRECUENCIAS = ['diaria', 'dias_fijos', 'semanal_n', 'cada_n_dias'];
// 'nota' = solo una nota del día, sin registro (no cuenta como hecho ni como fallo).
export const ESTADOS_LOG = ['registrado', 'saltado', 'descanso', 'congelado', 'nota'];
export const FINES_DE_DIA = ['00:00', '01:00', '02:00', '03:00', '04:00', '05:00', '06:00'];

export const LIMITES = {
  id: 64, nombre: 60, unidad: 16, identidad: 120, nota: 500, icono: 16,
  valorMax: 1_000_000, vecesMax: 50, cadaNMax: 3650, pausasMax: 50,
  habitos: 500, logs: 200_000,
  recordatoriosPorHabito: 5, recordatorios: 300, revisionTexto: 280, revisiones: 520,
  manifiesto: 280,
};

/** Paletas (M8). La primera es la de siempre; las demás se ganan con días registrados (ver temas.js). */
export const PALETAS = ['ambar', 'cobre', 'salvia', 'acero', 'platino'];
/** Nombres de la versión 0.8 → paletas nuevas (para no perder la elección al actualizar). */
const PALETAS_ANTES = { pino: 'ambar', arena: 'cobre', niebla: 'acero', ciruela: 'salvia', obsidiana: 'platino' };
export const TEMAS = ['auto', 'claro', 'oscuro', 'negro'];
export const MODOS_MANIFIESTO = ['pantalla', 'linea', 'no'];

export const BLOQUEOS = [0, 30, 60, 300, 900]; // segundos en segundo plano antes de pedir el PIN
export const PIN_ITERACIONES = 600_000;

export function configPorDefecto() {
  return {
    tema: 'auto',
    finDelDia: '03:00',
    hechosAlFinal: false,
    recordatorios: [], // [{ habitId, hora: 'HH:MM' }]
    notificaciones: false, // el usuario activó los avisos del navegador
    ultimoRespaldo: null, // 'YYYY-MM-DD' del último exportar
    pinHash: null,
    pinSalt: null,
    pinIter: PIN_ITERACIONES,
    bloqueoSegundos: 60,
    pinFallos: 0,
    pinEsperaHasta: 0, // marca de tiempo (ms) hasta la que no se aceptan intentos
    avisosVistos: [],
    paleta: 'ambar',
    manifiesto: '',
    manifiestoModo: 'pantalla', // pantalla breve una vez al día · línea en Hoy · no mostrar
    manifiestoVisto: null, // 'YYYY-MM-DD' del último día en que se mostró la pantalla
  };
}

export function datosVacios() {
  return { schemaVersion: SCHEMA_VERSION, habits: [], logs: [], revisiones: [], config: configPorDefecto() };
}

/* ---------- Ayudantes de saneamiento ---------- */

const esObjeto = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

function texto(v, max, porDefecto = '') {
  if (typeof v !== 'string') return porDefecto;
  // Quita caracteres de control (deja saltos de línea solo en notas).
  const limpio = v.replace(/[\u0000-\u0008\u000B-\u001F\u007F]/g, '').trim();
  return limpio.slice(0, max);
}

/** Número finito en [min, max] con hasta 2 decimales, o null. */
export function numero(v, { min = 0, max = LIMITES.valorMax } = {}) {
  if (typeof v === 'string') v = Number(v.replace(',', '.'));
  if (typeof v !== 'number' || !Number.isFinite(v)) return null;
  if (v < min || v > max) return null;
  return Math.round(v * 100) / 100;
}

function entero(v, min, max, porDefecto) {
  const n = Number(v);
  return Number.isInteger(n) && n >= min && n <= max ? n : porDefecto;
}

function idValido(v) {
  return typeof v === 'string' && v.length > 0 && v.length <= LIMITES.id && /^[\w-]+$/.test(v);
}

/* ---------- Hábito ---------- */

export function sanearFrecuencia(f) {
  if (!esObjeto(f) || !FRECUENCIAS.includes(f.tipo)) return { tipo: 'diaria' };
  if (f.tipo === 'dias_fijos') {
    const dias = Array.isArray(f.dias)
      ? [...new Set(f.dias.map(Number).filter((d) => Number.isInteger(d) && d >= 0 && d <= 6))].sort()
      : [];
    if (dias.length === 0) return { tipo: 'diaria' };
    if (dias.length === 7) return { tipo: 'diaria' };
    return { tipo: 'dias_fijos', dias };
  }
  if (f.tipo === 'semanal_n') return { tipo: 'semanal_n', n: entero(f.n, 1, 7, 3) };
  if (f.tipo === 'cada_n_dias') return { tipo: 'cada_n_dias', n: entero(f.n, 1, LIMITES.cadaNMax, 2) };
  return { tipo: 'diaria' };
}

export function sanearMeta(tipo, m) {
  if (tipo !== 'cantidad' || !esObjeto(m)) return { min: null, max: null };
  const min = m.min === null || m.min === undefined || m.min === '' ? null : numero(m.min);
  let max = m.max === null || m.max === undefined || m.max === '' ? null : numero(m.max);
  if (min !== null && max !== null && min > max) max = null;
  return { min, max };
}

function sanearPausas(p) {
  if (!Array.isArray(p)) return [];
  return p
    .filter((x) => esObjeto(x) && esFechaValida(x.desde) && esFechaValida(x.hasta) && x.desde <= x.hasta)
    .slice(0, LIMITES.pausasMax)
    .map((x) => ({ desde: x.desde, hasta: x.hasta }));
}

export function sanearHabito(h, hoy) {
  if (!esObjeto(h) || !idValido(h.id)) return null;
  const nombre = texto(h.nombre, LIMITES.nombre);
  if (!nombre) return null;
  const tipo = TIPOS.includes(h.tipo) ? h.tipo : 'si_no';
  return {
    id: h.id,
    nombre,
    icono: texto(h.icono, LIMITES.icono, '🌱') || '🌱',
    color: COLORES.includes(h.color) ? h.color : 'pino',
    tipo,
    unidad: tipo === 'cantidad' ? texto(h.unidad, LIMITES.unidad) : '',
    meta: sanearMeta(tipo, h.meta),
    vecesPorDia: tipo === 'si_no' ? entero(h.vecesPorDia, 1, LIMITES.vecesMax, 1) : 1,
    frecuencia: sanearFrecuencia(h.frecuencia),
    bloque: BLOQUES.includes(h.bloque) ? h.bloque : 'dia',
    identidad: texto(h.identidad, LIMITES.identidad),
    creado: esFechaValida(h.creado) ? h.creado : hoy,
    archivado: esFechaValida(h.archivado) ? h.archivado : null,
    privado: h.privado === true,
    pausas: sanearPausas(h.pausas),
    orden: Number.isFinite(h.orden) ? h.orden : 0,
  };
}

/* ---------- Registro (log) ---------- */

export function sanearLog(l, idsValidos) {
  if (!esObjeto(l) || !idsValidos.has(l.habitId) || !esFechaValida(l.fecha)) return null;
  const estado = ESTADOS_LOG.includes(l.estado) ? l.estado : null;
  if (!estado) return null;
  const valor = estado === 'registrado' ? numero(l.valor) : null;
  if (estado === 'registrado' && valor === null) return null;
  const log = { habitId: l.habitId, fecha: l.fecha, estado, valor };
  if (typeof l.registradoEn === 'string' && /^\d{2}:\d{2}$/.test(l.registradoEn)) log.registradoEn = l.registradoEn;
  // Congelado: día en que se gastó el congelador (puede ser posterior al día cubierto).
  if (estado === 'congelado' && esFechaValida(l.usadoEn) && l.usadoEn >= l.fecha) log.usadoEn = l.usadoEn;
  const nota = typeof l.nota === 'string' ? l.nota.replace(/[\u0000-\u0008\u000B-\u001F\u007F]/g, '').slice(0, LIMITES.nota) : '';
  if (nota.trim()) log.nota = nota;
  if (estado === 'nota' && !log.nota) return null; // una "nota" sin texto no es nada
  return log;
}

/* ---------- Configuración ---------- */

export function sanearConfig(c, idsValidos = null) {
  const base = configPorDefecto();
  if (!esObjeto(c)) return base;
  return {
    tema: TEMAS.includes(c.tema) ? c.tema : base.tema,
    finDelDia: FINES_DE_DIA.includes(c.finDelDia) ? c.finDelDia : base.finDelDia,
    hechosAlFinal: c.hechosAlFinal === true,
    recordatorios: sanearRecordatorios(c.recordatorios, idsValidos),
    notificaciones: c.notificaciones === true,
    ultimoRespaldo: esFechaValida(c.ultimoRespaldo) ? c.ultimoRespaldo : null,
    pinHash: typeof c.pinHash === 'string' && /^[A-Za-z0-9+/=]{20,100}$/.test(c.pinHash) ? c.pinHash : null,
    pinSalt: typeof c.pinSalt === 'string' && /^[A-Za-z0-9+/=]{16,100}$/.test(c.pinSalt) ? c.pinSalt : null,
    pinIter: Number.isInteger(c.pinIter) && c.pinIter >= 100_000 && c.pinIter <= 10_000_000 ? c.pinIter : PIN_ITERACIONES,
    bloqueoSegundos: BLOQUEOS.includes(c.bloqueoSegundos) ? c.bloqueoSegundos : base.bloqueoSegundos,
    pinFallos: Number.isInteger(c.pinFallos) && c.pinFallos >= 0 && c.pinFallos < 1000 ? c.pinFallos : 0,
    pinEsperaHasta: Number.isFinite(c.pinEsperaHasta) && c.pinEsperaHasta > 0 ? c.pinEsperaHasta : 0,
    avisosVistos: Array.isArray(c.avisosVistos)
      ? [...new Set(c.avisosVistos.filter((x) => typeof x === 'string' && /^[\w.-]{1,40}$/.test(x)))].slice(0, 50)
      : [],
    paleta: PALETAS.includes(c.paleta) ? c.paleta : PALETAS_ANTES[c.paleta] || base.paleta,
    manifiesto: texto(c.manifiesto, LIMITES.manifiesto).replace(/\n{3,}/g, '\n\n'),
    manifiestoModo: MODOS_MANIFIESTO.includes(c.manifiestoModo) ? c.manifiestoModo : base.manifiestoModo,
    manifiestoVisto: esFechaValida(c.manifiestoVisto) ? c.manifiestoVisto : null,
  };
}

/** Recordatorios: hora válida, hábito existente, sin repetidos, con tope por hábito. */
export function sanearRecordatorios(r, idsValidos) {
  if (!Array.isArray(r)) return [];
  const vistos = new Set();
  const porHabito = new Map();
  const out = [];
  for (const x of r) {
    if (!esObjeto(x) || typeof x.hora !== 'string' || !/^([01]\d|2[0-3]):[0-5]\d$/.test(x.hora)) continue;
    if (!idValido(x.habitId) || (idsValidos && !idsValidos.has(x.habitId))) continue;
    const clave = `${x.habitId}|${x.hora}`;
    const n = porHabito.get(x.habitId) || 0;
    if (vistos.has(clave) || n >= LIMITES.recordatoriosPorHabito) continue;
    vistos.add(clave);
    porHabito.set(x.habitId, n + 1);
    out.push({ habitId: x.habitId, hora: x.hora });
    if (out.length >= LIMITES.recordatorios) break;
  }
  return out.sort((a, b) => (a.hora < b.hora ? -1 : a.hora > b.hora ? 1 : 0));
}

/** Revisión semanal: una por semana (fecha del lunes), tres textos cortos. */
export function sanearRevisiones(r) {
  if (!Array.isArray(r)) return [];
  const porSemana = new Map();
  for (const x of r.slice(0, LIMITES.revisiones * 2)) {
    if (!esObjeto(x) || !esFechaValida(x.semana)) continue;
    const [a, m, d] = x.semana.split('-').map(Number);
    if (new Date(a, m - 1, d, 12).getDay() !== 1) continue; // debe ser lunes
    const rev = {
      semana: x.semana,
      funciono: texto(x.funciono, LIMITES.revisionTexto),
      noFunciono: texto(x.noFunciono, LIMITES.revisionTexto),
      ajuste: texto(x.ajuste, LIMITES.revisionTexto),
    };
    if (rev.funciono || rev.noFunciono || rev.ajuste) porSemana.set(rev.semana, rev);
  }
  return [...porSemana.values()].sort((a, b) => (a.semana < b.semana ? -1 : 1)).slice(-LIMITES.revisiones);
}

/* ---------- Migraciones ---------- */

/**
 * Lleva datos de cualquier versión anterior a SCHEMA_VERSION.
 * Cada paso es una función pura vN → vN+1. v1 → v2 agregó las revisiones semanales.
 * Para la v3: escribir pasos[2] = (d) => ({ ...d, schemaVersion: 3, … }).
 */
const pasos = {
  0: (d) => ({ ...d, schemaVersion: 1 }), // datos sin versión: se tratan como v1
  1: (d) => ({ ...d, schemaVersion: 2, revisiones: Array.isArray(d.revisiones) ? d.revisiones : [] }), // M7: revisión semanal
};

export function migrate(raw) {
  let d = esObjeto(raw) ? raw : {};
  let v = Number.isInteger(d.schemaVersion) ? d.schemaVersion : 0;
  if (v > SCHEMA_VERSION) return { datos: d, futuro: true };
  while (v < SCHEMA_VERSION) {
    const paso = pasos[v];
    if (!paso) break;
    d = paso(d);
    v = d.schemaVersion;
  }
  return { datos: d, futuro: false };
}

/** Migra y sanea un objeto completo. Devuelve también cuántos elementos se descartaron. */
export function sanearDatos(raw, hoy) {
  const { datos: d, futuro } = migrate(raw);
  const habitsIn = Array.isArray(d.habits) ? d.habits.slice(0, LIMITES.habitos) : [];
  const vistos = new Set();
  const habits = [];
  for (const h of habitsIn) {
    const s = sanearHabito(h, hoy);
    if (s && !vistos.has(s.id)) { vistos.add(s.id); habits.push(s); }
  }
  const logsIn = Array.isArray(d.logs) ? d.logs.slice(0, LIMITES.logs) : [];
  const porClave = new Map(); // un registro por hábito y día: gana el último
  for (const l of logsIn) {
    const s = sanearLog(l, vistos);
    if (s) porClave.set(`${s.habitId}|${s.fecha}`, s);
  }
  const datos = {
    schemaVersion: futuro ? d.schemaVersion : SCHEMA_VERSION,
    habits,
    logs: [...porClave.values()],
    revisiones: sanearRevisiones(d.revisiones),
    config: sanearConfig(d.config, vistos),
  };
  const descartados = (habitsIn.length - habits.length) + (logsIn.length - porClave.size);
  return { datos, futuro, descartados };
}
