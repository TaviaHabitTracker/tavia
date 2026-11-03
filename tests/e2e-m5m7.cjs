// Prueba de punta a punta de los Módulos 5–7: tema, recordatorios, respaldo (JSON, cifrado, CSV),
// importar con resumen, PIN y bloqueo, bóveda privada, modo Ritual, revisión semanal e insights.
// Uso: servir la carpeta en http://127.0.0.1:8765 y ejecutar: node tests/e2e-m5m7.cjs [carpeta-capturas]
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const URL = process.env.TAVIA_URL || 'http://127.0.0.1:8765/';
const CAPT = process.argv[2] || '.';

function fechas(desde, n) {
  const out = [];
  const d = new Date(`${desde}T12:00:00`);
  for (let i = 0; i < n; i++) { out.push(d.toLocaleDateString('sv-SE')); d.setDate(d.getDate() + 1); }
  return out;
}

// 40 días de historia con un patrón claro: los días de semana "buenos" se cumple casi todo.
function semilla() {
  const logs = [];
  for (const f of fechas('2026-09-17', 40)) {
    const dia = new Date(`${f}T12:00:00`).getDay();
    const bueno = [1, 3, 5].includes(dia);
    if (bueno) for (const id of ['med', 'leer', 'agua']) logs.push({ habitId: id, fecha: f, estado: 'registrado', valor: id === 'agua' ? 6 : 1, registradoEn: '07:20' });
    else if (dia !== 0) logs.push({ habitId: 'agua', fecha: f, estado: 'registrado', valor: 6, registradoEn: '19:40' });
  }
  return {
    schemaVersion: 1,
    habits: [
      { id: 'med', nombre: 'Meditar', icono: '🧘', color: 'ciruela', tipo: 'si_no', vecesPorDia: 1, frecuencia: { tipo: 'diaria' }, bloque: 'manana', creado: '2026-09-17', pausas: [], orden: 1, identidad: 'cuida su mente' },
      { id: 'leer', nombre: 'Leer', icono: '📖', color: 'lago', tipo: 'si_no', vecesPorDia: 1, frecuencia: { tipo: 'diaria' }, bloque: 'manana', creado: '2026-09-17', pausas: [], orden: 2 },
      { id: 'agua', nombre: 'Agua', icono: '💧', color: 'pino', tipo: 'si_no', vecesPorDia: 6, frecuencia: { tipo: 'diaria' }, bloque: 'dia', creado: '2026-09-17', pausas: [], orden: 3 },
    ],
    logs,
    config: { finDelDia: '03:00', ultimoRespaldo: '2026-10-01' },
  };
}

async function pagina(b, { hora = '2026-10-27T10:00:00', datos = semilla(), oscuro = false, permisos = [] } = {}) {
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, locale: 'es-CL', timezoneId: 'America/Santiago', colorScheme: oscuro ? 'dark' : 'light', acceptDownloads: true });
  if (permisos.length) await ctx.grantPermissions(permisos, { origin: new globalThis.URL(URL).origin });
  const p = await ctx.newPage();
  p.errores = [];
  p.on('console', (m) => { if (['error', 'warning'].includes(m.type())) p.errores.push(m.text()); });
  p.on('pageerror', (e) => p.errores.push('PAGEERROR ' + e.message));
  await p.clock.install({ time: new Date(hora) });
  if (datos) await p.addInitScript((d) => { if (!sessionStorage.getItem('s')) { sessionStorage.setItem('s', '1'); localStorage.setItem('tavia:data', d); } }, JSON.stringify(datos));
  await p.goto(URL);
  await p.waitForSelector('h1');
  return p;
}

