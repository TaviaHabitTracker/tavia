// Prueba de punta a punta de la Fase 1 de seguridad (informe de auditoría, 2 nov 2026).
// Uso: servir la carpeta en http://127.0.0.1:8765 y ejecutar: node tests/e2e-seguridad.cjs
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const URL_APP = process.env.TAVIA_URL || 'http://127.0.0.1:8765/';

async function semilla(pin) {
  const { crearPin } = await import('../js/cripto.js');
  const p = pin ? await crearPin(pin, 100_000) : {};
  return {
    schemaVersion: 2,
    habits: [
      { id: 'med', nombre: 'Medicamento', icono: '💊', color: 'pino', tipo: 'si_no', vecesPorDia: 1, frecuencia: { tipo: 'diaria' }, bloque: 'manana', creado: '2026-10-01', pausas: [], orden: 1, privado: true },
      { id: 'leer', nombre: 'Leer', icono: '📖', color: 'lago', tipo: 'si_no', vecesPorDia: 1, frecuencia: { tipo: 'diaria' }, bloque: 'noche', creado: '2026-10-01', pausas: [], orden: 2 },
    ],
    logs: [],
    revisiones: [],
    config: { finDelDia: '03:00', ultimoRespaldo: '2026-11-01', ...p },
  };
}

async function abrir(b, datos, { tactil = false } = {}) {
  const ctx = await b.newContext({ viewport: { width: 1200, height: 900 }, locale: 'es-CL', timezoneId: 'America/Santiago', acceptDownloads: true, hasTouch: tactil });
  const p = await ctx.newPage();
  p.errores = [];
  p.on('console', (m) => { if (['error', 'warning'].includes(m.type())) p.errores.push(m.text()); });
  p.on('pageerror', (e) => p.errores.push('PAGEERROR ' + e.message));
  if (datos) await p.addInitScript((d) => { if (!sessionStorage.getItem('s')) { sessionStorage.setItem('s', '1'); localStorage.setItem('tavia:data', d); } }, JSON.stringify(datos));
  await p.goto(URL_APP);
  return p;
}

(async () => {
  const b = await chromium.launch();
  let ok = 0;
  const paso = (txt) => { ok++; console.log('✓', txt); };

  /* 1. CSP y Trusted Types (M-4) */
  let p = await abrir(b, await semilla(null));
  await p.waitForSelector('h1');
  const csp = await p.locator('meta[http-equiv="Content-Security-Policy"]').getAttribute('content');
  assert.match(csp, /default-src 'none'/);
  assert.match(csp, /require-trusted-types-for 'script'/);
  const bloqueado = await p.evaluate(() => { try { document.body.insertAdjacentHTML('beforeend', '<img src=x>'); return false; } catch (e) { return e instanceof TypeError; } });
  assert.equal(bloqueado, true, 'Trusted Types bloquea HTML armado con texto');
  await p.waitForFunction(() => navigator.serviceWorker?.controller || navigator.serviceWorker.ready, null, { timeout: 10000 });
  const sw = await p.evaluate(async () => (await navigator.serviceWorker.ready).active?.scriptURL || '');
  assert.match(sw, /sw\.js$/, 'el Service Worker se registra a pesar de Trusted Types');
  assert.deepEqual(p.errores.filter((e) => !/insertAdjacentHTML|TrustedHTML/.test(e)), []);
  await p.context().close();
  paso('CSP con default-src none y Trusted Types: el HTML armado con texto se bloquea y el Service Worker igual se registra');

  /* 2. Exportar con PIN pide el PIN y el archivo no lleva el hash (M-3, A-3) */
  const conPin = await semilla('2468');
  p = await abrir(b, conPin);
  await p.locator('#pin-bloqueo').fill('2468');
  await p.getByRole('button', { name: 'Desbloquear' }).click();
  await p.waitForSelector('h1.titulo-pantalla', { timeout: 20000 });
  await p.getByRole('button', { name: 'Ajustes' }).click();
  await p.getByRole('button', { name: 'Exportar respaldo' }).click();
  const hoja = p.locator('dialog[data-hoja="pin"]');
  await hoja.waitFor();
  assert.match(await hoja.textContent(), /Escribe tu PIN para exportar/);
  await hoja.locator('input').fill('2468');
  const [descarga] = await Promise.all([
    p.waitForEvent('download', { timeout: 20000 }),
    hoja.getByRole('button', { name: 'Desbloquear' }).click(),
  ]);
  const texto = fs.readFileSync(await descarga.path(), 'utf8');
  const archivo = JSON.parse(texto);
  assert.equal(archivo.datos.config.pinHash, null);
  assert.ok(!texto.includes(conPin.config.pinHash) && !texto.includes(conPin.config.pinSalt));
  assert.equal(archivo.datos.habits.length, 2, 'el respaldo sigue completo');
  await p.context().close();
  paso('exportar con PIN activo pide el PIN, y el respaldo no lleva el hash ni la sal');

  /* 3. Si un archivo de la app no carga, no queda la pantalla en blanco (M-6) */
  const ctx = await b.newContext({ serviceWorkers: 'block' });
  p = await ctx.newPage();
  await p.route('**/js/modelo.js', (r) => r.fulfill({ status: 404, body: '' }));
  await p.goto(URL_APP);
  await p.locator('.fallo').waitFor({ timeout: 15000 });
  assert.match(await p.locator('.fallo').textContent(), /Tavia no pudo abrir.*no se borró nada/s);
  assert.equal(await p.getByRole('button', { name: 'Volver a intentar' }).count(), 1);
  await ctx.close();
  paso('si falta un archivo de la app, aparece un mensaje con «Volver a intentar» y no una pantalla en blanco');

  await b.close();
  console.log(`\n${ok} pruebas de seguridad (Fase 1) OK`);
})().catch((e) => { console.error('✗', e.message); process.exit(1); });
