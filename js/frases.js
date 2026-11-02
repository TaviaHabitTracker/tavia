// frases.js — Frases guía (Módulo 10). Lógica pura, sin DOM: se prueba en Node.
//
// - Las frases viven en data/frases_tavia.json (archivo estático, precacheado, ampliable sin tocar código).
// - El contexto del día se calcula SIEMPRE desde los registros: nunca se guarda como número.
// - La elección es determinista por día (fecha + id de instalación): recargar no la cambia.
// - Tras un tropiezo o un regreso solo hay tono suave; ese límite nunca se relaja.

import { diffDias, minutosDe, sumarDias } from './fechas.js';
import { diaGlobal, rachas } from './estadisticas.js';
import { cumplido, estadoDelDia, neutro, tocaEnFecha } from './calculos.js';
import { rachaGlobal } from './analisis.js';
import { CONTEXTOS_FRASE as CONTEXTOS, ROLES_FRASE as ROLES } from './esquema.js';

export { CONTEXTOS_FRASE as CONTEXTOS, ROLES_FRASE as ROLES, ESTILOS_FRASE as ESTILOS, FRECUENCIAS_FRASE, ESTADOS_ANIMO } from './esquema.js';
export const TONOS = ['suave', 'neutro', 'firme'];

export const LIMITES_FRASE = { id: 16, texto: 320, autor: 80, fuente: 200, archivo: 2000, miFrase: 200 };

/** Orden por defecto (el archivo puede traer el suyo en reglas.prioridad). */
export const PRIORIDAD = ['tropiezo', 'regreso', 'dia_dificil', 'descanso', 'hito', 'dia_completo', 'racha_larga', 'construyendo', 'inicio'];
export const HITOS = [30, 60, 100, 365];

const REGLAS_BASE = {
  sinRepetirDias: 60,
  sinRepetirDiasRelajado: 30,
  mismoAutorCadaDias: 7,
  hitos: HITOS,
  prioridad: PRIORIDAD,
  tonosPorContexto: { tropiezo: ['suave'], regreso: ['suave'], dia_dificil: ['suave', 'neutro'], descanso: ['suave', 'neutro'] },
  vecinos: {},
};

const esObjeto = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const limpio = (v) => (typeof v === 'string' ? v.replace(/[\u0000-\u001F\u007F]/g, ' ').replace(/\s+/g, ' ').trim() : '');

/* ---------- Carga y validación del archivo ---------- */

/** Valida una frase. Devuelve la frase limpia o null (nunca lanza). */
export function validarFrase(f) {
  if (!esObjeto(f)) return null;
  const id = typeof f.id === 'string' && /^[\w-]{1,16}$/.test(f.id) ? f.id : null;
  const texto = limpio(f.texto);
  const autor = limpio(f.autor);
  const fuente = limpio(f.fuente);
  if (!id || !texto || !autor || !fuente) return null;
  if (texto.length > LIMITES_FRASE.texto || autor.length > LIMITES_FRASE.autor || fuente.length > LIMITES_FRASE.fuente) return null;
  if (!CONTEXTOS.includes(f.contexto) || !TONOS.includes(f.tono) || !ROLES.includes(f.rol)) return null;
  if (!['textual', 'adaptada'].includes(f.tipo) || !['Alta', 'Media'].includes(f.confianza)) return null;
  return { id, contexto: f.contexto, texto, autor, rol: f.rol, fuente, tipo: f.tipo, confianza: f.confianza, tono: f.tono };
}

/**
 * Valida el archivo completo. Lo que no sirve se ignora sin romper nada.
 * Devuelve { frases, porId, reglas, idioma, descartadas }.
 */
export function validarArchivo(json, idioma = 'es') {
  const vacio = { frases: [], porId: new Map(), reglas: { ...REGLAS_BASE }, idioma, descartadas: 0 };
  if (!esObjeto(json) || !Array.isArray(json.frases)) return vacio;
  if (typeof json.idioma === 'string' && json.idioma !== idioma) return vacio;
  const porId = new Map();
  let descartadas = 0;
  for (const bruta of json.frases.slice(0, LIMITES_FRASE.archivo)) {
    const f = validarFrase(bruta);
    if (!f || porId.has(f.id)) { descartadas++; continue; }
    porId.set(f.id, f);
  }
  descartadas += Math.max(0, json.frases.length - LIMITES_FRASE.archivo);
  return { frases: [...porId.values()], porId, reglas: sanearReglas(json.reglas), idioma, descartadas };
}

