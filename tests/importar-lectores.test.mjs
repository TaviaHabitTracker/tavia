// I1 — Lectores seguros del importador. Ejecutar con: TZ=America/Santiago node --test 'tests/*.test.mjs'
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { ErrorImport, LIMITES_IMPORT, limitesCon } from '../js/importar/errores.js';
import { decodificar, pareceTexto } from '../js/importar/texto.js';
import { comoTabla, detectarDecimal, detectarDelimitador, normalizarClave, parsearCSV, parsearNumero } from '../js/importar/csv.js';
import { parsearJSON } from '../js/importar/json.js';
import { crc32, extraerEntrada, leerZip, listarZip, rutaSegura, soportaZip } from '../js/importar/zip.js';
import { convertirFecha, detectarFormatoFecha, lecturasPosibles } from '../js/importar/fechas.js';
import { abrirBytes, abrirArchivo, abrirCarpeta, detectarTipo } from '../js/importar/leer.js';
import { bytes, crearZip } from './importar-ayudantes.mjs';

const fixture = (n) => new Uint8Array(readFileSync(new URL(`./fixtures/importar/${n}`, import.meta.url)));
const codigo = (c) => (e) => e instanceof ErrorImport && e.codigo === c;

/* ---------- Texto y codificación ---------- */

test('texto: UTF-8 con BOM, sin BOM, Windows-1252 y UTF-16', () => {
  assert.deepEqual(decodificar(bytes('\ufeffcafé')), { texto: 'café', codificacion: 'utf-8', bom: true });
  assert.equal(decodificar(bytes('ñandú 🧘')).codificacion, 'utf-8');
  // "Café;Señal" guardado por Excel en Windows: é = 0xE9, ñ = 0xF1 (no es UTF-8 válido).
  const w = new Uint8Array([0x43, 0x61, 0x66, 0xe9, 0x3b, 0x53, 0x65, 0xf1, 0x61, 0x6c]);
  assert.deepEqual(decodificar(w), { texto: 'Café;Señal', codificacion: 'windows-1252', bom: false });
  const u16 = new Uint8Array([0xff, 0xfe, 0x61, 0x00, 0xe9, 0x00]);
  assert.equal(decodificar(u16).texto, 'aé');
});

test('texto: un binario con nulos se rechaza, no se "decodifica"', () => {
  assert.throws(() => decodificar(new Uint8Array([0x61, 0x00, 0x62])), codigo('texto_binario'));
  assert.equal(pareceTexto(new Uint8Array([0x61, 0x00])), false);
  assert.equal(pareceTexto(bytes('a,b\n1,2\n')), true);
});

/* ---------- CSV ---------- */

test('csv: comillas, comillas escapadas, delimitador y salto de línea dentro de un campo', () => {
  const t = 'nombre,nota\r\n"Café, té","dijo ""hola""\nsegunda línea"\r\nLeer,\r\n';
  const { filas, delimitador } = parsearCSV(t);
  assert.equal(delimitador, ',');
  assert.deepEqual(filas, [['nombre', 'nota'], ['Café, té', 'dijo "hola"\nsegunda línea'], ['Leer', '']]);
});

test('csv: fin de línea LF, CR y sin salto final; líneas vacías ignoradas', () => {
  assert.deepEqual(parsearCSV('a,b\n1,2').filas, [['a', 'b'], ['1', '2']]);
  assert.deepEqual(parsearCSV('a,b\r1,2\r').filas, [['a', 'b'], ['1', '2']]);
  assert.deepEqual(parsearCSV('a,b\n\n\n1,2\n\n').filas, [['a', 'b'], ['1', '2']]);
  assert.deepEqual(parsearCSV('').filas, []);
  assert.deepEqual(parsearCSV('a,b\n""\n').filas, [['a', 'b'], ['']]); // un campo vacío con comillas sí es fila
});

