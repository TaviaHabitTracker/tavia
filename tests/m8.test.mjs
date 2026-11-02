// Pruebas de lógica del Módulo 8: IndexedDB (mudanza desde localStorage), paletas, resumen anual y manifiesto.
// Ejecutar: TZ=America/Santiago node --test tests/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { crearAlmacen, CLAVE } from '../js/storage.js';
import { datosVacios, sanearConfig, PALETAS, LIMITES } from '../js/esquema.js';
import { crearModelo } from '../js/modelo.js';
import { BARRA, PALETA, paletas, paletaEfectiva, proximaPaleta } from '../js/temas.js';
import { aniosDisponibles, resumenAnual, resumenListo } from '../js/anual.js';
import { sugerirManifiesto, duracionLectura } from '../js/vistas/manifiesto.js';
import { sumarDias } from '../js/fechas.js';
import { t } from '../js/textos.js';

/* ---------- Ayudantes ---------- */

function storageFalso() {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k), _m: m };
}
/** Motor que se comporta como IndexedDB (asíncrono, tipo 'idb'). */
function idbFalso({ fallaEscritura = false, cuota = false } = {}) {
  const m = new Map();
  return {
    tipo: 'idb',
    async leer(k) { return m.has(k) ? m.get(k) : null; },
    async escribir(k, v) {
      if (cuota) { const e = new Error('lleno'); e.name = 'QuotaExceededError'; throw e; }
      if (fallaEscritura) throw new Error('rota');
      m.set(k, v);
    },
    async borrar(k) { m.delete(k); },
    _m: m,
  };
}
const datosCon = (nombre) => {
  const m = crearModelo(datosVacios(), { reloj: () => new Date(2026, 9, 27, 10) });
  m.crearHabito({ nombre });
  return m.serializar();
};

/* ---------- IndexedDB y mudanza ---------- */

test('IndexedDB: los datos de localStorage se mudan, se verifican y se borra la copia vieja', async () => {
  const legado = storageFalso();
  legado.setItem(CLAVE, JSON.stringify(datosCon('Leer')));
  const motor = idbFalso();
  const a = crearAlmacen({ motor, legado });
  const d = await a.cargar('2026-10-27');
  assert.equal(d.habits[0].nombre, 'Leer');
  assert.equal(a.motor, 'idb');
  assert.equal(legado.getItem(CLAVE), null);
  assert.equal(legado.getItem('tavia:motor'), 'idb');
  assert.ok(motor._m.get(CLAVE).includes('Leer'));
  // Una segunda carga lee directo de IndexedDB.
  const d2 = await crearAlmacen({ motor, legado }).cargar('2026-10-27');
  assert.equal(d2.habits[0].nombre, 'Leer');
});

test('IndexedDB: si no se puede escribir la mudanza, se sigue con localStorage y nada se pierde', async () => {
  const legado = storageFalso();
  legado.setItem(CLAVE, JSON.stringify(datosCon('Caminar')));
  const a = crearAlmacen({ motor: idbFalso({ fallaEscritura: true }), legado });
  const d = await a.cargar('2026-10-27');
  assert.equal(d.habits[0].nombre, 'Caminar');
  assert.equal(a.motor, 'local');
  assert.ok(legado.getItem(CLAVE).includes('Caminar'));
  a.guardar(datosCon('Nadar'));
  assert.equal(await a.guardarYa(), true);
  assert.ok(legado.getItem(CLAVE).includes('Nadar'));
});

test('IndexedDB: si los datos ya se mudaron y hoy no abre, no se usa el localStorage viejo (memoria + aviso)', async () => {
  const legado = storageFalso();
  legado.setItem('tavia:motor', 'idb');
  const avisos = [];
  const a = crearAlmacen({ abrir: async () => null, legado, alAviso: (k) => avisos.push(k) });
  const d = await a.cargar('2026-10-27');
  assert.deepEqual(d.habits, []);
  assert.deepEqual(avisos, ['aviso.idb']);
  assert.equal(a.motor, null);
  a.guardar(datosCon('X'));
  assert.equal(await a.guardarYa(), false);
  assert.equal(legado.getItem(CLAVE), null, 'no escribe en el localStorage viejo');
});

test('IndexedDB: sin IndexedDB y sin mudanza previa, usa localStorage', async () => {
  const legado = storageFalso();
  const a = crearAlmacen({ abrir: async () => null, legado });
  await a.cargar('2026-10-27');
  assert.equal(a.motor, 'local');
  a.guardar(datosCon('Leer'));
  await a.guardarYa();
  assert.ok(legado.getItem(CLAVE).includes('Leer'));
});

