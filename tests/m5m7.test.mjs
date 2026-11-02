// Pruebas de los Módulos 5–7: respaldo, cifrado, PIN, recordatorios e insights.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { datosVacios, sanearDatos } from '../js/esquema.js';
import { crearModelo } from '../js/modelo.js';
import { sumarDias } from '../js/fechas.js';
import { csvRegistros, textoRespaldo, validarRespaldo } from '../js/respaldo.js';
import { cifrar, crearPin, descifrar, esperaTrasFallos, igualesTiempoConstante, verificarPin } from '../js/cripto.js';
import { generarICS, recordatoriosVencidos } from '../js/recordatorios.js';
import { calcularInsights, resumenSemana, semanaParaRevisar } from '../js/insights.js';

function modelo(fecha = '2026-10-27', hora = '10:00') {
  let reloj = new Date(`${fecha}T${hora}:00`);
  const m = crearModelo(datosVacios(), { reloj: () => reloj });
  m.irA = (f, h = '10:00') => { reloj = new Date(`${f}T${h}:00`); };
  return m;
}

/* ---------- Respaldo ---------- */

test('respaldo: ida y vuelta conserva hábitos, registros, notas, recordatorios y revisiones', async () => {
  const m = modelo();
  const h = m.crearHabito({ nombre: 'Leer', creado: '2026-10-20' }).habito;
  m.tocar(h.id, '2026-10-21');
  m.fijarNota(h.id, '2026-10-21', 'bien');
  m.fijarRecordatorios(h.id, ['21:00', '08:30']);
  m.guardarRevision({ semana: '2026-10-19', funciono: 'Leer antes de dormir', noFunciono: '', ajuste: 'Dejar el celular afuera' });
  const texto = await textoRespaldo(m.serializar(), m.hoy());
  const r = validarRespaldo(JSON.parse(texto), m.hoy());
  assert.ok(r.ok);
  assert.deepEqual(r.datos, m.serializar());
  assert.deepEqual(r.resumen, { exportado: '2026-10-27', habitos: 1, registros: 1, notas: 1, desde: '2026-10-21', hasta: '2026-10-21', descartados: 0 });
});

test('importar rechaza archivos que no son de Tavia, vacíos o de una versión futura', () => {
  assert.equal(validarRespaldo([], '2026-10-27').error, 'respaldo.error.formato');
  assert.equal(validarRespaldo({ hola: 1 }, '2026-10-27').error, 'respaldo.error.formato');
  assert.equal(validarRespaldo({ app: 'tavia', datos: { habits: [], logs: [] } }, '2026-10-27').error, 'respaldo.error.vacio');
  assert.equal(validarRespaldo({ app: 'tavia', datos: { schemaVersion: 99, habits: [{ id: 'a', nombre: 'A' }], logs: [] } }, '2026-10-27').error, 'respaldo.error.futuro');
});

test('importar sanea: descarta lo inválido y lo cuenta en el resumen', () => {
  const r = validarRespaldo({
    app: 'tavia', datos: {
      schemaVersion: 1,
      habits: [{ id: 'a', nombre: 'A' }, { id: '<x>', nombre: 'malo' }],
      logs: [{ habitId: 'a', fecha: '2026-02-31', estado: 'registrado', valor: 1 }, { habitId: 'a', fecha: '2026-10-01', estado: 'registrado', valor: 1 }],
      config: { recordatorios: [{ habitId: 'a', hora: '25:00' }, { habitId: 'zz', hora: '08:00' }, { habitId: 'a', hora: '07:00' }] },
    },
  }, '2026-10-27');
  assert.ok(r.ok);
  assert.equal(r.resumen.descartados, 2);
  assert.deepEqual(r.datos.config.recordatorios, [{ habitId: 'a', hora: '07:00' }]);
});

test('combinar: agrega lo nuevo sin pisar lo actual', () => {
  const m = modelo();
  const a = m.crearHabito({ nombre: 'Actual', creado: '2026-10-20' }).habito;
  m.tocar(a.id, '2026-10-21');
  const otro = sanearDatos({
    schemaVersion: 2,
    habits: [{ id: a.id, nombre: 'Renombrado', creado: '2026-10-01' }, { id: 'nuevo', nombre: 'Nuevo', creado: '2026-10-01' }],
    logs: [
      { habitId: a.id, fecha: '2026-10-21', estado: 'saltado' }, // choca: gana lo actual
      { habitId: a.id, fecha: '2026-10-22', estado: 'registrado', valor: 1 }, // nuevo día: entra
      { habitId: 'nuevo', fecha: '2026-10-05', estado: 'registrado', valor: 1 },
    ],
  }, m.hoy()).datos;
  const r = m.combinar(otro);
  assert.deepEqual(r, { habitos: 1, logs: 2 });
  assert.equal(m.habito(a.id).nombre, 'Actual');
  assert.equal(m.logDe(a.id, '2026-10-21').estado, 'registrado');
  assert.ok(m.logDe(a.id, '2026-10-22'));
  assert.ok(m.habito('nuevo'));
});

