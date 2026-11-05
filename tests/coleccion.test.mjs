// Temas de colección (0.15): niveles por días registrados, contraste AA de los 50 niveles y dibujos seguros.
// Uso: node --test tests/coleccion.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { COLECCIONES, UMBRALES, contraste, nivelDe, paletaDe, proximoNivel } from '../js/coleccion.js';
import { ARTE } from '../js/coleccion-arte.js';
import { datosVacios, sanearConfig } from '../js/esquema.js';
import { t } from '../js/textos.js';

test('los niveles se ganan con días registrados acumulados', () => {
  assert.deepEqual(UMBRALES, [0, 10, 30, 75, 150]);
  assert.equal(nivelDe(0), 1);
  assert.equal(nivelDe(9), 1);
  assert.equal(nivelDe(10), 2);
  assert.equal(nivelDe(74), 3);
  assert.equal(nivelDe(75), 4);
  assert.equal(nivelDe(150), 5);
  assert.equal(nivelDe(9999), 5);
  assert.deepEqual(proximoNivel(6), { nivel: 2, dias: 10, faltan: 4 });
  assert.equal(proximoNivel(150), null);
});

test('10 temas × 5 niveles, cada uno con dibujo, nombres y textos', () => {
  assert.equal(COLECCIONES.length, 10);
  for (const id of COLECCIONES) {
    assert.equal(ARTE[id].length, 5, id);
    assert.notEqual(t(`coleccion.${id}`), `coleccion.${id}`);
    for (let n = 1; n <= 5; n++) {
      assert.ok(ARTE[id][n - 1].length > 0, `${id} ${n} sin dibujo`);
      assert.notEqual(t(`coleccion.${id}.${n}`), `coleccion.${id}.${n}`);
    }
  }
});

test('los dibujos solo usan etiquetas SVG conocidas y ningún estilo en línea ni evento', () => {
  const PERMITIDAS = new Set(['g', 'path', 'circle', 'ellipse', 'polygon', 'rect', 'defs', 'linearGradient', 'radialGradient', 'stop', 'clipPath', 'pattern']);
  const revisar = ([tag, attrs, hijos = []]) => {
    assert.ok(PERMITIDAS.has(tag), `etiqueta ${tag}`);
    for (const k of Object.keys(attrs)) {
      assert.ok(!/^on/i.test(k) && k !== 'style' && k !== 'href' && k !== 'xlink:href', `atributo ${k}`);
    }
    hijos.forEach(revisar);
  };
  for (const id of COLECCIONES) ARTE[id].forEach((nivel) => nivel.forEach(revisar));
});

test('los 50 niveles cumplen contraste AA (texto 4,5:1 y formas 3:1)', () => {
  for (const id of COLECCIONES) {
    for (let n = 1; n <= 5; n++) {
      const v = paletaDe(id, n);
      const donde = `${id} nivel ${n}`;
      assert.ok(contraste(v['--tinta'], v['--fondo']) >= 7, `${donde}: tinta`);
      assert.ok(contraste(v['--tinta-suave'], v['--superficie']) >= 4.5, `${donde}: tinta suave`);
      assert.ok(contraste(v['--tinta-tenue'], v['--superficie']) >= 4.5, `${donde}: tinta tenue`);
      assert.ok(contraste(v['--acento-texto'], v['--superficie']) >= 4.5, `${donde}: acento texto`);
      assert.ok(contraste(v['--acento'], v['--fondo']) >= 3, `${donde}: acento`);
      assert.ok(contraste(v['--sobre-acento'], v['--acento']) >= 4.5, `${donde}: sobre acento`);
      assert.ok(contraste(v['--linea-fuerte'], v['--fondo']) >= 3, `${donde}: línea fuerte`);
    }
  }
});

test('la configuración guarda el tema y los días de prueba, y descarta valores raros', () => {
  const base = datosVacios().config;
  assert.equal(base.coleccion, '');
  assert.equal(base.coleccionPrueba, null);
  assert.equal(sanearConfig({ ...base, coleccion: 'minas', coleccionPrueba: 75 }).coleccion, 'minas');
  assert.equal(sanearConfig({ ...base, coleccion: 'minas', coleccionPrueba: 75 }).coleccionPrueba, 75);
  assert.equal(sanearConfig({ ...base, coleccion: '<script>' }).coleccion, '');
  assert.equal(sanearConfig({ ...base, coleccionPrueba: -3 }).coleccionPrueba, null);
  assert.equal(sanearConfig({ ...base, coleccionPrueba: 2.5 }).coleccionPrueba, null);
  assert.equal(sanearConfig({ ...base, coleccionPrueba: 9999 }).coleccionPrueba, null);
});
