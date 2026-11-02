// Pruebas de los Módulos 3 y 4: notas, progreso global y lista de precache del Service Worker.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { datosVacios, sanearDatos } from '../js/esquema.js';
import { crearModelo } from '../js/modelo.js';
import { estadoDelDia } from '../js/calculos.js';
import { diaGlobal, nivelCalor, porcentajePeriodo, diaDeHabito } from '../js/estadisticas.js';

const RAIZ = fileURLToPath(new URL('..', import.meta.url));

function modelo(fecha = '2026-10-27') {
  const m = crearModelo(datosVacios(), { reloj: () => new Date(`${fecha}T10:00:00`) });
  return m;
}

test('nota sin registro no cuenta como hecho, ni siquiera en hábitos con máximo', () => {
  const m = modelo();
  const h = m.crearHabito({ nombre: 'Pantalla', tipo: 'cantidad', metaModo: 'max', metaMax: 2 }).habito;
  m.fijarNota(h.id, m.hoy(), 'día pesado');
  assert.equal(m.logDe(h.id, m.hoy()).estado, 'nota');
  assert.equal(estadoDelDia(h, m.logDe(h.id, m.hoy())), 'pendiente');
});

test('la nota sobrevive a marcar, quitar el registro y deshacer; borrarla deja el registro', () => {
  const m = modelo();
  const h = m.crearHabito({ nombre: 'Leer' }).habito;
  const hoy = m.hoy();
  m.fijarNota(h.id, hoy, 'antes de dormir');
  m.tocar(h.id, hoy);
  assert.equal(m.logDe(h.id, hoy).nota, 'antes de dormir');
  assert.equal(estadoDelDia(h, m.logDe(h.id, hoy)), 'hecho');
  m.quitarLog(h.id, hoy);
  assert.deepEqual(m.logDe(h.id, hoy), { habitId: h.id, fecha: hoy, estado: 'nota', valor: null, nota: 'antes de dormir' });
  m.tocar(h.id, hoy);
  m.fijarNota(h.id, hoy, '   ');
  assert.equal(m.logDe(h.id, hoy).nota, undefined);
  assert.equal(estadoDelDia(h, m.logDe(h.id, hoy)), 'hecho');
});

test('lista de notas: de la más nueva a la más antigua', () => {
  const m = modelo();
  const h = m.crearHabito({ nombre: 'A', creado: '2026-10-01' }).habito;
  m.fijarNota(h.id, '2026-10-05', 'uno');
  m.fijarNota(h.id, '2026-10-20', 'dos');
  assert.deepEqual(m.notas().map((n) => n.nota), ['dos', 'uno']);
});

test('saneamiento: una "nota" vacía se descarta; usadoEn solo en congelados', () => {
  const { datos } = sanearDatos({
    schemaVersion: 1,
    habits: [{ id: 'a', nombre: 'A' }],
    logs: [
      { habitId: 'a', fecha: '2026-10-01', estado: 'nota', nota: '' },
      { habitId: 'a', fecha: '2026-10-02', estado: 'congelado', usadoEn: '2026-10-03' },
      { habitId: 'a', fecha: '2026-10-04', estado: 'congelado', usadoEn: '2026-10-01' },
    ],
  }, '2026-10-27');
  assert.equal(datos.logs.length, 2);
  assert.equal(datos.logs[0].usadoEn, '2026-10-03');
  assert.equal(datos.logs[1].usadoEn, undefined); // usado antes del día cubierto: imposible
});

test('mapa de calor: niveles y día sin hábitos', () => {
  assert.equal(nivelCalor({ hechos: 0, total: 0 }), null);
  assert.equal(nivelCalor({ hechos: 0, total: 3 }), 0);
  assert.equal(nivelCalor({ hechos: 1, total: 3 }), 1);
  assert.equal(nivelCalor({ hechos: 2, total: 3 }), 2);
  assert.equal(nivelCalor({ hechos: 3, total: 4 }), 3);
  assert.equal(nivelCalor({ hechos: 4, total: 4 }), 4);
});

