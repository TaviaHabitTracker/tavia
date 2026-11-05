// Prueba de punta a punta de los temas de colección en prueba (0.15).
// Revisa que cada tema pinte sus colores y su dibujo en Hoy, la colección, el modo prueba,
// la pantalla al subir de nivel y que no haya errores de consola (incluida la CSP).
// Uso: servir la carpeta en http://127.0.0.1:8765 y ejecutar: node tests/e2e-coleccion.cjs [carpeta-capturas]
const { chromium } = require('playwright');
const assert = require('node:assert/strict');

const URL_APP = process.env.TAVIA_URL || 'http://127.0.0.1:8765/';
const CAPT = process.argv[2] || '.';
const TEMAS = ['minas', 'condor', 'cielo', 'oceano', 'araucaria', 'cumbre', 'origami', 'arquitectura', 'navegante', 'panal'];

function fechas(desde, hasta) {
  const out = [];
  const d = new Date(`${desde}T12:00:00`);
  while (d.toLocaleDateString('sv-SE') <= hasta) { out.push(d.toLocaleDateString('sv-SE')); d.setDate(d.getDate() + 1); }
  return out;
}

// Cuatro hábitos; 28 días registrados (nivel 2), dos días en pausa; hoy van 2 de 4.
function semilla(config) {
  const ids = ['agua', 'leer', 'med', 'cam'];
  const logs = [];
  fechas('2026-10-05', '2026-11-02').forEach((f, i) => {
    if (f === '2026-10-10' || f === '2026-10-18') return;
    const cuantos = [4, 4, 3, 4, 2, 4, 1, 4, 3][i % 9];
    for (const id of ids.slice(0, cuantos)) logs.push({ habitId: id, fecha: f, estado: 'registrado', valor: 1, registradoEn: '08:00' });
  });
  for (const id of ['agua', 'leer']) logs.push({ habitId: id, fecha: '2026-11-03', estado: 'registrado', valor: 1, registradoEn: '08:00' });
  const h = (id, nombre, icono, color, bloque, orden) => ({ id, nombre, icono, color, tipo: 'si_no', vecesPorDia: 1, frecuencia: { tipo: 'diaria' }, bloque, creado: '2026-10-05', pausas: [], orden });
  return {
    schemaVersion: 2,
    habits: [h('agua', 'Tomar agua', '💧', 'lago', 'manana', 1), h('leer', 'Leer', '📖', 'ciruela', 'noche', 2), h('med', 'Meditar', '🧘', 'pino', 'manana', 3), h('cam', 'Caminar', '🚶', 'musgo', 'dia', 4)],
    logs, revisiones: [], config: { finDelDia: '03:00', ultimoRespaldo: '2026-11-01', manifiestoModo: 'no', frasesActivas: false, ...config },
  };
}

async function abrir(b, config, op = {}) {
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, locale: 'es-CL', timezoneId: 'America/Santiago', reducedMotion: 'reduce', ...op });
  const p = await ctx.newPage();
  await p.clock.install({ time: new Date('2026-11-03T10:00:00') });
  await p.addInitScript((d) => { if (!sessionStorage.getItem('s')) { sessionStorage.setItem('s', '1'); localStorage.setItem('tavia:data', d); } }, JSON.stringify(semilla(config)));
  return { ctx, p };
}

