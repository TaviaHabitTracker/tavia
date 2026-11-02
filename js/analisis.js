// analisis.js — Análisis de constancia (diseño "Analista").
// Todo se calcula desde los registros, sin guardar nada. Nada aquí castiga:
// los días neutros (descanso, congelado, pausa) no suman ni rompen, y hoy sin marcar no es fallo.

import { diaSemana, diffDias, inicioSemana, sumarDias } from './fechas.js';
import { diaGlobal, periodos, puntaje, unidadRacha } from './estadisticas.js';

/** Días seguidos (hasta hoy) en que cumpliste al menos un hábito. */
export function rachaGlobal(habitos, hoy, logDe, { limite = 3650 } = {}) {
  if (!habitos.length) return 0;
  const inicio = habitos.reduce((m, h) => (h.creado < m ? h.creado : m), hoy);
  let n = 0;
  for (let d = hoy, i = 0; d >= inicio && i < limite; d = sumarDias(d, -1), i++) {
    const p = diaGlobal(habitos, d, logDe);
    if (p.hechos > 0) n++;
    else if (d === hoy || p.total === 0) continue; // hoy aún no termina; día sin nada que hacer
    else break;
  }
  return n;
}

/** Barras de la semana en curso (lunes a domingo): fracción cumplida de cada día. */
export function semanaGlobal(habitos, hoy, logDe) {
  const lunes = inicioSemana(hoy);
  return Array.from({ length: 7 }, (_, i) => {
    const fecha = sumarDias(lunes, i);
    if (fecha > hoy) return { fecha, pct: null, futuro: true };
    const p = diaGlobal(habitos, fecha, logDe);
    return { fecha, pct: p.total ? p.hechos / p.total : null, hechos: p.hechos, total: p.total, futuro: false };
  });
}

/** Porcentaje de la semana en curso (hoy solo cuenta lo hecho). */
export function porcentajeSemana(dias, hoy) {
  let h = 0, t = 0;
  for (const d of dias) {
    if (d.futuro || d.pct === null) continue;
    if (d.fecha === hoy) { h += d.hechos; t += d.hechos; continue; }
    h += d.hechos; t += d.total;
  }
  return t ? h / t : null;
}

/** Índice de constancia (0–100): promedio del puntaje de los hábitos activos, y su cambio en 7 días. */
export function constancia(habitos, hoy, logDe) {
  const activos = habitos.filter((h) => !h.archivado && h.creado <= hoy);
  if (!activos.length) return null;
  const hace7 = sumarDias(hoy, -7);
  const ahora = activos.reduce((s, h) => s + puntaje(h, hoy, logDe), 0) / activos.length;
  const antes7 = activos.filter((h) => h.creado <= hace7);
  const antes = antes7.length ? antes7.reduce((s, h) => s + puntaje(h, hace7, logDe), 0) / antes7.length : null;
  return { valor: Math.round(ahora * 100), cambio: antes === null ? null : Math.round(ahora * 100) - Math.round(antes * 100) };
}

/** Serie diaria del puntaje (0–100) en los últimos `dias` días, para el gráfico. */
export function seriePuntaje(h, hoy, logDe, dias = 90) {
  const desde = [sumarDias(hoy, -(dias - 1)), h.creado].sort().at(-1);
  const serie = [];
  // Un solo recorrido del historial: puntaje() avisa el valor al final de cada día.
  puntaje(h, hoy, logDe, (fecha, valor) => { if (fecha >= desde) serie.push({ fecha, v: Math.round(valor * 100) }); });
  return serie;
}

/**
 * Corridas consecutivas por tipo de período: 'ok' (racha), 'fallo' (sin registro) y 'neutro' (descanso/congelado).
 * "En curso" (hoy o la semana actual sin terminar) se muestra como parte de la racha si la viene continuando.
 */
