// Pruebas del Módulo 10: frases y palabras guía. Ejecutar con: TZ=America/Santiago node --test tests/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  validarArchivo, validarFrase, senales, elegirContexto, contextosQueAplican, tonosPermitidos,
  elegirFrase, semilla, podarVistas, esTarde, diasSinRegistrar, tocaMiFrase, diasAbrumado, cargarFrases, ROLES,
} from '../js/frases.js';
import { PALABRAS, PALABRA, sugerencias, observacionSemana, sorpresa, vecina } from '../js/palabras.js';
import { sumarDias } from '../js/fechas.js';
import { sanearDatos, datosVacios, migrate, SCHEMA_VERSION } from '../js/esquema.js';
import { crearModelo } from '../js/modelo.js';

const ARCHIVO = JSON.parse(readFileSync(new URL('../data/frases_tavia.json', import.meta.url), 'utf8'));
const DATOS = validarArchivo(ARCHIVO);
const HOY = '2026-11-02'; // lunes

/* ---------- Ayudantes: hábitos y registros falsos ---------- */

const habito = (id, extra = {}) => ({ id, nombre: id, creado: '2026-01-01', tipo: 'si_no', vecesPorDia: 1, frecuencia: { tipo: 'diaria' }, pausas: [], archivado: null, ...extra });
function registros() {
  const m = new Map();
  return {
    logDe: (id, f) => m.get(`${id}|${f}`) || null,
    hecho(id, f) { m.set(`${id}|${f}`, { habitId: id, fecha: f, estado: 'registrado', valor: 1 }); },
    estado(id, f, estado, extra = {}) { m.set(`${id}|${f}`, { habitId: id, fecha: f, estado, valor: null, ...extra }); },
  };
}
/** Marca `id` hecho los `n` días anteriores a `hasta` (sin incluirlo). */
function racha(r, id, n, hasta = HOY) { for (let i = 1; i <= n; i++) r.hecho(id, sumarDias(hasta, -i)); }
const MANANA = new Date(2026, 10, 2, 9, 0);
const ctx = (hs, r, op = {}) => elegirContexto(senales({ habitos: hs, hoy: HOY, logDe: r.logDe, ahora: MANANA, finDelDia: '00:00', ...op }));

/* ---------- El archivo ---------- */

test('el archivo trae 100 frases válidas, 11 contextos y ids únicos', () => {
  assert.equal(DATOS.frases.length, 100);
  assert.equal(DATOS.descartadas, 0);
  assert.equal(new Set(DATOS.frases.map((f) => f.contexto)).size, 11);
  for (const f of DATOS.frases) assert.ok(f.autor && f.fuente, f.id);
});

test('ninguna frase de tropiezo o regreso tiene tono distinto de suave... o queda filtrada', () => {
  // El archivo puede tener alguna neutra en regreso (Heráclito); el filtro de tono la excluye siempre.
  for (const c of ['tropiezo', 'regreso']) {
    const tonos = tonosPermitidos(c, 'firme');
    assert.deepEqual(tonos, ['suave']);
  }
});

test('todas las palabras guía apuntan a una frase que existe', () => {
  assert.equal(PALABRAS.length, 16);
  for (const p of PALABRAS) assert.ok(DATOS.porId.has(p.frase), p.id);
});

test('JSON corrupto, vacío o de otro idioma: lista vacía, sin lanzar', () => {
  for (const malo of [null, undefined, 'texto', 42, {}, { frases: 'no' }, { frases: [] }]) {
    const d = validarArchivo(malo);
    assert.equal(d.frases.length, 0);
  }
  assert.equal(validarArchivo({ idioma: 'en', frases: ARCHIVO.frases }).frases.length, 0);
});

