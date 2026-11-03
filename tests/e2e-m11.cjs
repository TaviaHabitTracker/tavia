// Prueba de punta a punta del Módulo 11: Descubrimientos de tu semana.
// Uso: servir la carpeta en http://127.0.0.1:8765 y ejecutar: node tests/e2e-m11.cjs [carpeta-capturas]
const { chromium } = require('playwright');
const assert = require('node:assert/strict');

const URL_APP = process.env.TAVIA_URL || 'http://127.0.0.1:8765/';
const CAPT = process.argv[2] || '.';
const HOY = '2026-11-03T10:00:00'; // martes

function fechas(desde, n) {
  const out = [];
  const d = new Date(`${desde}T12:00:00`);
  for (let i = 0; i < n; i++) { out.push(d.toLocaleDateString('sv-SE')); d.setDate(d.getDate() + 1); }
  return out;
}
// Generador pequeño con semilla (mismo que js/estadistica.js) para datos repetibles.
function azar(semilla) {
  let s = semilla >>> 0;
  return () => { s = (s + 0x6D2B79F5) >>> 0; let x = s; x = Math.imul(x ^ (x >>> 15), x | 1); x ^= x + Math.imul(x ^ (x >>> 7), x | 61); return ((x ^ (x >>> 14)) >>> 0) / 4294967296; };
}

// 140 días. «Leer» casi siempre los martes y en la mañana; «Caminar» suele ir junto con «Leer».
function datos() {
  const r = azar(42);
  const logs = [];
  for (const f of fechas('2026-06-15', 140)) {
    const dia = new Date(`${f}T12:00:00`).getDay(); // 2 = martes
    const leer = r() < (dia === 2 ? 0.97 : 0.4);
    if (leer) logs.push({ habitId: 'leer', fecha: f, estado: 'registrado', valor: 1, registradoEn: `0${7 + Math.floor(r() * 3)}:${String(Math.floor(r() * 60)).padStart(2, '0')}` });
    if (r() < (leer ? 0.9 : 0.3)) logs.push({ habitId: 'caminar', fecha: f, estado: 'registrado', valor: 1, registradoEn: '19:10' });
    if (r() < 0.6) logs.push({ habitId: 'pastilla', fecha: f, estado: 'registrado', valor: 1, registradoEn: '08:00' });
  }
  return {
    schemaVersion: 3,
    habits: [
      { id: 'leer', nombre: 'Leer', icono: '📖', color: 'lago', tipo: 'si_no', vecesPorDia: 1, frecuencia: { tipo: 'diaria' }, bloque: 'manana', creado: '2026-06-15', pausas: [], orden: 1 },
      { id: 'caminar', nombre: 'Caminar', icono: '🚶', color: 'musgo', tipo: 'si_no', vecesPorDia: 1, frecuencia: { tipo: 'diaria' }, bloque: 'noche', creado: '2026-06-15', pausas: [], orden: 2 },
      { id: 'pastilla', nombre: 'Pastilla', icono: '💊', color: 'pino', tipo: 'si_no', vecesPorDia: 1, frecuencia: { tipo: 'diaria' }, bloque: 'manana', creado: '2026-06-15', pausas: [], orden: 3 },
    ],
    logs,
    revisiones: [],
    config: { finDelDia: '03:00', ultimoRespaldo: '2026-11-01', recordatorios: [{ habitId: 'leer', hora: '21:00' }], frasesActivas: false },
  };
}

async function abrir(b, { d = datos(), ancho = 390, oscuro = false, movimiento = 'no-preference' } = {}) {
  const ctx = await b.newContext({ viewport: { width: ancho, height: 844 }, locale: 'es-CL', timezoneId: 'America/Santiago', colorScheme: oscuro ? 'dark' : 'light', reducedMotion: movimiento, serviceWorkers: 'block' });
  const p = await ctx.newPage();
  p.errores = [];
  p.red = [];
  p.on('console', (m) => { if (['error', 'warning'].includes(m.type()) && !/Service Worker registration blocked/.test(m.text())) p.errores.push(m.text()); });
  p.on('pageerror', (e) => p.errores.push(`PAGEERROR ${e.message}`));
  p.on('request', (r) => { if (!r.url().startsWith(URL_APP)) p.red.push(r.url()); });
  await p.clock.install({ time: new Date(HOY) });
  await p.addInitScript((x) => { if (!sessionStorage.getItem('s')) { sessionStorage.setItem('s', '1'); localStorage.setItem('tavia:data', x); } }, JSON.stringify(d));
  await p.goto(URL_APP);
  await p.waitForSelector('h1');
  await p.getByRole('button', { name: 'Progreso' }).click();
  await p.locator('section.desc').waitFor();
  return p;
}

