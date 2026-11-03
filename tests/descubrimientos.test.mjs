// Pruebas del Módulo 11: Descubrimientos de tu semana. Ejecutar con: TZ=America/Santiago node --test tests/
// Valores de referencia de Wilson y Fisher: SciPy 1.18.1
//   scipy.stats.fisher_exact(tabla)[1]  ·  scipy.stats.binomtest(x, n).proportion_ci(method='wilson')
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { wilson, fisher, bonferroni, mediana, cuantilNormal, azar } from '../js/estadistica.js';
import {
  calcularCandidatos, seleccionar, aItem, resumenSemanal, serieComparador, habitosIncluidos, construirMatriz,
  firma, firmaBase, DE_PATRON, UMBRALES, ajustesPorDefecto,
} from '../js/descubrimientos.js';
import { sumarDias, inicioSemana, diaSemana } from '../js/fechas.js';
import { sanearDatos, migrate, SCHEMA_VERSION, sanearDescubrimientos } from '../js/esquema.js';
import { crearModelo } from '../js/modelo.js';
import { t } from '../js/textos.js';
import { usuario, modeloDe, HOY } from './sinteticos.mjs';

const cerca = (a, b, tol = 1e-9) => assert.ok(Math.abs(a - b) <= tol * Math.max(1, Math.abs(b)), `${a} ≉ ${b}`);
const calcular = (m, extra = {}) => calcularCandidatos({ habitos: m.habitos(), hoy: HOY, logDe: m.logDe, porDia: m.palabras.porDia, ...extra });

/* ---------- Estadística ---------- */

test('Wilson coincide con SciPy', () => {
  for (const [x, n, lo, hi] of [
    [9, 10, 0.5958499732047615, 0.9821237869049271],
    [11, 13, 0.5776536898051747, 0.9567418216419188],
    [0, 10, 0, 0.27753279986288926],
    [50, 100, 0.4038315303659956, 0.5961684696340044],
  ]) {
    const w = wilson(x, n);
    cerca(w.bajo, lo, 1e-7);
    cerca(w.alto, hi, 1e-7);
  }
  assert.equal(wilson(0, 0).p, null);
});

test('Fisher exacto bilateral coincide con SciPy', () => {
  cerca(fisher(3, 1, 1, 3), 0.48571428571428565);
  cerca(fisher(8, 2, 1, 5), 0.034965034965034975);
  cerca(fisher(20, 10, 5, 25), 0.00018100006244459654, 1e-6);
  cerca(fisher(0, 10, 10, 0), 1.082508822446903e-05, 1e-6);
  assert.equal(fisher(0, 0, 0, 0), 1);
});

test('Bonferroni, cuantil normal y mediana', () => {
  assert.equal(bonferroni(0.01, 5), 0.002);
  assert.equal(bonferroni(0.01, 0), 0.01);
  cerca(cuantilNormal(0.975), 1.959963984540054, 1e-8);
  cerca(cuantilNormal(0.999), 3.090232306167813, 1e-8);
  assert.equal(mediana([3, 1, 2]), 2);
  assert.equal(mediana([4, 1, 2, 3]), 2.5);
  assert.equal(mediana([]), null);
});

/* ---------- Definiciones comunes ---------- */

const habito = (id, extra = {}) => ({ id, nombre: id, icono: '🌱', color: 'pino', creado: '2026-01-01', tipo: 'si_no', vecesPorDia: 1, frecuencia: { tipo: 'diaria' }, bloque: 'dia', pausas: [], archivado: null, privado: false, meta: { min: null, max: null }, ...extra });

test('el denominador excluye descanso, congelado, "Hoy no", pausa, antes de crear y días que no tocan', () => {
  const h = habito('a', { creado: '2026-10-02', frecuencia: { tipo: 'dias_fijos', dias: [0, 1, 2, 3, 4] }, pausas: [{ desde: '2026-10-20', hasta: '2026-10-21' }] });
  const logs = new Map([
    ['2026-10-05', { estado: 'registrado', valor: 1 }],
    ['2026-10-06', { estado: 'descanso', valor: null }],
    ['2026-10-07', { estado: 'congelado', valor: null }],
    ['2026-10-08', { estado: 'saltado', valor: null }],
    ['2026-10-20', { estado: 'registrado', valor: 1 }], // en pausa
  ]);
  const M = construirMatriz([h], '2026-10-01', '2026-10-21', (id, f) => (logs.has(f) ? { habitId: id, fecha: f, ...logs.get(f) } : null));
  const v = Object.fromEntries(M.fechas.map((f, i) => [f, M.filas[0].v[i]]));
  assert.equal(v['2026-10-01'], null); // antes de crearlo
  assert.equal(v['2026-10-05'], 1);
  assert.equal(v['2026-10-06'], null); // descanso
  assert.equal(v['2026-10-07'], null); // congelado
  assert.equal(v['2026-10-08'], null); // "Hoy no"
  assert.equal(v['2026-10-09'], 0); // viernes que tocaba y no se hizo
  assert.equal(v['2026-10-10'], null); // sábado: no toca
  assert.equal(v['2026-10-20'], null); // en pausa
  assert.equal(M.filas[0].descanso[5], true);
});

