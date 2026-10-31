// estadisticas.js — Racha, puntaje de hábito y congeladores.
// Nada de esto se guarda: se calcula siempre desde los registros.
// Para no recalcular todo el historial en cada toque, hay una caché por hábito
// que se invalida solo cuando cambia ESE hábito (su "revisión") o el día.

import { diffDias, inicioSemana, sumarDias } from './fechas.js';
import { activoEn, cumplido, estadoDelDia, neutro, progresoDelDia, semanaDe, tocaEnFecha, vistaDelDia } from './calculos.js';

export const CONGELADORES = { cada: 7, maximo: 3, diasAtras: 2 };

/** Último día que cuenta para las estadísticas (el día anterior a archivarlo, u hoy). */
function ultimoDia(h, hoy) {
  if (h.archivado && h.archivado <= hoy) return sumarDias(h.archivado, -1);
  return hoy;
}

/** Cuánto se cumplió un día, de 0 a 1. null = día neutro (descanso o congelado). */
export function cumplimiento(h, log) {
  const estado = estadoDelDia(h, log);
  if (neutro(estado)) return null;
  if (estado === 'hecho') return 1;
  if (estado !== 'parcial') return 0; // pendiente, saltado, excedido
  const v = log.valor ?? 0;
  if (h.tipo === 'si_no') return Math.min(v / h.vecesPorDia, 1);
  return h.meta.min ? Math.min(v / h.meta.min, 1) : 0;
}

/** Veces por día que se espera el hábito (para el suavizado del puntaje). */
export function frecuenciaPorDia(h) {
  const f = h.frecuencia;
  if (f.tipo === 'dias_fijos') return f.dias.length / 7;
  if (f.tipo === 'cada_n_dias') return 1 / f.n;
  if (f.tipo === 'semanal_n') return f.n / 7;
  return 1;
}

/**
 * Puntaje de hábito (idea de Loop Habit Tracker), de 0 a 1.
 * Cada día: puntaje = puntaje × m + valor × (1 − m), con m = 0,5 ^ (√frecuencia / 13).
 * Fallar un día lo baja de a poco; no lo reinicia.
 * - Días en pausa, de descanso o congelados: no mueven el puntaje.
 * - Hoy solo cuenta si ya está hecho (no es fallo hasta que termina el día).
 * - Días fijos / cada N días: entre un día programado y el siguiente se arrastra el
 *   resultado del último programado, igual que Loop con sus frecuencias.
 * - N por semana: el valor del día es min(1, hechos en los últimos 7 días / N).
 */
export function puntaje(h, hoy, logDe) {
  const fin = ultimoDia(h, hoy);
  if (fin < h.creado) return 0;
  const m = 0.5 ** (Math.sqrt(frecuenciaPorDia(h)) / 13);
  const tipo = h.frecuencia.tipo;
  let score = 0;
  let arrastre = null;
  const ventana = []; // cumplido (1/0) de los últimos 7 días, para "N por semana"

  for (let d = h.creado; d <= fin; d = sumarDias(d, 1)) {
    const log = logDe(h.id, d);
    const estado = estadoDelDia(h, log);
    if (tipo === 'semanal_n') { ventana.push(cumplido(estado) ? 1 : 0); if (ventana.length > 7) ventana.shift(); }
    if (!activoEn(h, d)) continue;
    if (d === hoy && !cumplido(estado)) continue;

    let v;
    if (tipo === 'diaria') {
      v = cumplimiento(h, log);
    } else if (tipo === 'semanal_n') {
      if (neutro(estado)) continue;
      v = Math.min(ventana.reduce((a, b) => a + b, 0) / h.frecuencia.n, 1);
    } else if (tocaEnFecha(h, d)) {
      v = cumplimiento(h, log);
      if (v !== null) arrastre = v;
    } else {
      v = arrastre;
    }
    if (v === null) continue;
    score = score * m + v * (1 - m);
  }
  return score;
}

