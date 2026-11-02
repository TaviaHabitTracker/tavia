// Prueba de punta a punta del rediseño «Analista» (0.9): panel del día con el brote, semana tocable,
// racha global, análisis de racha (gráfico recorrible con teclado), tema Negro e íconos propios.
// Uso: servir la carpeta en http://127.0.0.1:8765 y ejecutar: node tests/e2e-m9.cjs [carpeta-capturas]
const { chromium } = require('playwright');
const assert = require('node:assert/strict');

const URL_APP = process.env.TAVIA_URL || 'http://127.0.0.1:8765/';
const CAPT = process.argv[2] || '.';

function fechas(desde, hasta) {
  const out = [];
  const d = new Date(`${desde}T12:00:00`);
  while (d.toLocaleDateString('sv-SE') <= hasta) { out.push(d.toLocaleDateString('sv-SE')); d.setDate(d.getDate() + 1); }
  return out;
}

// Meditar: todos los días del 1 al 26 de octubre menos el 10 y el 19 (lunes, ese día sí hay Leer). Leer: los lunes, miércoles y viernes, menos el 9 y el 10.
// Así la racha global (días seguidos con al menos un hábito cumplido) es 16: del 11 al 26.
function semilla() {
  const logs = [];
  for (const f of fechas('2026-10-01', '2026-10-26')) {
    const dia = new Date(`${f}T12:00:00`).getDay();
    if (f !== '2026-10-10' && f !== '2026-10-19') logs.push({ habitId: 'med', fecha: f, estado: 'registrado', valor: 1, registradoEn: '07:15' });
    if ([1, 3, 5].includes(dia) && f !== '2026-10-09') logs.push({ habitId: 'leer', fecha: f, estado: 'registrado', valor: 1, registradoEn: '22:00' });
  }
  return {
    schemaVersion: 2,
    habits: [
      { id: 'med', nombre: 'Meditar', icono: '🧘', color: 'ciruela', tipo: 'si_no', vecesPorDia: 1, frecuencia: { tipo: 'diaria' }, bloque: 'manana', creado: '2026-10-01', pausas: [], orden: 1, identidad: 'cuida su mente' },
      { id: 'leer', nombre: 'Leer', icono: '📖', color: 'lago', tipo: 'si_no', vecesPorDia: 1, frecuencia: { tipo: 'diaria' }, bloque: 'noche', creado: '2026-10-01', pausas: [], orden: 2 },
    ],
    logs, revisiones: [], config: { finDelDia: '03:00', ultimoRespaldo: '2026-10-25' },
  };
}

