// Pruebas de lógica pura. Ejecutar con: TZ=America/Santiago node --test tests/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as F from '../js/fechas.js';
import { sanearDatos, datosVacios, migrate } from '../js/esquema.js';
import { crearModelo, validarEntrada, primerGrafema } from '../js/modelo.js';
import { tocaEnFecha, estadoDelDia, vistaDelDia, progresoDelDia } from '../js/calculos.js';
import { crearAlmacen } from '../js/storage.js';

test('fechaLocal no usa UTC (23:30 local sigue siendo el mismo día)', () => {
  assert.equal(F.fechaLocal(new Date(2026, 9, 27, 23, 30)), '2026-10-27');
  assert.equal(F.fechaLocal(new Date(2026, 0, 1, 0, 5)), '2026-01-01');
});

test('cambio de hora en Chile: sumar y restar días no duplica ni salta', () => {
  // Septiembre: el reloj salta de 24:00 a 01:00. Abril: vuelve de 24:00 a 23:00.
  let d = '2026-09-03';
  const vistos = [];
  for (let i = 0; i < 6; i++) { vistos.push(d); d = F.sumarDias(d, 1); }
  assert.deepEqual(vistos, ['2026-09-03', '2026-09-04', '2026-09-05', '2026-09-06', '2026-09-07', '2026-09-08']);
  d = '2026-04-02';
  for (let i = 0; i < 5; i++) d = F.sumarDias(d, 1);
  assert.equal(d, '2026-04-07');
  assert.equal(F.diffDias('2026-09-01', '2026-09-30'), 29);
  assert.equal(F.diffDias('2026-04-01', '2026-04-30'), 29);
  assert.equal(F.sumarDias('2026-03-01', -1), '2026-02-28');
  assert.equal(F.sumarDias('2028-03-01', -1), '2028-02-29');
});

test('día lógico respeta la hora de fin del día', () => {
  assert.equal(F.diaLogico(new Date(2026, 9, 28, 1, 30), '03:00'), '2026-10-27');
  assert.equal(F.diaLogico(new Date(2026, 9, 28, 3, 0), '03:00'), '2026-10-28');
  assert.equal(F.diaLogico(new Date(2026, 9, 28, 0, 1), '00:00'), '2026-10-28');
  assert.equal(F.diaLogico(new Date(2026, 9, 1, 1, 0), '02:00'), '2026-09-30'); // cruza de mes
  assert.equal(F.diaLogico(new Date(2026, 0, 1, 1, 0), '02:00'), '2025-12-31'); // cruza de año
});

test('ms hasta cambio de día', () => {
  const ms = F.msHastaCambioDeDia(new Date(2026, 9, 27, 23, 0), '00:00');
  assert.ok(ms > 59 * 60e3 && ms < 62 * 60e3);
  const ms2 = F.msHastaCambioDeDia(new Date(2026, 9, 28, 1, 0), '03:00');
  assert.ok(ms2 > 119 * 60e3 && ms2 < 122 * 60e3);
});

test('semana empieza el lunes', () => {
  assert.equal(F.diaSemana('2026-10-26'), 0); // lunes
  assert.equal(F.diaSemana('2026-11-01'), 6); // domingo
  assert.equal(F.inicioSemana('2026-11-01'), '2026-10-26');
});

test('esFechaValida rechaza fechas imposibles', () => {
  assert.ok(F.esFechaValida('2026-02-28'));
  assert.ok(!F.esFechaValida('2026-02-30'));
  assert.ok(!F.esFechaValida('2026-2-3'));
  assert.ok(!F.esFechaValida('<img>'));
});

