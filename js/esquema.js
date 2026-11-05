// esquema.js — Forma de los datos, valores por defecto, migraciones y saneamiento.
// Todo dato que entra (desde localStorage hoy, desde un archivo importado en el M5)
// pasa por aquí antes de tocar la app: tipos, rangos, tamaños y fechas válidas.

import { esFechaValida } from './fechas.js';

export const SCHEMA_VERSION = 4;

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
  miFrase: 200, frasesVistas: 400, favoritas: 300, diasGuia: 800, hitosVistos: 200,
  descItems: 300, descNoMostrar: 200, descClave: 40, descTexto: 300, descBarras: 60,
};

/* Módulo 11: Descubrimientos de tu semana. */
export const TIPOS_DESC = ['g1', 'g2', 'g3', 'g4', 'p1', 'p2', 'p3', 'p4', 'p5', 'p6', 'p7', 'p8'];
export const ESTADOS_DESC = ['nuevo', 'visto', 'guardado', 'oculto'];
export const EJES_DESC = ['dias', 'bloques', 'rachas', 'franjas', 'par', 'semanas', 'descanso', 'meses'];

/** Paletas (M8). La primera es la de siempre; las demás se ganan con días registrados (ver temas.js). */
export const PALETAS = ['ambar', 'cobre', 'salvia', 'acero', 'platino'];
/** Nombres de la versión 0.8 → paletas nuevas (para no perder la elección al actualizar). */
const PALETAS_ANTES = { pino: 'ambar', arena: 'cobre', niebla: 'acero', ciruela: 'salvia', obsidiana: 'platino' };
export const TEMAS = ['auto', 'claro', 'oscuro', 'negro'];
/** Temas Pro (en prueba): cambian letra, colores, brote, mapa de calor y movimiento. «analista» es el de siempre. */
export const ESTILOS = ['analista', 'kanso', 'calibre', 'observatorio', 'gaceta'];
export const MODOS_MANIFIESTO = ['pantalla', 'linea', 'no'];
/* Jardín anual: solo ajustes. El jardín se calcula siempre desde los registros. */
export const HEMISFERIOS = ['sur', 'norte'];
export const UMBRALES_JARDIN = [100, 90, 80, 75, 60, 50]; // % del día para que cuente como flor

export function jardinPorDefecto() {
  return { hemisferio: 'sur', umbral: 100, animaciones: true, vibracion: true, sonido: false, semilla: null };
}

/** Ajustes del jardín. Un valor raro vuelve al de fábrica; la semilla es un hex de 32 caracteres o nada. */
export function sanearJardin(j) {
  const base = jardinPorDefecto();
  if (!esObjeto(j)) return base;
  return {
    hemisferio: HEMISFERIOS.includes(j.hemisferio) ? j.hemisferio : base.hemisferio,
    umbral: UMBRALES_JARDIN.includes(j.umbral) ? j.umbral : base.umbral,
    animaciones: j.animaciones !== false,
    vibracion: j.vibracion !== false,
    sonido: j.sonido === true,
    semilla: typeof j.semilla === 'string' && /^[0-9a-f]{32}$/.test(j.semilla) ? j.semilla : null,
  };
}

/* Módulo 10: frases y palabras guía. */
export const CONTEXTOS_FRASE = ['inicio', 'construyendo', 'racha_larga', 'hito', 'dia_dificil', 'tropiezo', 'regreso', 'descanso', 'dia_completo', 'identidad', 'revision'];
export const ROLES_FRASE = ['filosofo', 'escritor', 'empresario', 'artista', 'deportista', 'autor', 'lider', 'proverbio'];
export const ESTILOS_FRASE = ['suave', 'equilibrado', 'firme'];
export const FRECUENCIAS_FRASE = ['cierre', 'dia', 'revision'];
export const ESTADOS_ANIMO = ['energia', 'tranquilo', 'cansado', 'abrumado'];
export const PALABRAS_GUIA = ['constancia', 'calma', 'paciencia', 'foco', 'valentia', 'disciplina', 'proposito', 'descanso', 'identidad', 'curiosidad', 'aprender', 'resiliencia', 'presencia', 'orden', 'energia', 'amabilidad'];
export const SALTADO = '-'; // palabra o check-in "saltado" ese día (para no volver a preguntar)