test('csv: detecta punto y coma (Excel en español) y tabulación', () => {
  assert.equal(detectarDelimitador('fecha;hábito;valor\n2026-01-01;Leer;1,5\n2026-01-02;Leer;2\n'), ';');
  assert.equal(detectarDelimitador('a\tb\tc\n1\t2\t3\n'), '\t');
  assert.equal(detectarDelimitador('a,b\n"x;y",2\n'), ',');
  assert.equal(detectarDelimitador('sola columna\nvalor\n'), ',');
});

test('csv: comilla sin cerrar se rechaza; comilla suelta se toma literal con aviso', () => {
  assert.throws(() => parsearCSV('a,b\n"abierta,2\n'), codigo('csv_comilla_abierta'));
  const r = parsearCSV('a,b\n5" pantalla,2\n');
  assert.deepEqual(r.filas[1], ['5" pantalla', '2']);
  assert.deepEqual(r.advertencias, [{ codigo: 'csv_comilla_suelta', n: 1 }]);
});

test('csv: límites de celda, columnas y filas', () => {
  const l = limitesCon({ celda: 5, columnas: 3, filas: 2 });
  assert.throws(() => parsearCSV('a\n123456\n', { limites: l }), codigo('csv_celda_larga'));
  assert.throws(() => parsearCSV('"123456"\n', { limites: l }), codigo('csv_celda_larga'));
  assert.throws(() => parsearCSV('a,b,c,d\n', { limites: l }), codigo('csv_muchas_columnas'));
  assert.throws(() => parsearCSV('a\n1\n2\n3\n', { limites: l }), codigo('csv_muchas_filas'));
  assert.equal(parsearCSV('a\n1\n', { limites: l }).filas.length, 2);
});

test('csv: tabla con columnas faltantes y sobrantes; claves normalizadas', () => {
  const t = comoTabla([['Fecha', ' Hábito ', 'Valor'], ['1', 'x'], ['1', 'x', '2', 'extra'], ['1', 'x', '2', '']]);
  assert.deepEqual(t.claves, ['fecha', 'habito', 'valor']);
  assert.deepEqual(t.filas, [['1', 'x', ''], ['1', 'x', '2'], ['1', 'x', '2']]);
  assert.deepEqual(t.advertencias, [{ codigo: 'csv_columnas_faltantes', n: 1 }, { codigo: 'csv_columnas_sobrantes', n: 1 }]);
  assert.equal(normalizarClave('  ÑANDÚ   Día '), 'nandu dia');
  assert.throws(() => comoTabla([]), codigo('csv_vacio'));
});

test('csv: una celda "__proto__" no contamina nada (las filas son arreglos)', () => {
  const t = comoTabla(parsearCSV('__proto__,constructor\n{"x":1},2\n').filas);
  assert.deepEqual(t.claves, ['__proto__', 'constructor']);
  assert.equal({}.x, undefined);
});

test('números: separador decimal y miles', () => {
  assert.deepEqual(detectarDecimal(['1,5', '2', '3,25']), { separador: ',', ambiguo: false });
  assert.deepEqual(detectarDecimal(['1.5', '10']), { separador: '.', ambiguo: false });
  assert.deepEqual(detectarDecimal(['1.234,5']), { separador: ',', ambiguo: false });
  assert.deepEqual(detectarDecimal(['1,234']), { separador: null, ambiguo: true });
  assert.deepEqual(detectarDecimal(['0,125']), { separador: ',', ambiguo: false });
  assert.deepEqual(detectarDecimal(['3', '4']), { separador: null, ambiguo: false });
  assert.equal(parsearNumero('1,5', ','), 1.5);
  assert.equal(parsearNumero('1.234,5', ','), 1234.5);
  assert.equal(parsearNumero('1,234.5', '.'), 1234.5);
  assert.equal(parsearNumero('-2', ','), -2);
  assert.equal(parsearNumero('1,5', '.'), null);
  assert.equal(parsearNumero('abc', '.'), null);
  assert.equal(parsearNumero('1e400', '.'), null);
  assert.equal(parsearNumero('Infinity', '.'), null);
});

/* ---------- JSON ---------- */

