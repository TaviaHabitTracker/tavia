// Prueba de punta a punta de los Módulos 2–4: rachas, rescate con congelador, Progreso, notas y PWA offline.
// Uso: servir la carpeta en http://127.0.0.1:8765 y ejecutar: node tests/e2e-m2m4.cjs [carpeta-capturas]
const { chromium } = require('playwright');
const assert = require('node:assert/strict');

const URL = process.env.TAVIA_URL || 'http://127.0.0.1:8765/';
const CAPT = process.argv[2] || '.';

function fechas(desde, n) {
  const out = [];
  const d = new Date(`${desde}T12:00:00`);
  for (let i = 0; i < n; i++) { out.push(d.toLocaleDateString('sv-SE')); d.setDate(d.getDate() + 1); }
  return out;
}

// Historia: "Leer" diario desde el 1 de octubre, hecho del 1 al 24; el 25 y el 26 olvidados. Hoy: 27.
function datosSemilla() {
  const logs = fechas('2026-10-01', 24).map((f) => ({ habitId: 'leer', fecha: f, estado: 'registrado', valor: 1 }));
  logs.push({ habitId: 'leer', fecha: '2026-10-10', estado: 'registrado', valor: 1, nota: 'Terminé el capítulo 3' });
  for (const f of ['2026-10-06', '2026-10-13', '2026-10-20']) logs.push({ habitId: 'gym', fecha: f, estado: 'registrado', valor: 1 });
  for (const f of fechas('2026-10-01', 26)) if (Number(f.slice(-2)) % 3) logs.push({ habitId: 'agua', fecha: f, estado: 'registrado', valor: 4 });
  return {
    schemaVersion: 1,
    habits: [
      { id: 'leer', nombre: 'Leer', icono: '📖', color: 'ciruela', tipo: 'si_no', vecesPorDia: 1, frecuencia: { tipo: 'diaria' }, bloque: 'noche', identidad: 'lee cada noche', creado: '2026-10-01', pausas: [], orden: 1 },
      { id: 'gym', nombre: 'Gimnasio', icono: '💪', color: 'musgo', tipo: 'si_no', vecesPorDia: 1, frecuencia: { tipo: 'dias_fijos', dias: [1] }, bloque: 'tarde', creado: '2026-10-01', pausas: [], orden: 2 },
      { id: 'agua', nombre: 'Agua', icono: '💧', color: 'lago', tipo: 'si_no', vecesPorDia: 6, frecuencia: { tipo: 'diaria' }, bloque: 'dia', creado: '2026-10-01', pausas: [], orden: 3 },
    ],
    logs,
    config: { finDelDia: '03:00' },
  };
}

async function pagina(b, { oscuro = false, semilla = true } = {}) {
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, locale: 'es-CL', timezoneId: 'America/Santiago', colorScheme: oscuro ? 'dark' : 'light' });
  const p = await ctx.newPage();
  p.errores = [];
  p.on('console', (m) => { if (['error', 'warning'].includes(m.type())) p.errores.push(m.text()); });
  p.on('pageerror', (e) => p.errores.push('PAGEERROR ' + e.message));
  await p.clock.install({ time: new Date('2026-10-27T10:00:00') });
  if (semilla) {
    const datos = JSON.stringify(datosSemilla());
    await p.addInitScript((d) => { if (!sessionStorage.getItem('sembrado')) { sessionStorage.setItem('sembrado', '1'); localStorage.setItem('tavia:data', d); } }, datos);
  }
  await p.goto(URL);
  await p.waitForSelector('h1');
  return p;
}

const fila = (p, nombre) => p.locator('li.tv-habito', { has: p.locator('.tv-habito__nombre', { hasText: nombre }) });

