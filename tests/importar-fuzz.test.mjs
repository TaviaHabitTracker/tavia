// I1 — Fuzzing y rendimiento de los lectores. Semilla fija: si algo falla, se repite igual.
// Regla: ante cualquier entrada, los lectores devuelven un resultado o lanzan ErrorImport.
// Nunca otro tipo de error, nunca un cuelgue, nunca Object.prototype modificado.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { ErrorImport, limitesCon } from '../js/importar/errores.js';
import { decodificar } from '../js/importar/texto.js';
import { comoTabla, parsearCSV } from '../js/importar/csv.js';
import { parsearJSON } from '../js/importar/json.js';
import { abrirBytes } from '../js/importar/leer.js';
import { convertirFecha, detectarFormatoFecha } from '../js/importar/fechas.js';
import { azar, bytes, crearZip } from './importar-ayudantes.mjs';

const fixture = (n) => new Uint8Array(readFileSync(new URL(`./fixtures/importar/${n}`, import.meta.url)));
const SEMILLA = 20261103;
const VUELTAS = 400;
const limites = limitesCon({ archivo: 1_000_000, descomprimido: 2_000_000, entrada: 1_000_000, filas: 20_000 });

function mutar(origen, r) {
  const b = origen.slice();
  const cambios = 1 + Math.floor(r() * 8);
  for (let k = 0; k < cambios; k++) {
    const op = r();
    const i = Math.floor(r() * b.length);
    if (op < 0.6) b[i] = Math.floor(r() * 256);
    else if (op < 0.8) return b.subarray(0, i); // truncado
    else b[i] = [0x00, 0xff, 0x22, 0x0a, 0x2c, 0x3b, 0x5b, 0x7b][Math.floor(r() * 8)];
  }
  return b;
}

async function sinSorpresas(fn, etiqueta) {
  try {
    await fn();
  } catch (e) {
    if (!(e instanceof ErrorImport)) throw new Error(`${etiqueta}: error inesperado ${e?.name}: ${e?.message}`);
  }
  assert.equal(Object.getPrototypeOf({}).contaminado, undefined, etiqueta);
}

test('fuzz: zips mutados y truncados', async () => {
  const r = azar(SEMILLA);
  const bases = [fixture('normal.zip'), fixture('slip.zip'), await crearZip([{ ruta: 'a.csv', datos: 'x,y\n1,2\n'.repeat(50) }])];
  for (let k = 0; k < VUELTAS; k++) {
    const b = mutar(bases[k % bases.length], r);
    await sinSorpresas(() => abrirBytes(b, { limites }), `zip #${k}`);
  }
});

test('fuzz: CSV mutados (comillas, nulos, delimitadores, codificaciones mezcladas)', async () => {
  const r = azar(SEMILLA + 1);
  const base = bytes('fecha;hábito;valor;nota\r\n2026-01-01;"Café, té";1,5;"dijo ""sí""\nok"\r\n2026-01-02;Leer;2;\r\n');
  for (let k = 0; k < VUELTAS; k++) {
    const b = mutar(base, r);
    await sinSorpresas(() => {
      const { texto } = decodificar(b);
      const { filas } = parsearCSV(texto, { limites });
      if (filas.length) comoTabla(filas);
    }, `csv #${k}`);
  }
});

test('fuzz: JSON mutados, incluidos __proto__ escondidos', async () => {
  const r = azar(SEMILLA + 2);
  const base = bytes('{"habitos":[{"nombre":"Leer","dias":[1,2,3],"meta":{"min":1}}],"x":{"__prot":{"contaminado":1}}}');
  for (let k = 0; k < VUELTAS; k++) {
    const b = mutar(base, r);
    await sinSorpresas(() => parsearJSON(decodificar(b).texto, { limites }), `json #${k}`);
  }
});

test('fuzz: fechas con basura', async () => {
  const r = azar(SEMILLA + 3);
  const piezas = ['2026', '-', '/', '13', '31', '02', '29', 'T', ' ', '25:61', 'Z', '+03:00', '1767225600', '.', 'x', '000'];
  for (let k = 0; k < VUELTAS; k++) {
    const v = Array.from({ length: 1 + Math.floor(r() * 7) }, () => piezas[Math.floor(r() * piezas.length)]).join('');
    await sinSorpresas(() => {
      const d = detectarFormatoFecha([v]);
      for (const f of ['iso', 'dmy', 'mdy', 'epoch']) {
        const s = convertirFecha(v, f);
        if (s !== null) assert.match(s, /^\d{4}-\d{2}-\d{2}$/, v);
      }
      return d;
    }, `fecha #${k}`);
  }
});

test('fuzz: bytes al azar puros', async () => {
  const r = azar(SEMILLA + 4);
  for (let k = 0; k < VUELTAS; k++) {
    const b = new Uint8Array(1 + Math.floor(r() * 300)).map(() => Math.floor(r() * 256));
    if (k % 3 === 0) { b[0] = 0x50; b[1] = 0x4b; b[2] = 5; b[3] = 6; } // fuerza la ruta del zip
    await sinSorpresas(() => abrirBytes(b, { limites }), `azar #${k}`);
  }
});

test('rendimiento: 5 años × 50 hábitos (≈91 000 filas) en zip, leído y parseado', async () => {
  const filas = ['fecha,habito,valor,nota'];
  const inicio = new Date(2021, 10, 3, 12);
  for (let d = 0; d < 5 * 365; d++) {
    const f = new Date(inicio); f.setDate(f.getDate() + d);
    const s = `${f.getFullYear()}-${String(f.getMonth() + 1).padStart(2, '0')}-${String(f.getDate()).padStart(2, '0')}`;
    for (let h = 0; h < 50; h++) filas.push(`${s},Hábito ${h},${(d * h) % 3},${h === 7 ? '"nota, con coma"' : ''}`);
  }
  const zip = await crearZip([{ ruta: 'export/Registros.csv', datos: filas.join('\r\n') }]);
  const t0 = performance.now();
  const c = await abrirBytes(zip);
  const t = comoTabla(parsearCSV(decodificar(c.entradas[0].bytes).texto).filas);
  const ms = performance.now() - t0;
  assert.equal(t.filas.length, 5 * 365 * 50);
  assert.equal(t.filas[7][3], 'nota, con coma');
  // Holgado a propósito: en este servidor tarda bastante menos. En gama baja se mide a mano (lista manual).
  assert.ok(ms < 5000, `tardó ${Math.round(ms)} ms`);
  console.log(`# rendimiento: ${t.filas.length} filas, zip ${zip.length} bytes, ${Math.round(ms)} ms`);
});
