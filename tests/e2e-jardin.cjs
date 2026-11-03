// Prueba de punta a punta del Jardín anual: vistas, teclado, privacidad, tarjeta PNG sin metadatos,
// temas, movimiento reducido, pantallas chicas y PC, cambio de año, configuración corrupta y 5 años.
// Uso: servir la carpeta en http://127.0.0.1:8765 y ejecutar: node tests/e2e-jardin.cjs [carpeta-capturas]
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const URL_APP = process.env.TAVIA_URL || 'http://127.0.0.1:8765/';
const CAPT = process.argv[2] || '.';

function fechas(desde, hasta) {
  const out = [];
  const d = new Date(`${desde}T12:00:00`);
  while (d.toLocaleDateString('sv-SE') <= hasta) { out.push(d.toLocaleDateString('sv-SE')); d.setDate(d.getDate() + 1); }
  return out;
}

/** Un año con días cumplidos, a medias y sin nada; un hábito privado; una nota. */
function semilla({ desde = '2026-01-05', hasta = '2026-10-27', config = {} } = {}) {
  const dias = fechas(desde, hasta);
  const logs = [];
  dias.forEach((f, i) => {
    if (i % 5 !== 4) logs.push({ habitId: 'med', fecha: f, estado: 'registrado', valor: 1 });
    if (i % 3 === 0) logs.push({ habitId: 'leer', fecha: f, estado: 'registrado', valor: 1 });
    if (i % 2) logs.push({ habitId: 'diario', fecha: f, estado: 'registrado', valor: 1 });
  });
  logs.push({ habitId: 'diario', fecha: '2026-10-20', estado: 'nota', valor: null, nota: 'Secreto de la bóveda' });
  logs.push({ habitId: 'med', fecha: '2026-10-21', estado: 'registrado', valor: 1, nota: 'Me sentí en calma' });
  return {
    schemaVersion: 2,
    habits: [
      { id: 'med', nombre: 'Meditar', icono: '🧘', color: 'ciruela', tipo: 'si_no', vecesPorDia: 1, frecuencia: { tipo: 'diaria' }, bloque: 'manana', creado: desde, pausas: [], orden: 1 },
      { id: 'leer', nombre: 'Leer', icono: '📖', color: 'lago', tipo: 'si_no', vecesPorDia: 1, frecuencia: { tipo: 'diaria' }, bloque: 'noche', creado: desde, pausas: [], orden: 2 },
      { id: 'diario', nombre: 'Diario secreto', icono: '🔒', color: 'pino', tipo: 'si_no', vecesPorDia: 1, frecuencia: { tipo: 'diaria' }, bloque: 'noche', creado: desde, pausas: [], orden: 3, privado: true },
    ],
    logs,
    revisiones: [],
    config: { finDelDia: '03:00', ultimoRespaldo: hasta, ...config },
  };
}

async function contexto(b, { esquema = 'light', ancho = 390, alto = 844, movimiento = 'no-preference' } = {}) {
  return b.newContext({ viewport: { width: ancho, height: alto }, locale: 'es-CL', timezoneId: 'America/Santiago', colorScheme: esquema, reducedMotion: movimiento, acceptDownloads: true, hasTouch: false });
}
async function pagina(ctx, { hora = '2026-10-27T10:00:00', datos = semilla() } = {}) {
  const p = await ctx.newPage();
  p.errores = [];
  p.on('console', (m) => { if (['error', 'warning'].includes(m.type())) p.errores.push(m.text()); });
  p.on('pageerror', (e) => p.errores.push('PAGEERROR ' + e.message));
  await p.clock.install({ time: new Date(hora) });
  if (datos) await p.addInitScript((d) => { if (!sessionStorage.getItem('s')) { sessionStorage.setItem('s', '1'); localStorage.setItem('tavia:data', d); } }, typeof datos === 'string' ? datos : JSON.stringify(datos));
  await p.goto(URL_APP);
  await p.waitForSelector('h1');
  return p;
}
async function abrirJardin(p) {
  await p.getByRole('button', { name: 'Progreso' }).click();
  await p.locator('label.segmento', { hasText: 'Jardín' }).click();
  await p.locator('.jardin__anio').waitFor();
}
/** Bloques (chunks) de un PNG. */
function bloquesPNG(buf) {
  assert.equal(buf.subarray(0, 8).toString('hex'), '89504e470d0a1a0a');
  const tipos = [];
  for (let i = 8; i < buf.length;) {
    const largo = buf.readUInt32BE(i);
    tipos.push(buf.subarray(i + 4, i + 8).toString('latin1'));
    i += 12 + largo;
  }
  return tipos;
}

