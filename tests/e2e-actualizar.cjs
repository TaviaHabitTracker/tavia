// Prueba de punta a punta de «Buscar actualización» (0.15.2): con la app al día dice «al día»;
// al publicarse una versión nueva, la encuentra, muestra el aviso y «Actualizar» la activa.
// Uso: node tests/e2e-actualizar.cjs  (copia la carpeta a un directorio temporal y la sirve en :8790)
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const { execFileSync, spawn } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

(async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tavia-act-'));
  execFileSync('cp', ['-r', '.', dir]);
  const srv = spawn('python3', ['-m', 'http.server', '8790'], { cwd: dir, stdio: 'ignore' });
  await new Promise((r) => setTimeout(r, 800));
  const b = await chromium.launch();
  const errores = [];
  try {
    const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, locale: 'es-CL' });
    const p = await ctx.newPage();
    p.on('pageerror', (e) => errores.push(e.message));
    await p.goto('http://127.0.0.1:8790/#ajustes');
    await p.waitForFunction(() => navigator.serviceWorker.controller !== null || navigator.serviceWorker.ready.then(() => true));
    await p.reload(); // ahora la controla el Service Worker
    await p.waitForFunction(() => Boolean(navigator.serviceWorker.controller));
    await p.locator('[data-foco="buscar-version"]').click();
    await p.waitForFunction(() => /más reciente/.test(document.querySelector('.version-pie [aria-live]')?.textContent || ''));
    console.log('✓ sin versión nueva: «Tienes la versión más reciente»');

    // Se publica una versión nueva.
    const sw = path.join(dir, 'sw.js');
    fs.writeFileSync(sw, fs.readFileSync(sw, 'utf8').replace(/const VERSION = '[^']+'/, "const VERSION = 'tavia-9.9.9'"));
    await p.locator('[data-foco="buscar-version"]').click();
    await p.waitForFunction(() => /versión nueva/.test(document.querySelector('.version-pie [aria-live]')?.textContent || ''), null, { timeout: 30000 });
    const aviso = p.locator('.avisos', { hasText: 'Hay una versión nueva' }).first();
    await aviso.waitFor();
    console.log('✓ versión nueva: la encuentra y muestra el aviso');
    await Promise.all([p.waitForEvent('load'), aviso.getByRole('button', { name: 'Actualizar' }).click()]);
    const cache = await p.evaluate(() => caches.keys());
    assert.ok(cache.includes('tavia-9.9.9'), `cachés: ${cache}`);
    console.log('✓ «Actualizar» activa la versión nueva y recarga');
    assert.deepEqual(errores, []);
    console.log('\n3 pruebas de punta a punta (actualizar) OK');
  } finally {
    await b.close();
    srv.kill();
    fs.rmSync(dir, { recursive: true, force: true });
  }
})().catch((e) => { console.error(e); process.exit(1); });