/**
 * Resultados por período, en orden: 'ok' · 'fallo' · 'neutro' · 'en_curso'.
 * Diaria, días fijos y cada N días: un período por día programado.
 * N por semana: un período por semana (lunes a domingo), con meta prorrateada.
 */
export function periodos(h, hoy, logDe) {
  const fin = ultimoDia(h, hoy);
  const lista = [];
  if (fin < h.creado) return lista;

  if (h.frecuencia.tipo === 'semanal_n') {
    for (let lunes = inicioSemana(h.creado); lunes <= fin; lunes = sumarDias(lunes, 7)) {
      const { meta, hechos } = semanaDe(h, lunes, logDe, fin);
      const enCurso = sumarDias(lunes, 6) >= hoy && fin === hoy;
      const r = meta === 0 ? 'neutro' : hechos >= meta ? 'ok' : enCurso ? 'en_curso' : 'fallo';
      lista.push({ fecha: lunes, r });
    }
    return lista;
  }

  for (let d = h.creado; d <= fin; d = sumarDias(d, 1)) {
    if (!tocaEnFecha(h, d)) continue;
    const estado = estadoDelDia(h, logDe(h.id, d));
    const r = neutro(estado) ? 'neutro' : cumplido(estado) ? 'ok' : d === hoy ? 'en_curso' : 'fallo';
    lista.push({ fecha: d, r });
  }
  return lista;
}

/** Racha actual y mejor racha. Neutro y "en curso" no suman ni rompen. */
export function rachas(h, hoy, logDe) {
  const ps = periodos(h, hoy, logDe);
  let actual = 0, mejor = 0, corrida = 0;
  for (const p of ps) {
    if (p.r === 'ok') { corrida++; mejor = Math.max(mejor, corrida); }
    else if (p.r === 'fallo') corrida = 0;
  }
  actual = corrida;
  return { actual, mejor, unidad: unidadRacha(h) };
}

/** Racha que había justo antes de una fecha (para ofrecer "rescatarla"). */
export function rachaAntesDe(h, fecha, hoy, logDe) {
  const ps = periodos(h, hoy, logDe).filter((p) => p.fecha < fecha);
  let n = 0;
  for (let i = ps.length - 1; i >= 0; i--) {
    if (ps[i].r === 'ok') n++;
    else if (ps[i].r === 'fallo') break;
  }
  return n;
}

export function unidadRacha(h) {
  const t = h.frecuencia.tipo;
  return t === 'semanal_n' ? 'semanas' : t === 'diaria' ? 'dias' : 'veces';
}

/**
 * Congeladores: se ganan por constancia (1 cada 7 días cumplidos), máximo 3 guardados.
 * Se derivan de los registros: un registro "congelado" gasta uno el día en que se usó.
 * Si ya tienes 3, el que ganarías se pierde (no se acumula a escondidas).
 */
export function congeladores(h, hoy, logDe) {
  const { cada, maximo } = CONGELADORES;
  const fin = ultimoDia(h, hoy);
  const eventos = []; // [fecha, +1 | -1]
  let cumplidos = 0;
  for (let d = h.creado; d <= fin; d = sumarDias(d, 1)) {
    const log = logDe(h.id, d);
    if (cumplido(estadoDelDia(h, log))) {
      cumplidos++;
      if (cumplidos % cada === 0) eventos.push([d, 1]);
    }
    if (log?.estado === 'congelado') eventos.push([log.usadoEn && log.usadoEn >= d ? log.usadoEn : d, -1]);
  }
  // Orden por fecha; el mismo día, primero se gana y después se gasta.
  eventos.sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : b[1] - a[1]));
  let disponibles = 0;
  for (const [, delta] of eventos) disponibles = Math.min(maximo, Math.max(0, disponibles + delta));
  return { disponibles, progreso: cumplidos % cada, cada, maximo };
}