function sanearReglas(r) {
  const base = { ...REGLAS_BASE };
  if (!esObjeto(r)) return base;
  const dias = (v, x) => (Number.isInteger(v) && v >= 0 && v <= 365 ? v : x);
  const listaCtx = (l) => (Array.isArray(l) ? l.filter((c) => CONTEXTOS.includes(c)) : []);
  const prioridad = listaCtx(r.prioridad);
  const tonos = {};
  if (esObjeto(r.tonosPorContexto)) {
    for (const [c, l] of Object.entries(r.tonosPorContexto)) {
      if (CONTEXTOS.includes(c) && Array.isArray(l)) tonos[c] = l.filter((x) => TONOS.includes(x));
    }
  }
  const vecinos = {};
  if (esObjeto(r.vecinos)) for (const [c, l] of Object.entries(r.vecinos)) if (CONTEXTOS.includes(c)) vecinos[c] = listaCtx(l);
  return {
    sinRepetirDias: dias(r.sinRepetirDias, base.sinRepetirDias),
    sinRepetirDiasRelajado: dias(r.sinRepetirDiasRelajado, base.sinRepetirDiasRelajado),
    mismoAutorCadaDias: dias(r.mismoAutorCadaDias, base.mismoAutorCadaDias),
    hitos: Array.isArray(r.hitos) && r.hitos.every((n) => Number.isInteger(n) && n > 0) ? r.hitos : base.hitos,
    // Las reglas de tono del código son el mínimo: el archivo puede endurecerlas, nunca ablandarlas.
    prioridad: prioridad.length === PRIORIDAD.length ? prioridad : base.prioridad,
    tonosPorContexto: { ...tonos, ...base.tonosPorContexto },
    vecinos,
  };
}

/** Lee el archivo (con fetch del mismo origen). Sin red y sin caché: lista vacía, la app sigue igual. */
export async function cargarFrases(url = 'data/frases_tavia.json', leer = globalThis.fetch) {
  try {
    const r = await leer(url, { cache: 'no-cache' });
    if (!r.ok) return validarArchivo(null);
    return validarArchivo(await r.json());
  } catch {
    return validarArchivo(null);
  }
}

/* ---------- Cálculo del contexto ---------- */

/** ¿Hay algún registro (de cualquier tipo) ese día? */
function hayRegistro(habitos, fecha, logDe) {
  return habitos.some((h) => logDe(h.id, fecha));
}

/** Días seguidos sin ningún registro, contando hacia atrás desde ayer. null = nunca registró nada antes. */
export function diasSinRegistrar(habitos, hoy, logDe, limite = 400) {
  if (!habitos.length) return null;
  const inicio = habitos.reduce((m, h) => (h.creado < m ? h.creado : m), hoy);
  let n = 0;
  for (let d = sumarDias(hoy, -1); d >= inicio && n < limite; d = sumarDias(d, -1)) {
    if (hayRegistro(habitos, d, logDe)) return n;
    n++;
  }
  return null;
}

/** Primer día de uso: el hábito más antiguo. */
export function primerUso(habitos, hoy) {
  return habitos.length ? habitos.reduce((m, h) => (h.creado < m ? h.creado : m), hoy) : null;
}

/**
 * ¿Es "tarde" en el día lógico? Desde 4 horas antes del fin del día
 * (con fin del día a las 00:00, desde las 20:00; con fin a las 03:00, desde las 23:00).
 */
export function esTarde(ahora, finDelDia = '00:00') {
  const corte = minutosDe(finDelDia);
  const min = ahora.getHours() * 60 + ahora.getMinutes();
  const desde = (corte - 240 + 1440) % 1440;
  if (desde < corte) return min >= desde && min < corte; // ventana dentro del mismo día de reloj
  return min >= desde || min < corte;
}

/** Hábitos esenciales de hoy (marcados en el editor). Sin marcados: ninguno. */
export function esencialesDeHoy(habitos, hoy) {
  return habitos.filter((h) => h.esencial && tocaEnFecha(h, hoy));
}

