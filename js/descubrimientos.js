// descubrimientos.js — Descubrimientos de tu semana (Módulo 11). Lógica pura, sin DOM.
// Observaciones que se calculan en el dispositivo a partir de tus propios registros.
// Reglas: nada sale del teléfono, no hay IA, solo estadística simple y explicable.
// Correlación no es causa: los textos (en textos.js, claves desc.*) hablan de "parece que" y "sueles".
// Mejor mostrar nada que mostrar ruido: cada detector exige muestra mínima, intervalos de Wilson
// y, si compara, estabilidad en las dos mitades de la ventana (y Fisher con Bonferroni cuando corresponde).

import { diaSemana, diffDias, inicioSemana, sumarDias } from './fechas.js';
import { activoEn, cumplido, estadoDelDia, neutro, tocaEnFecha } from './calculos.js';
import { periodos, unidadRacha } from './estadisticas.js';
import { TIPOS_DESC, descConfigPorDefecto } from './esquema.js';
import { bonferroni, fisher, mediana, seSolapan, wilson, zCorregido } from './estadistica.js';

/**
 * Umbrales (constantes configurables). Si cambias uno, deja su motivo en una línea al lado.
 * Ajuste respecto de la especificación, medido con tests/descubrimientos.test.mjs (1.000 usuarios × 12 semanas):
 * - minHistoria 14: con menos de dos semanas no hay nada honesto que decir (mismo criterio que insights.js).
 * - g1/p7 alfa 0.05: el límite inferior de Wilson usa un z corregido por Bonferroni (grupos × conjuntos evaluados);
 *   g1 margenBajo 0 (antes 5 pp): con el z corregido, el margen extra dejaba fuera patrones claros (detección 64 % → ver pruebas);
 *   sin eso, "el mejor de 7 días" en varios hábitos aparecía por azar en ~6 % de las semanas.
 * - p1 limiteFranja 0.5: el límite inferior de Wilson de la franja (no solo la proporción) debe llegar al 50 %;
 *   con horas al azar, la tarde ya junta ~40 % y con 15 registros pasaba el 50 % por puro ruido.
 * - p4 margen 0.02 + mitades: "igual o más" se exige con el límite inferior de Wilson (−2 pp de tolerancia)
 *   y en las dos mitades; con solo la proporción, la mitad de los usuarios sin patrón lo veía.
 */
export const UMBRALES = {
  ventana: 90, // días hacia atrás (hasta ayer); el año completo para G2 y P8
  anio: 365,
  minHistoria: 14,
  g1: { minPorDia: 8, minDias: 2, margenBajo: 0, diferencia: 0.12, clara: 0.12, alfa: 0.05 },
  g2: { minInterrupciones: 3, minRachas: 3, largoRacha: 2 },
  g3: { semanasHistoria: 2, semanasComparar: 8 },
  g4: { minRegistros: 10, minFranja: 0.5 },
  p1: { minRegistros: 15, minFranja: 0.5, limiteFranja: 0.5, minMitad: 5, alfa: 0.05 },
  p2: { minComunes: 30, minCondicion: 10, diferencia: 0.2, alfa: 0.01 },
  p3: { semanas: 4, minOcurrencias: 20, diferencia: 0.08 },
  p4: { minDescansos: 6, margen: 0.02 },
  p5: { minRegistros: 14, semanasGrafico: 13 },
  p6: { minCon: 5, minSin: 10, diferencia: 0.15, alfa: 0.01 },
  p7: { minPorBloque: 20, margenBajo: 0.05, diferencia: 0.12, alfa: 0.05 },
  p8: { minMeses: 3, minPorMes: 20 },
  seleccion: { cupoGratis: 2, cupoPro: 3, semanasNovedad: 8, semanasCaducidad: 3 },
};

export { TIPOS_DESC };
/** Los "de patrón" afirman una diferencia; los otros solo resumen (cuentan aparte en la tasa de falsos positivos). */
export const DE_PATRON = new Set(['g1', 'p1', 'p2', 'p3', 'p4', 'p6', 'p7']);
export const DE_PRO = new Set(['p1', 'p2', 'p3', 'p4', 'p5', 'p6', 'p7', 'p8']);
/** G3 (resumen de la semana) va aparte: no se elige ni cuenta en el cupo. */
export const ELEGIBLES = TIPOS_DESC.filter((x) => x !== 'g3');
/**
 * Tavia todavía no tiene plan de pago: mientras no exista Pro, todo queda abierto con el cupo de Pro.
 * Cuando exista, basta con leer el plan real aquí; lo gratis (G1–G4, 2 por semana) nunca se quita.
 */
export const PLAN_ACTUAL = 'pro';

/** Tavia no tiene categorías: un hábito es "sensible" (medicinas, tratamientos) por su ícono. */
export const EMOJIS_SENSIBLES = new Set(['💊', '💉', '🩺', '⚖️', '⚖']);
export const esSensible = (h) => EMOJIS_SENSIBLES.has(h.icono);

export const FRANJAS = [['madrugada', 0, 6], ['manana', 6, 12], ['tarde', 12, 19], ['noche', 19, 24]];
const BLOQUES_DESC = ['manana', 'tarde', 'noche', 'dia'];

export const ajustesPorDefecto = descConfigPorDefecto;

/* ---------- Qué hábitos entran ---------- */

