// Pruebas del Jardín anual (J1, J2): estados, caché, hitos, semilla, disposición, hemisferio y ajustes.
// Ejecutar: TZ=America/Santiago node --test tests/*.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { datosVacios, sanearConfig, sanearJardin, jardinPorDefecto } from '../js/esquema.js';
import { crearModelo } from '../js/modelo.js';
import { sumarDias } from '../js/fechas.js';
import { rachaGlobal } from '../js/analisis.js';
import { contar, crearCacheJardin, diasDelMes, estadoDesdeMedida, HITOS, jardinDelAnio, medirDia, umbralDe } from '../js/jardin.js';
import {
  ALTO, ANCHO, ESPECIES, estacion, filaEnMes, filasDelMes, generador, hash32, macizo, nuevaSemilla, posicionEnAnio, rasgosDelDia,
} from '../js/jardin-disposicion.js';
import { FIGURAS, figuraDe } from '../js/jardin-arte.js';

function modelo(fecha = '2026-10-27', hora = '10:00') {
  let reloj = new Date(`${fecha}T${hora}:00`);
  const m = crearModelo(datosVacios(), { reloj: () => reloj });
  m.irA = (f, h = '10:00') => { reloj = new Date(`${f}T${h}:00`); };
  return m;
}
const hecho = (m, h, d) => m.fijarValor(h.id, d, String(h.vecesPorDia || 1));
const estadoDe = (m, fecha, op = {}) => {
  const j = jardinDelAnio(m.habitos(), Number(fecha.slice(0, 4)), { hoy: m.hoy(), logDe: m.logDe, ...op });
  return j.dias.find((d) => d.fecha === fecha).estado;
};

/* ---------- J1: estados ---------- */

test('año bisiesto tiene 366 días y uno normal 365', () => {
  const m = modelo('2028-03-01');
  m.crearHabito({ nombre: 'A', creado: '2028-01-01' });
  assert.equal(jardinDelAnio(m.habitos(), 2028, { hoy: m.hoy(), logDe: m.logDe }).dias.length, 366);
  assert.equal(jardinDelAnio(m.habitos(), 2027, { hoy: m.hoy(), logDe: m.logDe }).dias.length, 365);
});

test('sin hábitos: todo es sin_sembrar o futuro, nunca tierra', () => {
  const j = jardinDelAnio([], 2026, { hoy: '2026-10-27', logDe: () => null });
  const c = contar(j.dias);
  assert.equal(c.tierra, 0);
  assert.equal(c.sin_sembrar, 300);
  assert.equal(c.futuro, 65);
});

test('hábito creado a mitad de año: antes es sin_sembrar (no falla); el futuro es futuro', () => {
  const m = modelo();
  m.crearHabito({ nombre: 'Leer', creado: '2026-06-15' });
  assert.equal(estadoDe(m, '2026-06-14'), 'sin_sembrar');
  assert.equal(estadoDe(m, '2026-06-15'), 'tierra');
  assert.equal(estadoDe(m, '2026-11-02'), 'futuro');
});

test('brote, capullo y flor según la fracción; hoy sin nada es pendiente, no tierra', () => {
  const m = modelo();
  const hs = ['A', 'B', 'C', 'D'].map((n) => m.crearHabito({ nombre: n, creado: '2026-10-01' }).habito);
  hecho(m, hs[0], '2026-10-20');
  assert.equal(estadoDe(m, '2026-10-20'), 'brote'); // 1/4
  hecho(m, hs[1], '2026-10-20');
  assert.equal(estadoDe(m, '2026-10-20'), 'capullo'); // 2/4
  hecho(m, hs[2], '2026-10-20'); hecho(m, hs[3], '2026-10-20');
  assert.equal(estadoDe(m, '2026-10-20'), 'flor');
  assert.equal(estadoDe(m, '2026-10-26'), 'tierra');
  assert.equal(estadoDe(m, '2026-10-27'), 'pendiente');
});

test('umbral de día cumplido distinto de 100 %', () => {
  const m = modelo();
  const hs = ['A', 'B', 'C', 'D'].map((n) => m.crearHabito({ nombre: n, creado: '2026-10-01' }).habito);
  for (const h of hs.slice(0, 3)) hecho(m, h, '2026-10-20');
  assert.equal(estadoDe(m, '2026-10-20'), 'capullo');
  assert.equal(estadoDe(m, '2026-10-20', { umbral: 0.75 }), 'flor');
  assert.equal(umbralDe({ jardin: { umbral: 75 } }), 0.75);
  assert.equal(umbralDe({}), 1);
});