export const BLOQUEOS = [0, 30, 60, 300, 900]; // segundos en segundo plano antes de pedir el PIN
export const PIN_ITERACIONES = 600_000;
/** Tope de iteraciones aceptadas (PIN y respaldo cifrado): más que esto solo sirve para congelar la app (B-2). */
export const ITERACIONES_MAX = 2_000_000;
export const ESPERA_PIN_MAX = 15 * 60_000;
/** Campos de la protección con PIN. Nunca salen en un respaldo ni llegan desde uno (A-3, M-2). */
export const CAMPOS_PIN = ['pinHash', 'pinSalt', 'pinIter', 'pinFallos', 'pinEspera'];

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
    // Espera que falta tras fallar el PIN (ms). Se descuenta con el tiempo real que la app pasa abierta,
    // no con la hora del teléfono: adelantar el reloj ya no la salta (hallazgo M-1).
    pinEspera: 0,
    avisosVistos: [],
    paleta: 'ambar',
    estilo: 'analista', // tema Pro en prueba (ver ESTILOS)
    manifiesto: '',
    manifiestoModo: 'pantalla', // pantalla breve una vez al día · línea en Hoy · no mostrar
    manifiestoVisto: null, // 'YYYY-MM-DD' del último día en que se mostró la pantalla
    // Módulo 10
    frasesActivas: true, // apagado = modo sin frases
    estiloFrases: 'equilibrado', // suave · equilibrado (suave y neutro) · firme
    frecuenciaFrases: 'cierre', // cierre: del día + cierre · dia: solo la del día · revision: solo en revisiones
    rolesFrases: [...ROLES_FRASE],
    soloAlta: false, // solo frases con fuente confirmada
    palabraDelDia: true,
    checkinActivo: true,
    idInstalacion: '', // se crea al cargar; sirve de semilla para elegir frases (nunca sale del dispositivo)
    jardin: jardinPorDefecto(),
    descubrimientos: descConfigPorDefecto(), // M11
  };
}

/** Ajustes de los Descubrimientos (M11). Privados y sensibles quedan fuera salvo que se incluyan a mano. */
export function descConfigPorDefecto() {
  return { activado: true, tiposApagados: [], excluidos: [], incluidos: [], notificarRevision: false };
}

export function descubrimientosVacios() {
  return { items: [], noMostrar: [], semana: null };
}

export function datosVacios() {
  return { schemaVersion: SCHEMA_VERSION, habits: [], logs: [], revisiones: [], frases: frasesVacias(), palabras: palabrasVacias(), descubrimientos: descubrimientosVacios(), config: configPorDefecto() };
}

export function frasesVacias() {
  return { vistas: [], favoritas: [], delDia: null, cierre: null, hitosVistos: [], miFrase: '' };
}

export function palabrasVacias() {
  return { porDia: {}, checkin: {}, minimo: null, identidad: [] };
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
    esencial: h.esencial === true,
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
    pinIter: Number.isInteger(c.pinIter) && c.pinIter >= 100_000 && c.pinIter <= ITERACIONES_MAX ? c.pinIter : PIN_ITERACIONES,
    bloqueoSegundos: BLOQUEOS.includes(c.bloqueoSegundos) ? c.bloqueoSegundos : base.bloqueoSegundos,
    pinFallos: Number.isInteger(c.pinFallos) && c.pinFallos >= 0 && c.pinFallos < 1000 ? c.pinFallos : 0,
    pinEspera: sanearEspera(c),
    avisosVistos: Array.isArray(c.avisosVistos)
      ? [...new Set(c.avisosVistos.filter((x) => typeof x === 'string' && /^[\w.-]{1,40}$/.test(x)))].slice(0, 50)
      : [],
    paleta: PALETAS.includes(c.paleta) ? c.paleta : PALETAS_ANTES[c.paleta] || base.paleta,
    estilo: ESTILOS.includes(c.estilo) ? c.estilo : base.estilo,
    manifiesto: texto(c.manifiesto, LIMITES.manifiesto).replace(/\n{3,}/g, '\n\n'),
    manifiestoModo: MODOS_MANIFIESTO.includes(c.manifiestoModo) ? c.manifiestoModo : base.manifiestoModo,
    manifiestoVisto: esFechaValida(c.manifiestoVisto) ? c.manifiestoVisto : null,
    frasesActivas: c.frasesActivas !== false,
    estiloFrases: ESTILOS_FRASE.includes(c.estiloFrases) ? c.estiloFrases : base.estiloFrases,
    frecuenciaFrases: FRECUENCIAS_FRASE.includes(c.frecuenciaFrases) ? c.frecuenciaFrases : base.frecuenciaFrases,
    rolesFrases: Array.isArray(c.rolesFrases) ? ROLES_FRASE.filter((r) => c.rolesFrases.includes(r)) : base.rolesFrases,
    soloAlta: c.soloAlta === true,
    palabraDelDia: c.palabraDelDia !== false,
    checkinActivo: c.checkinActivo !== false,
    idInstalacion: typeof c.idInstalacion === 'string' && /^[\w-]{8,64}$/.test(c.idInstalacion) ? c.idInstalacion : '',
    jardin: sanearJardin(c.jardin),
    descubrimientos: sanearDescConfig(c.descubrimientos, idsValidos),
  };
}