/**
 * base: hábitos que pueden tener descubrimientos propios.
 * comparables: los que entran en comparaciones, tendencias y cálculos globales (sin los sensibles).
 * Privados: solo si el usuario los incluyó y la bóveda está abierta. Sensibles: solo si los incluyó.
 */
export function habitosIncluidos(habitos, ajustes, { privadosVisibles = false } = {}) {
  const fuera = new Set(ajustes.excluidos), dentro = new Set(ajustes.incluidos);
  const base = habitos.filter((h) => {
    if (fuera.has(h.id)) return false;
    if (h.privado && !(privadosVisibles && dentro.has(h.id))) return false;
    if (esSensible(h) && !dentro.has(h.id)) return false;
    return true;
  });
  return { base, comparables: base.filter((h) => !esSensible(h)) };
}

/* ---------- Matriz de días ---------- */

/**
 * Para cada hábito y cada día lógico: 1 cumplido, 0 no cumplido, null no cuenta.
 * No cuentan: días que no tocan, antes de crearlo, archivado o en pausa, descanso, congelado y "Hoy no".
 * Los hábitos "N por semana" no tienen días programados: quedan fuera de las tasas por día.
 */
export function construirMatriz(habitos, desde, hasta, logDe) {
  const fechas = [];
  for (let d = desde; d <= hasta; d = sumarDias(d, 1)) fechas.push(d);
  const dias = fechas.map(diaSemana);
  const filas = habitos.map((h) => {
    const n = fechas.length;
    const v = new Array(n).fill(null), hora = new Array(n).fill(null), valor = new Array(n).fill(null), descanso = new Array(n).fill(false);
    const porDia = h.frecuencia.tipo !== 'semanal_n';
    for (let i = 0; i < n; i++) {
      const d = fechas[i];
      if (!activoEn(h, d)) continue;
      const log = logDe(h.id, d);
      if (log?.estado === 'descanso') descanso[i] = true;
      if (log?.estado === 'registrado') valor[i] = log.valor;
      const estado = estadoDelDia(h, log);
      if (cumplido(estado) && log?.registradoEn) hora[i] = log.registradoEn;
      if (!porDia || !tocaEnFecha(h, d) || neutro(estado) || estado === 'saltado') continue;
      v[i] = cumplido(estado) ? 1 : 0;
    }
    return { h, v, hora, valor, descanso };
  });
  return { fechas, dias, filas };
}

/** Suma de cumplidos y ocurrencias de un conjunto de filas entre los índices [a, b), con un filtro de día. */
function contar(filas, a, b, filtro = null) {
  let x = 0, n = 0;
  for (const f of filas) {
    for (let i = a; i < b; i++) {
      const v = f.v[i];
      if (v === null || (filtro && !filtro(i, f))) continue;
      n++; x += v;
    }
  }
  return { x, n };
}
const tasa = ({ x, n }) => (n ? x / n : null);
const limitar = (v, a = 0.05, b = 1) => Math.min(b, Math.max(a, v));
const fuerzaDe = (exceso, escala) => limitar(0.3 + exceso / escala);

/* ---------- G1 · día más constante (y P7, que usa el mismo criterio por bloque) ---------- */

/**
 * Elige el grupo con mayor tasa y lo acepta solo si su límite inferior de Wilson supera la tasa global
 * por `margenBajo`, la diferencia es de `diferencia` o más, y gana también en las dos mitades de la ventana.
 */
function mejorGrupo(filas, a, b, grupoDe, nGrupos, U) {
  const mitad = a + Math.floor((b - a) / 2);
  const total = contar(filas, a, b);
  if (!total.n) return null;
  const global = total.x / total.n;
  const grupos = Array.from({ length: nGrupos }, (_, g) => ({ g, ...contar(filas, a, b, (i, f) => grupoDe(i, f) === g) }));
  const evaluados = grupos.filter((x) => x.n >= U.minPorGrupo);
  if (evaluados.length < U.minGrupos) return null;
  const mejor = evaluados.reduce((m, x) => (x.x / x.n > m.x / m.n || (x.x / x.n === m.x / m.n && x.n > m.n) ? x : m));
  const p = mejor.x / mejor.n;
  // Límite inferior con z corregido por Bonferroni: se compararon `evaluados` grupos en `U.conjuntos` conjuntos.
  const w = wilson(mejor.x, mejor.n, zCorregido(U.alfa, evaluados.length * (U.conjuntos || 1)));
  if (w.bajo - global < U.margenBajo || p - global < U.diferencia) return null;
  // Estabilidad: en cada mitad, el mismo grupo supera la tasa global de esa mitad.
  for (const [x0, x1] of [[a, mitad], [mitad, b]]) {
    const tg = tasa(contar(filas, x0, x1));
    const tm = tasa(contar(filas, x0, x1, (i, f) => grupoDe(i, f) === mejor.g));
    if (tg === null || tm === null || tm <= tg) return null;
  }
  return { mejor, p, w, global, grupos, total };
}