test('json: objetos sin prototipo y claves peligrosas rechazadas en cualquier nivel', () => {
  const v = parsearJSON('{"a":{"b":[{"c":1}]}}');
  assert.equal(Object.getPrototypeOf(v), null);
  assert.equal(Object.getPrototypeOf(v.a.b[0]), null);
  for (const t of ['{"__proto__":{"x":1}}', '{"a":{"constructor":{"prototype":{}}}}', '[{"prototype":1}]']) {
    assert.throws(() => parsearJSON(t), codigo('json_clave_prohibida'), t);
  }
  assert.equal({}.x, undefined);
});

test('json: profundidad, tamaño, BOM e inválido', () => {
  assert.throws(() => parsearJSON('['.repeat(100_000) + ']'.repeat(100_000)), codigo('json_profundo'));
  assert.equal(parsearJSON('{"s":"[[[[[[["}', { limites: limitesCon({ jsonProfundidad: 2 }) }).s, '[[[[[[['); // corchetes dentro de strings no cuentan
  assert.throws(() => parsearJSON('[1,2,3,4]', { limites: limitesCon({ jsonNodos: 3 }) }), codigo('json_grande'));
  assert.deepEqual(parsearJSON('\ufeff[1]'), [1]);
  assert.throws(() => parsearJSON('{x:1}'), codigo('json_invalido'));
  assert.throws(() => parsearJSON('{"a":"\\"}'), codigo('json_invalido'));
});

/* ---------- Zip ---------- */

test('zip: este Node tiene DecompressionStream (si no, las pruebas de zip no valen)', () => {
  assert.equal(soportaZip(), true);
});

test('zip: lee un zip real de Python (stored, deflate, carpetas, UTF-8)', async () => {
  const { entradas, rechazadas } = await leerZip(fixture('normal.zip'));
  assert.equal(rechazadas, 0);
  assert.deepEqual(entradas.map((e) => e.ruta).sort(), ['001 Hábito ñandú/Datos.csv', 'Otro.csv', 'carpeta/Datos.csv']);
  const datos = entradas.find((e) => e.ruta === 'carpeta/Datos.csv');
  assert.match(decodificar(datos.bytes).texto, /Café, «té» y 🧘/);
});

test('zip slip: rutas con .., absolutas o raras se ignoran y se cuentan', async () => {
  const { entradas, rechazadas } = await leerZip(fixture('slip.zip'));
  assert.deepEqual(entradas.map((e) => e.ruta), ['bueno.csv']);
  assert.equal(rechazadas, 3);
  for (const r of ['../a', 'a/../b', '/a', 'C:/a', 'a//b', './a', 'a\u0001b', '']) assert.equal(rutaSegura(r), null, r);
  assert.equal(rutaSegura('carpeta/a b.csv'), 'carpeta/a b.csv');
});

test('zip bomb: relación de compresión exagerada se rechaza sin descomprimir', () => {
  assert.throws(() => listarZip(fixture('bomba.zip')), codigo('zip_bomba'));
});

test('zip bomb: un tamaño declarado que miente se corta al descomprimir', async () => {
  const zip = await crearZip([{ ruta: 'a.csv', datos: '0'.repeat(200_000), tamanoDeclarado: 1000 }]);
  const { entradas } = listarZip(zip);
  await assert.rejects(extraerEntrada(zip, entradas[0]), codigo('zip_bomba'));
});

test('zip: entradas superpuestas, cifradas, método raro, CRC malo, rutas repetidas', async () => {
  const sup = await crearZip([{ ruta: 'a.csv', datos: 'x' }, { ruta: 'b.csv', datos: 'x' }], { superponer: true });
  assert.throws(() => listarZip(sup), codigo('zip_superpuesto'));
  const cifrado = await crearZip([{ ruta: 'a', datos: 'x', flags: 1 }]);
  assert.throws(() => listarZip(cifrado), codigo('zip_cifrado'));
  const raro = await crearZip([{ ruta: 'a', datos: 'x', metodo: 12 }]);
  assert.throws(() => listarZip(raro), codigo('zip_metodo'));
  const crcMalo = await crearZip([{ ruta: 'a', datos: 'hola', crcDeclarado: 1 }]);
  await assert.rejects(leerZip(crcMalo), codigo('zip_corrupto'));
  const rep = await crearZip([{ ruta: 'A.csv', datos: '1' }, { ruta: 'a.csv', datos: '2' }]);
  assert.throws(() => listarZip(rep), codigo('zip_ruta_repetida'));
});