test('CSV: incluye notas, escapa comas y comillas y neutraliza fórmulas', () => {
  const m = modelo();
  const h = m.crearHabito({ nombre: 'Leer, "mucho"', creado: '2026-10-20' }).habito;
  m.tocar(h.id, '2026-10-21');
  m.fijarNota(h.id, '2026-10-21', '=HYPERLINK("x")');
  const csv = csvRegistros(m.serializar());
  assert.ok(csv.startsWith('﻿fecha,habito,estado'));
  assert.match(csv, /"Leer, ""mucho"""/);
  assert.match(csv, /"'=HYPERLINK\(""x""\)"/);
});

/* ---------- Cifrado y PIN ---------- */

test('respaldo cifrado: AES-GCM descifra con la contraseña correcta y falla con otra', async () => {
  const obj = await cifrar('{"hola":"mundo"}', 'una contraseña larga', 100_000);
  assert.equal(obj.tipo, 'respaldo-cifrado');
  assert.ok(!JSON.stringify(obj).includes('mundo'));
  assert.equal(await descifrar(obj, 'una contraseña larga'), '{"hola":"mundo"}');
  await assert.rejects(descifrar(obj, 'otra contraseña'));
  const alterado = { ...obj, datos: obj.datos.slice(0, -4) + 'AAAA' };
  await assert.rejects(descifrar(alterado, 'una contraseña larga'));
});

test('PIN: nunca se guarda en claro; se verifica con PBKDF2 y sal aleatoria', async () => {
  const p1 = await crearPin('2468', 100_000);
  const p2 = await crearPin('2468', 100_000);
  assert.ok(!JSON.stringify(p1).includes('2468'));
  assert.notEqual(p1.pinSalt, p2.pinSalt);
  assert.notEqual(p1.pinHash, p2.pinHash);
  assert.equal(await verificarPin('2468', p1), true);
  assert.equal(await verificarPin('2469', p1), false);
  assert.equal(await verificarPin('abcd', p1), false);
  await assert.rejects(crearPin('12'));
});

test('PIN: espera creciente tras 5 fallos y comparación en tiempo constante', () => {
  assert.equal(esperaTrasFallos(4), 0);
  assert.equal(esperaTrasFallos(5), 30_000);
  assert.equal(esperaTrasFallos(6), 60_000);
  assert.equal(esperaTrasFallos(20), 15 * 60_000);
  assert.ok(igualesTiempoConstante(new Uint8Array([1, 2]), new Uint8Array([1, 2])));
  assert.ok(!igualesTiempoConstante(new Uint8Array([1, 2]), new Uint8Array([1, 3])));
  assert.ok(!igualesTiempoConstante(new Uint8Array([1]), new Uint8Array([1, 3])));
});

test('config: un pinHash con basura se descarta al sanear', () => {
  const { datos } = sanearDatos({ habits: [], logs: [], config: { pinHash: '<script>', pinSalt: 'x', bloqueoSegundos: 7 } }, '2026-10-27');
  assert.equal(datos.config.pinHash, null);
  assert.equal(datos.config.bloqueoSegundos, 60);
});

/* ---------- Recordatorios ---------- */

test('recordatorios: tope de 5 por hábito, se ordenan y se borran con el hábito', () => {
  const m = modelo();
  const h = m.crearHabito({ nombre: 'Agua' }).habito;
  m.fijarRecordatorios(h.id, ['18:00', '09:00', '09:00', '12:00', '15:00', '20:00', '21:00']);
  assert.deepEqual(m.recordatoriosDe(h.id), ['09:00', '12:00', '15:00', '18:00', '20:00']);
  m.archivar(h.id);
  m.eliminar(h.id);
  assert.deepEqual(m.config.recordatorios, []);
});

test('recordatorios vencidos: solo pendientes de hoy y con la hora ya pasada (respeta fin del día)', () => {
  const m = modelo('2026-10-27', '21:30');
  const a = m.crearHabito({ nombre: 'Leer' }).habito;
  const b = m.crearHabito({ nombre: 'Meditar' }).habito;
  const g = m.crearHabito({ nombre: 'Gym', frecuencia: { tipo: 'dias_fijos', dias: [0] } }).habito; // lunes; hoy es martes
  m.fijarRecordatorios(a.id, ['21:00']);
  m.fijarRecordatorios(b.id, ['22:00', '01:30']);
  m.fijarRecordatorios(g.id, ['07:00']);
  assert.deepEqual(recordatoriosVencidos(m, new Date('2026-10-27T21:30:00')).map((v) => v.habito.nombre), ['Leer']);
  m.tocar(a.id, m.hoy());
  assert.deepEqual(recordatoriosVencidos(m, new Date('2026-10-27T21:30:00')), []);
  // 01:45 del 28 sigue siendo el día 27 (el día termina a las 03:00): 22:00 y 01:30 vencidos
  m.irA('2026-10-28', '01:45');
  assert.deepEqual(recordatoriosVencidos(m, new Date('2026-10-28T01:45:00')).map((v) => v.hora), ['01:30', '22:00']);
});