function detectorG1(M, a, b, filas, global, conjuntos = 1) {
  const U = UMBRALES.g1;
  const r = mejorGrupo(filas, a, b, (i) => M.dias[i], 7, { minPorGrupo: U.minPorDia, minGrupos: U.minDias, margenBajo: U.margenBajo, diferencia: U.diferencia, alfa: U.alfa, conjuntos });
  if (!r) return null;
  const { mejor, p, w } = r;
  return {
    tipo: 'g1',
    habitIds: global ? [] : [filas[0].h.id],
    clave: `d${mejor.g}`,
    tono: 'positivo',
    fuerza: fuerzaDe(w.bajo - r.global, 0.3),
    params: { dia: mejor.g, x: mejor.x, n: mejor.n, resto: Math.round(((r.total.x - mejor.x) / Math.max(1, r.total.n - mejor.n)) * 10) },
    evidencia: evidencia(b - a, { x: mejor.x, n: mejor.n, tasa: p, bajo: w.bajo, alto: w.alto, global: r.global, clara: w.bajo - r.global >= U.clara, umbrales: `≥${U.minPorDia} por día; límite inferior (corregido por comparaciones) +${pp(U.margenBajo)}; diferencia ≥${pp(U.diferencia)}; ambas mitades` }),
    grafico: { barras: r.grupos.map((g) => [g.x, g.n]), resaltado: mejor.g, eje: 'dias' },
  };
}

function detectorP7(M, a, b, filas) {
  const U = UMBRALES.p7;
  const r = mejorGrupo(filas, a, b, (i, f) => BLOQUES_DESC.indexOf(f.h.bloque), 4, { minPorGrupo: U.minPorBloque, minGrupos: 2, margenBajo: U.margenBajo, diferencia: U.diferencia, alfa: U.alfa });
  if (!r) return null;
  const { mejor, p, w } = r;
  const bloque = BLOQUES_DESC[mejor.g];
  return {
    tipo: 'p7', habitIds: [], clave: bloque, tono: 'positivo',
    fuerza: fuerzaDe(w.bajo - r.global, 0.3),
    params: { bloque, x: mejor.x, n: mejor.n },
    evidencia: evidencia(b - a, { x: mejor.x, n: mejor.n, tasa: p, bajo: w.bajo, alto: w.alto, global: r.global, clara: w.bajo - r.global >= UMBRALES.g1.clara, umbrales: `≥${U.minPorBloque} por bloque; límite inferior +${pp(U.margenBajo)}; diferencia ≥${pp(U.diferencia)}; ambas mitades` }),
    // Solo el bloque que fluye mejor se nombra: el gráfico muestra los demás sin etiqueta de "menos".
    grafico: { barras: r.grupos.map((g) => [g.x, g.n]), resaltado: mejor.g, eje: 'bloques' },
  };
}

/* ---------- G2 · racha típica y retomar ---------- */

function detectorG2(h, hoy, desdeAnio, logDe) {
  const U = UMBRALES.g2;
  // Períodos del último año. "Hoy no" (saltado) no cuenta como fallo aquí: se trata como día neutro.
  const ps = periodos(h, hoy, logDe)
    .filter((p) => p.fecha >= desdeAnio && p.r !== 'en_curso')
    .map((p) => (p.r === 'fallo' && h.frecuencia.tipo !== 'semanal_n' && logDe(h.id, p.fecha)?.estado === 'saltado' ? { ...p, r: 'neutro' } : p))
    .filter((p) => p.r !== 'neutro');
  const corridas = [];
  for (const p of ps) {
    const u = corridas.at(-1);
    if (u && u.r === p.r) u.n++;
    else corridas.push({ r: p.r, n: 1 });
  }
  const rachas = corridas.filter((c) => c.r === 'ok' && c.n >= U.largoRacha).map((c) => c.n);
  // Interrupción: tramo sin cumplir entre dos tramos cumplidos.
  const pausas = corridas.filter((c, i) => c.r === 'fallo' && corridas[i - 1]?.r === 'ok' && corridas[i + 1]?.r === 'ok').map((c) => c.n);
  if (pausas.length < U.minInterrupciones || rachas.length < U.minRachas) return null;
  const racha = Math.round(mediana(rachas));
  const retomar = Math.max(1, Math.round(mediana(pausas)));
  return {
    tipo: 'g2', habitIds: [h.id], clave: `r${retomar}`, tono: 'positivo',
    fuerza: limitar(pausas.length / 12 + 0.2),
    params: { racha, retomar, unidad: unidadRacha(h) },
    evidencia: evidencia(UMBRALES.anio, { rachas: rachas.length, interrupciones: pausas.length, clara: pausas.length >= 6, umbrales: `≥${U.minInterrupciones} interrupciones y ≥${U.minRachas} rachas en el año` }),
    grafico: { barras: rachas.slice(-12).map((n) => [n, Math.max(...rachas)]), resaltado: -1, eje: 'rachas' },
  };
}

/* ---------- G4 y P1 · franja del día ---------- */

export const franjaDe = (hhmm) => {
  const h = Number(hhmm.slice(0, 2));
  return FRANJAS.findIndex(([, a, b]) => h >= a && h < b);
};

function contarFranjas(filas, a, b) {
  const c = [0, 0, 0, 0];
  for (const f of filas) for (let i = a; i < b; i++) if (f.hora[i]) c[franjaDe(f.hora[i])]++;
  return c;
}