test('IndexedDB: cuota llena avisa; datos dañados se guardan aparte; versión futura no se sobrescribe', async () => {
  const avisos = [];
  const lleno = crearAlmacen({ motor: idbFalso({ cuota: true }), legado: null, alAviso: (k) => avisos.push(k) });
  await lleno.cargar('2026-10-27');
  lleno.guardar(datosVacios());
  assert.equal(await lleno.guardarYa(), false);
  assert.deepEqual(avisos, ['aviso.cuota']);

  const roto = idbFalso();
  roto._m.set(CLAVE, '{roto');
  const av2 = [];
  await crearAlmacen({ motor: roto, legado: null, alAviso: (k) => av2.push(k) }).cargar('2026-10-27');
  assert.deepEqual(av2, ['aviso.corrupto']);
  assert.ok([...roto._m.keys()].some((k) => k.startsWith(`${CLAVE}:corrupto:`)));

  const futuro = idbFalso();
  futuro._m.set(CLAVE, JSON.stringify({ schemaVersion: 99, habits: [], logs: [] }));
  const a = crearAlmacen({ motor: futuro, legado: null });
  await a.cargar('2026-10-27');
  a.guardar(datosVacios());
  await a.guardarYa();
  assert.equal(JSON.parse(futuro._m.get(CLAVE)).schemaVersion, 99);
});

/* ---------- Configuración nueva ---------- */

test('config M8: paleta, manifiesto y modo se sanean (y las paletas de la 0.8 se traducen)', () => {
  const c = sanearConfig({ paleta: 'neon', manifiesto: `  Hola\u0007 mundo\n\n\n\nfin${'x'.repeat(400)}`, manifiestoModo: 'siempre', manifiestoVisto: '2026-13-01', tema: 'negro' });
  assert.equal(c.paleta, 'ambar');
  assert.equal(c.tema, 'negro');
  assert.equal(c.manifiestoModo, 'pantalla');
  assert.equal(c.manifiestoVisto, null);
  assert.ok(c.manifiesto.startsWith('Hola mundo\n\nfin'));
  assert.ok(c.manifiesto.length <= LIMITES.manifiesto);
  assert.equal(sanearConfig({ paleta: 'cobre' }).paleta, 'cobre');
  assert.equal(sanearConfig({ paleta: 'arena' }).paleta, 'cobre');
  assert.equal(sanearConfig({ paleta: 'obsidiana' }).paleta, 'platino');
  assert.equal(sanearConfig({ tema: 'rosado' }).tema, 'auto');
});

/* ---------- Paletas ---------- */

test('paletas: se ganan con días registrados (no racha) y la elegida cae a ámbar si deja de estar ganada', () => {
  assert.deepEqual(paletas(10).map((p) => [p.id, p.ganada, p.faltan]), [['ambar', true, 0], ['cobre', true, 0], ['salvia', false, 20], ['acero', false, 50], ['platino', false, 90]]);
  assert.equal(paletaEfectiva('salvia', 29), 'ambar');
  assert.equal(paletaEfectiva('salvia', 30), 'salvia');
  assert.equal(paletaEfectiva('inventada', 999), 'ambar');
  assert.equal(proximaPaleta(7).id, 'salvia');
  assert.equal(proximaPaleta(100), null);
  assert.deepEqual(Object.keys(PALETA), PALETAS);
});

test('paletas: días registrados cuenta fechas distintas, no saltados ni descansos', () => {
  const m = crearModelo(datosVacios(), { reloj: () => new Date(2026, 9, 27, 10) });
  const a = m.crearHabito({ nombre: 'A' }).habito;
  const b = m.crearHabito({ nombre: 'B' }).habito;
  m.tocar(a.id, '2026-10-27');
  m.tocar(b.id, '2026-10-27');
  m.fijarEstado(a.id, '2026-10-27', 'descanso');
  assert.equal(m.diasRegistrados(), 1);
});

test('paletas y temas: styles.css define cada acento y cada tema que usa temas.js', () => {
  const css = readFileSync(new URL('../styles.css', import.meta.url), 'utf8');
  for (const [id, p] of Object.entries(PALETA)) {
    assert.match(css, new RegExp(`\\.muestra--${id} \\{ background: linear-gradient\\(135deg, ${p.muestra[0]} 50%, ${p.muestra[1]} 50%\\)`));
    if (id === 'ambar') assert.match(css, new RegExp(`--acento: ${p.muestra[1]};`));
    else assert.match(css, new RegExp(`:root\\[data-paleta="${id}"\\] \\{ --acento: ${p.muestra[1]};`));
  }
  for (const [tema, color] of Object.entries(BARRA)) {
    if (tema === 'claro') assert.match(css, new RegExp(`:root \\{ color-scheme: light; --fondo: ${color};`));
    else assert.match(css, new RegExp(`:root\\[data-theme="${tema}"\\] \\{ color-scheme: dark; --fondo: ${color};`));
  }
});

/* ---------- Resumen anual ---------- */