test('saneamiento descarta basura y conserva lo válido', () => {
  const hoy = '2026-10-27';
  const { datos, descartados } = sanearDatos({
    schemaVersion: 1,
    habits: [
      { id: 'a', nombre: '  Leer  ', tipo: 'cantidad', meta: { min: 10, max: 5 }, frecuencia: { tipo: 'dias_fijos', dias: [9, 1, 1] } },
      { id: 'b<script>', nombre: 'malo' },
      { id: 'c', nombre: '' },
      'texto',
    ],
    logs: [
      { habitId: 'a', fecha: '2026-10-27', estado: 'registrado', valor: '7,5' },
      { habitId: 'a', fecha: '2026-13-01', estado: 'registrado', valor: 1 },
      { habitId: 'zz', fecha: '2026-10-27', estado: 'registrado', valor: 1 },
      { habitId: 'a', fecha: '2026-10-26', estado: 'hackeado' },
    ],
    config: { finDelDia: '12:00', tema: 'x' },
  }, hoy);
  assert.equal(datos.habits.length, 1);
  assert.equal(datos.habits[0].nombre, 'Leer');
  assert.deepEqual(datos.habits[0].meta, { min: 10, max: null }); // min > max: se descarta el máximo
  assert.deepEqual(datos.habits[0].frecuencia, { tipo: 'dias_fijos', dias: [1] });
  assert.equal(datos.habits[0].creado, hoy);
  assert.equal(datos.logs.length, 1);
  assert.equal(datos.logs[0].valor, 7.5);
  assert.equal(datos.config.finDelDia, '03:00');
  assert.equal(descartados, 6);
});

test('migrate: datos sin versión llegan a la versión actual; versión futura se marca', () => {
  assert.equal(migrate({ habits: [] }).datos.schemaVersion, 2);
  assert.deepEqual(migrate({ schemaVersion: 1, habits: [] }).datos.revisiones, []);
  assert.equal(migrate({ schemaVersion: 99 }).futuro, true);
});

function modelo(ahora = new Date(2026, 9, 27, 10, 0)) {
  let reloj = ahora;
  const m = crearModelo(datosVacios(), { reloj: () => reloj });
  m.setReloj = (d) => { reloj = d; };
  return m;
}

test('crear hábito valida nombre, días y meta', () => {
  const m = modelo();
  assert.equal(m.crearHabito({ nombre: '   ' }).error, 'editor.error.nombre');
  assert.equal(m.crearHabito({ nombre: 'X', frecuencia: { tipo: 'dias_fijos', dias: [] } }).error, 'editor.error.dias');
  assert.equal(m.crearHabito({ nombre: 'X', tipo: 'cantidad', metaModo: 'rango', metaMin: '9', metaMax: '7' }).error, 'editor.error.meta');
  assert.equal(m.crearHabito({ nombre: 'X', tipo: 'cantidad', metaModo: 'min', metaMin: 'abc' }).error, 'editor.error.numero');
  const r = m.crearHabito({ nombre: 'Leer', tipo: 'cantidad', unidad: 'páginas', metaModo: 'min', metaMin: '20', creado: '2030-01-01' });
  assert.ok(r.ok);
  assert.equal(r.habito.creado, '2026-10-27'); // fecha futura de inicio se corrige a hoy
});

test('toque Sí/No: alterna; N veces suma y al completar vuelve a 0', () => {
  const m = modelo();
  const a = m.crearHabito({ nombre: 'Meditar' }).habito;
  const b = m.crearHabito({ nombre: 'Agua', vecesPorDia: 3 }).habito;
  const hoy = m.hoy();
  assert.equal(m.tocar(a.id, hoy).accion, 'marcado');
  assert.equal(estadoDelDia(a, m.logDe(a.id, hoy)), 'hecho');
  assert.equal(m.logDe(a.id, hoy).registradoEn, '10:00');
  assert.equal(m.tocar(a.id, hoy).accion, 'desmarcado');
  assert.equal(m.logDe(a.id, hoy), null);
  assert.equal(m.tocar(b.id, hoy).accion, 'sumado');
  assert.equal(estadoDelDia(b, m.logDe(b.id, hoy)), 'parcial');
  m.tocar(b.id, hoy);
  assert.equal(m.tocar(b.id, hoy).accion, 'marcado');
  assert.equal(m.tocar(b.id, hoy).accion, 'desmarcado');
});