/** Hitos que se alcanzan hoy: racha global o de un hábito diario que llega a 30/60/100/365; o el primer mes. */
export function hitosDeHoy({ habitos, hoy, logDe, racha, hitos = HITOS }) {
  const lista = [];
  const hechoHoy = diaGlobal(habitos, hoy, logDe).hechos > 0;
  if (hechoHoy && hitos.includes(racha)) lista.push({ clave: `g${racha}@${hoy}`, tipo: 'global', n: racha });
  for (const h of habitos) {
    if (h.archivado || h.frecuencia.tipo !== 'diaria' || !cumplido(estadoDelDia(h, logDe(h.id, hoy)))) continue;
    const { actual } = rachas(h, hoy, logDe);
    if (hitos.includes(actual)) lista.push({ clave: `h${actual}:${h.id}@${hoy}`, tipo: 'habito', n: actual, habitId: h.id });
  }
  const inicio = primerUso(habitos, hoy);
  if (inicio && diffDias(inicio, hoy) === 30) lista.push({ clave: `mes1@${hoy}`, tipo: 'mes', n: 30 });
  return lista;
}

/**
 * Señales del día, todas derivadas de los registros.
 * `checkin`: estado de ánimo marcado hoy (o null). `ahora`: Date del reloj.
 */
export function senales({ habitos, hoy, logDe, ahora = new Date(), finDelDia = '00:00', checkin = null, hitos = HITOS }) {
  const vivos = habitos.filter((h) => !h.archivado || h.archivado > hoy);
  const racha = rachaGlobal(vivos, hoy, logDe);
  const ayer = sumarDias(hoy, -1);
  const pAyer = diaGlobal(vivos, ayer, logDe);
  const pHoy = diaGlobal(vivos, hoy, logDe);
  const sinRegistrar = diasSinRegistrar(vivos, hoy, logDe);
  const programadosHoy = vivos.filter((h) => tocaEnFecha(h, hoy));
  const estadosHoy = programadosHoy.map((h) => estadoDelDia(h, logDe(h.id, hoy)));
  const congeladorHoy = vivos.some((h) => {
    for (let d = sumarDias(hoy, -2); d <= hoy; d = sumarDias(d, 1)) if (logDe(h.id, d)?.usadoEn === hoy) return true;
    return false;
  });
  const esenciales = esencialesDeHoy(vivos, hoy);
  const minimoListo = esenciales.length
    ? esenciales.every((h) => { const e = estadoDelDia(h, logDe(h.id, hoy)); return cumplido(e) || neutro(e); })
    : pHoy.hechos > 0;
  return {
    racha,
    sinHabitos: vivos.length === 0,
    // Ayer había algo que hacer y no se cumplió nada (descanso, congelador o "hoy no" no cuentan como fallo).
    ayerSinCumplir: pAyer.total > 0 && pAyer.hechos === 0,
    sinRegistrar,
    descanso: vivos.length > 0 && (
      programadosHoy.length === 0 // hoy no aplica ningún hábito (o todos en pausa)
      || (estadosHoy.length > 0 && estadosHoy.every(neutro)) // todo en descanso o congelado
      || congeladorHoy),
    diaCompleto: pHoy.total > 0 && pHoy.hechos === pHoy.total,
    dificil: checkin === 'cansado' || checkin === 'abrumado' || (pHoy.total > 0 && esTarde(ahora, finDelDia) && !minimoListo),
    hitos: hitosDeHoy({ habitos: vivos, hoy, logDe, racha, hitos }),
  };
}

/** Todos los contextos que aplican hoy (sin ordenar). */
export function contextosQueAplican(s) {
  const c = new Set();
  if (s.sinHabitos) { c.add('inicio'); return c; }
  const regreso = s.sinRegistrar !== null && s.sinRegistrar >= 3;
  if (regreso) c.add('regreso');
  // Tras varios días fuera, "ayer" también falló: eso es un regreso, no un tropiezo.
  else if (s.ayerSinCumplir) c.add('tropiezo');
  if (s.dificil) c.add('dia_dificil');
  if (s.descanso) c.add('descanso');
  if (s.hitos.length) c.add('hito');
  if (s.diaCompleto) c.add('dia_completo');
  c.add(s.racha >= 21 ? 'racha_larga' : s.racha >= 3 ? 'construyendo' : 'inicio');
  return c;
}

/** Contexto ganador según la prioridad. */
export function elegirContexto(s, prioridad = PRIORIDAD) {
  const aplican = contextosQueAplican(s);
  return prioridad.find((c) => aplican.has(c)) || 'inicio';
}

/** Tonos permitidos: el contexto pone el límite y el estilo del usuario lo afina. */
export function tonosPermitidos(contexto, estilo = 'equilibrado', checkin = null, reglas = REGLAS_BASE) {
  const porEstilo = estilo === 'suave' ? ['suave'] : estilo === 'firme' ? ['suave', 'neutro', 'firme'] : ['suave', 'neutro'];
  let limite = reglas.tonosPorContexto?.[contexto] || TONOS;
  if (contexto === 'dia_dificil' && checkin === 'abrumado') limite = ['suave'];
  return porEstilo.filter((t) => limite.includes(t));
}

