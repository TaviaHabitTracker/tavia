// anual.js — Tu año en Tavia (M8): el resumen tipo "Wrapped".
// Todo se calcula desde los registros (nada se guarda). Hoy solo cuenta si ya está completo.

import { diaSemana, diffDias, sumarDias } from './fechas.js';
import { cumplido, estadoDelDia } from './calculos.js';
import { diaGlobal, nivelCalor, porcentajePeriodo } from './estadisticas.js';
import { horaFuerte } from './insights.js';

const MIN_DIAS_HABITO = 14; // para elegir el hábito más constante sin que gane uno de 3 días

/** Años que tienen al menos un hábito activo (para elegir cuál ver). El actual primero. */
export function aniosDisponibles(habitos, hoy) {
  const actual = Number(hoy.slice(0, 4));
  const primero = habitos.reduce((m, h) => Math.min(m, Number(h.creado.slice(0, 4))), actual);
  const out = [];
  for (let a = actual; a >= primero; a--) out.push(a);
  return out;
}

/**
 * Resumen del año. Devuelve null si no hay hábitos ese año.
 * @returns {{ anio, desde, hasta, diasPosibles, diasConRegistro, marcas, pct, rachaDias, mejorMes, mejorDia,
 *             constante, hora, congelados, descansos, notas, mapa }}
 */
export function resumenAnual(habitos, anio, hoy, logDe, { revisiones = [] } = {}) {
  const inicioAnio = `${anio}-01-01`;
  const finAnio = `${anio}-12-31`;
  const enAnio = habitos.filter((h) => h.creado <= finAnio && (!h.archivado || h.archivado > inicioAnio));
  if (!enAnio.length || inicioAnio > hoy) return null;

  const primero = enAnio.reduce((m, h) => (h.creado < m ? h.creado : m), finAnio);
  const desde = primero > inicioAnio ? primero : inicioAnio;
  const hasta = finAnio < hoy ? finAnio : hoy;

  let marcas = 0, diasConRegistro = 0, racha = 0, rachaDias = 0, congelados = 0, descansos = 0, notas = 0;
  const mapa = new Map(); // fecha → nivel 0–4 (o null si ese día no tocaba nada)
  const porDia = Array.from({ length: 7 }, () => ({ hechos: 0, total: 0 }));
  let H = 0, T = 0;
  for (let d = desde; d <= hasta; d = sumarDias(d, 1)) {
    const p = diaGlobal(enAnio, d, logDe);
    mapa.set(d, nivelCalor(p));
    if (d !== hoy || p.hechos >= p.total) {
      porDia[diaSemana(d)].hechos += p.hechos;
      porDia[diaSemana(d)].total += p.total;
      H += p.hechos; T += p.total;
    }
    let algo = false;
    for (const h of enAnio) {
      const l = logDe(h.id, d);
      if (!l) continue;
      if (l.nota) notas++;
      if (l.estado === 'congelado') congelados++;
      else if (l.estado === 'descanso') descansos++;
      else if (cumplido(estadoDelDia(h, l))) { marcas++; algo = true; }
    }
    if (algo) { diasConRegistro++; racha++; rachaDias = Math.max(rachaDias, racha); }
    else if (d !== hoy) racha = 0; // hoy sin marcar todavía no corta la racha
  }

  // Mejor mes (con al menos una semana de datos).
  let mejorMes = null;
  for (let m = 1; m <= 12; m++) {
    const ini = `${anio}-${String(m).padStart(2, '0')}-01`;
    const fin = sumarDias(m === 12 ? `${anio + 1}-01-01` : `${anio}-${String(m + 1).padStart(2, '0')}-01`, -1);
    const a = ini > desde ? ini : desde;
    const b = fin < hasta ? fin : hasta;
    if (a > b || diffDias(a, b) < 6) continue;
    const pct = porcentajePeriodo(enAnio, a, b, hoy, logDe);
    if (pct !== null && (!mejorMes || pct > mejorMes.pct)) mejorMes = { mes: m - 1, pct };
  }

  // Mejor día de la semana.
  const dias = porDia.map((s, dia) => ({ dia, pct: s.total ? s.hechos / s.total : null })).filter((x) => x.pct !== null);
  const mejorDia = dias.length >= 3 ? dias.sort((x, y) => y.pct - x.pct)[0] : null;

  // Hábito más constante (porcentaje del año) entre los que tuvieron al menos dos semanas.
  let constante = null;
  for (const h of enAnio) {
    const a = h.creado > desde ? h.creado : desde;
    const b = h.archivado && sumarDias(h.archivado, -1) < hasta ? sumarDias(h.archivado, -1) : hasta;
    if (a > b || diffDias(a, b) + 1 < MIN_DIAS_HABITO) continue;
    const pct = porcentajePeriodo([h], a, b, hoy, logDe);
    if (pct !== null && (!constante || pct > constante.pct)) constante = { habito: h, pct };
  }

  return {
    anio,
    desde,
    hasta,
    diasPosibles: diffDias(desde, hasta) + 1,
    diasConRegistro,
    marcas,
    pct: T ? H / T : null,
    rachaDias,
    mejorMes,
    mejorDia,
    constante,
    hora: horaFuerte(enAnio, desde, hasta, logDe),
    congelados,
    descansos,
    notas,
    revisiones: revisiones.filter((r) => r.semana.startsWith(`${anio}-`)).length,
    mapa,
  };
}

/** ¿Hay suficiente para un resumen que valga la pena? (una semana con registros) */
export const resumenListo = (r) => Boolean(r) && r.diasConRegistro >= 7;