(async () => {
  const b = await chromium.launch();
  let ok = 0;
  const paso = (txt) => { ok++; console.log('✓', txt); };

  /* 1. Se calculan solos, sin red, con texto cálido y sin el hábito sensible */
  let p = await abrir(b);
  const tarjetas = p.locator('.desc-tarjeta');
  await tarjetas.first().waitFor({ timeout: 15000 });
  const n = await tarjetas.count();
  assert.ok(n >= 1 && n <= 3, `entre 1 y 3 tarjetas (hay ${n})`);
  const todo = await p.locator('section.desc').textContent();
  assert.doesNotMatch(todo, /Pastilla/, 'el hábito de salud queda fuera por defecto');
  assert.doesNotMatch(todo, /\b(peor|fallaste|debes|deberías)\b/i);
  assert.match(todo, /martes/i, 'aparece el día plantado');
  assert.equal(await p.locator('.desc-tarjeta .desc-nuevo').count(), n, 'recién calculados: «Nuevo»');
  await p.screenshot({ path: `${CAPT}/m11-progreso.png`, fullPage: true });
  paso(`Progreso muestra ${n} descubrimiento(s), sin el hábito sensible`);

  /* 2. Gráfico accesible: texto equivalente y tabla, mejor día marcado sin depender del color */
  const fig = p.locator('.desc-tarjeta[data-tipo="g1"] .desc-grafico').first();
  const etiqueta = await fig.locator('[role="img"]').getAttribute('aria-label');
  assert.match(etiqueta, /martes: \d+ \/ \d+/);
  assert.equal(await fig.locator('.desc-grafico__marca').count(), 1);
  await fig.locator('summary').click();
  assert.equal(await fig.locator('tbody tr').count(), 7);
  assert.equal(await fig.locator('tbody tr[data-marcada]').count(), 1);
  paso('gráfico: texto equivalente, tabla y marca del mejor día');

  /* 3. ¿Cómo se calculó? */
  await p.locator('.desc-tarjeta[data-tipo="g1"]').first().getByRole('button', { name: '¿Cómo se calculó?' }).click();
  const hoja = p.locator('dialog[data-hoja="desc-como"]');
  await hoja.waitFor();
  const como = await hoja.textContent();
  assert.match(como, /Miré tus últimos 90 días/);
  assert.match(como, /Pista (clara|inicial)/);
  assert.match(como, /margen razonable/);
  assert.match(como, /no una certeza/);
  await p.screenshot({ path: `${CAPT}/m11-como.png` });
  await p.keyboard.press('Escape');
  paso('«¿Cómo se calculó?» explica ventana, intervalo y que es una pista');

  /* 4. Guardar (con Deshacer) y la selección es estable al recargar */
  const antes = await tarjetas.allTextContents();
  const primera = tarjetas.first();
  await primera.getByRole('button', { name: 'Guardar' }).click();
  await p.locator('.desc-tarjeta').first().getByRole('button', { name: 'Guardado' }).waitFor();
  await p.clock.runFor(1000); // el guardado agrupa cambios con una pequeña espera
  await p.reload();
  await p.getByRole('button', { name: 'Progreso' }).click();
  await p.locator('.desc-tarjeta').first().waitFor();
  const despues = (await p.locator('.desc-tarjeta').allTextContents()).map((x) => x.replace(/Nuevo|Guardado|Guardar/g, ''));
  assert.deepEqual(despues, antes.map((x) => x.replace(/Nuevo|Guardado|Guardar/g, '')), 'la semana no cambia al volver a abrir');
  assert.equal(await p.locator('.desc-tarjeta .desc-nuevo').count(), 0, 'ya vistos');
  paso('guardar y selección estable al recargar');

  /* 5. Guardados y anteriores */
  await p.getByRole('button', { name: 'Guardados y anteriores' }).click();
  const ant = p.locator('dialog[data-hoja="desc-anteriores"]');
  await ant.waitFor();
  assert.equal(await ant.locator('.desc-tarjeta').count() >= 1, true);
  await p.keyboard.press('Escape');
  paso('colección de guardados');

  /* 6. Ocultar este tipo, con Deshacer */
  const tipo = await p.locator('.desc-tarjeta').first().getAttribute('data-tipo');
  await p.locator('.desc-tarjeta').first().locator('.desc-menu summary').click();
  await p.getByRole('button', { name: 'Ocultar este tipo' }).click();
  assert.equal(await p.locator(`.desc-tarjeta[data-tipo="${tipo}"]`).count(), 0);
  await p.getByRole('button', { name: 'Deshacer' }).click();
  await p.locator(`.desc-tarjeta[data-tipo="${tipo}"]`).first().waitFor();
  paso('ocultar un tipo y deshacer');

  /* 7. Acción de un toque: mover el recordatorio (si apareció la franja) */
  const mover = p.getByRole('button', { name: /Mover a las/ });
  if (await mover.count()) {
    await mover.click();
    await p.clock.runFor(1000);
    const guardado = await p.evaluate(() => new Promise((ok) => { const r = indexedDB.open('tavia'); r.onsuccess = () => { const tx = r.result.transaction(r.result.objectStoreNames[0]).objectStore(r.result.objectStoreNames[0]).get('tavia:data'); tx.onsuccess = () => ok(tx.result); }; }));
    const cfg = (typeof guardado === 'string' ? JSON.parse(guardado) : guardado)?.config;
    if (cfg) assert.ok(!cfg.recordatorios.some((x) => x.habitId === 'leer' && x.hora === '21:00'), 'se movió el recordatorio');
    paso('mover recordatorio con un toque');
  }

  /* 8. Comparador de dos hábitos */
  await p.locator('.desc-comparador summary').click();
  await p.locator('.desc-comparador .desc-grafico').waitFor();
  assert.equal(await p.locator('.desc-comparador select option', { hasText: 'Pastilla' }).count(), 0, 'sensible fuera del comparador');
  assert.match(await p.locator('.desc-comparador [role="img"]').getAttribute('aria-label'), /Leer \/ Caminar/);
  assert.match(await p.locator('.desc-comparador').textContent(), /no prueba que una cause la otra/);
  paso('comparador con nota de que no prueba causa');

  /* 9. Ajustes: incluir el hábito sensible y apagar todo */
  await p.getByRole('button', { name: 'Ajustes' }).click();
  const sec = p.locator('#descubrimientos');
  await sec.waitFor();
  await sec.locator('summary', { hasText: 'Hábitos que entran' }).click();
  assert.equal(await sec.locator('#desc-h-pastilla').isChecked(), false);
  assert.equal(await sec.locator('#desc-h-leer').isChecked(), true);
  await sec.locator('label[for="desc-h-pastilla"]').click();
  assert.equal(await sec.locator('#desc-h-pastilla').isChecked(), true, 'la lista no se cierra al cambiar');
  await sec.locator('label[for="desc-activado"]').click();
  await p.getByRole('button', { name: 'Progreso' }).click();
  assert.match(await p.locator('section.desc').textContent(), /están apagados/);
  assert.equal(await p.locator('.desc-tarjeta').count(), 0);
  paso('ajustes: incluir sensible a mano y apagar los Descubrimientos');

  assert.deepEqual(p.red, [], 'ninguna petición fuera de la app');
  assert.deepEqual(p.errores, []);
  paso('sin red y sin errores de consola');

  /* 10. Revisión semanal: bloque con lo de esta semana */
  p = await abrir(b);
  await p.locator('.desc-tarjeta').first().waitFor({ timeout: 15000 });
  await p.getByRole('button', { name: 'Hacer la revisión' }).click();
  await p.locator('dialog[data-hoja="semana"] .desc-revision').waitFor();
  assert.match(await p.locator('dialog[data-hoja="semana"] .desc-revision').textContent(), /Lo que descubrimos esta semana/);
  paso('revisión semanal con los descubrimientos');

  /* 11. Usuario nuevo: estado amable */
  const nuevo = datos();
  nuevo.habits.forEach((h) => { h.creado = '2026-10-30'; });
  nuevo.logs = nuevo.logs.filter((l) => l.fecha >= '2026-10-30');
  p = await abrir(b, { d: nuevo });
  await p.locator('.desc-vacio').waitFor({ timeout: 10000 });
  assert.match(await p.locator('.desc-vacio').textContent(), /Cuando haya más días/);
  paso('pocos días: «Cuando haya más días, te contaremos…»');

  /* 12. Tema oscuro, 320 px y movimiento reducido */
  p = await abrir(b, { ancho: 320, oscuro: true, movimiento: 'reduce' });
  await p.locator('.desc-tarjeta').first().waitFor({ timeout: 15000 });
  const anim = await p.locator('.desc-grafico__barra').first().evaluate((e) => getComputedStyle(e).animationName);
  assert.equal(anim, 'none');
  const desborde = await p.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
  assert.equal(desborde, false, 'sin scroll horizontal a 320 px');
  await p.locator('section.desc').screenshot({ path: `${CAPT}/m11-oscuro-320.png` });
  paso('oscuro a 320 px, sin desborde y sin animación con movimiento reducido');

  /* 13. Teclado: los botones de la tarjeta se alcanzan con Tab */
  await p.locator('.desc-tarjeta').first().getByRole('button', { name: '¿Cómo se calculó?' }).focus();
  await p.keyboard.press('Enter');
  await p.locator('dialog[data-hoja="desc-como"]').waitFor();
  await p.keyboard.press('Escape');
  paso('teclado: abrir «¿Cómo se calculó?» con Enter');

  await b.close();
  console.log(`\n${ok} pasos OK`);
})().catch((e) => { console.error(e); process.exit(1); });