/* ---------- Selección ---------- */

/** Hash FNV-1a de 32 bits: determinista y suficiente para elegir entre pocas frases. */
export function semilla(texto) {
  let h = 0x811c9dc5;
  for (let i = 0; i < texto.length; i++) {
    h ^= texto.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

/** Quita vistas viejas o inválidas (las que ya no sirven para ninguna regla). */
export function podarVistas(vistas, hoy, dias = 120) {
  return (vistas || []).filter((v) => v && typeof v.id === 'string' && typeof v.fecha === 'string' && diffDias(v.fecha, hoy) <= dias && v.fecha <= hoy);
}

/**
 * Elige la frase. Devuelve { frase, relajado } o null si no queda ninguna con los filtros del usuario.
 * Pasos: contexto + tono + filtros → sin repetir en 60 días y sin repetir autor en 7 →
 * relaja: 30 días → cualquier autor → contexto vecino (mismo tono) → la vista hace más tiempo.
 * El tono nunca se relaja. `excluir`: ids que no deben salir (por ejemplo, la frase del día al elegir la de cierre).
 */
export function elegirFrase({ datos, contexto, tonos, roles = ROLES, soloAlta = false, vistas = [], hoy, clave = '', excluir = [] }) {
  if (!datos?.frases?.length || !tonos.length) return null;
  const reglas = datos.reglas;
  const vetadas = new Set(excluir);
  const apta = (f) => tonos.includes(f.tono) && roles.includes(f.rol) && (!soloAlta || f.confianza === 'Alta') && !vetadas.has(f.id);
  const ultimaVez = new Map();
  for (const v of vistas) if (!ultimaVez.has(v.id) || ultimaVez.get(v.id) < v.fecha) ultimaVez.set(v.id, v.fecha);
  const hace = (id) => (ultimaVez.has(id) ? diffDias(ultimaVez.get(id), hoy) : Infinity);
  const autoresRecientes = new Set(vistas
    .filter((v) => diffDias(v.fecha, hoy) < reglas.mismoAutorCadaDias && v.fecha <= hoy)
    .map((v) => datos.porId.get(v.id)?.autor).filter(Boolean));

  const delContexto = (c) => datos.frases.filter((f) => f.contexto === c && apta(f)).sort((a, b) => (a.id < b.id ? -1 : 1));
  const propias = delContexto(contexto);
  const vecinas = (reglas.vecinos?.[contexto] || []).flatMap(delContexto);
  const pasos = [
    [propias, reglas.sinRepetirDias, true],
    [propias, reglas.sinRepetirDiasRelajado, true],
    [propias, reglas.sinRepetirDiasRelajado, false],
    [vecinas, reglas.sinRepetirDiasRelajado, false],
  ];
  const s = semilla(`${hoy}|${clave}|${contexto}`);
  for (let i = 0; i < pasos.length; i++) {
    const [lista, dias, cuidarAutor] = pasos[i];
    const ok = lista.filter((f) => hace(f.id) >= dias && (!cuidarAutor || !autoresRecientes.has(f.autor)));
    if (ok.length) return { frase: ok[s % ok.length], relajado: i };
  }
  // Todo visto hace poco: la que se vio hace más tiempo (del propio contexto, o de un vecino).
  const resto = propias.length ? propias : vecinas;
  if (!resto.length) return null;
  const masAntigua = [...resto].sort((a, b) => hace(b.id) - hace(a.id) || (a.id < b.id ? -1 : 1));
  return { frase: masAntigua[0], relajado: pasos.length };
}

/** "Mi frase" sale los lunes (salvo en días que piden solo calma) o cuando no hay ninguna que encaje. */
export function tocaMiFrase(miFrase, contexto, hoy, hayFrase) {
  if (!miFrase) return false;
  if (!hayFrase) return true;
  if (['tropiezo', 'regreso', 'dia_dificil'].includes(contexto)) return false;
  const [a, m, d] = hoy.split('-').map(Number);
  return new Date(a, m - 1, d, 12).getDay() === 1;
}

/** Días seguidos (hasta hoy) marcados como "abrumado". */
export function diasAbrumado(checkin, hoy) {
  let n = 0;
  for (let d = hoy; checkin?.[d] === 'abrumado'; d = sumarDias(d, -1)) n++;
  return n;
}