test('archivo .ics: un evento repetido por recordatorio, con regla según la frecuencia', () => {
  const m = modelo();
  const d = m.crearHabito({ nombre: 'Leer; en paz, siempre' }).habito;
  const f = m.crearHabito({ nombre: 'Gym', frecuencia: { tipo: 'dias_fijos', dias: [0, 3] } }).habito;
  const c = m.crearHabito({ nombre: 'Regar', frecuencia: { tipo: 'cada_n_dias', n: 3 }, creado: '2026-10-26' }).habito;
  const p = m.crearHabito({ nombre: 'Secreto' }).habito;
  m.editarHabito(p.id, { ...p, privado: true });
  m.fijarRecordatorios(d.id, ['21:00']);
  m.fijarRecordatorios(f.id, ['07:30']);
  m.fijarRecordatorios(c.id, ['08:00']);
  const { texto, eventos } = generarICS(m, new Date('2026-10-27T13:00:00Z'));
  assert.equal(eventos, 3);
  assert.match(texto, /^BEGIN:VCALENDAR\r\n/);
  assert.match(texto, /SUMMARY:Tavia: Leer\\; en paz\\, siempre/);
  assert.match(texto, /DTSTART:20261027T210000\r\nDURATION:PT10M\r\nRRULE:FREQ=DAILY\r\n/);
  assert.match(texto, /DTSTART:20261029T073000\r\nDURATION:PT10M\r\nRRULE:FREQ=WEEKLY;BYDAY=MO,TH/);
  assert.match(texto, /DTSTART:20261029T080000\r\nDURATION:PT10M\r\nRRULE:FREQ=DAILY;INTERVAL=3/);
  assert.match(texto, /DTSTAMP:20261027T130000Z/);
  for (const linea of texto.split('\r\n')) assert.ok(new TextEncoder().encode(linea).length <= 75, linea);
});

/* ---------- Insights y revisión semanal ---------- */

test('insights: nada con menos de 14 días; luego mejor día, hábito ancla y hora fuerte', () => {
  const m = modelo('2026-10-27');
  const med = m.crearHabito({ nombre: 'Meditar', creado: '2026-09-01' }).habito;
  const leer = m.crearHabito({ nombre: 'Leer', creado: '2026-09-01' }).habito;
  const agua = m.crearHabito({ nombre: 'Agua', creado: '2026-09-01' }).habito;
  assert.equal(calcularInsights(m.habitos(), '2026-09-10', m.logDe), null);
  // Patrón: los días que medita (lun, mié, vie, sáb), también lee y toma agua; el resto, poco.
  for (let d = '2026-09-01'; d < '2026-10-27'; d = sumarDias(d, 1)) {
    const dia = new Date(`${d}T12:00:00`).getDay(); // 0 = domingo
    const medita = [1, 3, 5, 6].includes(dia);
    if (medita) {
      for (const h of [med, leer, agua]) m.restaurarLog(h.id, d, { habitId: h.id, fecha: d, estado: 'registrado', valor: 1, registradoEn: '07:15' });
    } else if (dia === 2) {
      m.restaurarLog(agua.id, d, { habitId: agua.id, fecha: d, estado: 'registrado', valor: 1, registradoEn: '20:00' });
    }
  }
  const i = calcularInsights(m.habitos(), m.hoy(), m.logDe);
  assert.ok([0, 2, 4, 5].includes(i.mejorDia.dia), `mejor día ${i.mejorDia.dia}`);
  assert.equal(i.ancla.habito.nombre, 'Meditar');
  assert.ok(i.ancla.con > 0.9 && i.ancla.sin < 0.3);
  assert.equal(i.hora.franja, 'manana');
  assert.equal(i.hora.pico, 7);
});

test('revisión semanal: resumen, qué funcionó y qué costó; se ofrece domingo y lunes', () => {
  const m = modelo('2026-10-25'); // domingo
  const a = m.crearHabito({ nombre: 'A', creado: '2026-10-19' }).habito;
  const b = m.crearHabito({ nombre: 'B', creado: '2026-10-19' }).habito;
  for (let d = '2026-10-19'; d <= '2026-10-25'; d = sumarDias(d, 1)) m.tocar(a.id, d);
  m.tocar(b.id, '2026-10-19');
  const r = resumenSemana(m.habitos(), '2026-10-19', m.hoy(), m.logDe);
  assert.deepEqual(r.funciono.map((x) => x.habito.nombre), ['A']);
  assert.deepEqual(r.costo.map((x) => x.habito.nombre), ['B']);
  assert.equal(r.pct, 8 / 13); // hoy B sigue pendiente: no cuenta todavía
  assert.equal(semanaParaRevisar('2026-10-25'), '2026-10-19');
  assert.equal(semanaParaRevisar('2026-10-26'), '2026-10-19');
  assert.equal(semanaParaRevisar('2026-10-27'), null);
  const deshacer = m.guardarRevision({ semana: '2026-10-19', funciono: 'x', noFunciono: '', ajuste: 'y' });
  assert.equal(m.revisionDe('2026-10-19').ajuste, 'y');
  deshacer();
  assert.equal(m.revisionDe('2026-10-19'), null);
});