test('frases inválidas se ignoran una por una; ids repetidos se descartan', () => {
  const buena = ARCHIVO.frases[0];
  const d = validarArchivo({ frases: [
    buena, { ...buena }, // repetida
    { ...buena, id: 'x1', tono: 'gritón' },
    { ...buena, id: 'x2', contexto: 'lunes' },
    { ...buena, id: 'x3', texto: 'a'.repeat(400) },
    { ...buena, id: 'x4', fuente: '' },
    { ...buena, id: '<img>' },
    { ...buena, id: 'x5', rol: 'influencer' },
    { ...buena, id: 'x6', confianza: 'Baja' },
    { ...buena, id: 'x7' },
  ] });
  assert.deepEqual(d.frases.map((f) => f.id), [buena.id, 'x7']);
  assert.equal(d.descartadas, 8);
  assert.equal(validarFrase({ ...buena, texto: '  hola\u0000\n  mundo ' }).texto, 'hola mundo');
});

test('el archivo no puede ablandar el tono de tropiezo', () => {
  const d = validarArchivo({ ...ARCHIVO, reglas: { ...ARCHIVO.reglas, tonosPorContexto: { tropiezo: ['firme'] } } });
  assert.deepEqual(d.reglas.tonosPorContexto.tropiezo, ['suave']);
});

test('cargarFrases sin red devuelve lista vacía', async () => {
  const d = await cargarFrases('x', async () => { throw new Error('sin internet'); });
  assert.equal(d.frases.length, 0);
  const d2 = await cargarFrases('x', async () => ({ ok: true, json: async () => ARCHIVO }));
  assert.equal(d2.frases.length, 100);
});

/* ---------- Contexto ---------- */

test('usuario nuevo sin hábitos ni registros: inicio', () => {
  assert.equal(ctx([], registros()), 'inicio');
  const r = registros();
  assert.equal(ctx([habito('a', { creado: HOY })], r), 'inicio');
});

test('primera racha: 0 a 2 inicio, 3 a 20 construyendo, 21+ racha larga', () => {
  for (const [n, esperado] of [[2, 'inicio'], [3, 'construyendo'], [20, 'construyendo'], [21, 'racha_larga'], [40, 'racha_larga']]) {
    const r = registros();
    racha(r, 'a', n);
    assert.equal(ctx([habito('a')], r), esperado, `racha ${n}`);
  }
});

test('racha larga que se rompió ayer: tropiezo (gana a racha larga)', () => {
  const r = registros();
  racha(r, 'a', 40, sumarDias(HOY, -1)); // 40 días hasta anteayer; ayer nada
  r.estado('a', sumarDias(HOY, -1), 'nota', { nota: 'día largo' }); // un registro sin cumplir (no es "sin registrar")
  const hs = [habito('a')];
  const s = senales({ habitos: hs, hoy: HOY, logDe: r.logDe, ahora: MANANA });
  assert.ok(contextosQueAplican(s).has('tropiezo'));
  assert.equal(elegirContexto(s), 'tropiezo');
});

test('vuelta tras 10 días sin registrar: regreso, no tropiezo', () => {
  const r = registros();
  racha(r, 'a', 5, sumarDias(HOY, -10));
  assert.equal(diasSinRegistrar([habito('a')], HOY, r.logDe), 10);
  assert.equal(ctx([habito('a')], r), 'regreso');
});

test('2 días sin registrar es tropiezo; 3 ya es regreso', () => {
  const r2 = registros();
  racha(r2, 'a', 5, sumarDias(HOY, -2));
  assert.equal(ctx([habito('a')], r2), 'tropiezo');
  const r3 = registros();
  racha(r3, 'a', 5, sumarDias(HOY, -3));
  assert.equal(ctx([habito('a')], r3), 'regreso');
});

test('descanso, congelador y "hoy no" ayer no son tropiezo', () => {
  for (const estado of ['descanso', 'congelado', 'saltado']) {
    const r = registros();
    racha(r, 'a', 10, sumarDias(HOY, -1));
    r.estado('a', sumarDias(HOY, -1), estado);
    assert.equal(ctx([habito('a')], r), 'construyendo', estado);
  }
});