test('cantidad con meta máxima: cumplir es quedar en o bajo el máximo', () => {
  const h = habito('pantalla', { tipo: 'cantidad', unidad: 'h', meta: { min: null, max: 2 } });
  const logDe = (id, f) => ({ habitId: id, fecha: f, estado: 'registrado', valor: f.endsWith('1') ? 3 : 1.5 });
  const M = construirMatriz([h], '2026-10-01', '2026-10-02', logDe);
  assert.deepEqual(M.filas[0].v, [0, 1]);
});

/* ---------- Detectores con patrones plantados (≥ 80 % de acierto) ---------- */

for (const [patron, tipo] of [['dia', 'g1'], ['franja', 'p1'], ['par', 'p2'], ['tendencia', 'p3'], ['descanso', 'p4'], ['palabra', 'p6']]) {
  test(`detecta el patrón plantado "${patron}" (${tipo}) en ≥ 80 % de los usuarios`, () => {
    let ok = 0;
    const N = 30;
    for (let s = 1; s <= N; s++) {
      const m = modeloDe(usuario({ semilla: 1000 + s, patron, habitos: 3, p: 0.55 }));
      if (calcular(m).candidatos.some((c) => c.tipo === tipo)) ok++;
    }
    assert.ok(ok / N >= 0.8, `${patron}: ${ok}/${N}`);
  });
}

test('el patrón de día nombra el día plantado (martes) y guarda la evidencia', () => {
  const m = modeloDe(usuario({ semilla: 7, patron: 'dia', habitos: 3, p: 0.55 }));
  const c = calcular(m).candidatos.find((x) => x.tipo === 'g1' && x.habitIds[0] === 'h0');
  assert.ok(c);
  assert.equal(c.params.dia, 1); // sinteticos.mjs planta el patrón en diaSemana 1 = martes
  for (const k of ['ventana', 'x', 'n', 'bajo', 'alto', 'global', 'umbrales']) assert.ok(k in c.evidencia, k);
});

/* ---------- Falsos positivos: datos sin patrón ---------- */

test('sin patrón: menos de 5 % de semanas-usuario con un descubrimiento de patrón (1.000 usuarios × 12 semanas)', { timeout: 240_000 }, () => {
  let semanas = 0, conPatron = 0;
  for (let s = 1; s <= 1000; s++) {
    const r = azar(s * 31);
    const m = modeloDe(usuario({ semilla: s, dias: 200, habitos: 1 + Math.floor(r() * 8), p: 0.15 + r() * 0.8 }));
    const historial = [];
    for (let k = 11; k >= 0; k--) {
      const hoy = sumarDias(inicioSemana(HOY), -7 * k);
      const { candidatos } = calcularCandidatos({ habitos: m.habitos(), hoy, logDe: m.logDe, porDia: m.palabras.porDia });
      const sel = seleccionar(candidatos, { semana: hoy, historial });
      historial.push(...sel.map((c) => ({ ...c, semana: hoy })));
      semanas++;
      if (sel.some((c) => DE_PATRON.has(c.tipo))) conPatron++;
    }
  }
  const tasa = conPatron / semanas;
  assert.ok(tasa < 0.05, `tasa de falsos positivos ${tasa}`);
});

/* ---------- Muestra mínima y casos borde ---------- */

test('usuario nuevo, sin hábitos o con pocos días: no hay descubrimientos', () => {
  assert.equal(calcularCandidatos({ habitos: [], hoy: HOY, logDe: () => null }).suficientes, false);
  const m = modeloDe(usuario({ semilla: 3, dias: 10 }));
  const r = calcular(m);
  assert.equal(r.suficientes, false);
  assert.deepEqual(r.candidatos, []);
});