function detectorG4(filas, a, b) {
  const U = UMBRALES.g4;
  const c = contarFranjas(filas, a, b);
  const n = c.reduce((s, x) => s + x, 0);
  if (n < U.minRegistros) return null;
  const top = c.indexOf(Math.max(...c));
  if (c[top] / n < U.minFranja) return null;
  return {
    tipo: 'g4', habitIds: [], clave: FRANJAS[top][0], tono: 'neutro',
    fuerza: limitar((c[top] / n - 0.5) * 2 + 0.2),
    params: { franja: FRANJAS[top][0], x: c[top], n },
    evidencia: evidencia(b - a, { x: c[top], n, tasa: c[top] / n, clara: n >= 30, umbrales: `≥${U.minRegistros} registros con hora; ≥${pp(U.minFranja)} en una franja` }),
    grafico: { barras: c.map((x) => [x, n]), resaltado: top, eje: 'franjas' },
  };
}

function detectorP1(f, a, b, recordatorios, conjuntos = 1) {
  const U = UMBRALES.p1;
  const c = contarFranjas([f], a, b);
  const n = c.reduce((s, x) => s + x, 0);
  if (n < U.minRegistros) return null;
  const top = c.indexOf(Math.max(...c));
  if (c[top] / n < U.minFranja) return null;
  // La franja debe ser mayoría con confianza (4 franjas comparadas, en `conjuntos` hábitos).
  if (wilson(c[top], n, zCorregido(U.alfa, 4 * conjuntos)).bajo < U.limiteFranja) return null;
  const mitad = a + Math.floor((b - a) / 2);
  for (const [x0, x1] of [[a, mitad], [mitad, b]]) {
    const ch = contarFranjas([f], x0, x1);
    const nh = ch.reduce((s, x) => s + x, 0);
    if (nh < U.minMitad || ch.indexOf(Math.max(...ch)) !== top) return null;
  }
  const franja = FRANJAS[top][0];
  let accion = null;
  // Acción opcional: solo si hay exactamente un recordatorio y está en otra franja.
  if (recordatorios.length === 1 && franjaDe(recordatorios[0]) !== top) {
    const minutos = [];
    for (let i = a; i < b; i++) if (f.hora[i] && franjaDe(f.hora[i]) === top) minutos.push(Number(f.hora[i].slice(0, 2)) * 60 + Number(f.hora[i].slice(3, 5)));
    let m = Math.round(mediana(minutos) / 15) * 15;
    m = Math.min(Math.max(m, FRANJAS[top][1] * 60), FRANJAS[top][2] * 60 - 15);
    accion = { tipo: 'recordatorio', desde: recordatorios[0], hora: `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}` };
  }
  return {
    tipo: 'p1', habitIds: [f.h.id], clave: franja, tono: 'positivo',
    fuerza: limitar((c[top] / n - 0.5) * 2 + 0.3),
    params: { franja, x: c[top], n },
    accion,
    evidencia: evidencia(b - a, { x: c[top], n, tasa: c[top] / n, clara: c[top] / n >= 0.7 && n >= 30, umbrales: `≥${U.minRegistros} registros con hora; mayoría clara (límite inferior ≥${pp(U.limiteFranja)}) en una franja; la misma franja en ambas mitades` }),
    grafico: { barras: c.map((x) => [x, n]), resaltado: top, eje: 'franjas' },
  };
}

/* ---------- P2 · hábitos que suelen ir juntos ---------- */

function tablaPar(A, B, a, b) {
  let s11 = 0, s10 = 0, s01 = 0, s00 = 0;
  for (let i = a; i < b; i++) {
    const x = A.v[i], y = B.v[i];
    if (x === null || y === null) continue;
    if (x && y) s11++; else if (x) s10++; else if (y) s01++; else s00++;
  }
  return { s11, s10, s01, s00, n: s11 + s10 + s01 + s00 };
}

function detectorP2(filas, a, b) {
  const U = UMBRALES.p2;
  const mitad = a + Math.floor((b - a) / 2);
  const pares = [];
  for (let i = 0; i < filas.length; i++) for (let j = i + 1; j < filas.length; j++) {
    const t = tablaPar(filas[i], filas[j], a, b);
    if (t.n >= U.minComunes) pares.push({ A: filas[i], B: filas[j], t });
  }
  const m = pares.length;
  const corte = bonferroni(U.alfa, m);
  let mejor = null;
  for (const { A, B, t } of pares) {
    // Dos direcciones: "los días que haces A, también sueles hacer B" y al revés.
    for (const [X, Y, a1, a0, b1, b0] of [[A, B, t.s11, t.s10, t.s01, t.s00], [B, A, t.s11, t.s01, t.s10, t.s00]]) {
      // a1: X sí, Y sí · a0: X sí, Y no · b1: X no, Y sí · b0: X no, Y no
      const nCon = a1 + a0, nSin = b1 + b0;
      if (nCon < U.minCondicion || nSin < U.minCondicion) continue;
      const con = a1 / nCon, sin = b1 / nSin;
      if (con - sin < U.diferencia) continue;
      const p = fisher(a1, a0, b1, b0);
      if (p >= corte) continue;
      let estable = true;
      for (const [x0, x1] of [[a, mitad], [mitad, b]]) {
        const h = X === A ? tablaPar(A, B, x0, x1) : tablaPar(B, A, x0, x1);
        const c1 = h.s11 + h.s10, c0 = h.s01 + h.s00;
        if (!c1 || !c0 || h.s11 / c1 <= h.s01 / c0) { estable = false; break; }
      }
      if (!estable) continue;
      if (!mejor || p < mejor.p || (p === mejor.p && con - sin > mejor.con - mejor.sin)) mejor = { X, Y, con, sin, p, nCon, nSin, a1, b1 };
    }
  }
  if (!mejor) return null;
  return {
    tipo: 'p2', habitIds: [mejor.X.h.id, mejor.Y.h.id], clave: 'par', tono: 'positivo',
    fuerza: limitar(0.3 + Math.min(1, -Math.log10(mejor.p / corte) / 4) * 0.7),
    params: { a: mejor.X.h.id, b: mejor.Y.h.id, con: Math.round(mejor.con * 100), sin: Math.round(mejor.sin * 100) },
    evidencia: evidencia(b - a, { x: mejor.a1, n: mejor.nCon, x0: mejor.b1, n0: mejor.nSin, tasa: mejor.con, global: mejor.sin, pValor: mejor.p, corte, pares: m, clara: mejor.p < corte / 10, umbrales: `≥${U.minComunes} días en común; ≥${U.minCondicion} en cada caso; diferencia ≥${pp(U.diferencia)}; Fisher p < ${U.alfa}/${m}; ambas mitades` }),
    grafico: { barras: [[mejor.a1, mejor.nCon], [mejor.b1, mejor.nSin]], resaltado: 0, eje: 'par' },
  };
}

