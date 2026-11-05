// Prueba de punta a punta de los temas Pro en prueba (0.14): Kanso, Calibre, Observatorio y Gaceta.
// Revisa que cada tema se aplique (letra, colores, brote y mapa), que se elija en Ajustes y que no haya errores.
// Uso: servir la carpeta en http://127.0.0.1:8765 y ejecutar: node tests/e2e-temas-pro.cjs [carpeta-capturas]
const { chromium } = require('playwright');
const assert = require('node:assert/strict');

const URL_APP = process.env.TAVIA_URL || 'http://127.0.0.1:8765/';
const CAPT = process.argv[2] || '.';
const ESTILOS = ['kanso', 'calibre', 'observatorio', 'gaceta'];

function fechas(desde, hasta) {
  const out = [];
  const d = new Date(`${desde}T12:00:00`);
  while (d.toLocaleDateString('sv-SE') <= hasta) { out.push(d.toLocaleDateString('sv-SE')); d.setDate(d.getDate() + 1); }
  return out;
}

// Cuatro hábitos diarios durante octubre, con dos días en pausa (el 10 y el 18) y días parciales.
function semilla(estilo) {
  const ids = ['agua', 'leer', 'med', 'cam'];
  const logs = [];
  fechas('2026-10-05', '2026-11-02').forEach((f, i) => {
    if (f === '2026-10-10' || f === '2026-10-18') return;
    const cuantos = [4, 4, 3, 4, 2, 4, 1, 4, 3][i % 9];
    for (const id of ids.slice(0, cuantos)) logs.push({ habitId: id, fecha: f, estado: 'registrado', valor: 1, registradoEn: '08:00' });
  });
  for (const id of ['agua', 'leer']) logs.push({ habitId: id, fecha: '2026-11-03', estado: 'registrado', valor: 1, registradoEn: '08:00' });
  const h = (id, nombre, icono, color, bloque, orden) => ({ id, nombre, icono, color, tipo: 'si_no', vecesPorDia: 1, frecuencia: { tipo: 'diaria' }, bloque, creado: '2026-10-05', pausas: [], orden });
  return {
    schemaVersion: 2,
    habits: [h('agua', 'Tomar agua', '💧', 'lago', 'manana', 1), h('leer', 'Leer', '📖', 'ciruela', 'noche', 2), h('med', 'Meditar', '🧘', 'pino', 'manana', 3), h('cam', 'Caminar', '🚶', 'musgo', 'dia', 4)],
    logs, revisiones: [], config: { finDelDia: '03:00', ultimoRespaldo: '2026-11-01', estilo, manifiestoModo: 'no', frasesActivas: false },
  };
}

(async () => {
  const b = await chromium.launch();
  let ok = 0;
  const paso = (txt) => { ok++; console.log('✓', txt); };
  const errores = [];
  for (const esquema of ['light', 'dark']) {
    for (const estilo of ESTILOS) {
      const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, locale: 'es-CL', timezoneId: 'America/Santiago', colorScheme: esquema, reducedMotion: 'reduce' });
      const p = await ctx.newPage();
      p.on('console', (m) => { if (['error', 'warning'].includes(m.type())) errores.push(`${estilo}/${esquema}: ${m.text()}`); });
      p.on('pageerror', (e) => errores.push('PAGEERROR ' + e.message));
      await p.clock.install({ time: new Date('2026-11-03T10:00:00') });
      await p.addInitScript((d) => { if (!sessionStorage.getItem('s')) { sessionStorage.setItem('s', '1'); localStorage.setItem('tavia:data', d); } }, JSON.stringify(semilla(estilo)));
      await p.goto(URL_APP + '#hoy');
      await p.waitForSelector('.panel-dia__brote');
      await p.evaluate(() => document.fonts.ready);
      assert.equal(await p.evaluate(() => document.documentElement.dataset.estilo), estilo);
      const fuente = await p.evaluate(() => getComputedStyle(document.querySelector('.titulo-pantalla')).fontFamily);
      assert.ok(!/^"?Instrument Sans/.test(fuente), `${estilo}: el título usa otra letra (${fuente})`);
      if (estilo === 'calibre') assert.equal(await p.evaluate(() => getComputedStyle(document.querySelector('.brote__marcas')).display), 'inline');
      if (estilo === 'gaceta') assert.equal(await p.evaluate(() => getComputedStyle(document.querySelector('.brote__doble')).display), 'inline');
      await p.screenshot({ path: `${CAPT}/pro-${estilo}-${esquema}-hoy.png` });
      await p.goto(URL_APP + '#progreso');
      await p.waitForSelector('.mapa .celda');
      await p.evaluate(() => document.fonts.ready);
      const mapa = p.locator('.mapa').first();
      await mapa.scrollIntoViewIfNeeded();
      await p.screenshot({ path: `${CAPT}/pro-${estilo}-${esquema}-progreso.png` });
      paso(`${estilo} en ${esquema === 'light' ? 'claro' : 'oscuro'}: letra, brote y mapa`);
      await ctx.close();
    }
  }

  // Elegir un tema en Ajustes lo aplica al instante y se recuerda al volver a abrir.
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, locale: 'es-CL', timezoneId: 'America/Santiago' });
  const p = await ctx.newPage();
  await p.addInitScript((d) => { if (!sessionStorage.getItem('s')) { sessionStorage.setItem('s', '1'); localStorage.setItem('tavia:data', d); } }, JSON.stringify(semilla('analista')));
  await p.goto(URL_APP + '#ajustes');
  await p.waitForSelector('input[name="estilo"]');
  assert.equal(await p.evaluate(() => document.documentElement.dataset.estilo), undefined);
  await p.locator('input[name="estilo"][value="observatorio"]').check();
  await p.waitForFunction(() => document.documentElement.dataset.estilo === 'observatorio');
  await new Promise((r) => setTimeout(r, 1200)); // el guardado agrupa cambios con una pequeña espera
  await p.reload();
  await p.waitForSelector('input[name="estilo"]');
  assert.equal(await p.evaluate(() => document.documentElement.dataset.estilo), 'observatorio');
  await p.locator('input[name="estilo"][value="analista"]').check();
  await p.waitForFunction(() => !document.documentElement.dataset.estilo);
  paso('Ajustes: elegir tema Pro, se recuerda, y volver a Analista');
  await ctx.close();

  assert.deepEqual(errores, []);
  paso('sin errores de consola');
  await b.close();
  console.log(`\n${ok} pruebas de punta a punta (temas Pro) OK`);
})().catch((e) => { console.error(e); process.exit(1); });
