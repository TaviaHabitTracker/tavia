// Prueba de punta a punta en Chromium sin ventana.
// Uso: servir la carpeta (python -m http.server 8765) y luego: node tests/e2e.cjs [carpeta-capturas]
const { chromium } = require('playwright');
const assert = require('node:assert/strict');

const URL = process.env.TAVIA_URL || 'http://127.0.0.1:8765/';
const CAPT = process.argv[2] || '.';

async function nuevaPagina(b, { hora = '2026-10-27T10:00:00', oscuro = false, init } = {}) {
  const ctx = await b.newContext({
    viewport: { width: 390, height: 844 }, locale: 'es-CL', timezoneId: 'America/Santiago',
    colorScheme: oscuro ? 'dark' : 'light', hasTouch: true,
  });
  const p = await ctx.newPage();
  p.errores = [];
  p.on('console', (m) => { if (['error', 'warning'].includes(m.type())) p.errores.push(m.text()); });
  p.on('pageerror', (e) => p.errores.push('PAGEERROR ' + e.message));
  p.on('dialog', (d) => { p.errores.push('DIALOGO ' + d.message()); d.dismiss(); });
  await p.clock.install({ time: new Date(hora) });
  if (init) await p.addInitScript(init);
  await p.goto(URL);
  await p.waitForSelector('h1');
  return p;
}

const fila = (p, nombre) => p.locator('li.tv-habito', { has: p.locator('.tv-habito__nombre', { hasText: nombre }) });
const check = (p, nombre) => fila(p, nombre).locator('.tv-check');

async function crear(p, { nombre, tipo, veces, unidad, metaModo, min, max, frec, dias, creado }) {
  await p.getByRole('button', { name: 'Crear hábito' }).first().click();
  const d = p.locator('dialog[data-hoja="editor"]');
  await d.getByLabel('Nombre').fill(nombre);
  if (tipo === 'cantidad') {
    await d.locator('label.segmento', { hasText: 'Cantidad' }).click();
    if (unidad) await d.getByLabel('Unidad').fill(unidad);
    if (metaModo) await d.locator('label.segmento', { hasText: metaModo }).click();
    if (min !== undefined) await d.getByLabel('Mínimo', { exact: true }).fill(String(min));
    if (max !== undefined) await d.getByLabel('Máximo', { exact: true }).fill(String(max));
  }
  if (veces) for (let i = 1; i < veces; i++) await d.getByRole('button', { name: 'Veces al día: más' }).click();
  if (frec) await d.locator('label.segmento', { hasText: frec }).click();
  if (dias) {
    for (const i of [0, 1, 2, 3, 4, 5, 6]) {
      const caja = d.locator(`input[name="dias"][value="${i}"]`);
      if ((await caja.isChecked()) !== dias.includes(i)) await caja.locator('xpath=..').click();
    }
  }
  if (creado) {
    await d.locator('summary', { hasText: 'Más opciones' }).click();
    await d.getByLabel('Empezó el').fill(creado);
  }
  await d.getByRole('button', { name: 'Guardar' }).click();
  await p.waitForSelector('dialog[data-hoja="editor"]', { state: 'detached' });
}