/** ¿Se puede usar un congelador en esa fecha? (día perdido de hasta 2 días atrás) */
export function puedeCongelar(h, fecha, hoy, logDe) {
  const atras = diffDias(fecha, hoy);
  if (atras < 1 || atras > CONGELADORES.diasAtras) return false;
  if (fecha < h.creado || !activoEn(h, fecha)) return false;
  if (h.frecuencia.tipo !== 'semanal_n' && !tocaEnFecha(h, fecha)) return false;
  const estado = estadoDelDia(h, logDe(h.id, fecha));
  if (cumplido(estado) || neutro(estado)) return false;
  return congeladores(h, hoy, logDe).disponibles > 0;
}

/** Todo lo que la interfaz muestra de un hábito. */
export function resumen(h, hoy, logDe) {
  return { puntaje: puntaje(h, hoy, logDe), ...rachas(h, hoy, logDe), congeladores: congeladores(h, hoy, logDe) };
}

/** Caché: un resumen por hábito, válido mientras no cambie su revisión ni el día. */
export function crearCache() {
  const mapa = new Map();
  return {
    obtener(h, hoy, logDe, revision) {
      const clave = `${revision}|${hoy}`;
      const c = mapa.get(h.id);
      if (c && c.clave === clave) return c.valor;
      const valor = resumen(h, hoy, logDe);
      mapa.set(h.id, { clave, valor });
      return valor;
    },
    olvidar(id) { if (id) mapa.delete(id); else mapa.clear(); },
  };
}

/* ---------- Progreso del conjunto (Módulo 3) ---------- */

/** Hechos y requeridos de un día, sumando todos los hábitos. */
export function diaGlobal(habitos, fecha, logDe) {
  const vistas = habitos.filter((h) => tocaEnFecha(h, fecha)).map((h) => vistaDelDia(h, fecha, logDe));
  return progresoDelDia(vistas);
}

/** Nivel del mapa de calor (0–4) según la fracción del día cumplida. null = sin hábitos ese día. */
export function nivelCalor({ hechos, total }) {
  if (!total) return null;
  const p = hechos / total;
  if (p === 0) return 0;
  if (p >= 1) return 4;
  return p <= 1 / 3 ? 1 : p <= 2 / 3 ? 2 : 3;
}

/**
 * Porcentaje cumplido entre dos fechas (todos los hábitos).
 * Hoy solo entra si ya está completo: no es fallo hasta que termine el día.
 */
export function porcentajePeriodo(habitos, desde, hasta, hoy, logDe) {
  let hechos = 0, total = 0;
  for (let d = desde; d <= hasta; d = sumarDias(d, 1)) {
    const p = diaGlobal(habitos, d, logDe);
    if (d === hoy && p.hechos < p.total) continue;
    hechos += p.hechos;
    total += p.total;
  }
  return total ? hechos / total : null;
}

/** Estado de cada día para el mini mapa de un hábito. */
export function diaDeHabito(h, fecha, hoy, logDe) {
  if (fecha > hoy) return 'futuro';
  if (fecha < h.creado) return 'antes';
  if (!tocaEnFecha(h, fecha)) {
    // En "N por semana" todos los días son posibles: un día sin marcar no es fallo.
    if (h.frecuencia.tipo === 'semanal_n' && activoEn(h, fecha)) {
      return cumplido(estadoDelDia(h, logDe(h.id, fecha))) ? 'hecho' : 'libre';
    }
    return 'no-toca';
  }
  const estado = estadoDelDia(h, logDe(h.id, fecha));
  if (h.frecuencia.tipo === 'semanal_n') return cumplido(estado) ? 'hecho' : neutro(estado) ? estado : 'libre';
  if (cumplido(estado)) return 'hecho';
  if (neutro(estado)) return estado;
  if (estado === 'parcial') return 'parcial';
  if (fecha === hoy) return 'hoy';
  return 'fallo';
}