test('hábitos en pausa o día de descanso hoy: descanso', () => {
  const r = registros();
  racha(r, 'a', 10);
  assert.equal(ctx([habito('a', { pausas: [{ desde: HOY, hasta: '2026-11-10' }] })], r), 'descanso');
  const r2 = registros();
  racha(r2, 'a', 10);
  r2.estado('a', HOY, 'descanso');
  assert.equal(ctx([habito('a')], r2), 'descanso');
  // Hoy no aplica ningún hábito (solo los sábados)
  assert.equal(ctx([habito('s', { frecuencia: { tipo: 'dias_fijos', dias: [5] } })], registros()), 'descanso');
});

test('congelador usado hoy para cubrir ayer: descanso', () => {
  const r = registros();
  racha(r, 'a', 10, sumarDias(HOY, -1));
  r.estado('a', sumarDias(HOY, -1), 'congelado', { usadoEn: HOY });
  assert.equal(ctx([habito('a')], r), 'descanso');
});

test('día completo y check-in difícil', () => {
  const r = registros();
  racha(r, 'a', 10);
  r.hecho('a', HOY);
  assert.equal(ctx([habito('a')], r), 'dia_completo');
  assert.equal(ctx([habito('a')], r, { checkin: 'cansado' }), 'dia_dificil');
});

test('tarde con lo esencial sin hacer: día difícil; por la mañana, no', () => {
  const r = registros();
  racha(r, 'a', 10);
  const hs = [habito('a', { esencial: true }), habito('b')];
  r.hecho('b', HOY);
  assert.equal(ctx(hs, r), 'construyendo');
  assert.equal(ctx(hs, r, { ahora: new Date(2026, 10, 2, 21, 30) }), 'dia_dificil');
  r.hecho('a', HOY);
  assert.notEqual(ctx(hs, r, { ahora: new Date(2026, 10, 2, 21, 30) }), 'dia_dificil');
});

test('esTarde respeta la hora de fin del día', () => {
  assert.equal(esTarde(new Date(2026, 0, 1, 19, 59), '00:00'), false);
  assert.equal(esTarde(new Date(2026, 0, 1, 20, 0), '00:00'), true);
  assert.equal(esTarde(new Date(2026, 0, 1, 22, 59), '03:00'), false);
  assert.equal(esTarde(new Date(2026, 0, 1, 23, 0), '03:00'), true);
  assert.equal(esTarde(new Date(2026, 0, 2, 1, 30), '03:00'), true); // sigue siendo el día anterior
  assert.equal(esTarde(new Date(2026, 0, 2, 3, 0), '03:00'), false);
});

test('hito: la racha llega hoy a 30 (solo con hoy hecho); primer mes de uso', () => {
  const r = registros();
  racha(r, 'a', 29);
  const hs = [habito('a', { creado: '2026-01-01' })];
  assert.equal(ctx(hs, r), 'racha_larga'); // 29 hasta ayer: el hito no llega solo
  r.hecho('a', HOY);
  const s = senales({ habitos: hs, hoy: HOY, logDe: r.logDe, ahora: MANANA });
  assert.equal(s.racha, 30);
  assert.ok(s.hitos.some((x) => x.tipo === 'global' && x.n === 30));
  assert.equal(elegirContexto(s), 'hito'); // hito gana a día completo
  const rm = registros();
  rm.hecho('m', sumarDias(HOY, -1));
  assert.equal(ctx([habito('m', { creado: sumarDias(HOY, -30) })], rm), 'hito'); // primer mes de uso
  assert.equal(ctx([habito('m', { creado: sumarDias(HOY, -30) })], registros()), 'tropiezo'); // ayer sin cumplir gana
});