/* ---------- P3 · tendencia de constancia ---------- */

function detectorP3(M, filas) {
  const U = UMBRALES.p3;
  const n = M.fechas.length;
  const L = U.semanas * 7;
  if (n < 2 * L) return null;
  const ahora = contar(filas, n - L, n), antes = contar(filas, n - 2 * L, n - L);
  if (ahora.n < U.minOcurrencias || antes.n < U.minOcurrencias) return null;
  const wa = wilson(ahora.x, ahora.n), wb = wilson(antes.x, antes.n);
  const dif = wa.p - wb.p;
  if (Math.abs(dif) < U.diferencia || seSolapan(wa, wb)) return null;
  const sube = dif > 0;
  const semanas = [];
  for (let k = 2 * U.semanas - 1; k >= 0; k--) semanas.push(contar(filas, n - (k + 1) * 7, n - k * 7));
  return {
    tipo: 'p3', habitIds: [], clave: sube ? 'sube' : 'baja', tono: sube ? 'positivo' : 'baja',
    fuerza: fuerzaDe(sube ? wa.bajo - wb.alto : wb.bajo - wa.alto, 0.2),
    params: { sentido: sube ? 'sube' : 'baja', ahora: Math.round(wa.p * 100), antes: Math.round(wb.p * 100) },
    evidencia: evidencia(2 * L, { x: ahora.x, n: ahora.n, x0: antes.x, n0: antes.n, tasa: wa.p, bajo: wa.bajo, alto: wa.alto, global: wb.p, bajo0: wb.bajo, alto0: wb.alto, clara: Math.abs(dif) >= 0.15, umbrales: `≥${U.minOcurrencias} por ventana de 4 semanas; diferencia ≥${pp(U.diferencia)}; intervalos sin solaparse` }),
    grafico: { barras: semanas.map((s) => [s.x, s.n]), resaltado: sube ? semanas.length - 1 : -1, eje: 'semanas' },
  };
}

/* ---------- P4 · después del descanso ---------- */

function detectorP4(filas, a, b) {
  const U = UMBRALES.p4;
  const tras = (x0, x1) => {
    let x = 0, n = 0;
    for (const f of filas) {
      for (let i = x0; i < x1 - 1; i++) {
        if (!f.descanso[i] || f.v[i + 1] === null) continue;
        n++; x += f.v[i + 1];
      }
    }
    return { x, n };
  };
  const { x, n } = tras(a, b);
  if (n < U.minDescansos) return null;
  const habitual = tasa(contar(filas, a, b));
  if (habitual === null || x / n < habitual) return null; // si es menor, no se dice nada
  const w = wilson(x, n);
  // "Igual o más" con confianza: el límite inferior no queda por debajo de lo habitual (con una tolerancia chica).
  if (w.bajo < habitual - U.margen) return null;
  const mitad = a + Math.floor((b - a) / 2);
  for (const [x0, x1] of [[a, mitad], [mitad, b]]) {
    const r = tras(x0, x1), th = tasa(contar(filas, x0, x1));
    if (!r.n || th === null || r.x / r.n < th) return null;
  }
  return {
    tipo: 'p4', habitIds: [], clave: 'descanso', tono: 'positivo',
    fuerza: limitar(0.25 + (x / n - habitual)),
    params: { x, n },
    evidencia: evidencia(b - a, { x, n, tasa: x / n, bajo: w.bajo, alto: w.alto, global: habitual, clara: w.bajo >= habitual, umbrales: `≥${U.minDescansos} descansos seguidos de un día que tocaba; límite inferior ≥ lo habitual −${pp(U.margen)}; ambas mitades` }),
    grafico: { barras: [[x, n], [Math.round(habitual * 1000), 1000]], resaltado: 0, eje: 'descanso' },
  };
}

/* ---------- P5 · hábitos de cantidad ---------- */

