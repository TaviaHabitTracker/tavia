// Pruebas del Módulo 2: racha, puntaje y congeladores.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { datosVacios } from '../js/esquema.js';
import { crearModelo } from '../js/modelo.js';
import { sumarDias } from '../js/fechas.js';
import { puntaje, rachas, congeladores, puedeCongelar, rachaAntesDe, crearCache, frecuenciaPorDia } from '../js/estadisticas.js';
import { vistaDelDia } from '../js/calculos.js';

/** Modelo con reloj controlable; hoy = 2026-10-27 (martes) a las 10:00 salvo que se indique. */
function modelo(fecha = '2026-10-27') {
  let reloj = new Date(`${fecha}T10:00:00`);
  const m = crearModelo(datosVacios(), { reloj: () => reloj });
  m.irA = (f) => { reloj = new Date(`${f}T10:00:00`); };
  return m;
}
/** Marca como hechos los días indicados (desplazamientos desde una fecha). */
function marcar(m, h, desde, dias) {
  for (const i of dias) {
    const d = sumarDias(desde, i);
    if (h.tipo === 'si_no') m.fijarValor(h.id, d, String(h.vecesPorDia));
    else m.fijarValor(h.id, d, String(h.meta.min ?? 1));
  }
}
const R = (m, h) => rachas(m.habito(h.id), m.hoy(), m.logDe);

test('racha diaria: cuenta días seguidos; hoy sin marcar no la rompe', () => {
  const m = modelo();
  const h = m.crearHabito({ nombre: 'Leer', creado: '2026-10-20' }).habito;
  marcar(m, h, '2026-10-20', [0, 1, 3, 4, 5, 6]); // 20,21, (22 falla), 23..26
  assert.deepEqual(R(m, h), { actual: 4, mejor: 4, unidad: 'dias' });
  m.tocar(h.id, '2026-10-27');
  assert.equal(R(m, h).actual, 5);
  assert.equal(R(m, h).mejor, 5);
});

test('racha: ayer olvidado la corta; descanso y congelado no la rompen ni suman', () => {
  const m = modelo();
  const h = m.crearHabito({ nombre: 'A', creado: '2026-10-20' }).habito;
  marcar(m, h, '2026-10-20', [0, 1, 2, 3, 4]); // 20..24
  // 25 olvidado, 26 olvidado
  assert.equal(R(m, h).actual, 0);
  assert.equal(R(m, h).mejor, 5);
  // Descanso solo hoy
  assert.equal(m.fijarEstado(h.id, '2026-10-26', 'descanso'), null);
  assert.ok(m.fijarEstado(h.id, '2026-10-27', 'descanso'));
  assert.equal(R(m, h).actual, 0); // los días olvidados siguen ahí
});

test('congeladores: 1 cada 7 cumplidos, máximo 3, se gastan y la racha se salva', () => {
  const m = modelo('2026-10-27');
  const h = m.crearHabito({ nombre: 'A', creado: '2026-09-01' }).habito;
  // 6 cumplidos: aún 0
  marcar(m, h, '2026-09-01', [0, 1, 2, 3, 4, 5]);
  let c = congeladores(m.habito(h.id), m.hoy(), m.logDe);
  assert.deepEqual([c.disponibles, c.progreso], [0, 6]);
  marcar(m, h, '2026-09-01', [6]);
  assert.equal(congeladores(m.habito(h.id), m.hoy(), m.logDe).disponibles, 1);
  // 35 cumplidos → 5 ganados, pero tope 3
  marcar(m, h, '2026-09-01', Array.from({ length: 28 }, (_, i) => i + 7));
  c = congeladores(m.habito(h.id), m.hoy(), m.logDe);
  assert.equal(c.disponibles, 3);
  // Días 6..20 de octubre seguidos; 21..26: marcamos 21..24, olvidamos 25 y 26.
  marcar(m, h, '2026-10-06', Array.from({ length: 19 }, (_, i) => i)); // 6..24
  assert.equal(R(m, h).actual, 0);
  assert.equal(puedeCongelar(m.habito(h.id), '2026-10-24', m.hoy(), m.logDe), false); // ya cumplido
  assert.equal(puedeCongelar(m.habito(h.id), '2026-10-24', m.hoy(), m.logDe), false);
  assert.equal(puedeCongelar(m.habito(h.id), '2026-10-27', m.hoy(), m.logDe), false); // hoy no se congela
  assert.equal(m.usarCongelador(h.id, '2026-10-24'), null);
  assert.ok(m.usarCongelador(h.id, '2026-10-25'));
  assert.ok(m.usarCongelador(h.id, '2026-10-26'));
  assert.equal(m.logDe(h.id, '2026-10-26').usadoEn, '2026-10-27');
  const r = R(m, h);
  assert.ok(r.actual >= 19, `racha salvada: ${r.actual}`);
  assert.equal(congeladores(m.habito(h.id), m.hoy(), m.logDe).disponibles, 1);
});