function modeloAnual() {
  const m = crearModelo(datosVacios(), { reloj: () => new Date(2026, 11, 3, 10) });
  const med = m.crearHabito({ nombre: 'Meditar', identidad: 'cuida su mente' }).habito;
  const leer = m.crearHabito({ nombre: 'Leer' }).habito;
  // Creados el 5 de enero (como si vinieran de un respaldo).
  const d = m.serializar();
  for (const h of d.habits) h.creado = '2026-01-05';
  const logs = [];
  for (let f = '2026-01-05'; f <= '2026-03-31'; f = sumarDias(f, 1)) {
    logs.push({ habitId: med.id, fecha: f, estado: 'registrado', valor: 1, registradoEn: '07:10' });
    if (f >= '2026-02-01' && f <= '2026-02-10') logs.push({ habitId: leer.id, fecha: f, estado: 'registrado', valor: 1, registradoEn: '22:00' });
  }
  logs.push({ habitId: leer.id, fecha: '2026-04-02', estado: 'congelado', valor: null });
  d.logs = logs;
  m.reemplazar(d);
  return m;
}

test('resumen anual: días, marcas, racha, mejor mes y hábito más constante', () => {
  const m = modeloAnual();
  const r = resumenAnual(m.habitos(), 2026, m.hoy(), m.logDe);
  assert.equal(r.desde, '2026-01-05');
  assert.equal(r.hasta, '2026-12-03');
  assert.equal(r.diasConRegistro, 86); // 5 ene → 31 mar
  assert.equal(r.marcas, 86 + 10);
  assert.equal(r.rachaDias, 86);
  assert.equal(r.congelados, 1);
  assert.equal(t('meses.largo')[r.mejorMes.mes], 'Febrero'); // enero 27/54 = 50 %; febrero 38/56 = 68 %
  assert.equal(r.constante.habito.nombre, 'Meditar');
  assert.equal(r.hora.franja, 'manana');
  assert.equal(r.mapa.get('2026-01-05'), 2);
  assert.equal(r.mapa.get('2026-02-05'), 4);
  assert.equal(r.mapa.get('2026-06-01'), 0);
  assert.ok(resumenListo(r));
});

test('resumen anual: año sin hábitos → null; año futuro → null; hoy sin marcar no corta la racha', () => {
  const m = modeloAnual();
  assert.equal(resumenAnual(m.habitos(), 2025, m.hoy(), m.logDe), null);
  assert.equal(resumenAnual(m.habitos(), 2027, m.hoy(), m.logDe), null);
  assert.deepEqual(aniosDisponibles(m.habitos(), m.hoy()), [2026]);

  const m2 = crearModelo(datosVacios(), { reloj: () => new Date(2026, 9, 27, 10) });
  const h = m2.crearHabito({ nombre: 'A' }).habito;
  const d = m2.serializar();
  d.habits[0].creado = '2026-10-20';
  d.logs = ['2026-10-20', '2026-10-21', '2026-10-22', '2026-10-23', '2026-10-24', '2026-10-25', '2026-10-26']
    .map((fecha) => ({ habitId: h.id, fecha, estado: 'registrado', valor: 1 }));
  m2.reemplazar(d);
  const r = resumenAnual(m2.habitos(), 2026, m2.hoy(), m2.logDe);
  assert.equal(r.rachaDias, 7);
  assert.equal(r.diasConRegistro, 7);
  assert.ok(resumenListo(r));
});

/* ---------- Manifiesto ---------- */

test('manifiesto: sugerencia desde las identidades (sin repetir, frases "Soy…" aparte)', () => {
  const hs = [
    { identidad: 'cuida su mente' }, { identidad: 'Soy una persona que lee cada noche.' },
    { identidad: 'cuida su mente' }, { identidad: 'soy constante' }, { identidad: '' }, { identidad: 'camina', archivado: '2026-01-01' },
  ];
  assert.equal(sugerirManifiesto(hs), 'Soy una persona que cuida su mente y lee cada noche. Soy constante. Avanzo un poco cada día, sin culpa.');
  assert.equal(sugerirManifiesto([{ identidad: '' }]), '');
  assert.ok(duracionLectura('corto') < duracionLectura('x'.repeat(200)));
  assert.ok(duracionLectura('x'.repeat(280)) <= 9000);
});

test('textos: plural simple {n|uno|varios}', () => {
  assert.equal(t('anual.dias', { n: 1 }), '1 día');
  assert.equal(t('anual.dias', { n: 13 }), '13 días');
  assert.equal(t('respaldo.combinado', { h: 1, l: 2 }), 'Se agregó 1 hábito y 2 registros.');
});

/* ---------- 0.9.1: el último toque no se pierde ---------- */

test('guardar con { ya: true } escribe en el acto, sin esperar el temporizador', async () => {
  const motor = idbFalso();
  const a = crearAlmacen({ motor, legado: null, esperaMs: 60_000 });
  await a.cargar('2026-11-02');
  a.guardar(datosCon('Agrupado'));             // con espera: aún no escribe
  assert.equal(motor._m.get(CLAVE), undefined);
  const r = a.guardar(datosCon('Marcado'), { ya: true }); // al marcar: la escritura parte ya
  assert.equal(await r, true);
  assert.ok(motor._m.get(CLAVE).includes('Marcado'));
  assert.equal(await a.guardarYa(), true, 'no queda nada pendiente');
});