function detectorP5(M, f, a, b) {
  const U = UMBRALES.p5;
  const h = f.h;
  if (h.tipo !== 'cantidad') return null;
  const valores = [];
  for (let i = a; i < b; i++) if (f.valor[i] !== null) valores.push(f.valor[i]);
  if (valores.length < U.minRegistros) return null;
  const prom = valores.reduce((s, v) => s + v, 0) / valores.length;
  const tieneMeta = h.meta.min !== null || h.meta.max !== null;
  const dentro = contar([f], a, b);
  // Semanas (lunes) con días dentro de la meta, para el gráfico y la "mejor semana".
  const semanas = new Map();
  for (let i = a; i < b; i++) {
    const lunes = inicioSemana(M.fechas[i]);
    const s = semanas.get(lunes) || { x: 0, n: 0, suma: 0, k: 0 };
    if (f.v[i] !== null) { s.n++; s.x += f.v[i]; }
    if (f.valor[i] !== null) { s.suma += f.valor[i]; s.k++; }
    semanas.set(lunes, s);
  }
  const lista = [...semanas.entries()].slice(-U.semanasGrafico);
  let mejor = -1;
  lista.forEach(([, s], i) => {
    const valor = tieneMeta ? s.x : s.k;
    const actual = mejor < 0 ? -1 : (tieneMeta ? lista[mejor][1].x : lista[mejor][1].k);
    if (valor > 0 && valor >= actual) mejor = i;
  });
  const ultimos7 = valores.slice(-7);
  return {
    tipo: 'p5', habitIds: [h.id], clave: tieneMeta ? 'meta' : 'registro', tono: 'neutro',
    fuerza: limitar(valores.length / 60 + 0.2),
    params: { meta: tieneMeta, x: dentro.x, n: dentro.n, dias: valores.length, prom: Math.round(prom * 10) / 10, mejorSemana: mejor >= 0 ? lista[mejor][0] : null },
    evidencia: evidencia(b - a, { x: dentro.x, n: dentro.n, registros: valores.length, promedio: Math.round(prom * 100) / 100, media7: Math.round((ultimos7.reduce((s, v) => s + v, 0) / ultimos7.length) * 100) / 100, clara: valores.length >= 30, umbrales: `≥${U.minRegistros} registros con valor` }),
    grafico: { barras: lista.map(([, s]) => (tieneMeta ? [s.x, 7] : [s.k, 7])), resaltado: mejor, eje: 'semanas' },
  };
}

/* ---------- P6 · palabras guía ---------- */

function detectorP6(M, filas, a, b, porDia) {
  const U = UMBRALES.p6;
  const mitad = a + Math.floor((b - a) / 2);
  const usadas = new Map();
  for (let i = a; i < b; i++) {
    const p = porDia?.[M.fechas[i]];
    if (p && p !== '-') usadas.set(p, (usadas.get(p) || 0) + 1);
  }
  const candidatas = [...usadas.entries()].filter(([, k]) => k >= U.minCon && (b - a) - k >= U.minSin);
  const m = candidatas.length;
  if (!m) return null;
  const corte = bonferroni(U.alfa, m);
  let mejor = null;
  for (const [palabra] of candidatas) {
    const con = (i) => porDia[M.fechas[i]] === palabra;
    const c = contar(filas, a, b, con), s = contar(filas, a, b, (i) => !con(i));
    if (!c.n || !s.n || c.x / c.n - s.x / s.n < U.diferencia) continue;
    const p = fisher(c.x, c.n - c.x, s.x, s.n - s.x);
    if (p >= corte) continue;
    let estable = true;
    for (const [x0, x1] of [[a, mitad], [mitad, b]]) {
      const ch = tasa(contar(filas, x0, x1, con)), sh = tasa(contar(filas, x0, x1, (i) => !con(i)));
      if (ch === null || sh === null || ch <= sh) { estable = false; break; }
    }
    if (estable && (!mejor || p < mejor.p)) mejor = { palabra, c, s, p };
  }
  if (!mejor) return null;
  const { c, s } = mejor;
  return {
    tipo: 'p6', habitIds: [], clave: mejor.palabra, tono: 'positivo',
    fuerza: limitar(0.3 + Math.min(1, -Math.log10(mejor.p / corte) / 4) * 0.7),
    params: { palabra: mejor.palabra, con: Math.round((c.x / c.n) * 100), sin: Math.round((s.x / s.n) * 100) },
    evidencia: evidencia(b - a, { x: c.x, n: c.n, x0: s.x, n0: s.n, tasa: c.x / c.n, global: s.x / s.n, pValor: mejor.p, corte, pares: m, clara: mejor.p < corte / 10, umbrales: `≥${U.minCon} días con la palabra y ≥${U.minSin} sin ella; diferencia ≥${pp(U.diferencia)}; Fisher p < ${U.alfa}/${m}; ambas mitades` }),
    grafico: { barras: [[c.x, c.n], [s.x, s.n]], resaltado: 0, eje: 'par' },
  };
}

/* ---------- P8 · mes más constante ---------- */