(async () => {
  const b = await chromium.launch();
  let ok = 0;
  const paso = (txt) => { ok++; console.log('✓', txt); };
  const errores = [];
  const vigilar = (p, donde) => {
    p.on('console', (m) => { if (['error', 'warning'].includes(m.type())) errores.push(`${donde}: ${m.text()}`); });
    p.on('pageerror', (e) => errores.push(`${donde} PAGEERROR ${e.message}`));
  };

  // Cada tema en el nivel 1 y en el nivel 5 (con días simulados): colores en la raíz y dibujo en Hoy.
  for (const tema of TEMAS) {
    for (const nivel of [1, 5]) {
      const { ctx, p } = await abrir(b, { coleccion: tema, coleccionPrueba: nivel === 1 ? 3 : 160 });
      vigilar(p, `${tema}/${nivel}`);
      await p.goto(URL_APP + '#hoy');
      await p.waitForSelector('.panel-dia__coleccion .coleccion-arte');
      await p.evaluate(() => document.fonts.ready);
      const raiz = await p.evaluate(() => ({ c: document.documentElement.dataset.coleccion, n: document.documentElement.dataset.nivel, fondo: getComputedStyle(document.body).backgroundColor }));
      assert.equal(raiz.c, tema);
      assert.equal(raiz.n, String(nivel));
      const piezas = await p.locator('.panel-dia__coleccion svg *').count();
      assert.ok(piezas > 4, `${tema} ${nivel}: el dibujo tiene piezas`);
      const anillo = await p.locator('.coleccion-arte__anillo').getAttribute('stroke-dasharray');
      assert.equal(anillo, '50 100', `${tema}: 2 de 4 hábitos`);
      await p.screenshot({ path: `${CAPT}/col-${tema}-n${nivel}.png` });
      await ctx.close();
    }
    paso(`${tema}: colores y dibujo en Hoy (niveles 1 y 5)`);
  }

  // Colección desde Ajustes: elegir tema, modo prueba, subir de nivel y volver a «ninguno».
  const { ctx, p } = await abrir(b, {});
  vigilar(p, 'coleccion');
  await p.goto(URL_APP + '#ajustes');
  await p.locator('[data-foco="abrir-coleccion"]').click();
  await p.waitForSelector('[data-hoja="coleccion"]');
  assert.equal(await p.locator('.coleccion-tema').count(), 10);
  // 28 días registrados reales → nivel 2: dos baldosas ganadas y tres «próximo» por tema.
  assert.equal(await p.locator('.coleccion-tema').first().locator('.coleccion-baldosa--proxima').count(), 3);
  await p.screenshot({ path: `${CAPT}/col-hoja.png` });
  await p.locator('input[name="coleccion"][value="cielo"]').check();
  await p.waitForFunction(() => document.documentElement.dataset.coleccion === 'cielo');
  paso('Colección: 10 temas, lo ganado y lo próximo; elegir uno lo aplica');

  await p.locator('#coleccion-prueba').check();
  await p.waitForSelector('#coleccion-prueba-dias');
  await p.locator('[data-foco="coleccion-salto-5"]').click();
  await p.waitForSelector('[data-hoja="subida"]');
  assert.match(await p.locator('[data-hoja="subida"] .tv-hoja__titulo').textContent(), /Tu constelación/);
  await p.screenshot({ path: `${CAPT}/col-subida.png` });
  await p.locator('[data-hoja="subida"] .tv-boton--secundario').click();
  await p.waitForFunction(() => document.documentElement.dataset.nivel === '5');
  paso('Modo prueba: saltar al nivel 5 muestra la pantalla de subida, sin confeti');

  await new Promise((r) => setTimeout(r, 1200)); // el guardado agrupa cambios
  await p.reload();
  await p.waitForSelector('.panel-dia, [data-foco="abrir-coleccion"]');
  assert.equal(await p.evaluate(() => document.documentElement.dataset.coleccion), 'cielo');
  await p.locator('[data-foco="abrir-coleccion"]').first().click();
  await p.waitForSelector('[data-hoja="coleccion"]');
  await p.locator('input[name="coleccion"][value=""]').check();
  await p.waitForFunction(() => !document.documentElement.dataset.coleccion && !document.documentElement.style.getPropertyValue('--fondo'));
  paso('Se recuerda al volver a abrir y «Sin tema» deja la app como siempre');
  await ctx.close();

  // Subir de nivel con días reales: marcar el último hábito del día 30 abre la pantalla.
  {
    const { ctx: c2, p: p2 } = await abrir(b, { coleccion: 'minas' });
    vigilar(p2, 'subida-real');
    await p2.goto(URL_APP + '#hoy');
    await p2.waitForSelector('.panel-dia__coleccion');
    const dias = await p2.evaluate(() => document.documentElement.dataset.nivel);
    assert.equal(dias, '2');
    paso('Días reales: 28 días registrados = nivel 2 (Carbón)');
    await c2.close();
  }

  // 0.15.1: cada tema tiene su animación al subir de nivel y los temas llevan el sello Pro (gratis en la beta).
  {
    const ANIM = { minas: 'brillo', condor: 'alas', cielo: 'estrellas', oceano: 'burbujas', araucaria: 'crecer', cumbre: 'ruta', origami: 'plegar', arquitectura: 'trazar', navegante: 'girar', panal: 'llenar' };
    const { ctx: c3, p: p3 } = await abrir(b, { coleccionPrueba: 160 }, { reducedMotion: 'no-preference' });
    vigilar(p3, 'animaciones');
    await p3.goto(URL_APP + '#ajustes');
    assert.match(await p3.locator('.coleccion-abrir .sello-pro').textContent(), /PRO.*beta/i);
    await p3.locator('[data-foco="abrir-coleccion"]').click();
    await p3.waitForSelector('[data-hoja="coleccion"]');
    assert.equal(await p3.locator('.coleccion-tema .sello-pro').count(), 10);
    for (const tema of TEMAS) {
      await p3.locator(`[data-foco="coleccion-ver-${tema}"]`).click();
      await p3.waitForSelector('[data-hoja="subida"]');
      assert.equal(await p3.locator('[data-hoja="subida"] .subida__arte').getAttribute('data-anim'), ANIM[tema]);
      // La animación corre (no está quieta) y termina en menos de 2 s.
      const corre = await p3.evaluate(() => document.getAnimations().some((a) => a.playState === 'running' && a.effect?.target?.closest?.('.subida__arte')));
      assert.ok(corre, `${tema}: la animación corre`);
      await p3.waitForTimeout(450);
      await p3.locator('[data-hoja="subida"]').screenshot({ path: `${CAPT}/anim-${tema}-medio.png` });
      await p3.waitForTimeout(1700);
      const quedan = await p3.evaluate(() => document.getAnimations().filter((a) => a.playState === 'running' && a.effect?.target?.closest?.('.subida__arte')).length);
      assert.equal(quedan, 0, `${tema}: termina antes de 2,2 s`);
      // Elegir el tema no debe dispararse al tocar «Ver animación».
      await p3.locator('[data-hoja="subida"] .tv-boton--secundario').click();
      await p3.waitForSelector('[data-hoja="subida"]', { state: 'detached' });
    }
    assert.equal(await p3.evaluate(() => document.documentElement.dataset.coleccion), undefined);
    paso('Animación propia por tema (< 2 s) y sello Pro · gratis en la beta');
    await c3.close();
  }

  // 0.15.4: en Hoy el dibujo late al marcar un hábito y brilla al completar el día.
  {
    const { ctx: c4, p: p4 } = await abrir(b, { coleccion: 'navegante', coleccionPrueba: 160 }, { reducedMotion: 'no-preference' });
    vigilar(p4, 'hoy-movimiento');
    await p4.goto(URL_APP + '#hoy');
    await p4.waitForSelector('.panel-dia__coleccion');
    await p4.locator('[data-foco="check-med"]').click();
    await p4.waitForSelector('.panel-dia__coleccion--late');
    await p4.locator('[data-foco="check-cam"]').click();
    await p4.waitForSelector('.panel-dia__coleccion--florece');
    assert.equal(await p4.locator('.coleccion-arte__anillo').getAttribute('stroke-dasharray'), '100 100');
    paso('Hoy: el dibujo late al marcar y brilla al completar el día');
    await c4.close();
  }

  assert.deepEqual(errores, []);
  paso('sin errores de consola');
  await b.close();
  console.log(`\n${ok} pruebas de punta a punta (colección) OK`);
})().catch((e) => { console.error(e); process.exit(1); });