test('zip: límites de entradas y de total descomprimido', async () => {
  const muchas = await crearZip(Array.from({ length: 5 }, (_, i) => ({ ruta: `${i}.csv`, datos: 'x' })));
  assert.throws(() => listarZip(muchas, { limites: limitesCon({ entradas: 4 }) }), codigo('zip_muchas_entradas'));
  const grande = await crearZip([{ ruta: 'a', datos: 'x'.repeat(600) }, { ruta: 'b', datos: 'y'.repeat(600) }]);
  assert.throws(() => listarZip(grande, { limites: limitesCon({ descomprimido: 1000 }) }), codigo('zip_grande'));
  assert.throws(() => listarZip(grande, { limites: limitesCon({ entrada: 500 }) }), codigo('zip_entrada_grande'));
});

test('zip: truncado, vacío, offset fuera del archivo, ZIP64', async () => {
  const z = fixture('normal.zip');
  assert.throws(() => listarZip(z.subarray(0, z.length - 10)), codigo('zip_corrupto'));
  assert.throws(() => listarZip(z.subarray(0, 100)), codigo('zip_corrupto'));
  assert.deepEqual(listarZip(fixture('vacio.zip')).entradas, []);
  await assert.rejects(abrirBytes(fixture('vacio.zip')), codigo('zip_vacio'));
  const fuera = await crearZip([{ ruta: 'a', datos: 'x', offsetForzado: 99999 }]);
  assert.throws(() => listarZip(fuera), codigo('zip_corrupto'));
  const z64 = await crearZip([{ ruta: 'a', datos: 'x' }], { totalDeclarado: 0xffff });
  assert.throws(() => listarZip(z64), codigo('zip64'));
});

test('zip: cancelar a la mitad', async () => {
  const ctl = new AbortController();
  ctl.abort();
  await assert.rejects(leerZip(fixture('normal.zip'), { senal: ctl.signal }), codigo('cancelado'));
});

test('crc32 conocido', () => {
  assert.equal(crc32(bytes('123456789')), 0xcbf43926);
});

/* ---------- Fechas ---------- */

test('fechas: detecta AAAA-MM-DD, DD/MM, MM/DD y marcas de tiempo', () => {
  assert.equal(detectarFormatoFecha(['2026-01-05', '2026-02-28']).formato, 'iso');
  assert.equal(detectarFormatoFecha(['03/04/2025', '25/04/2025']).formato, 'dmy');
  assert.equal(detectarFormatoFecha(['03/04/2025', '04/25/2025']).formato, 'mdy');
  assert.equal(detectarFormatoFecha(['1767225600', '1767312000']).formato, 'epoch');
  assert.equal(detectarFormatoFecha(['2026-01-05', '05/01/2026']).formato, null); // mezcla: no se adivina
  assert.equal(detectarFormatoFecha(['13/04/2025', '04/13/2025']).formato, null); // DD/MM y MM/DD a la vez
});

test('fechas: ambigua de verdad → se pregunta con un ejemplo', () => {
  const r = detectarFormatoFecha(['05/05/2025', '03/04/2025', '01/02/2025']);
  assert.deepEqual([r.formato, r.ambiguo, r.ejemplo], [null, true, '03/04/2025']);
  assert.deepEqual(lecturasPosibles('03/04/2025'), { dmy: '2025-04-03', mdy: '2025-03-04' });
  // Si día == mes en todas, cualquiera de las dos da lo mismo: no hace falta preguntar.
  assert.equal(detectarFormatoFecha(['05/05/2025', '01/01/2026']).formato, 'dmy');
});