/* ---------- Descubrimientos (M11) ---------- */

const listaIds = (v, idsValidos) => (Array.isArray(v) ? [...new Set(v.filter((x) => idValido(x) && (!idsValidos || idsValidos.has(x))))].slice(0, LIMITES.habitos) : []);

export function sanearDescConfig(c, idsValidos = null) {
  const base = descConfigPorDefecto();
  if (!esObjeto(c)) return base;
  return {
    activado: c.activado !== false,
    tiposApagados: Array.isArray(c.tiposApagados) ? TIPOS_DESC.filter((x) => c.tiposApagados.includes(x)) : [],
    excluidos: listaIds(c.excluidos, idsValidos),
    incluidos: listaIds(c.incluidos, idsValidos),
    notificarRevision: c.notificarRevision === true, // aviso «Tu semana está lista» (apagado de fábrica)
  };
}

/** Objeto plano y pequeño: solo números finitos, booleanos, null y textos cortos (sin anidar, salvo `meses`). */
function plano(o, maxClaves = 30) {
  if (!esObjeto(o)) return {};
  const out = {};
  for (const [k, v] of Object.entries(o).slice(0, maxClaves)) {
    if (!/^\w{1,24}$/.test(k)) continue;
    if (typeof v === 'number' && Number.isFinite(v)) out[k] = v;
    else if (typeof v === 'boolean' || v === null) out[k] = v;
    else if (typeof v === 'string') out[k] = texto(v, LIMITES.descTexto);
  }
  return out;
}

function sanearGrafico(g) {
  if (!esObjeto(g) || !EJES_DESC.includes(g.eje) || !Array.isArray(g.barras)) return null;
  const barras = g.barras.slice(0, LIMITES.descBarras)
    .filter((b) => Array.isArray(b) && b.length === 2 && b.every((x) => Number.isFinite(x) && x >= 0 && x <= 1e6))
    .map(([x, n]) => [x, n]);
  const out = { eje: g.eje, barras, resaltado: Number.isInteger(g.resaltado) && g.resaltado >= -1 && g.resaltado < barras.length ? g.resaltado : -1 };
  if (Array.isArray(g.meses)) out.meses = g.meses.filter((m) => typeof m === 'string' && /^\d{4}-\d{2}$/.test(m)).slice(0, LIMITES.descBarras);
  return out;
}

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;
function sanearAccion(a) {
  if (!esObjeto(a)) return null;
  if (a.tipo === 'recordatorio' && HHMM.test(a.desde) && HHMM.test(a.hora)) return { tipo: 'recordatorio', desde: a.desde, hora: a.hora, ...(a.hecha === true ? { hecha: true } : {}) };
  return null;
}

export function sanearDescItem(x, idsValidos = null) {
  if (!esObjeto(x) || !idValido(x.id) || !TIPOS_DESC.includes(x.tipo) || !esFechaValida(x.semana)) return null;
  const habitIds = Array.isArray(x.habitIds) ? x.habitIds.filter(idValido).slice(0, 2) : [];
  const estado = ESTADOS_DESC.includes(x.estado) ? x.estado : 'visto';
  // Hábito borrado: si no estaba guardado, el descubrimiento se va; si estaba guardado, queda sin nombre.
  if (idsValidos && habitIds.some((id) => !idsValidos.has(id)) && estado !== 'guardado') return null;
  return {
    id: x.id,
    tipo: x.tipo,
    habitIds,
    clave: texto(x.clave, LIMITES.descClave),
    semana: x.semana,
    params: plano(x.params, 16),
    evidencia: plano(x.evidencia, 30),
    grafico: sanearGrafico(x.grafico),
    accion: sanearAccion(x.accion),
    estado,
    creadoEl: esFechaValida(x.creadoEl) ? x.creadoEl : x.semana,
    caducaEl: esFechaValida(x.caducaEl) ? x.caducaEl : x.semana,
  };
}

export function sanearDescubrimientos(d, idsValidos = null) {
  const base = descubrimientosVacios();
  if (!esObjeto(d)) return base;
  const vistos = new Set();
  const items = [];
  for (const x of Array.isArray(d.items) ? d.items.slice(-LIMITES.descItems * 2) : []) {
    const s = sanearDescItem(x, idsValidos);
    if (s && !vistos.has(s.id)) { vistos.add(s.id); items.push(s); }
  }
  return {
    items: items.slice(-LIMITES.descItems),
    noMostrar: Array.isArray(d.noMostrar) ? [...new Set(d.noMostrar.filter((x) => typeof x === 'string' && /^[\w|+-]{1,140}$/.test(x)))].slice(-LIMITES.descNoMostrar) : [],
    semana: esFechaValida(d.semana) ? d.semana : null,
  };
}