test('dos contextos a la vez: gana la prioridad (tropiezo > día difícil > descanso > hito)', () => {
  const s = { sinHabitos: false, racha: 40, ayerSinCumplir: true, sinRegistrar: 0, descanso: true, diaCompleto: true, dificil: true, hitos: [{}] };
  assert.equal(elegirContexto(s), 'tropiezo');
  assert.equal(elegirContexto({ ...s, ayerSinCumplir: false }), 'dia_dificil');
  assert.equal(elegirContexto({ ...s, ayerSinCumplir: false, dificil: false }), 'descanso');
  assert.equal(elegirContexto({ ...s, ayerSinCumplir: false, dificil: false, descanso: false }), 'hito');
});

test('cambio de día con hora de fin a las 03:00: a la 01:30 sigue siendo "ayer"', async () => {
  const datos = sanearDatos({ habits: [habito('a', { nombre: 'Leer' })], logs: [], config: { finDelDia: '03:00' } }, HOY).datos;
  const m = crearModelo(datos, { reloj: () => new Date(2026, 10, 3, 1, 30) });
  assert.equal(m.hoy(), HOY);
});

/* ---------- Tono ---------- */

test('tono permitido por contexto y estilo', () => {
  assert.deepEqual(tonosPermitidos('tropiezo', 'firme'), ['suave']);
  assert.deepEqual(tonosPermitidos('regreso', 'equilibrado'), ['suave']);
  assert.deepEqual(tonosPermitidos('dia_dificil', 'firme'), ['suave', 'neutro']);
  assert.deepEqual(tonosPermitidos('dia_dificil', 'firme', 'abrumado'), ['suave']);
  assert.deepEqual(tonosPermitidos('descanso', 'firme'), ['suave', 'neutro']);
  assert.deepEqual(tonosPermitidos('racha_larga', 'equilibrado'), ['suave', 'neutro']);
  assert.deepEqual(tonosPermitidos('racha_larga', 'firme'), ['suave', 'neutro', 'firme']);
  assert.deepEqual(tonosPermitidos('racha_larga', 'suave'), ['suave']);
});

/* ---------- Selección ---------- */

const elegir = (op) => elegirFrase({ datos: DATOS, hoy: HOY, clave: 'inst', roles: ROLES, ...op });

test('la elección es determinista: misma fecha e instalación, misma frase', () => {
  const a = elegir({ contexto: 'construyendo', tonos: ['suave', 'neutro'] });
  const b = elegir({ contexto: 'construyendo', tonos: ['suave', 'neutro'] });
  assert.equal(a.frase.id, b.frase.id);
  assert.equal(a.relajado, 0);
  // Otras instalaciones o días reparten las frases (no siempre la misma).
  const ids = new Set();
  for (let i = 0; i < 30; i++) ids.add(elegirFrase({ datos: DATOS, hoy: sumarDias(HOY, i), clave: 'inst', contexto: 'construyendo', tonos: ['suave', 'neutro'] }).frase.id);
  assert.ok(ids.size >= 5);
  assert.notEqual(semilla('a'), semilla('b'));
});

test('en tropiezo nunca sale una frase que no sea suave, ni relajando', () => {
  const tonos = tonosPermitidos('tropiezo', 'firme');
  const vistas = DATOS.frases.map((f) => ({ id: f.id, fecha: sumarDias(HOY, -1) })); // todo visto ayer
  for (let i = 0; i < 40; i++) {
    const r = elegirFrase({ datos: DATOS, hoy: sumarDias(HOY, i), clave: 'x', contexto: 'tropiezo', tonos, vistas });
    assert.equal(r.frase.tono, 'suave');
  }
});

test('no repite frases vistas en 60 días ni autores de los últimos 7', () => {
  const tonos = ['suave', 'neutro'];
  const primera = elegir({ contexto: 'construyendo', tonos }).frase;
  const vistas = [{ id: primera.id, fecha: sumarDias(HOY, -59) }];
  const r = elegir({ contexto: 'construyendo', tonos, vistas });
  assert.notEqual(r.frase.id, primera.id);
  // Autor visto hace 3 días (en otro contexto) → no sale ese autor.
  const clear = DATOS.frases.find((f) => f.autor === 'James Clear' && f.contexto !== 'construyendo');
  for (let i = 0; i < 20; i++) {
    const x = elegirFrase({ datos: DATOS, hoy: sumarDias(HOY, i), clave: 'k', contexto: 'construyendo', tonos, vistas: [{ id: clear.id, fecha: sumarDias(HOY, i - 3) }] });
    assert.notEqual(x.frase.autor, 'James Clear');
  }
});