test('no se marcan días futuros ni anteriores al inicio', () => {
  const m = modelo();
  const a = m.crearHabito({ nombre: 'A' }).habito;
  assert.equal(m.tocar(a.id, '2026-10-28'), null);
  assert.equal(m.tocar(a.id, '2026-10-26'), null);
  const b = m.crearHabito({ nombre: 'B', creado: '2026-10-01' }).habito;
  assert.ok(m.tocar(b.id, '2026-10-26')); // pasado permitido desde su inicio
  assert.equal(m.logDe(b.id, '2026-10-26').registradoEn, undefined); // día pasado: no inventamos la hora
});

test('deshacer restaura exactamente el registro anterior', () => {
  const m = modelo();
  const a = m.crearHabito({ nombre: 'A' }).habito;
  const hoy = m.hoy();
  m.tocar(a.id, hoy);
  const r = m.fijarEstado(a.id, hoy, 'saltado');
  assert.equal(estadoDelDia(a, m.logDe(a.id, hoy)), 'saltado');
  m.restaurarLog(a.id, hoy, r.antes);
  assert.equal(estadoDelDia(a, m.logDe(a.id, hoy)), 'hecho');
});

test('cantidad: mínimo, máximo, rango y solo registrar', () => {
  const m = modelo();
  const hoy = m.hoy();
  const min = m.crearHabito({ nombre: 'Leer', tipo: 'cantidad', metaModo: 'min', metaMin: 20 }).habito;
  const max = m.crearHabito({ nombre: 'Pantalla', tipo: 'cantidad', metaModo: 'max', metaMax: 2 }).habito;
  const rango = m.crearHabito({ nombre: 'Dormir', tipo: 'cantidad', metaModo: 'rango', metaMin: 7, metaMax: 9 }).habito;
  const libre = m.crearHabito({ nombre: 'Peso', tipo: 'cantidad', metaModo: 'libre' }).habito;
  const est = (h, v) => { m.fijarValor(h.id, hoy, v); return estadoDelDia(h, m.logDe(h.id, hoy)); };
  assert.equal(est(min, '10'), 'parcial');
  assert.equal(est(min, '20'), 'hecho');
  assert.equal(est(max, '1,5'), 'hecho');
  assert.equal(est(max, '0'), 'hecho'); // 0 horas de pantalla también es un registro
  assert.equal(est(max, '3'), 'excedido');
  assert.equal(est(rango, '7,5'), 'hecho');
  assert.equal(est(rango, '6'), 'parcial');
  assert.equal(est(rango, '10'), 'excedido');
  assert.equal(est(libre, '72,4'), 'hecho');
  assert.deepEqual(m.fijarValor(min.id, hoy, 'mucho'), { error: 'editor.error.numero' });
  assert.deepEqual(m.fijarValor(min.id, hoy, '-3'), { error: 'editor.error.numero' });
});