export function corridas(h, hoy, logDe) {
  const ps = periodos(h, hoy, logDe).filter((p) => p.r !== 'en_curso');
  const out = [];
  for (const p of ps) {
    const ultima = out.at(-1);
    if (ultima && ultima.tipo === p.r) { ultima.hasta = p.fecha; ultima.largo++; }
    else out.push({ tipo: p.r, desde: p.fecha, hasta: p.fecha, largo: 1 });
  }
  return out;
}

/**
 * Cuánto tardas en volver: promedio de períodos sin registro entre una racha y la siguiente.
 * null si todavía no hay suficientes vueltas para decir algo (menos de 2).
 */
export function vuelta(corr) {
  const huecos = [];
  for (let i = 1; i < corr.length - 1; i++) {
    if (corr[i].tipo !== 'fallo') continue;
    const antes = corr.slice(0, i).some((c) => c.tipo === 'ok');
    const despues = corr.slice(i + 1).some((c) => c.tipo === 'ok');
    if (antes && despues) huecos.push(corr[i].largo);
  }
  if (huecos.length < 2) return null;
  return huecos.reduce((a, b) => a + b, 0) / huecos.length;
}

/** Análisis completo de un hábito para la hoja "Análisis". */
export function analisisHabito(h, hoy, logDe) {
  const ps = periodos(h, hoy, logDe);
  const desde90 = sumarDias(hoy, -89);
  const recientes = ps.filter((p) => p.fecha >= desde90 && (p.r === 'ok' || p.r === 'fallo'));
  const ok90 = recientes.filter((p) => p.r === 'ok').length;
  const corr = corridas(h, hoy, logDe);

  // Por día de la semana (no aplica a "N por semana": ahí cualquier día sirve).
  let porDia = null;
  if (h.frecuencia.tipo !== 'semanal_n') {
    const s = Array.from({ length: 7 }, () => ({ ok: 0, total: 0 }));
    for (const p of recientes) { s[diaSemana(p.fecha)].total++; if (p.r === 'ok') s[diaSemana(p.fecha)].ok++; }
    porDia = s.map((x) => (x.total >= 2 ? x.ok / x.total : null));
  }

  const serie = seriePuntaje(h, hoy, logDe);
  return {
    unidad: unidadRacha(h),
    pct90: recientes.length ? ok90 / recientes.length : null,
    corridas: corr,
    vuelta: vuelta(corr),
    porDia,
    serie,
    lectura: lectura({ porDia, serie, vuelta: vuelta(corr), dias: diffDias(h.creado, hoy) + 1 }),
  };
}

/**
 * Una o dos frases para leer los datos, en tono de analista: patrones, nunca juicios.
 * Devuelve claves de texto con sus variables.
 */
export function lectura({ porDia, serie, vuelta: v, dias }) {
  const frases = [];
  if (dias < 14) return [{ clave: 'analisis.lectura.pocos' }];
  if (porDia) {
    const media = (xs) => { const ys = xs.filter((x) => x !== null); return ys.length ? ys.reduce((a, b) => a + b, 0) / ys.length : null; };
    const semana = media(porDia.slice(0, 5));
    const finde = media(porDia.slice(5));
    if (semana !== null && finde !== null && Math.abs(semana - finde) >= 0.15) {
      frases.push({ clave: finde < semana ? 'analisis.lectura.findeMenos' : 'analisis.lectura.findeMas', vars: { pts: Math.round(Math.abs(semana - finde) * 100) } });
    }
  }
  if (serie.length >= 31) {
    const cambio = serie.at(-1).v - serie.at(-31).v;
    if (Math.abs(cambio) >= 5) frases.push({ clave: cambio > 0 ? 'analisis.lectura.sube' : 'analisis.lectura.baja', vars: { pts: Math.abs(cambio) } });
  }
  if (v !== null) frases.push({ clave: 'analisis.lectura.vuelta', vars: { n: Math.round(v * 10) / 10 } });
  return frases.length ? frases.slice(0, 2) : [{ clave: 'analisis.lectura.estable' }];
}