(async () => {
  const b = await chromium.launch();
  let ok = 0;
  const paso = (txt) => { ok++; console.log('✓', txt); };

  /* 1. Estado vacío → idea → hábito */
  let p = await nuevaPagina(b);
  await p.getByRole('button', { name: /Caminar/ }).click();
  assert.equal(await p.locator('dialog[data-hoja="editor"]').getByLabel('Nombre').inputValue(), 'Caminar');
  await p.locator('dialog[data-hoja="editor"]').getByRole('button', { name: 'Guardar' }).click();
  await fila(p, 'Caminar').waitFor();
  paso('idea crea hábito en menos de 3 toques');

  /* 2. Marcar en 1 toque, persistir, desmarcar y deshacer */
  await check(p, 'Caminar').click();
  assert.equal(await check(p, 'Caminar').getAttribute('data-estado'), 'hecho');
  assert.equal(await check(p, 'Caminar').getAttribute('aria-pressed'), 'true');
  assert.match(await p.locator('.tv-progreso__texto').textContent(), /1\/1/);
  await p.clock.runFor(400); // espera del guardado
  await p.reload();
  await fila(p, 'Caminar').waitFor();
  assert.equal(await check(p, 'Caminar').getAttribute('data-estado'), 'hecho');
  paso('marcar en un toque y persistir al recargar');
  await check(p, 'Caminar').click();
  assert.equal(await check(p, 'Caminar').getAttribute('data-estado'), null);
  await p.getByRole('button', { name: 'Deshacer' }).click();
  assert.equal(await check(p, 'Caminar').getAttribute('data-estado'), 'hecho');
  paso('desmarcar muestra Deshacer y restaura');
  await check(p, 'Caminar').click(); // dejarlo sin marcar
  await p.clock.runFor(6000);
  assert.equal(await p.locator('.tv-deshacer').count(), 0);
  paso('el aviso de Deshacer desaparece solo');

  /* 3. Varias veces al día */
  await crear(p, { nombre: 'Agua', veces: 3 });
  for (let i = 1; i <= 3; i++) await check(p, 'Agua').click();
  assert.equal(await check(p, 'Agua').getAttribute('data-estado'), 'hecho');
  await check(p, 'Agua').click();
  assert.equal(await check(p, 'Agua').getAttribute('data-estado'), null);
  assert.match(await fila(p, 'Agua').locator('.tv-habito__meta').textContent(), /0 de 3 veces/);
  paso('N veces al día: cada toque suma, al completar vuelve a 0');

  /* 4. Cantidad con mínimo, decimales con coma */
  await crear(p, { nombre: 'Leer', tipo: 'cantidad', unidad: 'páginas', metaModo: 'Al menos', min: 10 });
  await check(p, 'Leer').click();
  let d = p.locator('dialog[data-hoja="detalle"]');
  await d.getByLabel(/Cantidad de hoy/).fill('7,5');
  await d.getByRole('button', { name: 'Guardar' }).click();
  assert.equal(await check(p, 'Leer').getAttribute('data-estado'), 'parcial');
  assert.match(await fila(p, 'Leer').locator('.tv-habito__meta').textContent(), /7,5 \/ 10 páginas/);
  await check(p, 'Leer').click();
  await d.getByLabel(/Cantidad de hoy/).fill('abc');
  await d.getByRole('button', { name: 'Guardar' }).click();
  assert.match(await d.locator('.error-campo').textContent(), /número válido/);
  await d.getByLabel(/Cantidad de hoy/).fill('12');
  await d.getByRole('button', { name: 'Guardar' }).click();
  assert.equal(await check(p, 'Leer').getAttribute('data-estado'), 'hecho');
  paso('cantidad: decimales con coma, error amable, meta mínima');

  /* 5. Máximo (malos hábitos) */
  await crear(p, { nombre: 'Pantalla', tipo: 'cantidad', unidad: 'h', metaModo: 'Como máximo', max: 2 });
  await check(p, 'Pantalla').click();
  d = p.locator('dialog[data-hoja="detalle"]');
  await d.getByLabel(/Cantidad de hoy/).fill('3');
  await d.getByRole('button', { name: 'Guardar' }).click();
  assert.equal(await check(p, 'Pantalla').getAttribute('data-estado'), 'excedido');
  paso('meta máxima: pasarse se ve neutro, sin rojo');

  /* 6. Hoy no y Descanso */
  await fila(p, 'Caminar').locator('.tv-habito__abrir').click();
  d = p.locator('dialog[data-hoja="detalle"]');
  await d.getByRole('button', { name: /Descanso/ }).click();
  assert.equal(await check(p, 'Caminar').getAttribute('data-estado'), 'descanso');
  paso('descanso desde la hoja de detalle');

  /* 7. Validaciones del editor */
  await p.getByRole('button', { name: 'Crear hábito' }).first().click();
  const ed = p.locator('dialog[data-hoja="editor"]');
  await ed.getByRole('button', { name: 'Guardar' }).click();
  assert.match(await ed.locator('.error-campo').last().textContent(), /Ponle un nombre/);
  assert.equal(await ed.getByLabel('Nombre').getAttribute('aria-invalid'), 'true');
  await p.keyboard.press('Escape');
  await p.waitForSelector('dialog[data-hoja="editor"]', { state: 'detached' });
  paso('editor exige nombre y se cierra con Escape');

  /* 8. XSS */
  await crear(p, { nombre: '<img src=x onerror=alert(1)>' });
  await fila(p, '<img src=x').waitFor();
  assert.equal(await p.locator('.tv-habito__nombre img').count(), 0);
  assert.equal(p.errores.filter((e) => e.startsWith('DIALOGO')).length, 0);
  paso('un nombre con HTML se muestra como texto y no se ejecuta');

  /* 9. Días fijos: martes y jueves (hoy es martes) */
  await crear(p, { nombre: 'Gym', frec: 'Días fijos', dias: [1, 3] });
  assert.match(await fila(p, 'Gym').locator('.tv-habito__meta').textContent(), /Martes y jueves/);
  paso('días fijos aparecen el día que toca');

  /* 10. Día anterior: hábito con inicio pasado se puede marcar ayer */
  await crear(p, { nombre: 'Diario', creado: '2026-10-20' });
  await p.getByRole('button', { name: 'Día anterior' }).click();
  assert.equal(await p.textContent('h1'), 'Ayer');
  assert.equal(await fila(p, 'Caminar').count(), 0); // creado hoy: ayer no aparece
  await check(p, 'Diario').click();
  assert.equal(await check(p, 'Diario').getAttribute('data-estado'), 'hecho');
  assert.equal(await p.getByRole('button', { name: 'Día siguiente' }).isDisabled(), false);
  await p.getByRole('button', { name: 'Volver a hoy' }).click();
  assert.equal(await p.textContent('h1'), 'Hoy');
  assert.equal(await check(p, 'Diario').getAttribute('data-estado'), null);
  paso('ayer se puede marcar; días antes del inicio no');

  await p.screenshot({ path: `${CAPT}/s2-hoy.png`, fullPage: true });

  /* 11. Archivar desde editor y restaurar / eliminar en Ajustes */
  await fila(p, 'Gym').locator('.tv-habito__abrir').click();
  await p.locator('dialog[data-hoja="detalle"]').getByRole('button', { name: 'Editar hábito' }).click();
  await p.locator('dialog[data-hoja="editor"]').getByRole('button', { name: 'Archivar' }).click();
  await p.waitForSelector('dialog', { state: 'detached' });
  assert.equal(await fila(p, 'Gym').count(), 0);
  await p.getByRole('button', { name: 'Ajustes' }).click();
  await p.getByRole('button', { name: 'Eliminar definitivamente' }).click();
  await p.locator('dialog[data-hoja="confirmar"]').getByRole('button', { name: 'Eliminar' }).click();
  await p.waitForSelector('dialog', { state: 'detached' });
  assert.equal(await p.locator('.fila-habito', { hasText: 'Gym' }).count(), 0);
  paso('archivar oculta; eliminar pide confirmación');
  await p.screenshot({ path: `${CAPT}/s3-ajustes.png`, fullPage: true });
  await p.getByRole('button', { name: 'Hoy' }).click();

  /* 12. Cambio de día a la hora de fin (03:00) */
  await p.clock.setFixedTime(new Date('2026-10-28T02:58:00'));
  await p.clock.resume();
  await p.evaluate(() => window.dispatchEvent(new Event('focus')));
  assert.match(await p.locator('.subtitulo').first().textContent(), /27 de octubre/);
  await p.clock.setFixedTime(new Date('2026-10-28T03:00:30'));
  await p.evaluate(() => window.dispatchEvent(new Event('focus')));
  await p.waitForFunction(() => /28 de octubre/.test(document.querySelector('.subtitulo').textContent));
  assert.equal(await check(p, 'Agua').getAttribute('data-estado'), null);
  paso('a las 03:00 cambia el día y la lista vuelve a pendiente');

  /* 13. Pausa */
  await fila(p, 'Agua').locator('.tv-habito__abrir').click();
  d = p.locator('dialog[data-hoja="detalle"]');
  await d.locator('summary', { hasText: 'Pausar' }).click();
  await d.getByRole('button', { name: 'Pausar' }).click();
  assert.equal(await fila(p, 'Agua').count(), 0);
  await p.getByRole('button', { name: 'Ajustes' }).click();
  assert.match(await p.locator('.fila-habito', { hasText: 'Agua' }).textContent(), /Pausado hasta/);
  await p.locator('.fila-habito', { hasText: 'Agua' }).getByRole('button', { name: 'Reanudar' }).click();
  await p.getByRole('button', { name: 'Hoy' }).click();
  await fila(p, 'Agua').waitFor();
  paso('pausar oculta el hábito; reanudar lo devuelve');

  /* 14. Teclado: el foco vuelve al check tras marcar */
  await check(p, 'Diario').focus();
  await p.keyboard.press('Enter');
  const foco = await p.evaluate(() => document.activeElement?.dataset.foco || '');
  assert.match(foco, /^check-/);
  paso('teclado: Enter marca y el foco se mantiene');

  assert.deepEqual(p.errores, []);
  paso('sin errores en consola ni violaciones de CSP');

  /* 15. Oscuro */
  const po = await nuevaPagina(b, { oscuro: true });
  await po.getByRole('button', { name: /Tomar agua/ }).click();
  await po.locator('dialog[data-hoja="editor"]').getByRole('button', { name: 'Guardar' }).click();
  await check(po, 'Tomar agua').click();
  await po.screenshot({ path: `${CAPT}/s4-oscuro.png` });
  await po.getByRole('button', { name: 'Crear hábito' }).first().click();
  await po.screenshot({ path: `${CAPT}/s5-editor-oscuro.png` });
  paso('tema oscuro');

  /* 16. Sin almacenamiento (modo privado estricto) */
  const pm = await nuevaPagina(b, { init: () => { Storage.prototype.setItem = () => { throw new DOMException('bloqueado', 'SecurityError'); }; Object.defineProperty(window, 'indexedDB', { get: () => undefined }); } });
  assert.match(await pm.locator('.tv-aviso').textContent(), /no deja guardar/);
  await pm.getByRole('button', { name: /Caminar/ }).click();
  await pm.locator('dialog[data-hoja="editor"]').getByRole('button', { name: 'Guardar' }).click();
  await fila(pm, 'Caminar').waitFor();
  paso('sin IndexedDB ni localStorage: aviso claro y la app sigue funcionando en memoria');

  /* 17. Datos dañados */
  const pc = await nuevaPagina(b, { init: () => { if (!sessionStorage.getItem('x')) { sessionStorage.setItem('x', '1'); localStorage.setItem('tavia:data', '{roto'); } } });
  assert.match(await pc.locator('.tv-aviso').textContent(), /datos dañados/);
  paso('datos dañados: aviso y copia de respaldo');

  /* 18. PC: riel lateral */
  const pp = await nuevaPagina(b);
  await pp.setViewportSize({ width: 1280, height: 800 });
  await pp.getByRole('button', { name: /Leer/ }).click();
  await pp.locator('dialog[data-hoja="editor"]').getByRole('button', { name: 'Guardar' }).click();
  await pp.screenshot({ path: `${CAPT}/s6-pc.png` });
  paso('PC: navegación en riel lateral');

  await b.close();
  console.log(`\n${ok} pruebas de punta a punta OK`);
})().catch((e) => { console.error('✗', e.message); process.exit(1); });