test('fechas: conversión local, fechas imposibles y fuera de rango', () => {
  assert.equal(convertirFecha('2026-02-28', 'iso'), '2026-02-28');
  assert.equal(convertirFecha('2026-02-31', 'iso'), null);
  assert.equal(convertirFecha('31/12/2025', 'dmy'), '2025-12-31');
  assert.equal(convertirFecha('12/31/2025', 'mdy'), '2025-12-31');
  assert.equal(convertirFecha('31/02/2025', 'dmy'), null);
  assert.equal(convertirFecha('1999-05-01', 'iso'), null);
  assert.equal(convertirFecha('', 'iso'), null);
  assert.equal(convertirFecha('2026-01-01T25:00', 'iso'), null);
});

test('fechas: con hora se aplica el fin del día del usuario (sin toISOString)', () => {
  assert.equal(convertirFecha('2026-03-10 23:30', 'iso'), '2026-03-10'); // con UTC se iría al 11
  assert.equal(convertirFecha('2026-03-11 01:30', 'iso', { finDelDia: '03:00' }), '2026-03-10');
  assert.equal(convertirFecha('11/03/2026 01:30', 'dmy', { finDelDia: '03:00' }), '2026-03-10');
  // 2026-03-11T02:00Z = 2026-03-10 23:00 en Chile (UTC-3).
  assert.equal(convertirFecha('2026-03-11T02:00:00Z', 'iso'), '2026-03-10');
  assert.equal(convertirFecha('2026-03-11T02:00:00+0000', 'iso'), '2026-03-10');
  const ms = String(new Date(2026, 2, 10, 23, 30).getTime());
  assert.equal(convertirFecha(ms, 'epoch'), '2026-03-10');
  assert.equal(convertirFecha(String(Math.floor(Number(ms) / 1000)), 'epoch'), '2026-03-10');
});

test('fechas: cambio de horario en Chile (abril y septiembre) no corre el día', () => {
  // En Chile el reloj se mueve a medianoche; operar con fecha local evita días duplicados o perdidos.
  assert.equal(convertirFecha('2026-04-05 00:30', 'iso'), '2026-04-05');
  assert.equal(convertirFecha('2026-09-06 00:30', 'iso'), '2026-09-06');
  assert.equal(convertirFecha('06/09/2026', 'dmy'), '2026-09-06');
});

/* ---------- Leer y detectar ---------- */

test('tipo por contenido, no por extensión', () => {
  assert.equal(detectarTipo(fixture('normal.zip')), 'zip');
  assert.equal(detectarTipo(fixture('vacio.zip')), 'zip');
  assert.equal(detectarTipo(bytes('SQLite format 3\u0000resto')), 'sqlite');
  assert.equal(detectarTipo(bytes('\ufeff  {"a":1}')), 'json');
  assert.equal(detectarTipo(bytes('\n[1]')), 'json');
  assert.equal(detectarTipo(bytes('fecha;valor\n')), 'csv');
  assert.equal(detectarTipo(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0, 0, 1, 2])), 'desconocido'); // PNG
  assert.equal(detectarTipo(new Uint8Array()), 'desconocido');
});

test('abrir: archivo con límites, huella estable y sin nombre guardado', async () => {
  const archivo = new File([fixture('normal.zip')], 'mi-archivo-secreto.zip');
  const a = await abrirArchivo(archivo);
  const b = await abrirArchivo(new File([fixture('normal.zip')], 'otro-nombre.bin'));
  assert.equal(a.tipo, 'zip');
  assert.equal(a.hash, b.hash);
  assert.match(a.hash, /^[0-9a-f]{64}$/);
  assert.ok(!JSON.stringify({ ...a, entradas: a.entradas.map((e) => e.ruta) }).includes('secreto'));
  await assert.rejects(abrirArchivo(new File([], 'x.csv')), codigo('archivo_vacio'));
  await assert.rejects(abrirArchivo(new File(['x'.repeat(20)], 'x'), { limites: limitesCon({ archivo: 10 }) }), codigo('archivo_grande'));
  await assert.rejects(abrirArchivo(new File([new Uint8Array([1, 2, 0, 3])], 'x.csv')), codigo('archivo_desconocido'));
  await assert.rejects(abrirArchivo(null), codigo('archivo_invalido'));
  const sq = await abrirBytes(bytes('SQLite format 3\u0000'));
  assert.deepEqual([sq.tipo, sq.entradas.length], ['sqlite', 0]);
});