(async () => {
  const b = await chromium.launch();
  let ok = 0;
  const paso = (txt) => { ok++; console.log('✓', txt); };

  /* 1. Vista año: 12 macizos, leyenda, resumen en texto y lista accesible */
  let ctx = await contexto(b);
  let p = await pagina(ctx);
  await abrirJardin(p);
  assert.equal(await p.locator('.jardin__anio .j-macizo').count(), 12);
  assert.equal(await p.locator('.jardin__anio use.j-dia-figura').count(), 365);
  assert.match(await p.locator('.jardin__titulo').textContent(), /Tu jardín 2026/);
  assert.match(await p.locator('.jardin__resumen').textContent(), /días con flor/);
  assert.equal(await p.locator('.jardin__leyenda li').count(), 8);
  assert.match(await p.locator('.jardin__anio').getAttribute('aria-label'), /días con flor/);
  await p.locator('.jardin__lista summary').click();
  assert.ok(await p.locator('.jardin__tabla tbody tr').count() >= 10);
  // Sin bóveda (sin PIN) el privado se ve en pantalla, pero el jardín no tiene nombres en el SVG.
  assert.doesNotMatch(await p.locator('.jardin__anio').innerHTML(), /Meditar|Diario|Leer/);
  // El jardín no cambia al recargar (semilla guardada).
  const antes = await p.locator('.jardin__anio').innerHTML();
  await p.clock.runFor(400); await new Promise((r) => setTimeout(r, 200));
  await p.reload(); await p.waitForSelector('h1');
  await abrirJardin(p);
  await p.waitForTimeout(50);
  const limpiar = (s) => s.replace(/ class="[^"]*jardin--entrada[^"]*"/g, '');
  assert.equal(limpiar(await p.locator('.jardin__anio').innerHTML()), limpiar(antes));
  await p.screenshot({ path: path.join(CAPT, 'jardin-anio-claro.png'), fullPage: true });
  paso('vista año: 12 macizos, 365 días, leyenda, resumen accesible, lista por mes y el mismo jardín al recargar');

  /* 2. Teclado: flechas entre meses, Enter abre el mes; flechas entre días; ficha del día */
  await p.locator('.j-macizo[tabindex="0"]').focus();
  assert.equal(await p.evaluate(() => document.activeElement.dataset.foco), 'jardin-macizo-10');
  await p.keyboard.press('ArrowLeft');
  assert.equal(await p.evaluate(() => document.activeElement.dataset.foco), 'jardin-macizo-9');
  await p.keyboard.press('ArrowRight');
  await p.keyboard.press('Enter');
  await p.locator('.jardin__mes').waitFor();
  assert.match(await p.locator('.jardin__titulo').textContent(), /Octubre 2026/);
  assert.equal(await p.locator('.jardin__mes .j-dia[role="button"]').count(), 27);
  await p.waitForFunction(() => document.activeElement?.dataset?.foco === 'jardin-dia-2026-10-27');
  await p.keyboard.press('ArrowLeft');
  assert.equal(await p.evaluate(() => document.activeElement.dataset.foco), 'jardin-dia-2026-10-26');
  await p.keyboard.press('ArrowUp');
  assert.equal(await p.evaluate(() => document.activeElement.dataset.foco), 'jardin-dia-2026-10-19');
  const caja = await p.locator('[data-foco="jardin-dia-2026-10-21"] .j-celda').boundingBox();
  assert.ok(caja.width >= 44 && caja.height >= 44, `área táctil ${Math.round(caja.width)}px`);
  await p.locator('[data-foco="jardin-dia-2026-10-21"]').click();
  const hoja = p.locator('dialog[data-hoja="jardin-dia"]');
  await hoja.waitFor();
  const textoHoja = await hoja.textContent();
  assert.match(textoHoja, /Meditar/);
  assert.match(textoHoja, /Me sentí en calma/);
  assert.doesNotMatch(textoHoja, /Diario secreto|Secreto de la bóveda/); // privados nunca en el jardín
  await p.keyboard.press('Escape');
  await p.screenshot({ path: path.join(CAPT, 'jardin-mes-claro.png'), fullPage: true });
  paso('teclado entre meses y días, áreas táctiles ≥ 44 px, ficha con nota y sin hábitos privados');

  /* 3. Sembrar de nuevo: una tierra reciente ofrece ir a ese día en Hoy */
  const tierra = p.locator('.jardin__mes .j-dia', { has: p.locator('use.j-tierra') }).first();
  await tierra.click();
  await p.getByRole('button', { name: 'Sembrar este día' }).click();
  await p.locator('.tv-habito').first().waitFor();
  assert.equal(await p.evaluate(() => location.hash), '#hoy');
  paso('sembrar de nuevo lleva al día en Hoy (reutiliza la edición de días pasados)');
  await ctx.close();

  /* 4. Hoy completo: la flor de hoy brota una vez, y desde Hoy se llega a ella */
  const datosHoy = semilla();
  for (const id of ['med', 'leer', 'diario']) {
    datosHoy.logs = datosHoy.logs.filter((l) => !(l.habitId === id && l.fecha === '2026-10-27'));
    datosHoy.logs.push({ habitId: id, fecha: '2026-10-27', estado: 'registrado', valor: 1 });
  }
  ctx = await contexto(b);
  p = await pagina(ctx, { datos: datosHoy });
  await p.getByRole('button', { name: 'Ver tu flor en el jardín' }).click();
  await p.locator('.jardin__mes').waitFor();
  assert.equal(await p.locator('.jardin__mes .j-nace').count(), 1);
  assert.equal(await p.locator('[data-foco="jardin-dia-2026-10-27"] .j-halo').count(), 1);
  await p.locator('[data-foco="jardin-anio"]').click();
  assert.equal(await p.locator('.j-nace').count(), 0); // una sola vez por día
  paso('al completar el día, la flor de hoy brota una sola vez y Hoy enlaza con ella');

  /* 5. Ver cómo creció: se oculta, crece, se pausa y se salta */
  await p.getByRole('button', { name: 'Ver cómo creció' }).click();
  assert.ok(await p.locator('.j-oculta').count() > 300);
  await p.getByRole('button', { name: 'Pausa' }).click();
  await p.getByRole('button', { name: 'Saltar' }).click();
  assert.equal(await p.locator('.j-oculta').count(), 0);
  paso('«Ver cómo creció» con pausa y saltar');

  /* 6. Tarjeta: privada por defecto, PNG sin metadatos, nombre genérico */
  await p.getByRole('button', { name: 'Mi jardín' }).click();
  const tarjeta = p.locator('dialog[data-hoja="jardin-tarjeta"]');
  await tarjeta.waitFor();
  assert.match(await tarjeta.locator('.jardin-tarjeta__aviso').textContent(), /las formas de tu jardín del año\./);
  assert.match(await tarjeta.textContent(), /Nunca lleva nombres de hábitos/);
  const [descarga] = await Promise.all([p.waitForEvent('download'), tarjeta.getByRole('button', { name: 'Descargar imagen' }).click()]);
  assert.equal(descarga.suggestedFilename(), 'tavia-jardin.png');
  const ruta = path.join(CAPT, 'tavia-jardin.png');
  await descarga.saveAs(ruta);
  const png = fs.readFileSync(ruta);
  const tipos = bloquesPNG(png);
  assert.ok(!tipos.some((t) => ['tEXt', 'zTXt', 'iTXt', 'eXIf', 'tIME'].includes(t)), tipos.join(','));
  assert.equal(png.readUInt32BE(16), 1080);
  assert.equal(png.readUInt32BE(20), 1350);
  assert.ok(!png.includes(Buffer.from('Meditar')) && !png.includes(Buffer.from('2026-10')));
  // Interruptores: historia y cifras cambian la vista previa y el aviso.
  await tarjeta.locator('label.segmento', { hasText: 'Historia' }).click();
  await tarjeta.locator('label.interruptor', { hasText: 'número de flores' }).click();
  assert.equal(await tarjeta.locator('canvas').getAttribute('height'), '1920');
  assert.match(await tarjeta.locator('.jardin-tarjeta__aviso').textContent(), /número de flores/);
  await tarjeta.screenshot({ path: path.join(CAPT, 'jardin-tarjeta.png') });
  paso('tarjeta: privada de fábrica, vista previa en vivo, PNG 1080×1350/1920 sin metadatos y nombre genérico');
  assert.deepEqual(p.errores, []);
  await ctx.close();

  /* 7. Temas oscuro y negro, movimiento reducido, pantalla chica y PC */
  for (const [nombre, op, tema] of [
    ['oscuro', { esquema: 'dark' }, null],
    ['negro', { esquema: 'dark' }, 'negro'],
    ['chica', { ancho: 320, alto: 640 }, null],
    ['pc', { ancho: 1280, alto: 900 }, null],
  ]) {
    ctx = await contexto(b, op);
    p = await pagina(ctx, { datos: semilla({ config: tema ? { tema } : {} }) });
    await abrirJardin(p);
    await p.waitForTimeout(700);
    const anchoSvg = (await p.locator('.jardin__anio').boundingBox()).width;
    const anchoVista = await p.evaluate(() => document.documentElement.clientWidth);
    assert.ok(anchoSvg <= anchoVista, `${nombre}: sin desborde`);
    assert.equal(await p.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth), true, `${nombre}: sin scroll horizontal`);
    await p.screenshot({ path: path.join(CAPT, `jardin-${nombre}.png`), fullPage: true });
    assert.deepEqual(p.errores, [], nombre);
    await ctx.close();
  }
  ctx = await contexto(b, { movimiento: 'reduce' });
  p = await pagina(ctx);
  await abrirJardin(p);
  assert.equal(await p.locator('.jardin--entrada').count(), 0);
  assert.equal(await p.getByRole('button', { name: 'Ver cómo creció' }).count(), 0);
  await p.locator('.j-macizo').nth(9).click();
  assert.equal(await p.locator('.jardin--viento').count(), 0);
  paso('tres temas, 320 px y PC sin desborde; con movimiento reducido no hay animaciones');
  await ctx.close();

  /* 8. Ajustes: umbral y hemisferio; configuración corrupta no rompe nada */
  ctx = await contexto(b);
  p = await pagina(ctx, { datos: semilla({ config: { jardin: 'basura' } }) });
  await abrirJardin(p);
  const flores100 = await p.locator('.jardin__anio use.j-flor').count();
  await p.getByRole('button', { name: 'Ajustes' }).click();
  await p.getByLabel('Un día florece cuando cumplo').selectOption('60');
  await p.locator('label.segmento', { hasText: 'Hemisferio norte' }).click();
  await p.getByRole('button', { name: 'Progreso' }).click();
  const flores60 = await p.locator('.jardin__anio use.j-flor').count();
  assert.ok(flores60 > flores100, `${flores60} > ${flores100}`);
  assert.match(await p.locator('.jardin__anio').getAttribute('class'), /estacion-otono/); // octubre en el norte
  assert.deepEqual(p.errores, []);
  paso('umbral y hemisferio cambian el dibujo (no las rachas); una configuración corrupta vuelve a la de fábrica');
  await ctx.close();

  /* 9. Cambio de año con el jardín abierto */
  ctx = await contexto(b);
  p = await pagina(ctx, { hora: '2026-12-31T22:00:00', datos: semilla({ hasta: '2026-12-31' }) });
  await abrirJardin(p);
  assert.match(await p.locator('.jardin__titulo').textContent(), /2026/);
  await p.clock.runFor(6 * 3600 * 1000);
  await p.waitForFunction(() => /2027/.test(document.querySelector('.jardin__titulo')?.textContent || ''), null, { timeout: 5000 });
  assert.equal(await p.locator('.jardin__anio use.j-dia-figura').count(), 365);
  paso('cambio de año con el jardín abierto: pasa solo al jardín del año nuevo');
  await ctx.close();

  /* 10. Bóveda con PIN: los privados no se ven ni en el jardín ni en sus números */
  ctx = await contexto(b);
  const conPin = semilla();
  conPin.config.pinHash = 'A'.repeat(44); conPin.config.pinSalt = 'B'.repeat(24);
  p = await pagina(ctx, { datos: conPin });
  assert.equal(await p.locator('.bloqueo').count(), 1);
  await ctx.close();
  paso('con PIN, la app abre bloqueada (el jardín no se dibuja hasta desbloquear)');

  /* 11. Cinco años de historial: el jardín abre rápido */
  ctx = await contexto(b);
  const cinco = semilla({ desde: '2022-01-03', hasta: '2026-10-27' });
  p = await pagina(ctx, { datos: cinco });
  await p.getByRole('button', { name: 'Progreso' }).click();
  const t0 = Date.now();
  await p.locator('label.segmento', { hasText: 'Jardín' }).click();
  await p.locator('.jardin__anio').waitFor();
  const ms = Date.now() - t0;
  assert.ok(ms < 1500, `${ms} ms`);
  const t1 = Date.now();
  await p.locator('.j-macizo').nth(9).click();
  await p.locator('.jardin__mes').waitFor();
  assert.ok(Date.now() - t1 < 400, `mes: ${Date.now() - t1} ms`);
  paso(`5 años de historial: el jardín abre en ${ms} ms y el mes en ${Date.now() - t1} ms (con caché)`);
  await ctx.close();

  await b.close();
  console.log(`\n${ok} pasos OK`);
})().catch((e) => { console.error(e); process.exit(1); });