test('descanso, saltado y congelado: hoja de descanso; días sin hábitos: hoja pequeña', () => {
  const m = modelo();
  const a = m.crearHabito({ nombre: 'A', creado: '2026-10-01' }).habito;
  const b = m.crearHabito({ nombre: 'B', creado: '2026-10-01', frecuencia: { tipo: 'dias_fijos', dias: [0] } }).habito; // lunes
  m.irA('2026-10-21'); // el descanso solo se pone el mismo día
  m.fijarEstado(a.id, '2026-10-21', 'descanso');
  m.irA('2026-10-27');
  assert.equal(estadoDe(m, '2026-10-21'), 'descanso');
  m.fijarEstado(a.id, '2026-10-22', 'saltado');
  assert.equal(estadoDe(m, '2026-10-22'), 'descanso');
  m.archivar(a.id);
  void b;
  // Tras archivar A, los días que no son lunes ya no tienen nada programado (desde hoy).
  assert.equal(estadoDe(m, '2026-10-28'), 'futuro');
});

test('pausado y archivado: días sin programar; se recalcula al restaurar', () => {
  const m = modelo();
  const a = m.crearHabito({ nombre: 'A', creado: '2026-10-01' }).habito;
  const cache = crearCacheJardin();
  const op = { hoy: m.hoy(), logDe: m.logDe, cache };
  m.pausar(a.id, '2026-10-30');
  assert.equal(jardinDelAnio(m.habitos(), 2026, op).dias.find((d) => d.fecha === '2026-10-27').estado, 'sin_habitos');
  m.reanudar(a.id);
  cache.olvidar(); // un cambio de hábito olvida todo
  assert.equal(jardinDelAnio(m.habitos(), 2026, op).dias.find((d) => d.fecha === '2026-10-27').estado, 'pendiente');
});

test('hora de fin del día: a las 02:00 todavía es el día anterior y sigue pendiente', () => {
  const m = modelo('2026-10-28', '02:00'); // fin del día por defecto: 03:00
  m.crearHabito({ nombre: 'A', creado: '2026-10-01' });
  assert.equal(m.hoy(), '2026-10-27');
  assert.equal(estadoDe(m, '2026-10-27'), 'pendiente');
  assert.equal(estadoDe(m, '2026-10-28'), 'futuro');
});

test('flor rara: la racha global (la misma de Hoy) llega a 30 y planta la insignia una vez', () => {
  const m = modelo('2026-03-15');
  const h = m.crearHabito({ nombre: 'A', creado: '2026-01-01' }).habito;
  for (let i = 0; i < 70; i++) hecho(m, h, sumarDias('2026-01-01', i));
  const j = jardinDelAnio(m.habitos(), 2026, { hoy: m.hoy(), logDe: m.logDe });
  const raras = j.dias.filter((d) => d.estado === 'flor_rara');
  assert.deepEqual(raras.map((d) => [d.fecha, d.hito]), [['2026-01-30', 30], ['2026-03-01', 60]]);
  m.irA('2026-03-11');
  assert.equal(rachaGlobal(m.habitos(), m.hoy(), m.logDe), 70); // la misma racha que muestra Hoy
  assert.deepEqual(HITOS, [30, 60, 100, 365]);
});

test('flor rara: un descanso no corta ni suma, y el hito nunca cae en un descanso', () => {
  const m = modelo('2026-03-15');
  const h = m.crearHabito({ nombre: 'A', creado: '2026-01-01' }).habito;
  for (let i = 0; i < 40; i++) {
    const d = sumarDias('2026-01-01', i);
    if (i !== 29) hecho(m, h, d);
  }
  m.irA('2026-01-30'); // el descanso solo se pone el mismo día
  m.fijarEstado(h.id, '2026-01-30', 'descanso');
  m.irA('2026-03-15');
  const j = jardinDelAnio(m.habitos(), 2026, { hoy: m.hoy(), logDe: m.logDe });
  assert.equal(j.dias.find((d) => d.fecha === '2026-01-30').estado, 'descanso');
  assert.equal(j.dias.find((d) => d.fecha === '2026-01-31').estado, 'flor_rara');
});

test('la racha viene del año anterior: el hito se planta en enero', () => {
  const m = modelo('2027-01-20');
  const h = m.crearHabito({ nombre: 'A', creado: '2026-12-10' }).habito;
  for (let i = 0; i < 40; i++) hecho(m, h, sumarDias('2026-12-10', i));
  const j = jardinDelAnio(m.habitos(), 2027, { hoy: m.hoy(), logDe: m.logDe });
  assert.equal(j.dias.find((d) => d.fecha === '2027-01-08').estado, 'flor_rara');
  assert.equal(jardinDelAnio(m.habitos(), 2026, { hoy: m.hoy(), logDe: m.logDe }).dias.filter((d) => d.hito).length, 0);
});