test('abrir carpeta: misma huella sin importar el orden; rutas peligrosas fuera', async () => {
  const f = (ruta, txt) => Object.assign(new File([txt], ruta.split('/').pop()), { webkitRelativePath: ruta });
  const uno = await abrirCarpeta([f('exp/a.csv', '1'), f('exp/b/c.csv', '2')]);
  const dos = await abrirCarpeta([f('exp/b/c.csv', '2'), f('exp/a.csv', '1')]);
  assert.equal(uno.hash, dos.hash);
  assert.deepEqual(uno.entradas.map((e) => e.ruta), ['exp/a.csv', 'exp/b/c.csv']);
  const malo = await abrirCarpeta([f('exp/a.csv', '1'), f('../x.csv', '2')]);
  assert.equal(malo.rechazadas, 1);
  await assert.rejects(abrirCarpeta([]), codigo('archivo_vacio'));
});

test('los errores llevan solo un código, nunca contenido del archivo', async () => {
  try {
    parsearCSV('"secreto abierto', { limites: LIMITES_IMPORT });
    assert.fail('debió fallar');
  } catch (e) {
    assert.equal(e.message, 'csv_comilla_abierta');
    assert.ok(!JSON.stringify(e.datos).includes('secreto'));
  }
});

/* ---------- Resumen y cliente (sin worker en Node: usa el hilo principal) ---------- */

test('diagnóstico: estructura sin contenido de celdas', async () => {
  const { diagnosticar } = await import('../js/importar/diagnostico.js');
  const csv = 'fecha;hábito;valor;nota\r\n2026-01-01;Secreto;1,5;mi nota privada\r\n2026-01-02;Leer;2;\r\n';
  const zip = await crearZip([{ ruta: 'exp/Registros.csv', datos: csv }, { ruta: 'exp/info.json', datos: '{"version":3,"habitos":[{"id":1}]}' }]);
  const r = diagnosticar(await abrirBytes(zip));
  const [c, j] = r.archivos;
  assert.deepEqual([c.delimitador, c.filas, c.totalColumnas, c.codificacion], [';', 2, 4, 'utf-8']);
  assert.deepEqual(c.columnas[0].fecha, { formato: 'iso', ambiguo: false, conHora: false });
  assert.equal(c.columnas[2].decimal.separador, ',');
  assert.equal(c.columnas[3].vacias, 1);
  assert.equal(j.forma.tipo, 'objeto');
  assert.deepEqual(j.forma.claves.map((k) => k.nombre), ['version', 'habitos']);
  const texto = JSON.stringify(r);
  assert.ok(!texto.includes('Secreto') && !texto.includes('mi nota privada'), 'no debe incluir celdas');
});

test('diagnóstico: un archivo dañado dentro del zip no tumba a los demás', async () => {
  const { diagnosticar } = await import('../js/importar/diagnostico.js');
  const zip = await crearZip([{ ruta: 'bueno.csv', datos: 'a,b\n1,2\n' }, { ruta: 'malo.csv', datos: 'a\n"abierta\n' }]);
  const r = diagnosticar(await abrirBytes(zip));
  assert.equal(r.archivos[0].filas, 1);
  assert.equal(r.archivos[1].error, 'csv_comilla_abierta');
});

test('cliente: sin Worker lee en el hilo principal y devuelve códigos', async () => {
  const { crearLector } = await import('../js/importar/cliente.js');
  const lector = crearLector({ usarWorker: false });
  const r = await lector.abrir(new File([fixture('normal.zip')], 'x.zip'));
  assert.equal(r.tipo, 'zip');
  assert.equal(r.archivos.length, 3);
  await assert.rejects(lector.abrir(new File([fixture('bomba.zip')], 'x.zip')), (e) => e.codigo === 'zip_bomba');
});
