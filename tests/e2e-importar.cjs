// Importador — prueba de punta a punta de la página «Revisar un archivo» en Chromium.
// Uso: servir la carpeta en http://127.0.0.1:8765 y ejecutar: node tests/e2e-importar.cjs [carpeta-capturas]
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const path = require('node:path');

const URL_APP = process.env.TAVIA_URL || 'http://127.0.0.1:8765/';
const PAGINA = new URL('herramientas/revisar-archivo.html', URL_APP).href;
const CAPT = process.argv[2] || '.';
const fixture = (n) => path.join(__dirname, 'fixtures', 'importar', n);

(async () => {
  const b = await chromium.launch();
  let ok = 0;
  const paso = (txt) => { ok++; console.log('✓', txt); };

  async function abrir({ oscuro = false, ancho = 390 } = {}) {
    const ctx = await b.newContext({ viewport: { width: ancho, height: 844 }, locale: 'es-CL', timezoneId: 'America/Santiago', colorScheme: oscuro ? 'dark' : 'light' });
    const p = await ctx.newPage();
    p.errores = [];
    p.pedidos = [];
    p.on('console', (m) => { if (['error', 'warning'].includes(m.type())) p.errores.push(m.text()); });
    p.on('pageerror', (e) => p.errores.push('PAGEERROR ' + e.message));
    ctx.on('request', (r) => p.pedidos.push(r.url()));
    await p.goto(PAGINA);
    return p;
  }

  let p = await abrir();
  await p.setInputFiles('#archivo', fixture('normal.zip'));
  await p.locator('#estado', { hasText: 'Listo' }).waitFor();
  const texto = await p.locator('#resultado').textContent();
  assert.match(texto, /Zip/);
  assert.match(texto, /carpeta\/Datos\.csv/);
  assert.match(texto, /punto y coma/);
  assert.match(texto, /fecha \(AAAA-MM-DD\)/);
  assert.match(texto, /coma decimal/);
  assert.ok(!texto.includes('Café, «té»'), 'no muestra el contenido de las celdas');
  assert.equal(await p.locator('#caja-progreso').isVisible(), false, 'la barra se oculta al terminar');
  assert.ok(p.pedidos.some((u) => u.endsWith('/js/importar/worker.js')), 'debe leer en el worker');
  assert.ok(p.pedidos.every((u) => u.startsWith(new URL(URL_APP).origin)), 'ningún pedido fuera del sitio');
  assert.deepEqual(p.errores, []);
  await p.screenshot({ path: `${CAPT}/importar-revisar.png`, fullPage: true });
  paso('zip real: estructura, separador, fechas y decimales; en el worker, sin red externa, sin errores de CSP');

  await p.setInputFiles('#archivo', fixture('bomba.zip'));
  await p.locator('#estado', { hasText: 'anormal' }).waitFor();
  assert.equal(await p.locator('#estado.estado--error').count(), 1);
  await p.setInputFiles('#archivo', { name: 'foto.csv', mimeType: 'text/csv', buffer: Buffer.from([0x89, 0x50, 0x4e, 0x47, 0, 0, 1]) });
  await p.locator('#estado', { hasText: 'No reconozco' }).waitFor();
  assert.deepEqual(p.errores, []);
  paso('zip bomba y archivo disfrazado: mensaje amable, sin detalles técnicos');

  await p.setInputFiles('#archivo', { name: 'excel.csv', mimeType: 'text/csv', buffer: Buffer.from([...Buffer.from('Fecha;H'), 0xe1, ...Buffer.from('bito;Valor\r\n03/04/2025;Leer;1\r\n05/06/2025;Leer;2\r\n')]) });
  await p.locator('#estado', { hasText: 'Listo' }).waitFor();
  const t2 = await p.locator('#resultado').textContent();
  assert.match(t2, /windows-1252/);
  assert.match(t2, /Hábito/);
  assert.match(t2, /no se sabe si es DD\/MM o MM\/DD/);
  paso('CSV de Excel en Windows-1252 con fechas ambiguas: lo detecta y no adivina');
  await p.context().close();

  p = await abrir({ oscuro: true, ancho: 1280 });
  const dir = require('node:fs').mkdtempSync(path.join(require('node:os').tmpdir(), 'tavia-carpeta-'));
  require('node:fs').mkdirSync(path.join(dir, 'Habito 1'));
  require('node:fs').writeFileSync(path.join(dir, 'Habits.csv'), 'Nombre,Color\nLeer,1\n');
  require('node:fs').writeFileSync(path.join(dir, 'Habito 1', 'Registros.csv'), 'Fecha,Valor\n2026-01-01,2\n');
  await p.setInputFiles('#carpeta', dir);
  await p.locator('#estado', { hasText: 'Listo' }).waitFor();
  assert.match(await p.locator('#resultado').textContent(), /Carpeta/);
  await p.screenshot({ path: `${CAPT}/importar-revisar-oscuro.png`, fullPage: true });
  assert.deepEqual(p.errores, []);
  paso('PC en tema oscuro: elegir carpeta funciona');
  await p.context().close();

  // Con el Service Worker activo (app instalada), la página sigue siendo la herramienta y funciona sin internet.
  const ctx = await b.newContext({ locale: 'es-CL', timezoneId: 'America/Santiago' });
  const app = await ctx.newPage();
  await app.goto(URL_APP);
  await app.evaluate(() => navigator.serviceWorker.ready);
  await app.reload();
  await ctx.setOffline(true);
  const sinRed = await ctx.newPage();
  await sinRed.goto(PAGINA);
  await sinRed.locator('h1', { hasText: 'Revisar un archivo exportado' }).waitFor();
  await sinRed.setInputFiles('#archivo', fixture('normal.zip'));
  await sinRed.locator('#estado', { hasText: 'Listo' }).waitFor();
  await sinRed.goto(URL_APP + '#hoy');
  await sinRed.locator('#app').waitFor();
  assert.equal(await sinRed.locator('h1', { hasText: 'Revisar un archivo' }).count(), 0, 'la app sigue abriendo la app');
  paso('sin internet con el Service Worker: la herramienta se abre y lee; la app sigue siendo la app');
  await ctx.close();

  await b.close();
  console.log(`\n${ok} pruebas de punta a punta (importador) OK`);
})().catch((e) => { console.error(e); process.exit(1); });
