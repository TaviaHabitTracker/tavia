// Prueba de privacidad de la tarjeta «Mi jardín» (J5).
// La rutina que dibuja solo recibe datos agregados: con las opciones por defecto no puede aparecer
// un nombre de hábito, una fecha exacta, una nota ni la semilla. Se dibuja en un canvas falso que
// anota todo el texto pintado.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { datosVacios } from '../js/esquema.js';
import { crearModelo } from '../js/modelo.js';
import { sumarDias } from '../js/fechas.js';
import { jardinDelAnio } from '../js/jardin.js';
import { datosTarjeta, dibujarTarjetaJardin, FORMATOS, NOMBRE_ARCHIVO, OPCIONES_POR_DEFECTO, textoContenido } from '../js/tarjeta-jardin.js';

// Path2D no existe en Node: basta con una versión que guarde la ruta.
globalThis.Path2D = class { constructor(d) { this.d = d; } };

function lienzoFalso() {
  const textos = [];
  const noop = () => {};
  const c = new Proxy({ textos }, {
    get(o, k) {
      if (k === 'textos') return textos;
      if (k === 'fillText') return (s) => textos.push(String(s));
      if (k === 'measureText') return (s) => ({ width: String(s).length * 18 });
      if (k === 'createRadialGradient') return () => ({ addColorStop: noop });
      if (k in o) return o[k];
      return noop;
    },
    set(o, k, v) { o[k] = v; return true; },
  });
  return { width: 0, height: 0, getContext: () => c, textos };
}

const COLORES = {
  fondo: '#fff', tinta: '#000', suave: '#555', acento: '#a60', ambiente: '#fff', cama: '#eee',
  roles: { tallo: '#7a7', hoja: '#7a7', 'hoja-descanso': '#9a9', nervio: '#fff', tierra: '#ccb', semilla: '#987', punto: '#ccc', perla: '#e93', aro: '#e93', luz: '#fff', brillo: '#fff', 'centro-oscuro': '#322' },
  variantes: Object.fromEntries([1, 2, 3, 4, 5].map((i) => [i, { petalo: '#c9b', petalo2: '#edc', centro: '#d93' }])),
};

const SEMILLA = '0123456789abcdef0123456789abcdef';
function escenario() {
  const reloj = new Date('2026-10-27T10:00:00');
  const m = crearModelo(datosVacios(), { reloj: () => reloj });
  const a = m.crearHabito({ nombre: 'Meditar con Ana', creado: '2026-01-01' }).habito;
  const b = m.crearHabito({ nombre: 'Diario secreto', creado: '2026-01-01', privado: true }).habito;
  for (let i = 0; i < 290; i++) {
    const d = sumarDias('2026-01-01', i);
    if (i % 4) m.fijarValor(a.id, d, '1');
    if (i % 2) m.fijarValor(b.id, d, '1');
  }
  m.fijarNota(a.id, '2026-10-20', 'Nota muy personal');
  return { m, a, b };
}

test('datos de la tarjeta: sin nombres, fechas, notas ni semilla (opciones por defecto)', () => {
  const { m } = escenario();
  const publicos = m.habitos().filter((h) => !h.privado);
  const j = jardinDelAnio(publicos, 2026, { hoy: m.hoy(), logDe: m.logDe });
  const datos = datosTarjeta(j, SEMILLA, { racha: 12 });
  const json = JSON.stringify(datos);
  assert.doesNotMatch(json, /Meditar|Ana|Diario|secreto|Nota muy personal/);
  assert.doesNotMatch(json, /\d{4}-\d{2}-\d{2}/);
  assert.ok(!json.includes(SEMILLA));
  assert.equal(datos.flores, null);
  assert.equal(datos.racha, null);
  assert.equal(datos.meses, null);
  assert.equal(datos.frase, null);
  assert.equal(datos.celdas.length, 365);
  assert.deepEqual(Object.keys(datos.celdas[0]).sort(), ['col', 'dx', 'dy', 'escala', 'figura', 'fila', 'giro', 'm', 'variante']);
});

test('lo dibujado con las opciones por defecto: solo título, año y marca', () => {
  const { m } = escenario();
  const j = jardinDelAnio(m.habitos().filter((h) => !h.privado), 2026, { hoy: m.hoy(), logDe: m.logDe });
  const lienzo = lienzoFalso();
  dibujarTarjetaJardin(lienzo, datosTarjeta(j, SEMILLA), COLORES);
  assert.deepEqual(lienzo.textos, ['Mi jardín', '2026', 'Tavia']);
  assert.equal(lienzo.width, 1080);
  assert.equal(lienzo.height, FORMATOS.retrato);
});

test('con cifras, racha, meses y frase: aparecen solo esos datos (y la frase con su autor)', () => {
  const { m } = escenario();
  const j = jardinDelAnio(m.habitos().filter((h) => !h.privado), 2026, { hoy: m.hoy(), logDe: m.logDe });
  const lienzo = lienzoFalso();
  const datos = datosTarjeta(j, SEMILLA, { opciones: { formato: 'historia', flores: true, racha: true, meses: true, frase: true }, racha: 7, hitoFrase: 30 });
  dibujarTarjetaJardin(lienzo, datos, COLORES);
  const todo = lienzo.textos.join(' | ');
  assert.equal(lienzo.height, FORMATOS.historia);
  assert.match(todo, /días con flor/);
  assert.match(todo, /Racha: 7 días/);
  assert.match(todo, /Ene/);
  assert.match(todo, /— Tavia/);
  assert.doesNotMatch(todo, /Meditar|Diario|Nota|\d{4}-\d{2}-\d{2}/);
  assert.match(textoContenido(datos), /número de flores/);
});

test('los hábitos privados no aportan nada, ni en los números', () => {
  const { m } = escenario();
  const publicos = m.habitos().filter((h) => !h.privado);
  const op = { opciones: { ...OPCIONES_POR_DEFECTO, flores: true } };
  const conPublicos = datosTarjeta(jardinDelAnio(publicos, 2026, { hoy: m.hoy(), logDe: m.logDe }), SEMILLA, op);
  // Si el privado entrara, los días impares (donde solo hizo el privado) cambiarían de figura.
  const conTodos = datosTarjeta(jardinDelAnio(m.habitos(), 2026, { hoy: m.hoy(), logDe: m.logDe }), SEMILLA, op);
  assert.notDeepEqual(conPublicos.celdas.map((c) => c.figura), conTodos.celdas.map((c) => c.figura));
  // La vista de la tarjeta siempre usa la primera (ver vistas/jardin-tarjeta.js: filtra h.privado).
  assert.equal(conPublicos.flores, jardinDelAnio(publicos, 2026, { hoy: m.hoy(), logDe: m.logDe }).dias.filter((d) => d.estado.startsWith('flor')).length);
});

test('nombre de archivo genérico', () => {
  assert.equal(NOMBRE_ARCHIVO, 'tavia-jardin.png');
});