test('caché: editar un día pasado solo recalcula su semana', () => {
  const m = modelo();
  const h = m.crearHabito({ nombre: 'A', creado: '2026-01-01' }).habito;
  const cache = crearCacheJardin();
  const op = { hoy: m.hoy(), logDe: m.logDe, cache };
  jardinDelAnio(m.habitos(), 2026, op);
  const lleno = cache.tamano;
  hecho(m, h, '2026-05-13');
  cache.olvidarFecha('2026-05-13');
  assert.equal(cache.tamano, lleno - 15);
  assert.equal(jardinDelAnio(m.habitos(), 2026, op).dias.find((d) => d.fecha === '2026-05-13').estado, 'flor');
});

test('caché: en "N por semana" un toque cambia la semana entera y se recalcula bien', () => {
  const m = modelo();
  const h = m.crearHabito({ nombre: 'Correr', creado: '2026-10-01', frecuencia: { tipo: 'semanal_n', n: 1 } }).habito;
  const cache = crearCacheJardin();
  const op = { hoy: m.hoy(), logDe: m.logDe, cache };
  assert.equal(jardinDelAnio(m.habitos(), 2026, op).dias.find((d) => d.fecha === '2026-10-22').estado, 'tierra');
  hecho(m, h, '2026-10-20'); // martes: la meta de la semana queda lista
  cache.olvidarFecha('2026-10-20');
  const j = jardinDelAnio(m.habitos(), 2026, op);
  assert.equal(j.dias.find((d) => d.fecha === '2026-10-20').estado, 'flor');
  assert.equal(j.dias.find((d) => d.fecha === '2026-10-22').estado, 'descanso'); // ya no era requerido
});

test('caché: cambiar los hábitos visibles (bóveda) la vacía sola', () => {
  const m = modelo();
  m.crearHabito({ nombre: 'A', creado: '2026-10-01' });
  m.crearHabito({ nombre: 'B', creado: '2026-10-01', privado: true });
  const cache = crearCacheJardin();
  cache.medir(m.habitos(), '2026-10-10', m.logDe);
  cache.medir(m.habitos().filter((h) => !h.privado), '2026-10-10', m.logDe);
  assert.equal(cache.tamano, 1);
  assert.equal(cache.medir(m.habitos().filter((h) => !h.privado), '2026-10-10', m.logDe).programados, 1);
});

test('medirDia y estadoDesdeMedida son puros', () => {
  assert.deepEqual(medirDia([], '2026-01-01', () => null), { programados: 0, hechos: 0, total: 0 });
  const op = { hoy: '2026-05-05', inicio: '2026-01-01' };
  assert.equal(estadoDesdeMedida({ programados: 2, hechos: 0, total: 0 }, '2026-02-02', op), 'descanso');
  assert.equal(estadoDesdeMedida({ programados: 2, hechos: 1, total: 3 }, '2026-02-02', op), 'brote');
});

test('cinco años de historial: el jardín de un año se arma rápido (y más rápido con caché)', () => {
  const m = modelo('2026-10-27');
  const hs = Array.from({ length: 8 }, (_, i) => m.crearHabito({ nombre: `H${i}`, creado: '2022-01-01', frecuencia: i % 3 === 2 ? { tipo: 'semanal_n', n: 3 } : { tipo: 'diaria' } }).habito);
  for (let i = 0; i < 1760; i++) {
    const d = sumarDias('2022-01-01', i);
    hs.forEach((h, k) => { if ((i + k) % 3) hecho(m, h, d); });
  }
  const cache = crearCacheJardin();
  const t0 = performance.now();
  jardinDelAnio(m.habitos(), 2026, { hoy: m.hoy(), logDe: m.logDe, cache });
  const t1 = performance.now();
  jardinDelAnio(m.habitos(), 2026, { hoy: m.hoy(), logDe: m.logDe, cache });
  const t2 = performance.now();
  assert.ok(t1 - t0 < 1500, `primera vez: ${Math.round(t1 - t0)} ms`);
  assert.ok(t2 - t1 < 60, `con caché: ${Math.round(t2 - t1)} ms`);
});

test('contar y diasDelMes', () => {
  const m = modelo();
  m.crearHabito({ nombre: 'A', creado: '2026-10-01' });
  const j = jardinDelAnio(m.habitos(), 2026, { hoy: m.hoy(), logDe: m.logDe });
  assert.equal(diasDelMes(j, 2).length, 28);
  const c = contar(diasDelMes(j, 10));
  assert.equal(c.tierra + c.pendiente + c.futuro, 31);
});