test('relaja en orden: 30 días → autor → vecino → la vista hace más tiempo', () => {
  const tonos = ['suave', 'neutro'];
  const hito = DATOS.frases.filter((f) => f.contexto === 'hito' && tonos.includes(f.tono));
  // Todas las de hito vistas hace 40 días → paso 1 (30 días).
  let vistas = hito.map((f) => ({ id: f.id, fecha: sumarDias(HOY, -40) }));
  assert.equal(elegir({ contexto: 'hito', tonos, vistas }).relajado, 1);
  // Todas vistas hace 10 días → vecinos (racha larga / día completo).
  vistas = hito.map((f) => ({ id: f.id, fecha: sumarDias(HOY, -10) }));
  const r = elegir({ contexto: 'hito', tonos, vistas });
  assert.equal(r.relajado, 3);
  assert.ok(['racha_larga', 'dia_completo'].includes(r.frase.contexto));
  // Todas las frases vistas en 60 días (incluidos vecinos): la vista hace más tiempo, del propio contexto.
  vistas = DATOS.frases.map((f, i) => ({ id: f.id, fecha: sumarDias(HOY, -(i % 20) - 1) }));
  const u = elegir({ contexto: 'hito', tonos, vistas });
  assert.equal(u.relajado, 4);
  assert.equal(u.frase.contexto, 'hito');
});

test('filtros del usuario: roles y "solo confianza Alta"', () => {
  for (let i = 0; i < 30; i++) {
    const r = elegirFrase({ datos: DATOS, hoy: sumarDias(HOY, i), clave: 'q', contexto: 'racha_larga', tonos: ['suave', 'neutro', 'firme'], soloAlta: true, roles: ['filosofo'] });
    if (r) { assert.equal(r.frase.confianza, 'Alta'); assert.equal(r.frase.rol, 'filosofo'); }
  }
  // Un filtro que deja todo vacío (ni en el contexto ni en sus vecinos) no inventa nada: devuelve null.
  assert.equal(elegir({ contexto: 'hito', tonos: ['suave', 'neutro'], roles: ['proverbio'] }), null);
  // Si el contexto no tiene, puede salir un vecino del mismo tono (tropiezo → regreso).
  assert.equal(elegir({ contexto: 'tropiezo', tonos: ['suave'], roles: ['proverbio'] }).frase.contexto, 'regreso');
  assert.equal(elegir({ contexto: 'inicio', tonos: [] }), null);
  assert.equal(elegirFrase({ datos: validarArchivo(null), hoy: HOY, contexto: 'inicio', tonos: ['suave'] }), null);
});

test('la frase de cierre excluye la del día', () => {
  const del = elegir({ contexto: 'dia_completo', tonos: ['suave', 'neutro'] }).frase;
  const cierre = elegir({ contexto: 'dia_completo', tonos: ['suave', 'neutro'], excluir: [del.id], vistas: [{ id: del.id, fecha: HOY }] }).frase;
  assert.notEqual(cierre.id, del.id);
});

test('podarVistas deja solo las útiles', () => {
  const v = podarVistas([{ id: 'a', fecha: sumarDias(HOY, -10) }, { id: 'b', fecha: sumarDias(HOY, -200) }, { id: 'c', fecha: '2030-01-01' }, null, { id: 3 }], HOY);
  assert.deepEqual(v.map((x) => x.id), ['a']);
});