(async () => {
  const b = await chromium.launch();
  let ok = 0;
  const paso = (txt) => { ok++; console.log('✓', txt); };
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, locale: 'es-CL', timezoneId: 'America/Santiago', colorScheme: 'dark' });
  const p = await ctx.newPage();
  const errores = [];
  p.on('console', (m) => { if (['error', 'warning'].includes(m.type())) errores.push(m.text()); });
  p.on('pageerror', (e) => errores.push('PAGEERROR ' + e.message));
  await p.clock.install({ time: new Date('2026-10-27T10:00:00') });
  await p.addInitScript((d) => { if (!sessionStorage.getItem('s')) { sessionStorage.setItem('s', '1'); localStorage.setItem('tavia:data', d); } }, JSON.stringify(semilla()));
  await p.goto(URL_APP);
  await p.waitForSelector('h1');
  const fila = (n) => p.locator('li.tv-habito', { has: p.locator('.tv-habito__nombre', { hasText: n }) });
  const kpi = (etiqueta) => p.locator('.kpi', { has: p.locator('.kpi__etiqueta', { hasText: etiqueta }) }).locator('.kpi__valor');

  /* 1. Panel del día: brote, racha global y cifras */
  const brote = p.locator('.panel-dia__brote');
  assert.equal(await brote.getAttribute('aria-valuenow'), '0');
  assert.equal(await kpi('días seguidos').textContent(), '16');
  assert.equal(await p.locator('.brote__hoja--on').count(), 0);
  assert.equal(await p.locator('.brote__yema').count(), 1);
  await fila('Meditar').locator('.tv-check').click();
  assert.equal(await brote.getAttribute('aria-valuenow'), '1');
  assert.equal(await kpi('días seguidos').textContent(), '17');
  assert.equal(await p.locator('.brote__hoja--on').count(), 2); // 1 de 2: primera hoja al empezar, segunda a la mitad
  await fila('Leer').locator('.tv-check').click();
  assert.equal(await p.locator('.brote__flor').count(), 1);
  assert.equal(await p.locator('.brote__yema').count(), 0);
  await p.screenshot({ path: `${CAPT}/m9-hoy-flor.png` });
  paso('panel del día: el brote se abre con cada hábito, florece al completar y la racha global suma hoy');

  /* 2. Semana tocable: abre ese día y vuelve */
  await p.locator('.semana-barras__dia').first().click(); // lunes 26
  assert.match(await p.locator('h1').textContent(), /Ayer|Lunes/i);
  assert.equal(await p.locator('.semana-barras__dia[aria-current="date"]').count(), 1);
  await p.getByRole('button', { name: 'Volver a hoy' }).click();
  assert.equal(await p.locator('h1').textContent(), 'Hoy');
  assert.equal(await p.locator('.semana-barras__dia[disabled]').count(), 5); // miércoles a domingo aún no llegan
  paso('semana: cada barra abre su día; los días futuros no se pueden tocar');

  /* 3. Íconos propios en vez de emojis */
  assert.equal(await fila('Meditar').locator('.tv-habito__icono svg').count(), 1);
  assert.equal(await fila('Leer').locator('.tv-habito__icono .tv-emoji').count(), 0);
  paso('íconos: los emojis conocidos se dibujan con el set SVG propio');

  /* 4. Análisis de racha desde Progreso */
  await p.getByRole('button', { name: 'Progreso', exact: true }).click();
  await p.locator('.tarjeta-habito', { hasText: 'Meditar' }).click();
  const hoja = p.locator('dialog[data-hoja="analisis"]');
  await hoja.waitFor();
  assert.match(await hoja.textContent(), /Meditar · análisis/);
  assert.match(await hoja.locator('.kpi', { hasText: 'mejor racha' }).textContent(), /9/);
  assert.match(await hoja.locator('.kpi', { hasText: 'vuelves tras fallar' }).textContent(), /1\s*d/);
  const grafico = hoja.getByRole('slider');
  await grafico.focus();
  const ultimo = await grafico.getAttribute('aria-valuetext');
  await p.keyboard.press('ArrowLeft');
  const anterior = await grafico.getAttribute('aria-valuetext');
  assert.notEqual(anterior, ultimo);
  await p.keyboard.press('Home');
  assert.match(await grafico.getAttribute('aria-valuetext'), /1 oct|oct/);
  assert.match(await hoja.getByRole('img').first().getAttribute('aria-label'), /Rachas: /);
  await p.screenshot({ path: `${CAPT}/m9-analisis.png` });
  await hoja.getByRole('button', { name: 'Cerrar' }).click();
  paso('análisis: cifras de racha, gráfico recorrible con flechas y resumen para lector de pantalla');

  /* 5. Desde el detalle del hábito */
  await p.getByRole('button', { name: 'Hoy', exact: true }).click();
  await fila('Leer').locator('.tv-habito__abrir').click();
  await p.locator('dialog[data-hoja="detalle"]').getByRole('button', { name: 'Ver análisis' }).click();
  await p.locator('dialog[data-hoja="analisis"]', { hasText: 'Leer · análisis' }).waitFor();
  await p.keyboard.press('Escape');
  paso('análisis: también se abre desde el detalle del hábito');

  /* 6. Tema Negro */
  await p.getByRole('button', { name: 'Ajustes', exact: true }).click();
  await p.locator('label.segmento', { hasText: 'Negro' }).click();
  assert.equal(await p.evaluate(() => document.documentElement.dataset.theme), 'negro');
  assert.equal(await p.evaluate(() => getComputedStyle(document.body).backgroundColor), 'rgb(0, 0, 0)');
  assert.equal(await p.evaluate(() => document.querySelector('meta[name="theme-color"]').content), '#000000');
  paso('tema Negro: negro puro y barra del sistema negra');

  assert.deepEqual(errores, []);
  paso('sin errores de consola');
  await b.close();
  console.log(`\n${ok} pruebas de punta a punta (0.9) OK`);
})().catch((e) => { console.error('✗', e.message); process.exit(1); });