test('frecuencias: días fijos, cada N días, pausa y archivado', () => {
  const m = modelo();
  const fijos = m.crearHabito({ nombre: 'Gym', frecuencia: { tipo: 'dias_fijos', dias: [1, 3] }, creado: '2026-10-01' }).habito; // martes y jueves
  assert.ok(!tocaEnFecha(fijos, '2026-10-26'));
  assert.ok(tocaEnFecha(fijos, '2026-10-27'));
  assert.ok(tocaEnFecha(fijos, '2026-10-29'));
  const cada = m.crearHabito({ nombre: 'Regar', frecuencia: { tipo: 'cada_n_dias', n: 3 }, creado: '2026-10-21' }).habito;
  assert.ok(tocaEnFecha(cada, '2026-10-21'));
  assert.ok(!tocaEnFecha(cada, '2026-10-22'));
  assert.ok(tocaEnFecha(cada, '2026-10-27'));
  const largo = m.crearHabito({ nombre: 'Cepillo', frecuencia: { tipo: 'cada_n_dias', n: 180 }, creado: '2026-01-01' }).habito;
  assert.ok(tocaEnFecha(largo, F.sumarDias('2026-01-01', 180)));
  m.pausar(fijos.id, '2026-11-05');
  assert.ok(!tocaEnFecha(m.habito(fijos.id), '2026-10-29'));
  m.reanudar(fijos.id);
  assert.ok(tocaEnFecha(m.habito(fijos.id), '2026-10-29'));
  const deshacer = m.archivar(cada.id);
  assert.ok(!tocaEnFecha(m.habito(cada.id), '2026-10-27'));
  assert.ok(tocaEnFecha(m.habito(cada.id), '2026-10-24')); // el pasado se conserva
  deshacer();
  assert.ok(tocaEnFecha(m.habito(cada.id), '2026-10-27'));
});

test('semanal: meta por semana, hábito creado a mitad de semana y progreso del día', () => {
  const m = modelo(new Date(2026, 9, 29, 10, 0)); // jueves
  const s = m.crearHabito({ nombre: 'Correr', frecuencia: { tipo: 'semanal_n', n: 2 }, creado: '2026-10-26' }).habito;
  const d = m.crearHabito({ nombre: 'Leer' }).habito;
  m.tocar(s.id, '2026-10-26');
  m.tocar(s.id, '2026-10-27');
  const vS = vistaDelDia(s, '2026-10-29', m.logDe);
  assert.deepEqual(vS.semana, { hechos: 2, n: 2, lista: true });
  assert.equal(vS.requerido, false); // meta semanal lista: hoy es opcional
  const vD = vistaDelDia(d, '2026-10-29', m.logDe);
  assert.deepEqual(progresoDelDia([vS, vD]), { hechos: 0, total: 1 });
  m.tocar(d.id, '2026-10-29');
  assert.deepEqual(progresoDelDia([vS, vistaDelDia(d, '2026-10-29', m.logDe)]), { hechos: 1, total: 1 });
  // La semana siguiente vuelve a contar desde 0
  assert.equal(vistaDelDia(s, '2026-11-02', m.logDe).semana.hechos, 0);
});

test('saltado y descanso no cuentan en el total del día', () => {
  const m = modelo();
  const a = m.crearHabito({ nombre: 'A' }).habito;
  const b = m.crearHabito({ nombre: 'B' }).habito;
  m.fijarEstado(a.id, m.hoy(), 'descanso');
  const vs = [a, b].map((h) => vistaDelDia(h, m.hoy(), m.logDe));
  assert.deepEqual(progresoDelDia(vs), { hechos: 0, total: 1 });
});

test('fin del día a las 03:00: a la 01:30 se marca el día anterior', () => {
  const m = modelo(new Date(2026, 9, 28, 1, 30));
  const a = m.crearHabito({ nombre: 'A', creado: '2026-10-20' }).habito;
  assert.equal(m.hoy(), '2026-10-27');
  m.tocar(a.id, m.hoy());
  assert.ok(m.logDe(a.id, '2026-10-27'));
  m.setConfig({ finDelDia: '00:00' });
  assert.equal(m.hoy(), '2026-10-28');
});

test('nota se conserva al desmarcar y al cambiar de estado', () => {
  const m = modelo();
  const a = m.crearHabito({ nombre: 'A' }).habito;
  const hoy = m.hoy();
  m.restaurarLog(a.id, hoy, { habitId: a.id, fecha: hoy, estado: 'registrado', valor: 1, nota: 'cansado' });
  m.tocar(a.id, hoy);
  assert.equal(m.logDe(a.id, hoy).nota, 'cansado');
  assert.equal(estadoDelDia(a, m.logDe(a.id, hoy)), 'pendiente');
  m.fijarEstado(a.id, hoy, 'saltado');
  assert.equal(m.logDe(a.id, hoy).nota, 'cansado');
});