(async () => {
  const b = await chromium.launch();
  let ok = 0;
  const paso = (txt) => { ok++; console.log('✓', txt); };

  let p = await pagina(b);

  /* Rescate: primero anteayer, luego ayer */
  const rescate = p.locator('[data-rescate="leer"]');
  assert.match(await rescate.textContent(), /quedó sin marcar anteayer/);
  assert.match(await rescate.textContent(), /racha de 24 días/);
  await p.screenshot({ path: `${CAPT}/m2-rescate.png` });
  await rescate.getByRole('button', { name: /Usar congelador/ }).click();
  assert.match(await p.locator('[data-rescate="leer"]').textContent(), /quedó sin marcar ayer/);
  await p.locator('[data-rescate="leer"]').getByRole('button', { name: /Usar congelador/ }).click();
  assert.equal(await p.locator('[data-rescate="leer"]').count(), 0);
  assert.match(await fila(p, 'Leer').locator('.tv-habito__meta').textContent(), /racha de 24 días/);
  paso('rescate con congeladores: dos días olvidados y la racha se mantiene');

  /* Detalle: estadísticas y congeladores */
  await fila(p, 'Leer').locator('.tv-habito__abrir').click();
  let d = p.locator('dialog[data-hoja="detalle"]');
  assert.match(await d.locator('.cifras').textContent(), /24 días/);
  assert.match(await d.locator('.congeladores').textContent(), /Congeladores: 1 de 3/);
  assert.match(await d.locator('.cifras').textContent(), /\d+\s%/);
  await p.screenshot({ path: `${CAPT}/m2-detalle.png`, animations: 'disabled', fullPage: true });
  await d.getByRole('button', { name: 'Marcar como hecho' }).click();
  assert.match(await fila(p, 'Leer').locator('.tv-identidad').textContent(), /Soy una persona que lee cada noche\./);
  paso('detalle con puntaje, racha y congeladores; frase de identidad al completar');

  /* Racha sube con hoy hecho */
  await fila(p, 'Leer').locator('.tv-habito__abrir').click();
  d = p.locator('dialog[data-hoja="detalle"]');
  assert.match(await d.locator('.cifras').textContent(), /25 días/);

  /* Nota del día */
  await d.locator('summary', { hasText: 'Nota del día' }).click();
  await d.getByLabel('Nota del día').fill('Con té, sin celular');
  await d.getByRole('button', { name: 'Guardar nota' }).click();
  assert.match(await d.textContent(), /Nota guardada/);
  await p.keyboard.press('Escape');
  paso('nota del día guardada');

  /* Día pasado: no hay "Descanso", sí "No lo hice" */
  await p.getByRole('button', { name: 'Día anterior' }).click();
  await fila(p, 'Gimnasio').waitFor({ state: 'detached' }).catch(() => {});
  await fila(p, 'Agua').locator('.tv-habito__abrir').click();
  d = p.locator('dialog[data-hoja="detalle"]');
  assert.equal(await d.getByRole('button', { name: /Descanso/ }).count(), 0);
  assert.equal(await d.getByRole('button', { name: /No lo hice/ }).count(), 1);
  await p.keyboard.press('Escape');
  await p.getByRole('button', { name: 'Volver a hoy' }).click();
  paso('días pasados: sin descanso; los olvidos se cubren con congelador');

  /* Progreso */
  await p.getByRole('button', { name: 'Progreso' }).click();
  assert.equal(await p.locator('.mapa button.celda').count(), 30);
  assert.match(await p.locator('.cifras').first().textContent(), /Este mes/);
  assert.match(await p.locator('.cifras').first().textContent(), /Mejor racha/);
  assert.equal(await p.locator('.tarjeta-habito').count(), 3);
  assert.equal(await p.locator('.tarjeta-habito').first().locator('.tira__dia').count(), 30);
  assert.match(await p.locator('.nota-item').first().textContent(), /Con té, sin celular/);
  assert.match(await p.locator('.nota-item').nth(1).textContent(), /capítulo 3/);
  await p.screenshot({ path: `${CAPT}/m3-progreso.png`, fullPage: true });
  paso('Progreso: mapa de 30 días, % del mes, mejor racha, tarjetas y notas');

  /* Teclado en el mapa y clic → ver ese día en Hoy */
  await p.locator('.mapa button.celda[tabindex="0"]').focus();
  await p.keyboard.press('ArrowLeft');
  const enfocada = await p.evaluate(() => document.activeElement.dataset.fecha);
  assert.equal(enfocada, '2026-10-26');
  await p.keyboard.press('Enter');
  assert.equal(await p.textContent('h1'), 'Ayer');
  paso('mapa navegable con flechas; Enter abre ese día en Hoy');

  /* Nota abre su día */
  await p.getByRole('button', { name: 'Progreso' }).click();
  await p.locator('.nota-item', { hasText: 'capítulo 3' }).click();
  assert.match(await p.locator('dialog[data-hoja="detalle"] .subtitulo').first().textContent(), /10 de octubre/);
  await p.keyboard.press('Escape');
  paso('tocar una nota abre el hábito en ese día');

  assert.deepEqual(p.errores, []);
  paso('sin errores de consola');

  /* Oscuro */
  const po = await pagina(b, { oscuro: true });
  await po.getByRole('button', { name: 'Progreso' }).click();
  await po.screenshot({ path: `${CAPT}/m3-progreso-oscuro.png`, fullPage: true });
  paso('Progreso en oscuro');

  /* PWA: Service Worker, offline y manifiesto */
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, locale: 'es-CL' });
  const pw = await ctx.newPage();
  const errs = [];
  pw.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
  await pw.goto(URL);
  await pw.evaluate(() => navigator.serviceWorker.ready);
  await pw.reload();
  await pw.waitForFunction(() => Boolean(navigator.serviceWorker.controller));
  const man = await pw.evaluate(async () => (await fetch(document.querySelector('link[rel=manifest]').href)).json());
  assert.equal(man.short_name, 'Tavia');
  await ctx.setOffline(true);
  await pw.reload();
  await pw.waitForSelector('h1');
  assert.equal(await pw.textContent('h1'), 'Hoy');
  await pw.getByRole('button', { name: /Caminar/ }).click();
  await pw.locator('dialog[data-hoja="editor"]').getByRole('button', { name: 'Guardar' }).click();
  await fila(pw, 'Caminar').waitFor();
  assert.ok(await pw.evaluate(() => getComputedStyle(document.querySelector('.titulo-pantalla')).fontFamily.includes('Instrument Sans')));
  await ctx.setOffline(false);
  assert.deepEqual(errs, []);
  paso('PWA: Service Worker activo, funciona sin internet y el manifiesto carga');

  /* Atajo "Nuevo hábito" */
  await pw.goto(`${URL}#nuevo`);
  await pw.locator('dialog[data-hoja="editor"]').waitFor();
  paso('atajo #nuevo abre el editor');

  /* Instalar: sección visible en Ajustes */
  await pw.keyboard.press('Escape');
  await pw.getByRole('button', { name: 'Ajustes' }).click();
  assert.match(await pw.locator('#instalar').textContent(), /Android|iPhone/);
  await pw.screenshot({ path: `${CAPT}/m4-ajustes.png`, fullPage: true });
  paso('instrucciones de instalación en Ajustes');

  await b.close();
  console.log(`\n${ok} pruebas de punta a punta (M2–M4) OK`);
})().catch((e) => { console.error('✗', e.message); process.exit(1); });