test('hoy nunca cuenta (el día no termina)', () => {
  const m = modeloDe(usuario({ semilla: 5, dias: 120 }));
  const a = calcular(m);
  m.fijarEstado('h0', HOY, 'descanso');
  const b = calcular(m);
  assert.deepEqual(a.candidatos.map(firma), b.candidatos.map(firma));
});

test('5 años de historia y 30 hábitos: calcula en menos de 2 s', () => {
  const m = modeloDe(usuario({ semilla: 9, dias: 5 * 365, habitos: 30 }));
  const t0 = performance.now();
  calcular(m);
  assert.ok(performance.now() - t0 < 2000);
});

/* ---------- Privacidad ---------- */

test('privados y sensibles quedan fuera por defecto; se incluyen solo a mano', () => {
  const hs = [habito('a'), habito('b', { privado: true }), habito('c', { icono: '💊' })];
  const aj = ajustesPorDefecto();
  assert.deepEqual(habitosIncluidos(hs, aj).base.map((h) => h.id), ['a']);
  // Privado incluido pero bóveda cerrada: sigue fuera.
  assert.deepEqual(habitosIncluidos(hs, { ...aj, incluidos: ['b', 'c'] }).base.map((h) => h.id), ['a', 'c']);
  const abierta = habitosIncluidos(hs, { ...aj, incluidos: ['b', 'c'] }, { privadosVisibles: true });
  assert.deepEqual(abierta.base.map((h) => h.id), ['a', 'b', 'c']);
  // El sensible incluido tiene descubrimientos propios, pero no entra en comparaciones ni en lo global.
  assert.deepEqual(abierta.comparables.map((h) => h.id), ['a', 'b']);
  assert.deepEqual(habitosIncluidos(hs, { ...aj, excluidos: ['a'] }).base, []);
});

test('con la bóveda cerrada no se calcula nada de hábitos privados', () => {
  const d = usuario({ semilla: 11, patron: 'dia', habitos: 3, p: 0.55 });
  d.habits[0].privado = true;
  const m = modeloDe(d);
  const r = calcular(m, { ajustes: { ...ajustesPorDefecto(), incluidos: ['h0'] }, privadosVisibles: false });
  assert.ok(r.candidatos.every((c) => !c.habitIds.includes('h0') && c.params.a !== 'h0' && c.params.b !== 'h0'));
});

test('sensibles no aparecen en pares (P2), tendencia (P3) ni en el global de G1', () => {
  const d = usuario({ semilla: 1001, patron: 'par', habitos: 3, p: 0.55 });
  d.habits[0].icono = '💊';
  const m = modeloDe(d);
  const r = calcular(m, { ajustes: { ...ajustesPorDefecto(), incluidos: ['h0'] } });
  assert.ok(!r.candidatos.some((c) => c.tipo === 'p2' && c.habitIds.includes('h0')));
});

test('los textos y la evidencia no llevan nombres de hábitos (solo ids)', () => {
  const d = usuario({ semilla: 1002, patron: 'par', habitos: 3, p: 0.55 });
  d.habits.forEach((h, i) => { h.nombre = `Secreto${i}`; });
  const m = modeloDe(d);
  const json = JSON.stringify(calcular(m).candidatos);
  assert.ok(!json.includes('Secreto'));
});

test('el módulo no hace peticiones de red', () => {
  for (const f of ['../js/descubrimientos.js', '../js/estadistica.js', '../js/vistas/descubrimientos.js']) {
    const src = readFileSync(new URL(f, import.meta.url), 'utf8');
    for (const prohibido of ['fetch(', 'XMLHttpRequest', 'sendBeacon', 'WebSocket', 'innerHTML', 'eval(', 'new Function']) {
      assert.ok(!src.includes(prohibido), `${f} usa ${prohibido}`);
    }
  }
});

/* ---------- Selección semanal ---------- */

const cand = (tipo, ids, clave, fuerza = 0.5, tono = 'positivo') => ({ tipo, habitIds: ids, clave, fuerza, tono, params: {}, evidencia: {}, grafico: null });

test('selección: cupo, diversidad de tipo y de hábito, y G3 fuera', () => {
  const cs = [cand('g1', ['a'], 'd1', 0.9), cand('g1', ['b'], 'd2', 0.8), cand('g2', ['c'], 'r1', 0.7), cand('p2', ['b', 'c'], 'par', 0.6), cand('p4', [], 'descanso', 0.5)];
  const pro = seleccionar(cs, { semana: HOY, plan: 'pro' });
  assert.deepEqual(pro.map((c) => c.tipo), ['g1', 'g2', 'p4']); // g1 b: tipo repetido · p2: hábito c repetido
  const gratis = seleccionar(cs, { semana: HOY, plan: 'gratis' });
  assert.deepEqual(gratis.map((c) => c.tipo), ['g1', 'g2']);
  assert.ok(gratis.every((c) => ['g1', 'g2', 'g4'].includes(c.tipo)));
});

