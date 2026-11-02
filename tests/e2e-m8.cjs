// Prueba de punta a punta del Módulo 8: IndexedDB (mudanza, pestañas, respaldo a localStorage),
// tu año (tarjeta PNG), paletas exclusivas y manifiesto.
// Uso: servir la carpeta en http://127.0.0.1:8765 y ejecutar: node tests/e2e-m8.cjs [carpeta-capturas]
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const URL_APP = process.env.TAVIA_URL || 'http://127.0.0.1:8765/';
const CAPT = process.argv[2] || '.';

function fechas(desde, hasta) {
  const out = [];
  const d = new Date(`${desde}T12:00:00`);
  while (d.toLocaleDateString('sv-SE') <= hasta) { out.push(d.toLocaleDateString('sv-SE')); d.setDate(d.getDate() + 1); }
  return out;
}

/** n días registrados (desde el 1 de octubre), con un hábito privado. */
function semilla(n = 40) {
  const dias = fechas('2026-01-05', '2026-10-26').slice(-n);
  const logs = [];
  dias.forEach((f, i) => {
    logs.push({ habitId: 'med', fecha: f, estado: 'registrado', valor: 1, registradoEn: '07:20' });
    if (i % 2) logs.push({ habitId: 'leer', fecha: f, estado: 'registrado', valor: 1, registradoEn: '22:00' });
    logs.push({ habitId: 'diario', fecha: f, estado: 'registrado', valor: 1, registradoEn: '23:00' });
  });
  return {
    schemaVersion: 2,
    habits: [
      { id: 'med', nombre: 'Meditar', icono: '🧘', color: 'ciruela', tipo: 'si_no', vecesPorDia: 1, frecuencia: { tipo: 'diaria' }, bloque: 'manana', creado: dias[0], pausas: [], orden: 1, identidad: 'cuida su mente' },
      { id: 'leer', nombre: 'Leer', icono: '📖', color: 'lago', tipo: 'si_no', vecesPorDia: 1, frecuencia: { tipo: 'diaria' }, bloque: 'noche', creado: dias[0], pausas: [], orden: 2, identidad: 'lee cada noche' },
      { id: 'diario', nombre: 'Diario secreto', icono: '🔒', color: 'pino', tipo: 'si_no', vecesPorDia: 1, frecuencia: { tipo: 'diaria' }, bloque: 'noche', creado: dias[0], pausas: [], orden: 3, privado: true },
    ],
    logs,
    revisiones: [],
    config: { finDelDia: '03:00', ultimoRespaldo: '2026-10-25' },
  };
}

async function contexto(b, { oscuro = false } = {}) {
  return b.newContext({ viewport: { width: 390, height: 844 }, locale: 'es-CL', timezoneId: 'America/Santiago', colorScheme: oscuro ? 'dark' : 'light', acceptDownloads: true });
}
async function pagina(ctx, { hora = '2026-10-27T10:00:00', datos = semilla(), init = null } = {}) {
  const p = await ctx.newPage();
  p.errores = [];
  p.on('console', (m) => { if (['error', 'warning'].includes(m.type())) p.errores.push(m.text()); });
  p.on('pageerror', (e) => p.errores.push('PAGEERROR ' + e.message));
  await p.clock.install({ time: new Date(hora) });
  if (init) await p.addInitScript(init);
  if (datos) await p.addInitScript((d) => { if (!sessionStorage.getItem('s')) { sessionStorage.setItem('s', '1'); localStorage.setItem('tavia:data', d); } }, JSON.stringify(datos));
  await p.goto(URL_APP);
  await p.waitForSelector('h1');
  return p;
}
const leerGuardado = (p) => p.evaluate(() => new Promise((ok, mal) => {
  const r = indexedDB.open('tavia');
  r.onerror = () => mal(r.error);
  r.onsuccess = () => {
    const g = r.result.transaction('kv').objectStore('kv').get('tavia:data');
    g.onsuccess = () => { r.result.close(); ok(g.result ? JSON.parse(g.result) : null); };
    g.onerror = () => mal(g.error);
  };
}));
const esperar = (ms) => new Promise((r) => setTimeout(r, ms));
/** Guarda (la espera de 250 ms corre con el reloj falso; la escritura en IndexedDB, en tiempo real). */
async function guardar(p) { await p.clock.runFor(400); await esperar(150); }
const fila = (p, n) => p.locator('li.tv-habito', { has: p.locator('.tv-habito__nombre', { hasText: n }) });