function detectorP8(M, filas) {
  const U = UMBRALES.p8;
  const meses = new Map();
  for (let i = 0; i < M.fechas.length; i++) {
    const k = M.fechas[i].slice(0, 7);
    if (!meses.has(k)) meses.set(k, { mes: k, x: 0, n: 0 });
  }
  for (const m of meses.values()) {
    const r = contar(filas, 0, M.fechas.length, (i) => M.fechas[i].startsWith(m.mes));
    m.x = r.x; m.n = r.n;
  }
  const validos = [...meses.values()].filter((m) => m.n >= U.minPorMes);
  if (validos.length < U.minMeses) return null;
  // El mejor (en empate, el más reciente). Nunca se nombra el que menos.
  const mejor = validos.reduce((a, m) => (m.x / m.n >= a.x / a.n ? m : a));
  const lista = [...meses.values()];
  return {
    tipo: 'p8', habitIds: [], clave: mejor.mes, tono: 'positivo',
    fuerza: limitar(0.2 + validos.length / 20),
    params: { mes: mejor.mes, x: mejor.x, n: mejor.n },
    evidencia: evidencia(UMBRALES.anio, { x: mejor.x, n: mejor.n, tasa: mejor.x / mejor.n, meses: validos.length, clara: validos.length >= 6, umbrales: `≥${U.minMeses} meses con ≥${U.minPorMes} días que tocaban` }),
    grafico: { barras: lista.map((m) => [m.x, m.n]), resaltado: lista.indexOf(mejor), eje: 'meses', meses: lista.map((m) => m.mes) },
  };
}

/* ---------- Todos los candidatos ---------- */

const pp = (x) => `${Math.round(x * 100)} pp`;
function evidencia(ventana, extra) {
  const e = { ventana };
  for (const [k, v] of Object.entries(extra)) e[k] = typeof v === 'number' && !Number.isInteger(v) ? Math.round(v * 10000) / 10000 : v;
  return e;
}

/** Primer día con historia de un conjunto de hábitos. */
const inicioDe = (hs, hoy) => hs.reduce((m, h) => (h.creado < m ? h.creado : m), hoy);

/**
 * Calcula todos los candidatos permitidos. Devuelve { suficientes, candidatos }.
 * `entrada`: { habitos, hoy, logDe, ajustes, plan, privadosVisibles, porDia, palabrasActivas, recordatoriosDe }
 */
export function calcularCandidatos(entrada) {
  const { habitos, hoy, logDe, ajustes = ajustesPorDefecto(), plan = PLAN_ACTUAL, privadosVisibles = false, porDia = {}, palabrasActivas = true, recordatoriosDe = () => [] } = entrada;
  const { base, comparables } = habitosIncluidos(habitos, ajustes, { privadosVisibles });
  const hasta = sumarDias(hoy, -1); // hoy todavía no termina: nunca cuenta
  if (!base.length || diffDias(inicioDe(base, hoy), hoy) < UMBRALES.minHistoria) return { suficientes: false, candidatos: [] };

  const desdeAnio = [sumarDias(hasta, -(UMBRALES.anio - 1)), inicioDe(base, hoy)].sort().at(-1);
  const M = construirMatriz(base, desdeAnio, hasta, logDe);
  const n = M.fechas.length;
  const a = Math.max(0, n - UMBRALES.ventana), b = n;
  const filaDe = new Map(M.filas.map((f) => [f.h.id, f]));
  const comp = comparables.map((h) => filaDe.get(h.id));
  const total = contar(M.filas, a, b);
  const conHora = M.filas.some((f) => f.hora.some(Boolean));
  if (total.n < UMBRALES.minHistoria && !conHora) return { suficientes: false, candidatos: [] };

  const apagados = new Set(ajustes.tiposApagados);
  const permitido = (tipo) => !apagados.has(tipo) && (plan === 'pro' || !DE_PRO.has(tipo));
  const out = [];
  const empujar = (c) => { if (c) out.push(c); };

  if (permitido('g1')) {
    const conjuntos = M.filas.length + (comp.length > 1 ? 1 : 0);
    for (const f of M.filas) empujar(detectorG1(M, a, b, [f], false, conjuntos));
    if (comp.length > 1) empujar(detectorG1(M, a, b, comp, true, conjuntos));
  }
  if (permitido('g2')) for (const h of base) empujar(detectorG2(h, hoy, desdeAnio, logDe));
  if (permitido('g4') && plan !== 'pro') empujar(detectorG4(comp, a, b)); // en Pro lo cubre P1, por hábito
  if (permitido('p1')) for (const f of M.filas) empujar(detectorP1(f, a, b, recordatoriosDe(f.h.id), M.filas.length));
  if (permitido('p2') && comp.length > 1) empujar(detectorP2(comp, a, b));
  if (permitido('p3')) empujar(detectorP3(M, comp));
  if (permitido('p4')) empujar(detectorP4(comp, a, b));
  if (permitido('p5')) for (const f of M.filas) empujar(detectorP5(M, f, a, b));
  if (permitido('p6') && palabrasActivas) empujar(detectorP6(M, comp, a, b, porDia));
  if (permitido('p7')) empujar(detectorP7(M, a, b, comp));
  if (permitido('p8')) empujar(detectorP8(M, comp));
  return { suficientes: true, candidatos: out };
}

/* ---------- Selección semanal ---------- */

export const firma = (c) => `${c.tipo}|${c.habitIds.join('+')}|${c.clave}`;
/** "No volver a mostrar este": el mismo tipo con los mismos hábitos, aunque cambie el detalle. */
export const firmaBase = (c) => `${c.tipo}|${c.habitIds.join('+')}`;
const PESO_TONO = { positivo: 1, neutro: 0.7, baja: 0.5 };