test('congelador: no más de 2 días atrás ni sin congeladores disponibles', () => {
  const m = modelo();
  const h = m.crearHabito({ nombre: 'A', creado: '2026-10-01' }).habito;
  assert.equal(m.usarCongelador(h.id, '2026-10-26'), null); // 0 disponibles
  marcar(m, h, '2026-10-01', [0, 1, 2, 3, 4, 5, 6]);
  assert.equal(m.usarCongelador(h.id, '2026-10-24'), null); // 3 días atrás
  assert.ok(m.usarCongelador(h.id, '2026-10-25'));
  assert.equal(m.usarCongelador(h.id, '2026-10-26'), null); // ya no quedan
});

test('congelador ganado hoy puede cubrir ayer (se gasta después de ganarse)', () => {
  const m = modelo();
  const h = m.crearHabito({ nombre: 'A', creado: '2026-10-20' }).habito;
  marcar(m, h, '2026-10-20', [0, 1, 2, 3, 4, 5]); // 20..25 (6)
  m.tocar(h.id, '2026-10-27'); // 7.º cumplido hoy → gana 1
  // 26 se olvidó
  assert.ok(m.usarCongelador(h.id, '2026-10-26'));
  assert.equal(congeladores(m.habito(h.id), m.hoy(), m.logDe).disponibles, 0);
  assert.equal(R(m, h).actual, 7);
});

test('días fijos: la racha cuenta veces programadas y no le afectan los otros días', () => {
  const m = modelo('2026-10-29'); // jueves
  const h = m.crearHabito({ nombre: 'Gym', frecuencia: { tipo: 'dias_fijos', dias: [1, 3] }, creado: '2026-10-13' }).habito;
  for (const d of ['2026-10-13', '2026-10-15', '2026-10-20', '2026-10-22', '2026-10-27']) m.tocar(h.id, d);
  assert.deepEqual(R(m, h), { actual: 5, mejor: 5, unidad: 'veces' });
});

test('semanal: racha en semanas, semana en curso no rompe, primera semana prorrateada', () => {
  const m = modelo('2026-10-29'); // jueves
  // Creado el jueves 8 de octubre: esa semana tiene 4 días → meta ceil(3·4/7) = 2
  const h = m.crearHabito({ nombre: 'Correr', frecuencia: { tipo: 'semanal_n', n: 3 }, creado: '2026-10-08' }).habito;
  for (const d of ['2026-10-09', '2026-10-11']) m.tocar(h.id, d); // semana 1: 2 de 2
  for (const d of ['2026-10-12', '2026-10-14', '2026-10-16']) m.tocar(h.id, d); // semana 2: 3
  for (const d of ['2026-10-19', '2026-10-21', '2026-10-25']) m.tocar(h.id, d); // semana 3: 3
  m.tocar(h.id, '2026-10-27'); // semana actual: 1 de 3, en curso
  assert.deepEqual(R(m, h), { actual: 3, mejor: 3, unidad: 'semanas' });
  const v = vistaDelDia(m.habito(h.id), '2026-10-29', m.logDe);
  assert.equal(v.semana.n, 3);
  // Si la semana actual termina sin cumplir, al lunes siguiente la racha se corta
  m.irA('2026-11-02');
  assert.equal(R(m, h).actual, 0);
  assert.equal(R(m, h).mejor, 3);
});

