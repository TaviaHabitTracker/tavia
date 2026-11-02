// Pruebas de la Fase 1 de seguridad (informe de auditoría, 2 nov 2026).
// Cada prueba nombra el hallazgo que cubre.
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { datosVacios, sanearConfig, PIN_ITERACIONES, ESPERA_PIN_MAX } from '../js/esquema.js';
import { crearRespaldo, textoRespaldo, validarRespaldo } from '../js/respaldo.js';
import { cifrar, crearPin, descifrar } from '../js/cripto.js';
import { crearModelo } from '../js/modelo.js';
import { intentarPin } from '../js/vistas/seguridad.js';

const HOY = '2026-11-02';

function datosConPin(pin) {
  const d = datosVacios();
  d.habits = [{ id: 'med', nombre: 'Medicamento', icono: '💊', color: 'pino', tipo: 'si_no', vecesPorDia: 1, frecuencia: { tipo: 'diaria' }, bloque: 'manana', creado: '2026-10-01', pausas: [], orden: 1, privado: true }];
  d.config = { ...d.config, ...pin };
  return d;
}

test('A-3: el respaldo nunca lleva el hash ni la sal del PIN', async () => {
  const pin = await crearPin('2468', 100_000);
  const d = datosConPin({ ...pin, pinFallos: 3 });
  const r = crearRespaldo(d, HOY);
  assert.equal(r.datos.config.pinHash, null);
  assert.equal(r.datos.config.pinSalt, null);
  assert.equal(r.datos.config.pinFallos, 0);
  const texto = await textoRespaldo(d, HOY);
  assert.ok(!texto.includes(pin.pinHash) && !texto.includes(pin.pinSalt));
  assert.equal(d.config.pinHash, pin.pinHash, 'no toca los datos de la app');
});

test('M-2: un respaldo que trae PIN llega sin PIN (no puede quitar ni cambiar el actual)', async () => {
  const ajeno = await crearPin('1111', 100_000);
  const archivo = { app: 'tavia', tipo: 'respaldo', datos: datosConPin(ajeno) };
  const r = validarRespaldo(archivo, HOY);
  assert.ok(r.ok);
  assert.equal(r.datos.config.pinHash, null);
  assert.equal(r.datos.config.pinSalt, null);
});

test('M-1: la espera se guarda como tiempo que falta y cambiar la hora del teléfono no la salta', async () => {
  const pin = await crearPin('2468', 100_000);
  let ahora = new Date('2026-11-02T10:00:00');
  const m = crearModelo(datosConPin(pin), { reloj: () => ahora });
  const ctx = { modelo: m };
  for (let i = 0; i < 5; i++) assert.equal((await intentarPin(ctx, '0000')).ok, false);
  assert.equal(m.config.pinEspera, 30_000);
  ahora = new Date('2026-11-03T10:00:00'); // alguien adelanta el reloj un día
  const r = await intentarPin(ctx, '2468');
  assert.equal(r.ok, false, 'sigue esperando aunque el PIN sea correcto');
  assert.equal(r.esperaMs, 30_000);
  m.setConfig({ pinEspera: 0 }); // la espera se cumplió con la app abierta
  assert.equal((await intentarPin(ctx, '2468')).ok, true);
  assert.equal(m.config.pinFallos, 0);
});

test('M-1: datos de la 0.9 con hora absoluta se traducen a espera pendiente, con tope de 15 min', () => {
  assert.equal(sanearConfig({ pinFallos: 6, pinEsperaHasta: Date.now() + 999_999 }).pinEspera, 60_000);
  assert.equal(sanearConfig({ pinFallos: 2, pinEsperaHasta: 123 }).pinEspera, 0);
  assert.equal(sanearConfig({ pinEspera: 99_999_999 }).pinEspera, ESPERA_PIN_MAX);
  assert.equal(sanearConfig({ pinEspera: -5 }).pinEspera, 0);
  assert.equal('pinEsperaHasta' in sanearConfig({ pinEsperaHasta: 5 }), false);
});

test('B-2: el respaldo cifrado rechaza iteraciones exageradas y sal o IV de largo raro', async () => {
  const obj = await cifrar('{"a":1}', 'una contraseña larga', 100_000);
  await assert.rejects(descifrar({ ...obj, cifrado: { ...obj.cifrado, iter: 3_000_000 } }, 'una contraseña larga'), /Iteraciones/);
  await assert.rejects(descifrar({ ...obj, cifrado: { ...obj.cifrado, iv: 'AAAA' } }, 'una contraseña larga'), /IV/);
  await assert.rejects(descifrar({ ...obj, cifrado: { ...obj.cifrado, sal: 'AAAA' } }, 'una contraseña larga'), /Sal/);
  assert.equal(await descifrar(obj, 'una contraseña larga'), '{"a":1}');
  assert.equal(sanearConfig({ pinIter: 5_000_000 }).pinIter, PIN_ITERACIONES);
});