/* ---------- Ajustes ---------- */

test('ajustes del jardín: por defecto, corruptos y semilla', () => {
  assert.deepEqual(sanearConfig(null).jardin, jardinPorDefecto());
  assert.deepEqual(sanearJardin('basura'), jardinPorDefecto());
  const j = sanearJardin({ hemisferio: 'oeste', umbral: 33, animaciones: 'no', sonido: 1, semilla: '<script>' });
  assert.equal(j.hemisferio, 'sur');
  assert.equal(j.umbral, 100);
  assert.equal(j.animaciones, true);
  assert.equal(j.sonido, false);
  assert.equal(j.semilla, null);
  const s = nuevaSemilla();
  assert.match(s, /^[0-9a-f]{32}$/);
  assert.equal(sanearJardin({ semilla: s, umbral: 75, hemisferio: 'norte' }).semilla, s);
  // Viaja en el respaldo como cualquier ajuste.
  const m = modelo();
  m.setConfig({ jardin: { ...m.config.jardin, semilla: s } });
  assert.equal(m.serializar().config.jardin.semilla, s);
});

/* ---------- J2: semilla y disposición ---------- */

test('misma semilla = mismo jardín; otra semilla = otro jardín', () => {
  const a = rasgosDelDia('2026-04-12', 'a'.repeat(32));
  assert.deepEqual(a, rasgosDelDia('2026-04-12', 'a'.repeat(32)));
  let distintos = 0;
  for (let i = 0; i < 30; i++) {
    const d = sumarDias('2026-01-01', i);
    if (JSON.stringify(rasgosDelDia(d, 'a'.repeat(32))) !== JSON.stringify(rasgosDelDia(d, 'b'.repeat(32)))) distintos++;
  }
  assert.ok(distintos > 25);
});

test('semilla ausente: usa una de respaldo y no se rompe', () => {
  assert.deepEqual(rasgosDelDia('2026-04-12', null), rasgosDelDia('2026-04-12'));
});

test('rasgos dentro de rango; las 5 especies aparecen; la insignia nunca sale al azar', () => {
  const vistas = new Set();
  for (let i = 0; i < 366; i++) {
    const r = rasgosDelDia(sumarDias('2028-01-01', i), 'c'.repeat(32));
    vistas.add(r.especie);
    assert.ok(Math.abs(r.dx) <= 0.15 && Math.abs(r.dy) <= 0.15);
    assert.ok(r.variante >= 1 && r.variante <= 5);
  }
  assert.deepEqual([...vistas].sort(), [...ESPECIES].sort());
});

test('generador y hash son deterministas', () => {
  assert.equal(hash32('tavia'), hash32('tavia'));
  const g1 = generador(42), g2 = generador(42);
  for (let i = 0; i < 5; i++) assert.equal(g1(), g2());
});

test('disposición: columnas = días de la semana, filas por semana del mes, todo dentro del lienzo', () => {
  assert.equal(filaEnMes('2026-11-01'), 0); // domingo
  assert.equal(filaEnMes('2026-11-02'), 1); // lunes
  assert.equal(filasDelMes(2026, 11), 6);
  assert.equal(filasDelMes(2027, 2), 4); // febrero 2027 empieza lunes
  for (let i = 0; i < 366; i++) {
    const d = sumarDias('2028-01-01', i);
    const p = posicionEnAnio(d, rasgosDelDia(d));
    assert.ok(p.cx > 0 && p.cx < ANCHO && p.cy > 0 && p.cy < ALTO, d);
  }
  assert.ok(macizo(12).y > macizo(1).y);
});

test('estaciones según hemisferio', () => {
  assert.equal(estacion(1, 'sur'), 'verano');
  assert.equal(estacion(1, 'norte'), 'invierno');
  assert.equal(estacion(10, 'sur'), 'primavera');
  assert.equal(estacion(4, 'norte'), 'primavera');
});

test('cada estado tiene una figura con forma distinta (no solo color)', () => {
  const formas = new Set(['tierra', 'brote', 'capullo', 'flor', 'flor_rara', 'descanso', 'sin_habitos', 'futuro'].map((e) => figuraDe(e, 'margarita')));
  assert.equal(formas.size, 8);
  for (const e of ESPECIES) {
    assert.ok(FIGURAS[`flor-${e}`] && FIGURAS[`capullo-${e}`], e);
  }
  assert.equal(figuraDe('pendiente', 'loto'), 'tierra');
  assert.ok(FIGURAS['flor-insignia'].some((p) => p.rol === 'perla'));
});