test('serializar → sanear devuelve lo mismo (ida y vuelta)', () => {
  const m = modelo();
  const a = m.crearHabito({ nombre: 'A', tipo: 'cantidad', metaModo: 'rango', metaMin: 1, metaMax: 2, unidad: 'h' }).habito;
  m.fijarValor(a.id, m.hoy(), '1,25');
  const d1 = m.serializar();
  const { datos: d2 } = sanearDatos(JSON.parse(JSON.stringify(d1)), m.hoy());
  assert.deepEqual(d2, d1);
});

test('primerGrafema toma un emoji compuesto completo', () => {
  assert.equal(primerGrafema('👩‍💻 hola'), '👩‍💻');
  assert.equal(primerGrafema('🇨🇱'), '🇨🇱');
  assert.equal(primerGrafema(''), '');
});

test('validarEntrada recorta textos largos', () => {
  const v = validarEntrada({ nombre: 'x'.repeat(500), identidad: 'y'.repeat(500) }, '2026-10-27');
  assert.equal(v.datos.nombre.length, 60);
  assert.equal(v.datos.identidad.length, 120);
});

/* ---------- Almacenamiento ---------- */

function storageFalso({ lleno = false } = {}) {
  const m = new Map();
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => {
      if (lleno) { const e = new Error('lleno'); e.name = 'QuotaExceededError'; throw e; }
      m.set(k, String(v));
    },
    removeItem: (k) => m.delete(k),
    _m: m,
  };
}

test('storage: sin localStorage sigue en memoria y avisa', async () => {
  const avisos = [];
  const a = crearAlmacen({ storage: null, alAviso: (k) => avisos.push(k) });
  const d = await a.cargar('2026-10-27');
  assert.deepEqual(d.habits, []);
  assert.equal(a.estado, 'memoria');
  assert.deepEqual(avisos, ['aviso.memoria']);
});

test('storage: JSON dañado se respalda y se empieza de cero', async () => {
  const s = storageFalso();
  s.setItem('tavia:data', '{roto');
  const avisos = [];
  const a = crearAlmacen({ storage: s, alAviso: (k) => avisos.push(k) });
  const d = await a.cargar('2026-10-27');
  assert.deepEqual(d.habits, []);
  assert.deepEqual(avisos, ['aviso.corrupto']);
  assert.ok([...s._m.keys()].some((k) => k.startsWith('tavia:data:corrupto:')));
});

test('storage: cuota llena avisa y no rompe', async () => {
  const avisos = [];
  const a = crearAlmacen({ storage: storageFalso({ lleno: true }), alAviso: (k) => avisos.push(k) });
  a.guardar(datosVacios());
  assert.equal(await a.guardarYa(), false);
  assert.equal(a.estado, 'error');
  assert.deepEqual(avisos, ['aviso.cuota']);
});

test('storage: versión futura queda en solo lectura (no sobrescribe)', async () => {
  const s = storageFalso();
  s.setItem('tavia:data', JSON.stringify({ schemaVersion: 99, habits: [], logs: [] }));
  const a = crearAlmacen({ storage: s });
  await a.cargar('2026-10-27');
  a.guardar(datosVacios());
  await a.guardarYa();
  assert.equal(JSON.parse(s.getItem('tavia:data')).schemaVersion, 99);
});

test('storage: guardar y cargar ida y vuelta', async () => {
  const s = storageFalso();
  const a = crearAlmacen({ storage: s });
  const m = crearModelo(datosVacios(), { reloj: () => new Date(2026, 9, 27, 10) });
  m.crearHabito({ nombre: 'Leer' });
  a.guardar(m.serializar());
  await a.guardarYa();
  const d = await crearAlmacen({ storage: s }).cargar('2026-10-27');
  assert.equal(d.habits[0].nombre, 'Leer');
});
