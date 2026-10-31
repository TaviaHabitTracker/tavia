// insights.js — Lo que dicen tus datos (M7) y el resumen de la revisión semanal.
// Son patrones, no causas: el texto habla de "suelen ir de la mano", nunca de "provoca".

import { diaSemana, diffDias, inicioSemana, sumarDias } from './fechas.js';
import { cumplido, estadoDelDia, neutro, semanaDe, tocaEnFecha } from './calculos.js';
import { diaGlobal } from './estadisticas.js';

const VENTANA = 56; // 8 semanas
const MIN_DIAS = 14;

/** Insights personales; null si todavía no hay datos suficientes. */
export function calcularInsights(habitos, hoy, logDe) {
  if (habitos.length === 0) return null;
  const inicio = habitos.reduce((m, h) => (h.creado < m ? h.creado : m), hoy);
  if (diffDias(inicio, hoy) < MIN_DIAS) return null;
  const ayer = sumarDias(hoy, -1);
  const desde = [sumarDias(hoy, -VENTANA), inicio].sort().at(-1);
  return {
    mejorDia: mejorDia(habitos, desde, ayer, logDe),
    ancla: habitoAncla(habitos, desde, ayer, logDe),
    hora: horaFuerte(habitos, desde, ayer, logDe),
  };
}

/** Día de la semana con mayor cumplimiento (si se distingue al menos 10 puntos del promedio). */
function mejorDia(habitos, desde, hasta, logDe) {
  const suma = Array.from({ length: 7 }, () => ({ hechos: 0, total: 0, dias: 0 }));
  let H = 0, T = 0;
  for (let d = desde; d <= hasta; d = sumarDias(d, 1)) {
    const p = diaGlobal(habitos, d, logDe);
    if (!p.total) continue;
    const s = suma[diaSemana(d)];
    s.hechos += p.hechos; s.total += p.total; s.dias++;
    H += p.hechos; T += p.total;
  }
  if (!T) return null;
  const promedio = H / T;
  const candidatos = suma.map((s, dia) => ({ dia, pct: s.total ? s.hechos / s.total : -1, dias: s.dias })).filter((x) => x.dias >= 2);
  if (candidatos.length < 3) return null;
  candidatos.sort((a, b) => b.pct - a.pct);
  const mejor = candidatos[0];
  const peor = candidatos.at(-1);
  if (mejor.pct - promedio < 0.1) return null;
  return { dia: mejor.dia, pct: mejor.pct, promedio, peorDia: peor.dia, peorPct: peor.pct };
}

/**
 * Hábito "ancla": el que más se asocia con cumplir los demás ese mismo día.
 * Compara el cumplimiento del resto en días con y sin ese hábito hecho.
 */
function habitoAncla(habitos, desde, hasta, logDe) {
  if (habitos.length < 2) return null;
  let mejor = null;
  for (const a of habitos) {
    const con = [], sin = [];
    for (let d = desde; d <= hasta; d = sumarDias(d, 1)) {
      if (!tocaEnFecha(a, d)) continue;
      const estadoA = estadoDelDia(a, logDe(a.id, d));
      if (neutro(estadoA)) continue;
      let hechos = 0, total = 0;
      for (const b of habitos) {
        if (b.id === a.id || !tocaEnFecha(b, d) || b.frecuencia.tipo === 'semanal_n') continue;
        const e = estadoDelDia(b, logDe(b.id, d));
        if (neutro(e)) continue;
        total++;
        if (cumplido(e)) hechos++;
      }
      if (!total) continue;
      (cumplido(estadoA) ? con : sin).push(hechos / total);
    }
    if (con.length < 5 || sin.length < 5) continue;
    const prom = (xs) => xs.reduce((x, y) => x + y, 0) / xs.length;
    const pc = prom(con), ps = prom(sin);
    if (pc - ps >= 0.15 && (!mejor || pc - ps > mejor.con - mejor.sin)) mejor = { habito: a, con: pc, sin: ps };
  }
  return mejor;
}

const FRANJAS = [['manana', 5, 12], ['tarde', 12, 19], ['noche', 19, 29]];

/** Franja del día (y hora) en que más marcas tus hábitos. */
export function horaFuerte(habitos, desde, hasta, logDe) {
  const porHora = new Array(24).fill(0);
  let n = 0;
  for (const h of habitos) {
    for (let d = desde; d <= hasta; d = sumarDias(d, 1)) {
      const l = logDe(h.id, d);
      if (!l?.registradoEn || !cumplido(estadoDelDia(h, l))) continue;
      porHora[Number(l.registradoEn.slice(0, 2))]++;
      n++;
    }
  }
  if (n < 10) return null;
  const franjas = FRANJAS.map(([id, a, b]) => {
    let c = 0;
    for (let x = a; x < b; x++) c += porHora[x % 24];
    return { id, pct: c / n };
  }).sort((x, y) => y.pct - x.pct);
  const pico = porHora.indexOf(Math.max(...porHora));
  return { franja: franjas[0].id, pct: franjas[0].pct, pico, registros: n };
}

/* ---------- Revisión semanal ---------- */

/** Resumen de una semana (lunes a domingo, o hasta hoy si está en curso). */
export function resumenSemana(habitos, lunes, hoy, logDe) {
  const domingo = sumarDias(lunes, 6);
  const fin = domingo < hoy ? domingo : hoy;
  const porHabito = [];
  for (const h of habitos) {
    if (h.creado > fin || (h.archivado && h.archivado <= lunes)) continue;
    let hechos = 0, total = 0;
    if (h.frecuencia.tipo === 'semanal_n') {
      const s = semanaDe(h, lunes, logDe, fin);
      hechos = Math.min(s.hechos, s.meta); total = s.meta;
    } else {
      for (let d = lunes; d <= fin; d = sumarDias(d, 1)) {
        if (!tocaEnFecha(h, d)) continue;
        const e = estadoDelDia(h, logDe(h.id, d));
        if (neutro(e) || (d === hoy && !cumplido(e))) continue;
        total++;
        if (cumplido(e)) hechos++;
      }
    }
    if (total) porHabito.push({ habito: h, hechos, total, pct: hechos / total });
  }
  const H = porHabito.reduce((a, x) => a + x.hechos, 0);
  const T = porHabito.reduce((a, x) => a + x.total, 0);
  const orden = [...porHabito].sort((a, b) => b.pct - a.pct || b.total - a.total);
  return {
    lunes, fin,
    pct: T ? H / T : null,
    funciono: orden.filter((x) => x.pct >= 0.8).slice(0, 3),
    costo: orden.filter((x) => x.pct < 0.5).reverse().slice(0, 3),
    porHabito: orden,
  };
}

/** ¿Toca ofrecer la revisión? Domingo (semana actual) o lunes (semana recién terminada). */
export function semanaParaRevisar(hoy) {
  const dia = diaSemana(hoy);
  if (dia === 6) return inicioSemana(hoy);
  if (dia === 0) return sumarDias(inicioSemana(hoy), -7);
  return null;
}