test('semanal: un descanso reduce la meta de esa semana', () => {
  const m = modelo('2026-10-25'); // domingo
  const h = m.crearHabito({ nombre: 'X', frecuencia: { tipo: 'semanal_n', n: 7 }, creado: '2026-10-19' }).habito;
  for (const d of ['2026-10-19', '2026-10-20', '2026-10-21', '2026-10-22', '2026-10-23', '2026-10-24']) m.tocar(h.id, d);
  m.fijarEstado(h.id, '2026-10-25', 'descanso'); // hoy
  assert.equal(R(m, h).actual, 1); // 6 de 6 disponibles
});

test('puntaje: sube al cumplir, baja de a poco, no se reinicia', () => {
  const m = modelo('2026-12-31');
  const h = m.crearHabito({ nombre: 'A', creado: '2026-10-01' }).habito;
  marcar(m, h, '2026-10-01', Array.from({ length: 60 }, (_, i) => i)); // 60 días seguidos
  const p60 = puntaje(m.habito(h.id), '2026-11-29', m.logDe);
  assert.ok(p60 > 0.95, `alto tras 60 días: ${p60}`);
  // Un día fallado baja poco
  const p61 = puntaje(m.habito(h.id), '2026-12-01', m.logDe);
  assert.ok(p61 < p60 && p61 > 0.9, `un fallo baja poco: ${p61}`);
  // m = 0,5^(1/13): tras 13 días sin cumplir, cerca de la mitad
  const p = puntaje(m.habito(h.id), '2026-12-13', m.logDe);
  assert.ok(p > 0.45 && p < 0.55, `media vida ≈13 días: ${p}`);
});

test('puntaje: hoy pendiente no baja; un día nuevo hecho da ~5 %', () => {
  const m = modelo();
  const h = m.crearHabito({ nombre: 'A' }).habito;
  assert.equal(puntaje(m.habito(h.id), m.hoy(), m.logDe), 0);
  m.tocar(h.id, m.hoy());
  const p = puntaje(m.habito(h.id), m.hoy(), m.logDe);
  assert.ok(Math.abs(p - (1 - 0.5 ** (1 / 13))) < 1e-9);
});

test('puntaje: parcial cuenta proporcional; descanso no mueve', () => {
  const m = modelo('2026-10-28');
  const h = m.crearHabito({ nombre: 'Leer', tipo: 'cantidad', metaModo: 'min', metaMin: 20, creado: '2026-10-27' }).habito;
  m.fijarValor(h.id, '2026-10-27', '10'); // 50 %
  const mm = 0.5 ** (1 / 13);
  assert.ok(Math.abs(puntaje(m.habito(h.id), m.hoy(), m.logDe) - 0.5 * (1 - mm)) < 1e-9);
  m.fijarEstado(h.id, m.hoy(), 'descanso');
  assert.ok(Math.abs(puntaje(m.habito(h.id), m.hoy(), m.logDe) - 0.5 * (1 - mm)) < 1e-9);
});

test('frecuencia por día según tipo', () => {
  const m = modelo();
  const f = (frecuencia) => frecuenciaPorDia(m.crearHabito({ nombre: 'x', frecuencia }).habito);
  assert.equal(f({ tipo: 'diaria' }), 1);
  assert.equal(f({ tipo: 'dias_fijos', dias: [0, 2] }), 2 / 7);
  assert.equal(f({ tipo: 'semanal_n', n: 3 }), 3 / 7);
  assert.equal(f({ tipo: 'cada_n_dias', n: 4 }), 1 / 4);
});