test('novedad: lo mismo no vuelve en 8 semanas; si cambia de forma clara, sí', () => {
  const visto = { ...cand('g1', ['a'], 'd1'), semana: sumarDias(HOY, -21) };
  assert.equal(seleccionar([cand('g1', ['a'], 'd1')], { semana: HOY, historial: [visto] }).length, 0);
  assert.equal(seleccionar([cand('g1', ['a'], 'd3')], { semana: HOY, historial: [visto] }).length, 1);
  const viejo = { ...visto, semana: sumarDias(HOY, -63) };
  assert.equal(seleccionar([cand('g1', ['a'], 'd1')], { semana: HOY, historial: [viejo] }).length, 1);
  // Una tendencia a la baja sigue la misma regla.
  const baja = { ...cand('p3', [], 'baja', 0.5, 'baja'), semana: sumarDias(HOY, -28) };
  assert.equal(seleccionar([cand('p3', [], 'baja', 0.5, 'baja')], { semana: HOY, historial: [baja] }).length, 0);
});

test('"no volver a mostrar" bloquea el tipo con esos hábitos aunque cambie el detalle', () => {
  const c = cand('g1', ['a'], 'd1');
  assert.equal(seleccionar([cand('g1', ['a'], 'd5')], { semana: HOY, noMostrar: [firmaBase(c)] }).length, 0);
});

test('aItem caduca a las 3 semanas y pasa el saneamiento', () => {
  const it = aItem({ ...cand('g1', ['a'], 'd1'), grafico: { barras: [[1, 2]], resaltado: 0, eje: 'dias' } }, HOY, 'x1');
  assert.equal(it.caducaEl, sumarDias(HOY, 21));
  const s = sanearDescubrimientos({ items: [it], noMostrar: ['g1|a'], semana: HOY }, new Set(['a']));
  assert.equal(s.items.length, 1);
  assert.equal(s.items[0].estado, 'nuevo');
});

/* ---------- G3 resumen ---------- */

test('G3: positivo si iguala o supera tu mediana; neutro si no, sin cifras comparativas', () => {
  const m = modeloDe(usuario({ semilla: 21, dias: 100, p: 0.6 }));
  const r = resumenSemanal({ habitos: m.habitos(), hoy: HOY, logDe: m.logDe });
  assert.ok(r && ['positivo', 'neutro'].includes(r.tono));
  assert.equal(r.cuando, 'pasada'); // HOY es lunes
  assert.ok(!/\d/.test(t('desc.g3.neutro')));
  assert.ok(!/\{(ahora|antes)\}/.test(t('desc.p3.baja')));
});

test('P9 comparador: 12 semanas por hábito', () => {
  const m = modeloDe(usuario({ semilla: 2, dias: 120, habitos: 2 }));
  const r = serieComparador(m.habitos(), HOY, m.logDe);
  assert.equal(r.semanas.length, 12);
  assert.equal(r.series.length, 2);
  assert.ok(r.series[0].serie.every((x) => x === null || (x.p >= 0 && x.p <= 1)));
});

/* ---------- Tono ---------- */

const PROHIBIDAS = ['te hace', 'te hacen', 'provoca', 'provocan', 'provoco', 'gracias a', 'debes', 'deberias', 'debe', 'tienes que', 'fallaste', 'fallo', 'fracaso', 'fracasos', 'fracasaste', 'peor', 'peores', 'mal', 'debil', 'debiles', 'perdiste', 'culpa', 'culpas'];
const normalizar = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
export function revisarTono(texto) {
  const n = ` ${normalizar(texto).replace(/[^a-zñ0-9]+/g, ' ')} `;
  return PROHIBIDAS.filter((p) => n.includes(` ${p} `));
}