/* ---------- Frases y palabras guía (M10) ---------- */

const idFrase = (v) => typeof v === 'string' && /^[\w-]{1,16}$/.test(v);

function sanearMarca(x, extra = {}) {
  if (!esObjeto(x) || !esFechaValida(x.fecha) || !idFrase(x.id) || !CONTEXTOS_FRASE.includes(x.contexto)) return null;
  const m = { fecha: x.fecha, id: x.id, contexto: x.contexto };
  if (extra.cerrada && x.cerrada === true) m.cerrada = true;
  if (extra.propia && x.propia === true) m.propia = true;
  return m;
}

export function sanearFrases(f) {
  const base = frasesVacias();
  if (!esObjeto(f)) return base;
  const vistas = Array.isArray(f.vistas)
    ? f.vistas.filter((v) => esObjeto(v) && idFrase(v.id) && esFechaValida(v.fecha)).map((v) => ({ id: v.id, fecha: v.fecha })).slice(-LIMITES.frasesVistas)
    : [];
  return {
    vistas,
    favoritas: Array.isArray(f.favoritas) ? [...new Set(f.favoritas.filter(idFrase))].slice(0, LIMITES.favoritas) : [],
    delDia: sanearMarca(f.delDia, { cerrada: true, propia: true }),
    cierre: sanearMarca(f.cierre),
    hitosVistos: Array.isArray(f.hitosVistos) ? [...new Set(f.hitosVistos.filter((x) => typeof x === 'string' && /^[\w:@-]{1,90}$/.test(x)))].slice(-LIMITES.hitosVistos) : [],
    miFrase: texto(f.miFrase, LIMITES.miFrase).replace(/\s+/g, ' '),
  };
}

/** Un mapa fecha → valor permitido (días recientes primero, con tope). */
function porFecha(o, validos) {
  if (!esObjeto(o)) return {};
  const pares = Object.entries(o).filter(([k, v]) => esFechaValida(k) && (v === SALTADO || validos.includes(v)));
  pares.sort((a, b) => (a[0] < b[0] ? 1 : -1));
  return Object.fromEntries(pares.slice(0, LIMITES.diasGuia));
}

export function sanearPalabras(p) {
  const base = palabrasVacias();
  if (!esObjeto(p)) return base;
  return {
    porDia: porFecha(p.porDia, PALABRAS_GUIA),
    checkin: porFecha(p.checkin, ESTADOS_ANIMO),
    minimo: esFechaValida(p.minimo) ? p.minimo : null,
    identidad: Array.isArray(p.identidad) ? [...new Set(p.identidad.filter((x) => PALABRAS_GUIA.includes(x)))].slice(0, 3) : [],
  };
}

/** Espera pendiente del PIN. Los datos de la 0.9 traían una hora absoluta (pinEsperaHasta): se recalcula desde los fallos. */
function sanearEspera(c) {
  if (Number.isFinite(c.pinEspera) && c.pinEspera > 0) return Math.min(Math.round(c.pinEspera), ESPERA_PIN_MAX);
  const fallos = Number.isInteger(c.pinFallos) ? c.pinFallos : 0;
  if (Number.isFinite(c.pinEsperaHasta) && c.pinEsperaHasta > 0 && fallos >= 5) return Math.min(30_000 * 2 ** (fallos - 5), ESPERA_PIN_MAX);
  return 0;
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
 * Cada paso es una función pura vN → vN+1. v1 → v2 agregó las revisiones semanales;
 * v2 → v3, las frases y palabras guía (M10); v3 → v4, los Descubrimientos (M11). Para la v5: escribir pasos[4].
 */
const pasos = {
  0: (d) => ({ ...d, schemaVersion: 1 }), // datos sin versión: se tratan como v1
  1: (d) => ({ ...d, schemaVersion: 2, revisiones: Array.isArray(d.revisiones) ? d.revisiones : [] }), // M7: revisión semanal
  2: (d) => ({ ...d, schemaVersion: 3, frases: esObjeto(d.frases) ? d.frases : frasesVacias(), palabras: esObjeto(d.palabras) ? d.palabras : palabrasVacias() }), // M10: frases y palabras
  3: (d) => ({ ...d, schemaVersion: 4, descubrimientos: esObjeto(d.descubrimientos) ? d.descubrimientos : descubrimientosVacios() }), // M11: solo agrega
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
    frases: sanearFrases(d.frases),
    palabras: sanearPalabras(d.palabras),
    descubrimientos: sanearDescubrimientos(d.descubrimientos, vistos),
    config: sanearConfig(d.config, vistos),
  };
  const descartados = (habitsIn.length - habits.length) + (logsIn.length - porClave.size);
  return { datos, futuro, descartados };
}