test('pausa: no rompe la racha ni mueve el puntaje', () => {
  const m = modelo('2026-10-20');
  const h = m.crearHabito({ nombre: 'A', creado: '2026-10-15' }).habito;
  marcar(m, h, '2026-10-15', [0, 1, 2, 3, 4]); // 15..19
  m.pausar(h.id, '2026-10-24'); // 20..24 en pausa
  m.irA('2026-10-25');
  m.tocar(h.id, '2026-10-25');
  assert.equal(R(m, h).actual, 6);
});

test('archivado: las estadísticas se congelan en el día anterior', () => {
  const m = modelo('2026-10-25');
  const h = m.crearHabito({ nombre: 'A', creado: '2026-10-20' }).habito;
  marcar(m, h, '2026-10-20', [0, 1, 2, 3, 4]);
  m.archivar(h.id); // archivado el 25
  m.irA('2026-11-10');
  assert.equal(R(m, h).actual, 5);
});

test('rachaAntesDe: cuánto había antes del día olvidado', () => {
  const m = modelo();
  const h = m.crearHabito({ nombre: 'A', creado: '2026-10-20' }).habito;
  marcar(m, h, '2026-10-20', [0, 1, 2, 3, 4, 5]); // 20..25
  assert.equal(rachaAntesDe(m.habito(h.id), '2026-10-26', m.hoy(), m.logDe), 6);
});

test('caché: misma revisión devuelve lo mismo; un cambio la invalida solo para ese hábito', () => {
  const m = modelo();
  const a = m.crearHabito({ nombre: 'A' }).habito;
  const b = m.crearHabito({ nombre: 'B' }).habito;
  const cache = crearCache();
  const ra = cache.obtener(m.habito(a.id), m.hoy(), m.logDe, m.revision(a.id));
  const rb = cache.obtener(m.habito(b.id), m.hoy(), m.logDe, m.revision(b.id));
  assert.equal(cache.obtener(m.habito(a.id), m.hoy(), m.logDe, m.revision(a.id)), ra);
  m.tocar(a.id, m.hoy());
  assert.notEqual(cache.obtener(m.habito(a.id), m.hoy(), m.logDe, m.revision(a.id)), ra);
  assert.equal(cache.obtener(m.habito(b.id), m.hoy(), m.logDe, m.revision(b.id)), rb);
});

test('rendimiento: 50 hábitos con 3 años de historia se calculan rápido', () => {
  const m = modelo('2026-10-27');
  const hs = [];
  for (let i = 0; i < 50; i++) hs.push(m.crearHabito({ nombre: `H${i}`, creado: '2023-10-27' }).habito);
  for (const h of hs) for (let d = 0; d < 1096; d += 2) m.restaurarLog(h.id, sumarDias('2023-10-27', d), { habitId: h.id, fecha: sumarDias('2023-10-27', d), estado: 'registrado', valor: 1 });
  const t0 = performance.now();
  const cache = crearCache();
  for (const h of hs) cache.obtener(m.habito(h.id), m.hoy(), m.logDe, m.revision(h.id));
  const ms = performance.now() - t0;
  assert.ok(ms < 1500, `primer cálculo completo: ${ms.toFixed(0)} ms`);
  const t1 = performance.now();
  m.tocar(hs[0].id, m.hoy());
  for (const h of hs) cache.obtener(m.habito(h.id), m.hoy(), m.logDe, m.revision(h.id));
  const ms2 = performance.now() - t1;
  assert.ok(ms2 < 100, `tras un toque solo se recalcula 1 hábito: ${ms2.toFixed(0)} ms`);
  console.log(`  primer cálculo ${ms.toFixed(0)} ms · tras un toque ${ms2.toFixed(1)} ms`);
});