test('linter de tono: ninguna plantilla de Descubrimientos usa palabras prohibidas', () => {
  const src = readFileSync(new URL('../js/textos.js', import.meta.url), 'utf8');
  const claves = [...src.matchAll(/'((?:desc|ajustes\.desc)\.[\w.]+)'/g)].map((m) => m[1]);
  assert.ok(claves.length > 60);
  const ejemplo = { nombre: 'Leer', a: 'Leer', b: 'Caminar', dia: 'martes', x: 11, n: 13, flores: 5, franja: 'mañana', hora: '08:00', con: 84, sin: 52, ahora: 70, antes: 55, palabra: 'calma', bloque: 'de la mañana', mes: 'Marzo', racha: '12 días', retomar: 'al siguiente', prom: 3, unidad: 'km', dias: 40, fecha: '3 nov', resto: 6, rachas: 4, interrupciones: 3, x0: 5, n0: 10, global: '60 %', registros: 30, promedio: 3, media7: 3, meses: 6, bajo: '50 %', alto: '80 %', p: '0,001', m: 3, corte: '0,003', semana: 'Sem. 1', texto: 'x' };
  for (const k of claves) {
    const v = t(k, ejemplo);
    const textos = Array.isArray(v) ? v : [v];
    for (const x of textos) assert.deepEqual(revisarTono(String(x)), [], `${k}: «${x}»`);
  }
});

test('linter de tono: no da falsos avisos (malva, normal) y sí detecta flexiones y mayúsculas', () => {
  assert.deepEqual(revisarTono('Un color malva, algo normal y animal.'), []);
  assert.deepEqual(revisarTono('Fue tu PEOR día'), ['peor']);
  assert.deepEqual(revisarTono('Deberías volver'), ['deberias']);
  assert.deepEqual(revisarTono('Esto provoca'), ['provoca']);
});

/* ---------- Datos: migración, respaldo y borrado ---------- */

test('migración v3 → v4: solo agrega Descubrimientos vacíos', () => {
  const v3 = { schemaVersion: 3, habits: [habito('a')], logs: [], revisiones: [], frases: {}, palabras: {}, config: { tema: 'oscuro' } };
  const { datos } = migrate(v3);
  assert.equal(datos.schemaVersion, 4);
  const s = sanearDatos(v3, HOY).datos;
  assert.equal(SCHEMA_VERSION, 4);
  assert.deepEqual(s.descubrimientos, { items: [], noMostrar: [], semana: null });
  assert.equal(s.config.descubrimientos.activado, true);
  assert.equal(s.config.tema, 'oscuro');
});

test('saneamiento: basura, tipos desconocidos, HTML y objetos anidados se descartan', () => {
  const s = sanearDescubrimientos({
    items: [
      { id: 'ok', tipo: 'g1', habitIds: ['a'], clave: 'd1', semana: HOY, params: { dia: 1, raro: { x: 1 } }, evidencia: { n: 3 }, grafico: { eje: 'dias', barras: [[1, 2], ['x', 1]], resaltado: 9 }, estado: 'nuevo' },
      { id: 'mal', tipo: 'z9', habitIds: [], semana: HOY },
      { id: 'otro', tipo: 'g2', habitIds: ['borrado'], semana: HOY, estado: 'visto' },
      { id: 'guardado', tipo: 'g2', habitIds: ['borrado'], semana: HOY, estado: 'guardado' },
      null, 'texto',
    ],
    noMostrar: ['g1|a', '<img onerror=x>'],
  }, new Set(['a']));
  assert.deepEqual(s.items.map((x) => x.id), ['ok', 'guardado']);
  assert.deepEqual(s.items[0].params, { dia: 1 });
  assert.deepEqual(s.items[0].grafico, { eje: 'dias', barras: [[1, 2]], resaltado: -1 });
  assert.deepEqual(s.noMostrar, ['g1|a']);
});

test('modelo: semana estable, guardar, ocultar, borrar hábito y respaldo', () => {
  const m = modeloDe(usuario({ semilla: 1003, patron: 'dia', habitos: 3, p: 0.55 }));
  const { candidatos } = calcular(m);
  const sel = seleccionar(candidatos, { semana: HOY });
  assert.ok(sel.length);
  m.fijarSemanaDesc(HOY, sel.map((c, i) => aItem(c, HOY, `d${i}`)));
  assert.equal(m.descubrimientos.semana, HOY);
  assert.equal(m.descubrimientos.items.length, sel.length);
  m.estadoDesc('d0', 'guardado');
  const deshacer = m.noMostrarDesc('d1', 'x|y');
  assert.equal(m.descubrimientos.items.find((x) => x.id === 'd1')?.estado ?? 'oculto', 'oculto');
  deshacer();
  assert.ok(!m.descubrimientos.noMostrar.includes('x|y'));
  // Respaldo: viaja y vuelve igual.
  const copia = sanearDatos(JSON.parse(JSON.stringify(m.serializar())), HOY).datos;
  assert.deepEqual(copia.descubrimientos, m.descubrimientos);
  // Borrar un hábito: lo no guardado de ese hábito se va; lo guardado queda (sin nombre).
  const delGuardado = m.descubrimientos.items.find((x) => x.id === 'd0');
  for (const id of delGuardado.habitIds) m.eliminar(id);
  assert.ok(m.descubrimientos.items.some((x) => x.id === 'd0'));
  assert.ok(m.descubrimientos.items.every((x) => x.estado === 'guardado' || x.habitIds.every((id) => m.habito(id))));
});