test('porcentaje del período: hoy incompleto no cuenta', () => {
  const m = modelo();
  const a = m.crearHabito({ nombre: 'A', creado: '2026-10-25' }).habito;
  const b = m.crearHabito({ nombre: 'B', creado: '2026-10-25' }).habito;
  m.tocar(a.id, '2026-10-25'); m.tocar(b.id, '2026-10-25'); // 2/2
  m.tocar(a.id, '2026-10-26'); // 1/2
  m.tocar(a.id, '2026-10-27'); // hoy 1/2: no cuenta
  const p = porcentajePeriodo(m.habitos(), '2026-10-25', '2026-10-27', m.hoy(), m.logDe);
  assert.equal(p, 3 / 4);
  assert.deepEqual(diaGlobal(m.habitos(), '2026-10-27', m.logDe), { hechos: 1, total: 2 });
  m.tocar(b.id, '2026-10-27'); // hoy completo: ahora sí cuenta
  assert.equal(porcentajePeriodo(m.habitos(), '2026-10-25', '2026-10-27', m.hoy(), m.logDe), 5 / 6);
});

test('mini mapa por hábito: estados de cada día', () => {
  const m = modelo();
  const h = m.crearHabito({ nombre: 'Gym', frecuencia: { tipo: 'dias_fijos', dias: [1] }, creado: '2026-10-13' }).habito; // martes
  m.tocar(h.id, '2026-10-13');
  const e = (d) => diaDeHabito(m.habito(h.id), d, m.hoy(), m.logDe);
  assert.equal(e('2026-10-12'), 'antes');
  assert.equal(e('2026-10-13'), 'hecho');
  assert.equal(e('2026-10-14'), 'no-toca');
  assert.equal(e('2026-10-20'), 'fallo');
  assert.equal(e('2026-10-27'), 'hoy');
  assert.equal(e('2026-10-28'), 'futuro');
});

/* ---------- PWA ---------- */

function archivosDeLaApp() {
  const lista = [];
  const recorrer = (dir) => {
    for (const n of readdirSync(dir)) {
      const ruta = join(dir, n);
      const rel = relative(RAIZ, ruta).split('\\').join('/');
      if (/^(tests|node_modules|\.)/.test(rel) || ['package.json', 'README.md', 'sw.js', 'INSTALAR.md', 'fonts/InstrumentSans-OFL.txt'].includes(rel)) continue;
      if (statSync(ruta).isDirectory()) recorrer(ruta);
      else lista.push(`./${rel}`);
    }
  };
  recorrer(RAIZ);
  return lista.sort();
}

test('el Service Worker precachea exactamente los archivos de la app', () => {
  const sw = readFileSync(join(RAIZ, 'sw.js'), 'utf8');
  const bloque = sw.match(/const ARCHIVOS = \[([\s\S]*?)\];/)[1];
  const precache = [...bloque.matchAll(/'([^']+)'/g)].map((x) => x[1]).filter((x) => x !== './');
  assert.deepEqual([...precache].sort(), archivosDeLaApp());
  assert.match(sw, /const VERSION = 'tavia-[\d.]+'/);
});

test('manifest completo: nombre, íconos 192/512/maskable, colores, standalone, scope', () => {
  const man = JSON.parse(readFileSync(join(RAIZ, 'manifest.json'), 'utf8'));
  assert.equal(man.name, 'Tavia Habit Tracker');
  assert.equal(man.short_name, 'Tavia');
  assert.equal(man.display, 'standalone');
  assert.ok(man.start_url && man.scope && man.background_color && man.theme_color);
  const tam = man.icons.map((i) => `${i.sizes}:${i.purpose}`);
  for (const x of ['192x192:any', '512x512:any', '512x512:maskable']) assert.ok(tam.includes(x), x);
  for (const i of man.icons) statSync(join(RAIZ, i.src));
});