/**
 * Elige hasta 3 (Gratis: 2) con diversidad: no dos del mismo tipo ni del mismo hábito.
 * Puntaje = fuerza × novedad × utilidad × tono. Lo ya mostrado en las últimas 8 semanas no vuelve
 * salvo que cambie de forma clara (otra firma: otro día, otra franja, otro par, otro sentido).
 */
export function seleccionar(candidatos, { semana, historial = [], noMostrar = [], plan = PLAN_ACTUAL }) {
  const U = UMBRALES.seleccion;
  const bloqueadas = new Set(noMostrar);
  const recientes = new Set(historial.filter((x) => diffDias(x.semana, semana) < U.semanasNovedad * 7 && x.semana !== semana).map(firma));
  const puntuados = candidatos
    .filter((c) => !bloqueadas.has(firmaBase(c)) && (plan === 'pro' || !DE_PRO.has(c.tipo)))
    .map((c) => ({ c, puntaje: c.fuerza * (recientes.has(firma(c)) ? 0 : 1) * (c.accion ? 1 : 0.8) * (PESO_TONO[c.tono] ?? 0.7) }))
    .filter((x) => x.puntaje > 0)
    .sort((x, y) => y.puntaje - x.puntaje || (firma(x.c) < firma(y.c) ? -1 : 1));
  const cupo = plan === 'pro' ? U.cupoPro : U.cupoGratis;
  const elegidos = [], tipos = new Set(), habitos = new Set();
  for (const { c } of puntuados) {
    if (elegidos.length >= cupo) break;
    if (tipos.has(c.tipo) || c.habitIds.some((id) => habitos.has(id))) continue;
    elegidos.push(c);
    tipos.add(c.tipo);
    c.habitIds.forEach((id) => habitos.add(id));
  }
  return elegidos;
}

/** Convierte un candidato en un descubrimiento para guardar. */
export function aItem(c, semana, id) {
  return {
    id, tipo: c.tipo, habitIds: [...c.habitIds], clave: c.clave, semana,
    params: c.params, evidencia: c.evidencia, grafico: c.grafico, accion: c.accion || null,
    estado: 'nuevo', creadoEl: semana, caducaEl: sumarDias(semana, UMBRALES.seleccion.semanasCaducidad * 7),
  };
}

/* ---------- G3 · resumen de la semana (en vivo, fuera del cupo) ---------- */

/**
 * Esta semana (lunes a ayer, más hoy si ya está hecho) frente a la mediana del mismo tramo
 * en las 8 semanas anteriores. El lunes, todavía no hay tramo: se resume la semana pasada.
 * Devuelve { tono: 'positivo' | 'neutro', flores, cuando: 'esta' | 'pasada' } o null.
 */
export function resumenSemanal({ habitos, hoy, logDe, ajustes = ajustesPorDefecto(), privadosVisibles = false }) {
  const U = UMBRALES.g3;
  if (ajustes.tiposApagados.includes('g3')) return null;
  const { base } = habitosIncluidos(habitos, ajustes, { privadosVisibles });
  if (!base.length || diffDias(inicioDe(base, hoy), hoy) < U.semanasHistoria * 7) return null;
  const lunes = inicioSemana(hoy);
  const esLunes = lunes === hoy;
  const ref = esLunes ? sumarDias(lunes, -7) : lunes;
  const largo = esLunes ? 7 : diffDias(lunes, hoy); // días completos del tramo
  const flores = (desde, incluirHoy) => {
    let n = 0;
    for (let i = 0; i < largo; i++) for (const h of base) if (cumplido(estadoDelDia(h, logDe(h.id, sumarDias(desde, i))))) n++;
    if (incluirHoy) for (const h of base) if (cumplido(estadoDelDia(h, logDe(h.id, hoy)))) n++;
    return n;
  };
  const ahora = flores(ref, !esLunes);
  const previas = [];
  for (let k = 1; k <= U.semanasComparar; k++) {
    const inicio = sumarDias(ref, -7 * k);
    if (inicio < inicioSemana(inicioDe(base, hoy))) break;
    previas.push(flores(inicio, false));
  }
  if (previas.length < U.semanasHistoria - 1) return null;
  const habitual = mediana(previas);
  return { tono: ahora > 0 && ahora >= habitual ? 'positivo' : 'neutro', flores: ahora, cuando: esLunes ? 'pasada' : 'esta' };
}

/* ---------- P9 · comparador (herramienta, no descubrimiento) ---------- */

/** Porcentaje cumplido por semana de dos hábitos (últimas `semanas`), para superponerlos. */
export function serieComparador(habitos, hoy, logDe, semanas = 12) {
  const hasta = sumarDias(hoy, -1);
  const desde = sumarDias(inicioSemana(hasta), -7 * (semanas - 1));
  const M = construirMatriz(habitos, desde, hasta, logDe);
  const series = M.filas.map((f) => {
    const serie = [];
    for (let k = 0; k < semanas; k++) {
      const r = contar([f], k * 7, Math.min((k + 1) * 7, M.fechas.length));
      serie.push(r.n ? { x: r.x, n: r.n, p: r.x / r.n } : null);
    }
    return { id: f.h.id, serie };
  });
  return { semanas: Array.from({ length: semanas }, (_, k) => sumarDias(desde, 7 * k)), series };
}