test('no regresión: rachas y puntaje iguales con o sin Descubrimientos guardados', async () => {
  const { estadisticasHabito } = await import('../js/estadisticas.js').catch(() => ({}));
  const d = usuario({ semilla: 77, dias: 150 });
  const a = modeloDe(d);
  const b = modeloDe(d);
  b.fijarSemanaDesc(HOY, seleccionar(calcular(b).candidatos, { semana: HOY }).map((c, i) => aItem(c, HOY, `q${i}`)));
  const sa = a.serializar(), sb = b.serializar();
  delete sb.descubrimientos; delete sa.descubrimientos;
  delete sb.config.idInstalacion; delete sa.config.idInstalacion; // semilla aleatoria por modelo
  assert.deepEqual(sa, sb);
  if (estadisticasHabito) for (const h of a.habitos()) assert.deepEqual(estadisticasHabito(h, HOY, a.logDe), estadisticasHabito(h, HOY, b.logDe));
});

test('crearModelo acepta datos sin descubrimientos (respaldo de antes del módulo)', () => {
  const m = crearModelo({ schemaVersion: 3, habits: [], logs: [], revisiones: [], config: sanearDatos({}, HOY).datos.config });
  assert.deepEqual(m.descubrimientos.items, []);
});

test('el día de la semana del gráfico usa lunes = 0', () => {
  assert.equal(diaSemana('2026-11-02'), 0);
  assert.equal(UMBRALES.ventana, 90);
});

/* ---------- Compartir y aviso semanal ---------- */

test('tarjeta para compartir: solo frase genérica, sin nombres de hábitos ni cifras', async () => {
  const { fraseCompartible, datosTarjetaDesc } = await import('../js/tarjeta-desc.js');
  let vistas = 0;
  for (const patron of ['dia', 'franja', 'par', 'tendencia', 'descanso', 'palabra']) {
    const d = usuario({ semilla: 1004, patron, habitos: 3, p: 0.55 });
    d.habits.forEach((h, i) => { h.nombre = `Secreto${i}`; });
    const m = modeloDe(d);
    for (const c of calcular(m).candidatos) {
      const f = fraseCompartible(c);
      if (!f) continue;
      vistas++;
      assert.ok(!/Secreto|\d/.test(f), `${c.tipo}: «${f}»`);
      assert.ok(!/Secreto|\d/.test(JSON.stringify(datosTarjetaDesc(c)).replace(/"(dia|formato)":[^,}]*/g, '')));
    }
  }
  assert.ok(vistas >= 6);
  assert.equal(fraseCompartible({ tipo: 'p3', params: { sentido: 'baja' } }), null, 'una baja no se comparte');
  assert.equal(fraseCompartible({ tipo: 'g3', params: {} }), null);
  assert.equal(fraseCompartible({ tipo: 'p6', params: { palabra: '<img onerror=x>' } }), null);
  assert.equal(fraseCompartible({ tipo: 'g1', params: { dia: 1 } }), 'Mi día más constante: el martes.');
});

test('aviso «Tu semana está lista»: apagado de fábrica y sin contenido del descubrimiento', () => {
  const s = sanearDatos({ schemaVersion: 3, habits: [], logs: [], config: {} }, HOY).datos;
  assert.equal(s.config.descubrimientos.notificarRevision, false);
  assert.equal(sanearDatos({ schemaVersion: 4, habits: [], logs: [], config: { descubrimientos: { notificarRevision: true } } }, HOY).datos.config.descubrimientos.notificarRevision, true);
  assert.ok(!/\{/.test(t('desc.aviso.titulo') + t('desc.aviso.cuerpo')), 'sin variables: no lleva datos');
  const src = readFileSync(new URL('../js/tarjeta-desc.js', import.meta.url), 'utf8');
  for (const prohibido of ['fetch(', 'XMLHttpRequest', 'sendBeacon', 'innerHTML', '.nombre']) assert.ok(!src.includes(prohibido), prohibido);
});