test('Mi frase: los lunes y cuando no hay frase; nunca en días que piden calma', () => {
  assert.equal(tocaMiFrase('', 'inicio', HOY, true), false);
  assert.equal(tocaMiFrase('Voy a mi ritmo', 'inicio', HOY, true), true); // lunes
  assert.equal(tocaMiFrase('Voy a mi ritmo', 'tropiezo', HOY, true), false);
  assert.equal(tocaMiFrase('Voy a mi ritmo', 'inicio', '2026-11-03', true), false);
  assert.equal(tocaMiFrase('Voy a mi ritmo', 'tropiezo', '2026-11-03', false), true); // no hay otra
});

test('días seguidos abrumado', () => {
  assert.equal(diasAbrumado({ [HOY]: 'abrumado', [sumarDias(HOY, -1)]: 'abrumado', [sumarDias(HOY, -2)]: 'cansado' }, HOY), 2);
  assert.equal(diasAbrumado({}, HOY), 0);
});

/* ---------- Palabras ---------- */

test('sugerencias: en tropiezo o día difícil, solo palabras que acompañan', () => {
  for (const c of ['tropiezo', 'dia_dificil']) {
    assert.deepEqual(sugerencias(c).map((p) => p.nombre), ['Calma', 'Amabilidad', 'Descanso', 'Paciencia', 'Resiliencia']);
  }
  assert.equal(sugerencias('desconocido').length, 5);
  assert.notEqual(sorpresa('calma', HOY).id, 'calma');
  assert.equal(vecina('amabilidad').id, 'constancia');
  assert.equal(vecina('constancia', -1).id, 'amabilidad');
});

test('observación semanal: describe, con al menos 2 días y 10 puntos de diferencia', () => {
  const r = registros();
  const lunes = '2026-10-26';
  const hs = [habito('a'), habito('b')];
  const porDia = {};
  for (let i = 0; i < 7; i++) {
    const f = sumarDias(lunes, i);
    r.hecho('a', f);
    if (i < 3) { r.hecho('b', f); porDia[f] = 'calma'; } else porDia[f] = i === 3 ? 'foco' : undefined;
  }
  const o = observacionSemana({ porDia, lunes, hoy: HOY, habitos: hs, logDe: r.logDe });
  assert.equal(o.usadas[0].palabra.id, 'calma');
  assert.equal(o.destacada.palabra.id, 'calma');
  assert.equal(o.destacada.pct, 1);
  assert.equal(o.destacada.pctResto, 0.5);
  // Una sola vez no alcanza para observar nada.
  const o2 = observacionSemana({ porDia: { [lunes]: 'foco' }, lunes, hoy: HOY, habitos: hs, logDe: r.logDe });
  assert.equal(o2.destacada, null);
  assert.equal(PALABRA.get('calma').nombre, 'Calma');
});

/* ---------- Esquema v3 ---------- */

test('migración v2 → v3: agrega frases y palabras vacías sin tocar lo anterior', () => {
  const v2 = { schemaVersion: 2, habits: [habito('a', { nombre: 'Leer' })], logs: [], revisiones: [], config: { tema: 'oscuro' } };
  const { datos } = migrate(v2);
  assert.equal(datos.schemaVersion, SCHEMA_VERSION); // pasa por la v3 (frases) y sigue hasta la actual
  assert.ok(datos.frases && datos.palabras);
  const s = sanearDatos(v2, HOY).datos;
  assert.equal(s.schemaVersion, SCHEMA_VERSION);
  assert.equal(s.config.tema, 'oscuro');
  assert.equal(s.habits[0].esencial, false);
  assert.deepEqual(s.frases.favoritas, []);
  assert.equal(s.config.estiloFrases, 'equilibrado');
  assert.equal(s.config.frasesActivas, true);
});