(async () => {
  const b = await chromium.launch();
  let ok = 0;
  const paso = (txt) => { ok++; console.log('✓', txt); };

  /* 1. Mudanza de localStorage a IndexedDB */
  let ctx = await contexto(b);
  let p = await pagina(ctx);
  assert.equal(await fila(p, 'Meditar').count(), 1);
  const ls = await p.evaluate(() => [localStorage.getItem('tavia:data'), localStorage.getItem('tavia:motor')]);
  assert.deepEqual(ls, [null, 'idb']);
  assert.equal((await leerGuardado(p)).habits.length, 3);
  await fila(p, 'Meditar').locator('.tv-check').click();
  await guardar(p);
  await p.reload(); await p.waitForSelector('h1');
  assert.equal(await fila(p, 'Meditar').locator('.tv-check').getAttribute('data-estado'), 'hecho');
  await p.getByRole('button', { name: 'Ajustes' }).click();
  await p.locator('.seccion', { hasText: 'Tus datos' }).getByText(/IndexedDB/).waitFor();
  paso('los datos se mudan de localStorage a IndexedDB, se borra la copia vieja y sobreviven a recargar');

  /* 2. Dos pestañas: lo que marcas en una aparece en la otra */
  await p.getByRole('button', { name: 'Hoy' }).click();
  const p2 = await ctx.newPage();
  await p2.clock.install({ time: new Date('2026-10-27T10:00:00') });
  await p2.goto(URL_APP); await p2.waitForSelector('h1');
  assert.notEqual(await fila(p2, 'Leer').locator('.tv-check').getAttribute('data-estado'), 'hecho');
  await fila(p, 'Leer').locator('.tv-check').click();
  await guardar(p);
  await p2.waitForFunction(() => document.querySelector('li.tv-habito:has(.tv-habito__nombre) .tv-check') && [...document.querySelectorAll('li.tv-habito')].some((li) => li.textContent.includes('Leer') && li.querySelector('.tv-check').dataset.estado === 'hecho'), null, { timeout: 5000 });
  paso('dos pestañas abiertas se mantienen al día (BroadcastChannel)');
  await ctx.close();

  /* 3. Sin IndexedDB: sigue con localStorage */
  ctx = await contexto(b);
  p = await pagina(ctx, { init: () => Object.defineProperty(window, 'indexedDB', { get: () => undefined }) });
  assert.equal(await p.locator('.tv-aviso').count(), 0);
  await fila(p, 'Meditar').locator('.tv-check').click();
  await guardar(p);
  assert.ok((await p.evaluate(() => localStorage.getItem('tavia:data'))).includes('"habitId":"med"'));
  await p.getByRole('button', { name: 'Ajustes' }).click();
  await p.getByText(/localStorage/).waitFor();
  paso('si el navegador no tiene IndexedDB, guarda en localStorage como antes');
  await ctx.close();

  /* 4. Paletas: se ganan con días registrados; aviso al ganar una */
  ctx = await contexto(b);
  p = await pagina(ctx, { datos: semilla(6) });
  await p.getByRole('button', { name: 'Ajustes' }).click();
  const arena = p.locator('label.paleta-opcion', { hasText: 'Cobre' });
  assert.equal(await arena.locator('input').isDisabled(), true);
  assert.match(await arena.textContent(), /te falta 1/);
  await p.getByRole('button', { name: 'Hoy' }).click();
  await fila(p, 'Meditar').locator('.tv-check').click();
  await p.locator('.tv-deshacer', { hasText: 'Ganaste el color Cobre' }).waitFor();
  await p.getByRole('button', { name: 'Ajustes' }).click();
  assert.equal(await arena.locator('input').isDisabled(), false);
  assert.match(await p.locator('label.paleta-opcion', { hasText: 'Salvia' }).textContent(), /te faltan 23/);
  await arena.click();
  assert.equal(await p.evaluate(() => document.documentElement.dataset.paleta), 'cobre');
  assert.equal(await p.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--acento').trim()), '#B95A31');
  await guardar(p);
  await p.reload(); await p.waitForSelector('h1');
  assert.equal(await p.evaluate(() => document.documentElement.dataset.paleta), 'cobre');
  await p.getByRole('button', { name: 'Hoy' }).click();
  // Si se deshace el registro que la ganó, el color vuelve a ámbar (pero la elección queda guardada).
  await fila(p, 'Meditar').locator('.tv-check').click();
  assert.equal(await p.evaluate(() => document.documentElement.dataset.paleta), undefined);
  paso('paletas: bloqueadas con "te falta", aviso sobrio al ganarla, se aplica y se recuerda');
  await ctx.close();

  /* 5. Tu año: tarjeta PNG 1080×1920, sin hábitos privados con la bóveda cerrada */
  ctx = await contexto(b);
  p = await pagina(ctx, { hora: '2026-12-02T09:00:00', datos: (() => { const d = semilla(120); d.config.pinHash = null; return d; })() });
  await p.getByRole('button', { name: 'Progreso' }).click();
  assert.match(await p.locator('.anual-entrada').textContent(), /resumen de 2026 está listo/);
  await p.getByRole('button', { name: 'Ver tu 2026' }).click();
  const hoja = p.locator('dialog[data-hoja="anual"]');
  await hoja.locator('canvas.anual__lienzo').waitFor();
  const alt = await hoja.locator('canvas').getAttribute('aria-label');
  assert.match(alt, /120 días con al menos un hábito cumplido/);
  assert.match(alt, /Meditar/);
  const [descarga] = await Promise.all([p.waitForEvent('download'), hoja.getByRole('button', { name: 'Guardar imagen' }).click()]);
  assert.equal(descarga.suggestedFilename(), 'tavia-2026.png');
  const png = fs.readFileSync(await descarga.path());
  assert.equal(png.subarray(1, 4).toString(), 'PNG');
  assert.deepEqual([png.readUInt32BE(16), png.readUInt32BE(20)], [1080, 1920]);
  fs.writeFileSync(`${CAPT}/m8-tavia-2026.png`, png);
  await p.screenshot({ path: `${CAPT}/m8-anual.png` });
  paso('tu año: tarjeta 1080×1920 descargable como PNG, con resumen en texto');
  await hoja.getByRole('button', { name: 'Cerrar' }).click();
  await ctx.close();

  // Con PIN y bóveda cerrada, el hábito privado no aparece en la tarjeta.
  ctx = await contexto(b);
  const conPin = semilla(30);
  p = await pagina(ctx, { hora: '2026-12-02T09:00:00', datos: conPin });
  await p.getByRole('button', { name: 'Ajustes' }).click();
  await p.getByRole('button', { name: 'Activar PIN' }).click();
  let d = p.locator('dialog[data-hoja="pin-nuevo"]');
  await d.getByLabel(/Elige un PIN/).fill('2468');
  await d.getByLabel('Repite el PIN').fill('2468');
  await d.getByRole('button', { name: 'Guardar PIN' }).click();
  await p.waitForSelector('dialog[data-hoja="pin-nuevo"]', { state: 'detached', timeout: 20000 });
  await p.getByRole('button', { name: 'Progreso' }).click();
  await p.getByRole('button', { name: 'Ver tu 2026' }).click();
  const textoHoja = await p.locator('dialog[data-hoja="anual"]').textContent();
  assert.ok(!textoHoja.includes('Diario secreto'));
  assert.ok(!(await p.locator('dialog[data-hoja="anual"] canvas').getAttribute('aria-label')).includes('Diario secreto'));
  assert.match(textoHoja, /hábitos privados no aparecen/);
  paso('tu año: con la bóveda cerrada, los hábitos privados no salen en la imagen');
  await ctx.close();

  /* 6. Manifiesto */
  ctx = await contexto(b, { oscuro: true });
  p = await pagina(ctx);
  await p.getByRole('button', { name: 'Ajustes' }).click();
  await p.getByRole('button', { name: 'Sugerir con mis identidades' }).click();
  assert.equal(await p.locator('#ajuste-manifiesto').inputValue(), 'Soy una persona que cuida su mente y lee cada noche. Avanzo un poco cada día, sin culpa.');
  await p.locator('#ajuste-manifiesto').fill('Avanzo un poco cada día.\nSin culpa.');
  await p.getByRole('button', { name: 'Ver cómo se ve' }).click();
  await p.locator('dialog.manifiesto').waitFor();
  await p.locator('dialog.manifiesto').click();
  await p.locator('dialog.manifiesto').waitFor({ state: 'detached' });
  await guardar(p);
  await p.reload(); await p.waitForSelector('h1');
  const man = p.locator('dialog.manifiesto');
  await man.waitFor();
  assert.match(await man.textContent(), /Avanzo un poco cada día\.\s*Sin culpa\./);
  await p.screenshot({ path: `${CAPT}/m8-manifiesto.png` });
  // Se cierra solo.
  await p.clock.runFor(6000);
  await esperar(400);
  assert.equal(await man.count(), 0);
  await guardar(p);
  await p.reload(); await p.waitForSelector('h1');
  await esperar(300);
  assert.equal(await p.locator('dialog.manifiesto').count(), 0, 'una vez al día');
  // Modo línea: sin pantalla, una línea arriba en Hoy.
  await p.getByRole('button', { name: 'Ajustes' }).click();
  await p.locator('label.segmento', { hasText: 'Como una línea arriba en Hoy' }).click();
  await p.getByRole('button', { name: 'Hoy' }).click();
  assert.match(await p.locator('blockquote.manifiesto-linea').textContent(), /Sin culpa/);
  // Al día siguiente sigue sin pantalla (modo línea) y el check está a un toque.
  await guardar(p);
  await p.clock.setFixedTime(new Date('2026-10-28T08:00:00'));
  await p.reload(); await p.waitForSelector('h1');
  await esperar(300);
  assert.equal(await p.locator('dialog.manifiesto').count(), 0);
  await fila(p, 'Meditar').locator('.tv-check').click();
  assert.equal(await fila(p, 'Meditar').locator('.tv-check').getAttribute('data-estado'), 'hecho');
  paso('manifiesto: sugerencia, vista previa, pantalla al abrir una vez al día que se cierra sola, o línea en Hoy');
  const errores = p.errores;
  await ctx.close();

  // Con PIN: el manifiesto aparece recién después de desbloquear.
  ctx = await contexto(b);
  const bloqueada = semilla(10);
  p = await pagina(ctx, { datos: bloqueada });
  await p.getByRole('button', { name: 'Ajustes' }).click();
  await p.getByRole('button', { name: 'Activar PIN' }).click();
  d = p.locator('dialog[data-hoja="pin-nuevo"]');
  await d.getByLabel(/Elige un PIN/).fill('1357');
  await d.getByLabel('Repite el PIN').fill('1357');
  await d.getByRole('button', { name: 'Guardar PIN' }).click();
  await p.waitForSelector('dialog[data-hoja="pin-nuevo"]', { state: 'detached', timeout: 20000 });
  await p.locator('#ajuste-manifiesto').fill('Paso a paso.');
  await p.locator('#ajuste-manifiesto').blur();
  await guardar(p);
  await p.reload(); await p.waitForSelector('.bloqueo__caja');
  assert.equal(await p.locator('dialog.manifiesto').count(), 0);
  await p.locator('#pin-bloqueo').fill('1357');
  await p.getByRole('button', { name: 'Desbloquear' }).click();
  await p.locator('dialog.manifiesto', { hasText: 'Paso a paso.' }).waitFor({ timeout: 20000 });
  paso('manifiesto con PIN: nunca encima de la pantalla de bloqueo, aparece al desbloquear');

  assert.deepEqual([...errores, ...p.errores], []);
  paso('sin errores de consola');
  await ctx.close();

  await b.close();
  console.log(`\n${ok} pruebas de punta a punta (M8) OK`);
})().catch((e) => { console.error('✗', e.message); process.exit(1); });
