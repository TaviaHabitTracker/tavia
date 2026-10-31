// calculos.js — Reglas puras: qué hábito toca cada día y en qué estado está.
// No guarda nada: todo se calcula desde los registros (logs).
// La racha, el puntaje y los congeladores llegan en el Módulo 2.

import { diaSemana, diffDias, inicioSemana, sumarDias } from './fechas.js';

/** ¿El hábito está en pausa ese día? */
export function enPausa(h, fecha) {
  return h.pausas.some((p) => fecha >= p.desde && fecha <= p.hasta);
}

/** Pausa que cubre la fecha (o null). */
export function pausaActual(h, fecha) {
  return h.pausas.find((p) => fecha >= p.desde && fecha <= p.hasta) || null;
}

/** ¿El hábito existe y está activo en esa fecha? (creado, no archivado, no en pausa) */
export function activoEn(h, fecha) {
  if (fecha < h.creado) return false;
  if (h.archivado && fecha >= h.archivado) return false;
  return !enPausa(h, fecha);
}

/**
 * ¿Toca hacer el hábito ese día?
 * - diaria: siempre.
 * - dias_fijos: solo los días elegidos (lunes = 0).
 * - cada_n_dias: cada N días contando desde el día de inicio.
 * - semanal_n: se muestra todos los días; la meta es por semana.
 */
export function tocaEnFecha(h, fecha) {
  if (!activoEn(h, fecha)) return false;
  const f = h.frecuencia;
  switch (f.tipo) {
    case 'dias_fijos':
      return f.dias.includes(diaSemana(fecha));
    case 'cada_n_dias':
      return diffDias(h.creado, fecha) % f.n === 0;
    default:
      return true;
  }
}

/**
 * Estado del hábito un día, según su registro.
 * pendiente · hecho · parcial · excedido · saltado · descanso · congelado
 * "hecho" y "parcial" se derivan del valor: si cambias la meta,
 * los días pasados se recalculan solos y nunca quedan incoherentes.
 */
export function estadoDelDia(h, log) {
  if (!log || log.estado === 'nota') return 'pendiente';
  if (log.estado !== 'registrado') return log.estado;
  const v = log.valor ?? 0;
  if (h.tipo === 'si_no') {
    if (v >= h.vecesPorDia) return 'hecho';
    return v > 0 ? 'parcial' : 'pendiente';
  }
  const { min, max } = h.meta;
  if (max !== null && v > max) return 'excedido';
  if (min !== null) return v >= min ? 'hecho' : (v > 0 ? 'parcial' : 'pendiente');
  if (max !== null) return 'hecho'; // registrado y dentro del máximo
  return v > 0 ? 'hecho' : 'pendiente'; // solo registrar
}

/** Estados que cuentan como cumplido. */
export const cumplido = (estado) => estado === 'hecho';

/** Días hechos en la semana (lunes a la fecha, inclusive). */
export function hechosEnSemana(h, fecha, logDe) {
  let n = 0;
  for (let d = inicioSemana(fecha); d <= fecha; d = sumarDias(d, 1)) {
    if (cumplido(estadoDelDia(h, logDe(h.id, d)))) n++;
  }
  return n;
}

/** Estados que no suman ni rompen (día libre). */
export const neutro = (estado) => estado === 'descanso' || estado === 'congelado';

/**
 * Meta real de una semana para un hábito "N veces por semana".
 * Se prorratea por los días disponibles: si lo creaste un jueves (4 días de semana)
 * con meta 3, esa semana pide ceil(3 × 4 / 7) = 2. Los días en pausa, de descanso
 * o congelados tampoco cuentan como disponibles.
 * Devuelve { meta, hechos, disponibles }.
 */
export function semanaDe(h, fecha, logDe, hasta = fecha) {
  const lunes = inicioSemana(fecha);
  let disponibles = 0, hechos = 0;
  for (let i = 0; i < 7; i++) {
    const d = sumarDias(lunes, i);
    if (!activoEn(h, d)) continue;
    const estado = estadoDelDia(h, logDe(h.id, d));
    if (neutro(estado)) continue;
    disponibles++;
    if (d <= hasta && cumplido(estado)) hechos++;
  }
  const meta = disponibles === 0 ? 0 : Math.ceil((h.frecuencia.n * disponibles) / 7);
  return { meta, hechos, disponibles };
}

/**
 * Lo que la pantalla Hoy necesita de un hábito en una fecha.
 * `requerido` indica si cuenta para el "3 de 5 hechos" del día.
 */
export function vistaDelDia(h, fecha, logDe) {
  const log = logDe(h.id, fecha);
  const estado = estadoDelDia(h, log);
  let semana = null;
  let requerido = !['saltado', 'descanso', 'congelado'].includes(estado);
  if (h.frecuencia.tipo === 'semanal_n') {
    const s = semanaDe(h, fecha, logDe);
    const hechos = hechosEnSemana(h, fecha, logDe);
    const hechosAntes = hechos - (cumplido(estado) ? 1 : 0);
    semana = { hechos, n: s.meta, lista: s.meta > 0 && hechosAntes >= s.meta };
    // Si la meta semanal ya estaba lista antes de hoy, hoy es opcional.
    if (semana.lista && !cumplido(estado)) requerido = false;
  }
  return { habito: h, log, estado, semana, requerido };
}

/** Progreso del día: cuántos hábitos requeridos están hechos. */
export function progresoDelDia(vistas) {
  const requeridas = vistas.filter((v) => v.requerido);
  return { hechos: requeridas.filter((v) => cumplido(v.estado)).length, total: requeridas.length };
}