test('saneamiento de datos de frases y palabras: tipos, tamaños y basura', () => {
  const malo = {
    ...datosVacios(),
    habits: [habito('a', { nombre: 'Leer', esencial: 'sí' })],
    frases: {
      vistas: [{ id: 'f001', fecha: HOY }, { id: '<x>', fecha: HOY }, { id: 'f002', fecha: 'ayer' }],
      favoritas: ['f001', 'f001', 42, 'f003'],
      delDia: { fecha: HOY, id: 'f001', contexto: 'inicio', cerrada: true },
      cierre: { fecha: HOY, id: 'f999', contexto: 'otro' },
      hitosVistos: ['g30@2026-11-02', { a: 1 }],
      miFrase: `${'x'.repeat(500)}\u0000`,
    },
    palabras: { porDia: { [HOY]: 'calma', ayer: 'calma', '2026-11-01': 'gritar' }, checkin: { [HOY]: 'abrumado', '2026-11-01': 'feliz' }, minimo: HOY, identidad: ['calma', 'foco', 'orden', 'energia', 'nope'] },
    config: { ...datosVacios().config, estiloFrases: 'agresivo', rolesFrases: ['filosofo', 'hacker'], frecuenciaFrases: 'siempre' },
  };
  const s = sanearDatos(malo, HOY).datos;
  assert.equal(s.habits[0].esencial, false);
  assert.deepEqual(s.frases.vistas, [{ id: 'f001', fecha: HOY }]);
  assert.deepEqual(s.frases.favoritas, ['f001', 'f003']);
  assert.equal(s.frases.delDia.cerrada, true);
  assert.equal(s.frases.cierre, null);
  assert.deepEqual(s.frases.hitosVistos, ['g30@2026-11-02']);
  assert.ok(s.frases.miFrase.length <= 200);
  assert.deepEqual(s.palabras.porDia, { [HOY]: 'calma' });
  assert.deepEqual(s.palabras.checkin, { [HOY]: 'abrumado' });
  assert.deepEqual(s.palabras.identidad, ['calma', 'foco', 'orden']);
  assert.equal(s.config.estiloFrases, 'equilibrado');
  assert.deepEqual(s.config.rolesFrases, ['filosofo']);
  assert.equal(s.config.frecuenciaFrases, 'cierre');
});

test('modelo: guarda frase del día, vistas, favoritas, palabra y check-in; serializa y combina', () => {
  const m = crearModelo(sanearDatos({ habits: [habito('a', { nombre: 'Leer' })] }, HOY).datos, { reloj: () => MANANA });
  m.fijarFraseDelDia({ fecha: HOY, id: 'f013', contexto: 'construyendo' });
  m.fijarFraseDelDia({ fecha: HOY, id: 'f013', contexto: 'construyendo' }); // no duplica la vista
  assert.deepEqual(m.frases.vistas, [{ id: 'f013', fecha: HOY }]);
  m.alternarFavorita('f013');
  assert.deepEqual(m.frases.favoritas, ['f013']);
  m.alternarFavorita('f013');
  assert.deepEqual(m.frases.favoritas, []);
  m.fijarPalabra(HOY, 'calma');
  m.fijarCheckin(HOY, 'cansado');
  assert.equal(m.palabras.porDia[HOY], 'calma');
  m.fijarMiFrase('  Voy a mi ritmo.  ');
  assert.equal(m.frases.miFrase, 'Voy a mi ritmo.');
  const d = m.serializar();
  assert.equal(d.frases.delDia.id, 'f013');
  assert.equal(d.palabras.checkin[HOY], 'cansado');
  // Combinar un respaldo: suma favoritas y días, lo actual gana si choca.
  m.combinar(sanearDatos({ ...d, frases: { ...d.frases, favoritas: ['f001'] }, palabras: { ...d.palabras, porDia: { [HOY]: 'foco', '2026-10-30': 'orden' } } }, HOY).datos);
  assert.deepEqual(m.frases.favoritas, ['f001']);
  assert.equal(m.palabras.porDia[HOY], 'calma');
  assert.equal(m.palabras.porDia['2026-10-30'], 'orden');
});