/** Lee lo guardado en IndexedDB (desde el M8 los datos viven ahí). */
const leerGuardado = (p) => p.evaluate(() => new Promise((ok, mal) => {
  const r = indexedDB.open('tavia');
  r.onerror = () => mal(r.error);
  r.onsuccess = () => {
    const g = r.result.transaction('kv').objectStore('kv').get('tavia:data');
    g.onsuccess = () => { r.result.close(); ok(JSON.parse(g.result)); };
    g.onerror = () => mal(g.error);
  };
}));
const fila = (p, n) => p.locator('li.tv-habito', { has: p.locator('.tv-habito__nombre', { hasText: n }) });
async function descargar(p, accion) {
  const [d] = await Promise.all([p.waitForEvent('download'), accion()]);
  return { nombre: d.suggestedFilename(), texto: fs.readFileSync(await d.path(), 'utf8') };
}
async function ocultarYVolver(p) {
  await p.evaluate(() => {
    const fijar = (v) => { Object.defineProperty(document, 'visibilityState', { value: v, configurable: true }); document.dispatchEvent(new Event('visibilitychange')); };
    fijar('hidden'); fijar('visible');
  });
}

(async () => {
  const b = await chromium.launch();
  let ok = 0;
  const paso = (txt) => { ok++; console.log('✓', txt); };

  let p = await pagina(b);

  /* Aviso de respaldo (> 14 días) */
  assert.match(await p.locator('[data-aviso="aviso.respaldo"]').textContent(), /hace 26 días/);
  paso('aviso de respaldo con más de 14 días');

  /* Tema */
  await p.getByRole('button', { name: 'Ajustes' }).click();
  await p.locator('label.segmento', { hasText: 'Oscuro' }).click();
  assert.equal(await p.evaluate(() => document.documentElement.dataset.theme), 'oscuro');
  assert.equal(await p.evaluate(() => document.querySelector('meta[name="theme-color"]').content), '#17141F');
  await p.clock.runFor(400);
  await p.reload(); await p.waitForSelector('h1');
  assert.equal(await p.evaluate(() => document.documentElement.dataset.theme), 'oscuro');
  await p.getByRole('button', { name: 'Ajustes' }).click();
  await p.locator('label.segmento', { hasText: 'Automático' }).click();
  paso('tema oscuro elegido, aplicado a la barra y recordado');

  /* Exportar JSON → último respaldo hoy */
  let f = await descargar(p, () => p.getByRole('button', { name: 'Exportar respaldo' }).click());
  assert.equal(f.nombre, 'tavia-respaldo-2026-10-27.json');
  const respaldo = JSON.parse(f.texto);
  assert.equal(respaldo.app, 'tavia');
  assert.equal(respaldo.datos.habits.length, 3);
  assert.match(await p.locator('.seccion', { hasText: 'Tus datos' }).textContent(), /Último respaldo: hoy/);
  assert.equal(await p.locator('[data-aviso="aviso.respaldo"]').count(), 0);
  paso('exportar respaldo JSON y registrar la fecha');

  /* CSV */
  f = await descargar(p, () => p.getByRole('button', { name: 'Exportar a Excel (CSV)' }).click());
  assert.ok(f.texto.startsWith('﻿fecha,habito,estado,valor,unidad,hora,nota'));
  paso('exportar CSV');

  /* Cifrado */
  await p.getByRole('button', { name: 'Exportar cifrado (con contraseña)' }).click();
  let d = p.locator('dialog[data-hoja="contrasena"]');
  await d.getByLabel(/Elige una contraseña/).fill('corta');
  await d.getByLabel('Repite la contraseña').fill('corta');
  await d.getByRole('button', { name: 'Cifrar y exportar' }).click();
  assert.match(await d.locator('.error-campo').textContent(), /al menos 8/);
  await d.getByLabel(/Elige una contraseña/).fill('mi clave segura');
  await d.getByLabel('Repite la contraseña').fill('mi clave segura');
  f = await descargar(p, () => d.getByRole('button', { name: 'Cifrar y exportar' }).click());
  const cifrado = JSON.parse(f.texto);
  assert.equal(cifrado.tipo, 'respaldo-cifrado');
  assert.ok(!f.texto.includes('Meditar'));
  fs.writeFileSync(`${CAPT}/cifrado.json`, f.texto);
  paso('respaldo cifrado (AES-GCM): el archivo no deja leer los hábitos');

  /* Importar: archivo inválido */
  let [chooser] = await Promise.all([p.waitForEvent('filechooser'), p.getByRole('button', { name: 'Importar respaldo' }).click()]);
  await chooser.setFiles({ name: 'x.json', mimeType: 'application/json', buffer: Buffer.from('{"hola": 1}') });
  await p.locator('.tv-deshacer', { hasText: 'no parece un respaldo' }).waitFor();
  paso('importar rechaza un archivo que no es de Tavia sin tocar nada');

  /* Importar cifrado: contraseña mala y luego buena → resumen → combinar → deshacer */
  [chooser] = await Promise.all([p.waitForEvent('filechooser'), p.getByRole('button', { name: 'Importar respaldo' }).click()]);
  await chooser.setFiles(`${CAPT}/cifrado.json`);
  d = p.locator('dialog[data-hoja="contrasena"]');
  await d.getByLabel('Contraseña del respaldo').fill('otra');
  await d.getByRole('button', { name: 'Abrir' }).click();
  await p.locator('.tv-deshacer', { hasText: 'contraseña no es correcta' }).waitFor();
  const otro = semilla();
  otro.habits.push({ id: 'nuevo', nombre: 'Caminar', icono: '🚶', creado: '2026-10-01', frecuencia: { tipo: 'diaria' }, pausas: [], orden: 4 });
  otro.logs.push({ habitId: 'nuevo', fecha: '2026-10-05', estado: 'registrado', valor: 1 }, { habitId: 'nuevo', fecha: '2026-13-45', estado: 'registrado', valor: 1 });
  [chooser] = await Promise.all([p.waitForEvent('filechooser'), p.getByRole('button', { name: 'Importar respaldo' }).click()]);
  await chooser.setFiles({ name: 'otro.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify({ app: 'tavia', exportado: '2026-10-20', datos: otro })) });
  d = p.locator('dialog[data-hoja="importar"]');
  assert.match(await d.textContent(), /4 hábitos/);
  assert.match(await d.textContent(), /1 elemento con datos inválidos se ignorará/);
  await p.screenshot({ path: `${CAPT}/m5-importar.png`, animations: 'disabled' });
  await d.getByRole('button', { name: 'Combinar con lo actual' }).click();
  assert.match(await p.locator('.tv-deshacer').textContent(), /Se agregó 1 hábito y 1 registro/);
  assert.equal(await p.locator('.fila-habito', { hasText: 'Caminar' }).count(), 1);
  await p.getByRole('button', { name: 'Deshacer' }).click();
  assert.equal(await p.locator('.fila-habito', { hasText: 'Caminar' }).count(), 0);
  paso('importar: contraseña incorrecta avisa; resumen con descartados; combinar y deshacer');

  /* Recordatorios: editor, tarjeta al abrir, .ics, aviso del navegador */
  await p.getByRole('button', { name: 'Hoy' }).click();
  await fila(p, 'Leer').locator('.tv-habito__abrir').click();
  await p.locator('dialog[data-hoja="detalle"]').getByRole('button', { name: 'Editar hábito' }).click();
  d = p.locator('dialog[data-hoja="editor"]');
  await d.getByRole('button', { name: 'Agregar hora' }).click();
  await d.locator('input[name="hora"]').fill('09:00');
  await d.getByRole('button', { name: 'Guardar' }).click();
  await p.locator('[data-tarjeta="recordatorios"]', { hasText: 'Leer · 09:00' }).waitFor();
  assert.match(await fila(p, 'Leer').locator('.tv-habito__meta').textContent(), /09:00/);
  await p.getByRole('button', { name: 'Ajustes' }).click();
  f = await descargar(p, () => p.getByRole('button', { name: 'Agregar a mi calendario (.ics)' }).click());
  assert.match(f.texto, /SUMMARY:Tavia: Leer/);
  assert.match(f.texto, /RRULE:FREQ=DAILY/);
  paso('recordatorio: hora en el editor, tarjeta de pendientes al abrir y archivo .ics');

  /* PIN + bloqueo + intentos */
  await p.getByRole('button', { name: 'Activar PIN' }).click();
  d = p.locator('dialog[data-hoja="pin-nuevo"]');
  await d.getByLabel(/Elige un PIN/).fill('12');
  await d.getByLabel('Repite el PIN').fill('12');
  await d.getByRole('button', { name: 'Guardar PIN' }).click();
  assert.match(await d.locator('.error-campo').textContent(), /entre 4 y 8/);
  await d.getByLabel(/Elige un PIN/).fill('2468');
  await d.getByLabel('Repite el PIN').fill('2468');
  await d.getByRole('button', { name: 'Guardar PIN' }).click();
  await p.waitForSelector('dialog[data-hoja="pin-nuevo"]', { state: 'detached', timeout: 20000 });
  await p.clock.runFor(400);
  const guardado = (await leerGuardado(p)).config;
  assert.ok(guardado.pinHash && !JSON.stringify(guardado).includes('2468'));
  await p.locator('#ajuste-bloqueo').selectOption('0');
  await ocultarYVolver(p);
  await p.locator('.bloqueo__caja').waitFor();
  assert.equal(await p.locator('#vista').textContent(), '');
  await p.screenshot({ path: `${CAPT}/m6-bloqueo.png` });
  for (let i = 0; i < 5; i++) {
    await p.locator('#pin-bloqueo').fill('0000');
    await p.getByRole('button', { name: 'Desbloquear' }).click();
    await p.waitForFunction(() => document.querySelector('.bloqueo .error-campo')?.textContent, null, { timeout: 20000 });
  }
  assert.match(await p.locator('.bloqueo .error-campo').textContent(), /Espera \d+ segundos/);
  await p.clock.runFor(400);
  await p.reload(); await p.waitForSelector('.bloqueo__caja');
  assert.match(await p.locator('.bloqueo .error-campo').textContent(), /Espera/);
  await p.clock.fastForward(31_000);
  await p.locator('#pin-bloqueo').fill('2468');
  await p.getByRole('button', { name: 'Desbloquear' }).click();
  await p.waitForSelector('h1.titulo-pantalla', { timeout: 20000 });
  paso('PIN: hash sin el PIN en claro; bloqueo al volver; espera tras 5 fallos que sobrevive a recargar');

  /* Bóveda privada */
  await p.getByRole('button', { name: 'Hoy' }).click();
  await fila(p, 'Meditar').locator('.tv-habito__abrir').click();
  await p.locator('dialog[data-hoja="detalle"]').getByRole('button', { name: 'Editar hábito' }).click();
  d = p.locator('dialog[data-hoja="editor"]');
  await d.locator('label.interruptor', { hasText: 'Privado' }).click();
  await d.getByRole('button', { name: 'Guardar' }).click();
  assert.equal(await fila(p, 'Meditar').count(), 0);
  await p.getByRole('button', { name: 'Mostrar hábitos privados' }).click();
  await p.locator('dialog[data-hoja="pin"] input').fill('2468');
  await p.locator('dialog[data-hoja="pin"]').getByRole('button', { name: 'Desbloquear' }).click();
  await fila(p, 'Meditar').waitFor({ timeout: 20000 });
  assert.match(await fila(p, 'Meditar').textContent(), /Privado/);
  await p.getByRole('button', { name: 'Ocultar hábitos privados' }).click();
  assert.equal(await fila(p, 'Meditar').count(), 0);
  await p.getByRole('button', { name: 'Progreso' }).click();
  assert.equal(await p.locator('.tarjeta-habito', { hasText: 'Meditar' }).count(), 0);
  paso('bóveda privada: oculta en Hoy y Progreso hasta mostrarla con el PIN');

  /* Insights */
  assert.match(await p.locator('.insights').textContent(), /Tu mejor día es el/);
  assert.match(await p.locator('.insights').textContent(), /Marcas la mayoría de tus hábitos/);
  await p.screenshot({ path: `${CAPT}/m7-progreso.png`, fullPage: true });
  paso('insights: mejor día y hora fuerte');

  assert.deepEqual(p.errores, []);
  paso('sin errores de consola');

  /* Ritual + revisión semanal (domingo) */
  const pd = await pagina(b, { hora: '2026-11-01T08:00:00' }); // domingo
  await pd.getByRole('button', { name: /ritual de mañana/i }).click();
  d = pd.locator('dialog[data-hoja="ritual"]');
  assert.match(await d.textContent(), /1 de 2/);
  await pd.screenshot({ path: `${CAPT}/m7-ritual.png`, animations: 'disabled' });
  await d.getByRole('button', { name: 'Hecho' }).click();
  await d.getByRole('button', { name: 'Después' }).click();
  assert.match(await d.textContent(), /Hiciste 1 de 2/);
  await d.getByRole('button', { name: 'Volver a Hoy' }).click();
  assert.equal(await fila(pd, 'Meditar').locator('.tv-check').getAttribute('data-estado'), 'hecho');
  paso('modo Ritual: uno por uno, "Después" no marca nada');

  await pd.locator('[data-tarjeta="semana"]').getByRole('button', { name: 'Hacer la revisión' }).click();
  d = pd.locator('dialog[data-hoja="semana"]');
  assert.match(await d.textContent(), /Lo que funcionó/);
  await d.getByLabel('Un ajuste pequeño para la próxima semana').fill('Meditar antes del café');
  await d.getByRole('button', { name: 'Guardar revisión' }).click();
  assert.equal(await pd.locator('[data-tarjeta="semana"]').count(), 0);
  await pd.clock.runFor(400);
  // Lunes siguiente: el ajuste aparece arriba en Hoy
  await pd.clock.setFixedTime(new Date('2026-11-02T08:00:00'));
  await pd.reload(); await pd.waitForSelector('h1');
  assert.match(await pd.locator('.ajuste-semana').textContent(), /Meditar antes del café/);
  paso('revisión semanal: el domingo se ofrece; el ajuste se muestra la semana siguiente');

  /* Notificación del navegador a la hora (con la app abierta) */
  // Los avisos del sistema solo funcionan en el modo headless nuevo de Chromium.
  const b2 = await chromium.launch({ channel: 'chromium' });
  const pn = await pagina(b2, { hora: '2026-10-27T10:00:00', permisos: ['notifications'] });
  await pn.evaluate(() => navigator.serviceWorker.ready);
  await pn.getByRole('button', { name: 'Ajustes' }).click();
  await pn.locator('label.interruptor', { hasText: 'Avisos del navegador' }).click();
  await pn.getByRole('button', { name: 'Hoy' }).click();
  await fila(pn, 'Leer').locator('.tv-habito__abrir').click();
  await pn.locator('dialog[data-hoja="detalle"]').getByRole('button', { name: 'Editar hábito' }).click();
  d = pn.locator('dialog[data-hoja="editor"]');
  await d.getByRole('button', { name: 'Agregar hora' }).click();
  await d.locator('input[name="hora"]').fill('10:02');
  await d.getByRole('button', { name: 'Guardar' }).click();
  await pn.clock.runFor(3 * 60_000);
  // showNotification es asíncrono: esperamos (con tiempo real, el reloj de la página es falso).
  let notis = [];
  for (let i = 0; i < 40 && !notis.length; i++) {
    notis = await pn.evaluate(async () => (await (await navigator.serviceWorker.getRegistration()).getNotifications()).map((n) => n.title));
    if (!notis.length) await new Promise((r) => setTimeout(r, 100));
  }
  assert.deepEqual(notis, ['Tavia: Leer']);
  paso('recordatorio a la hora: aviso del sistema con la app abierta');

  await b2.close();
  await b.close();
  console.log(`\n${ok} pruebas de punta a punta (M5–M7) OK`);
})().catch((e) => { console.error('✗', e.message); process.exit(1); });
