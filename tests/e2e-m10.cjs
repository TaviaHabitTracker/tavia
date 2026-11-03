// Prueba de punta a punta del Módulo 10: frases y palabras guía.
// Uso: servir la carpeta en http://127.0.0.1:8765 y ejecutar: node tests/e2e-m10.cjs [carpeta-capturas]
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');

const URL_APP = process.env.TAVIA_URL || 'http://127.0.0.1:8765/';
const CAPT = process.argv[2] || '.';
const ARCHIVO = JSON.parse(readFileSync(join(__dirname, '..', 'data', 'frases_tavia.json'), 'utf8'));
const POR_ID = new Map(ARCHIVO.frases.map((f) => [f.id, f]));

function fechas(desde, hasta) {
  const out = [];
  const d = new Date(`${desde}T12:00:00`);
  while (d.toLocaleDateString('sv-SE') <= hasta) { out.push(d.toLocaleDateString('sv-SE')); d.setDate(d.getDate() + 1); }
  return out;
}

const HABITOS = [
  { id: 'med', nombre: 'Meditar', icono: '🧘', color: 'ciruela', tipo: 'si_no', vecesPorDia: 1, frecuencia: { tipo: 'diaria' }, bloque: 'manana', creado: '2026-10-01', pausas: [], orden: 1, identidad: 'cuida su mente', esencial: true },
  { id: 'leer', nombre: 'Leer', icono: '📖', color: 'lago', tipo: 'si_no', vecesPorDia: 1, frecuencia: { tipo: 'diaria' }, bloque: 'noche', creado: '2026-10-01', pausas: [], orden: 2 },
  { id: 'agua', nombre: 'Tomar agua', icono: '💧', color: 'lago', tipo: 'si_no', vecesPorDia: 1, frecuencia: { tipo: 'diaria' }, bloque: 'dia', creado: '2026-10-01', pausas: [], orden: 3 },
];

/** Racha de 16 días (hasta ayer, 26 de octubre). Hoy: martes 27. */
function construyendo() {
  const logs = [];
  for (const f of fechas('2026-10-11', '2026-10-26')) logs.push({ habitId: 'med', fecha: f, estado: 'registrado', valor: 1 });
  return { schemaVersion: 2, habits: HABITOS, logs, revisiones: [], config: { finDelDia: '03:00', ultimoRespaldo: '2026-10-25' } };
}
/** 40 días de racha, pero ayer (26) no se cumplió nada: tropiezo. Estilo Firme para probar que igual es suave. */
function tropiezo(extra = {}) {
  const logs = [];
  for (const f of fechas('2026-09-15', '2026-10-25')) logs.push({ habitId: 'med', fecha: f, estado: 'registrado', valor: 1 });
  return { schemaVersion: 3, habits: HABITOS.map((h) => ({ ...h, creado: '2026-09-15' })), logs, revisiones: [], config: { finDelDia: '03:00', ultimoRespaldo: '2026-10-25', estiloFrases: 'firme' }, ...extra };
}

async function abrir(b, datos, { hora = '2026-10-27T10:00:00', movimiento = 'no-preference', bloquear = null } = {}) {
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, locale: 'es-CL', timezoneId: 'America/Santiago', colorScheme: 'light', reducedMotion: movimiento, serviceWorkers: bloquear ? 'block' : 'allow' });
  const p = await ctx.newPage();
  p.errores = [];
  p.on('console', (m) => { if (['error', 'warning'].includes(m.type()) && !/Service Worker registration blocked/.test(m.text())) p.errores.push(m.text()); });
  p.on('pageerror', (e) => p.errores.push(`PAGEERROR ${e.message}`));
  if (bloquear) await p.route('**/data/frases_tavia.json', bloquear);
  await p.clock.install({ time: new Date(hora) });
  await p.addInitScript((d) => { if (!sessionStorage.getItem('s')) { sessionStorage.setItem('s', '1'); localStorage.setItem('tavia:data', d); } }, JSON.stringify(datos));
  await p.goto(URL_APP);
  await p.waitForSelector('h1');
  return p;
}
const idFrase = async (p, sel = '[data-tarjeta="frase"]') => {
  const txt = (await p.locator(`${sel} .frase__texto`).textContent()).replace(/^«|»$/g, '');
  return ARCHIVO.frases.find((f) => f.texto === txt)?.id;
};

(async () => {
  const b = await chromium.launch();
  let ok = 0;
  const paso = (txt) => { ok++; console.log('✓', txt); };

  /* 1. Construyendo: tarjeta "Tu día" y frase del día con autor y fuente */
  let p = await abrir(b, construyendo());
  const guia = p.locator('[data-tarjeta="guia"]');
  await guia.waitFor();
  assert.equal(await guia.locator('.chip-animo').count(), 4);
  assert.equal(await guia.locator('.chip-guia:not(.chip-guia--mas)').count(), 5);
  const tarjeta = p.locator('[data-tarjeta="frase"]');
  await tarjeta.waitFor();
  assert.equal(await tarjeta.getAttribute('data-contexto'), 'construyendo');
  assert.match(await tarjeta.textContent(), /Paso a paso/i);
  const id1 = await idFrase(p);
  assert.ok(id1, 'la frase mostrada existe en el archivo');
  const f1 = POR_ID.get(id1);
  assert.ok(['suave', 'neutro'].includes(f1.tono), 'estilo Equilibrado: sin tono firme');
  assert.equal(await tarjeta.locator('.frase__autor').textContent(), f1.autor);
  assert.equal(await tarjeta.locator('.frase__fuente').textContent(), f1.fuente);
  assert.equal(await tarjeta.locator('.frase__marca--miel').count(), 0, '«fuente por confirmar» no va en la tarjeta principal');
  if (f1.tipo === 'adaptada') assert.equal(await tarjeta.locator('.frase__marca').textContent(), 'adaptada');
  assert.equal(await p.locator('dialog[open]').count(), 0, 'nunca una ventana que interrumpa');
  await p.screenshot({ path: `${CAPT}/m10-hoy-construyendo.png`, fullPage: true });
  paso('construyendo: tarjeta "Tu día" (4 estados, 5 palabras) y frase del día con autor, fuente y marca «adaptada»');

  /* 2. Elegir palabra (florece) y check-in */
  await guia.locator('.chip-guia', { hasText: 'Constancia' }).click();
  await p.waitForSelector('.chip-palabra', { timeout: 3000 });
  assert.equal(await p.locator('.cabecera .chip-palabra').textContent(), 'Constancia');
  await guia.getByRole('button', { name: 'Con energía' }).click();
  assert.equal(await p.locator('[data-tarjeta="guia"]').count(), 0);
  paso('palabra del día: un toque la elige y queda en el encabezado; con el check-in la tarjeta se va');

  /* 3. Determinista: al recargar, la misma frase */
  await p.reload();
  await p.waitForSelector('[data-tarjeta="frase"]');
  assert.equal(await idFrase(p), id1);
  assert.equal(await p.locator('.cabecera .chip-palabra').textContent(), 'Constancia');
  paso('recargar no cambia la frase del día ni la palabra');

  /* 4. Favorita, cerrar con Deshacer */
  await p.locator('[data-tarjeta="frase"]').getByRole('button', { name: 'Guardar en favoritas' }).click();
  assert.equal(await p.locator('[data-tarjeta="frase"] [aria-pressed="true"]').count(), 1);
  await p.getByRole('button', { name: 'Ocultar la frase de hoy' }).click();
  assert.equal(await p.locator('[data-tarjeta="frase"]').count(), 0);
  await p.locator('.tv-deshacer__accion').click();
  assert.equal(await p.locator('[data-tarjeta="frase"]').count(), 1);
  paso('favorita con un toque; ocultar la frase se puede deshacer');

  /* 5. Hoja de la palabra: flechas, deslizar, Sorpréndeme */
  await p.locator('.cabecera .chip-palabra').click();
  const hojaP = p.locator('dialog[data-hoja="palabra"]');
  await hojaP.waitFor();
  assert.equal(await hojaP.locator('.palabra__nombre').textContent(), 'Constancia');
  assert.match(await hojaP.textContent(), /Es tu palabra de hoy/);
  assert.ok((await hojaP.locator('.frase__autor').textContent()).length > 0);
  await hojaP.getByRole('button', { name: 'Palabra siguiente' }).click();
  assert.equal(await hojaP.locator('.palabra__nombre').textContent(), 'Calma');
  await hojaP.getByRole('button', { name: 'Sorpréndeme' }).click();
  assert.notEqual(await hojaP.locator('.palabra__nombre').textContent(), 'Calma');
  await p.screenshot({ path: `${CAPT}/m10-palabra.png` });
  await hojaP.getByRole('button', { name: 'Cerrar' }).first().click();
  paso('palabra: significado y frase; flechas y Sorpréndeme cambian de palabra');

  /* 6. Cierre: al completar el día aparece una segunda frase (distinta). Máximo 2. */
  for (const n of ['Meditar', 'Tomar agua', 'Leer']) await p.locator('li.tv-habito', { hasText: n }).locator('.tv-check').click();
  const cierre = p.locator('[data-tarjeta="cierre"]');
  await cierre.waitFor();
  assert.equal(await cierre.getAttribute('data-contexto'), 'dia_completo');
  const idC = await idFrase(p, '[data-tarjeta="cierre"]');
  assert.ok(idC && idC !== id1);
  assert.equal(await p.locator('.tarjeta-frase').count(), 2);
  assert.match(await p.locator('li.tv-habito', { hasText: 'Meditar' }).textContent(), /Soy una persona que cuida su mente/);
  await p.screenshot({ path: `${CAPT}/m10-cierre.png`, fullPage: true });
  // Desmarcar oculta el cierre de "día completo"; volver a marcar muestra el MISMO (una vez al día).
  await p.locator('li.tv-habito', { hasText: 'Leer' }).locator('.tv-check').click();
  assert.equal(await p.locator('[data-tarjeta="cierre"]').count(), 0);
  await p.locator('li.tv-habito', { hasText: 'Leer' }).locator('.tv-check').click();
  assert.equal(await idFrase(p, '[data-tarjeta="cierre"]'), idC);
  paso('cierre: al completar el día, una frase distinta; nunca más de 2 al día');

  /* 7. Colección: favoritas y "fuente por confirmar" */
  await p.getByRole('button', { name: 'Ajustes', exact: true }).click();
  await p.locator('#frases').scrollIntoViewIfNeeded();
  await p.getByRole('button', { name: /Ver la colección/ }).click();
  const col = p.locator('dialog[data-hoja="coleccion"]');
  await col.waitFor();
  assert.equal(await col.locator('.coleccion__item').count(), 1);
  await col.locator('label.segmento', { hasText: 'Todas' }).click();
  assert.equal(await col.locator('.coleccion__item').count(), ARCHIVO.frases.length);
  assert.equal(await col.locator('.frase__marca--miel').count(), ARCHIVO.frases.filter((f) => f.confianza === 'Media').length);
  await p.screenshot({ path: `${CAPT}/m10-coleccion.png` });
  await col.getByRole('button', { name: 'Cerrar' }).first().click();
  paso('colección: tus favoritas, todas por contexto y la marca «fuente por confirmar»');

  /* 8. Tarjeta compartible: canvas con la frase completa */
  await p.getByRole('button', { name: 'Hoy', exact: true }).click();
  await p.locator('[data-tarjeta="frase"]').getByRole('button', { name: 'Compartir como imagen' }).click();
  const hojaT = p.locator('dialog[data-hoja="tarjeta-frase"]');
  await hojaT.waitFor();
  const pintado = await hojaT.locator('canvas').evaluate((c) => {
    const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
    let distintos = 0;
    for (let i = 0; i < d.length; i += 4000) if (d[i] !== d[0]) distintos++;
    return { w: c.width, h: c.height, distintos };
  });
  assert.equal(pintado.w, 1080);
  assert.equal(pintado.h, 1350);
  assert.ok(pintado.distintos > 20, 'el lienzo tiene texto dibujado');
  assert.match(await hojaT.locator('canvas').getAttribute('aria-label'), new RegExp(POR_ID.get(id1).autor));
  await hojaT.locator('canvas').screenshot({ path: `${CAPT}/m10-tarjeta.png` });
  assert.deepEqual(p.errores, []);
  await p.context().close();
  paso('tarjeta compartible 1080×1350 con frase, autor y fuente; sin errores de consola');

  /* 9. Tropiezo con estilo Firme: igual solo suave. Abrumado → día liviano → solo lo esencial */
  p = await abrir(b, tropiezo());
  await p.waitForSelector('[data-tarjeta="frase"]');
  assert.equal(await p.locator('[data-tarjeta="frase"]').getAttribute('data-contexto'), 'tropiezo');
  assert.equal(POR_ID.get(await idFrase(p)).tono, 'suave');
  const sug = await p.locator('[data-tarjeta="guia"] .chip-guia:not(.chip-guia--mas)').allTextContents();
  assert.deepEqual(sug, ['Calma', 'Amabilidad', 'Descanso', 'Paciencia', 'Resiliencia']);
  await p.getByRole('button', { name: 'Abrumado' }).click();
  await p.getByRole('button', { name: 'Solo lo esencial' }).click();
  assert.match(await p.locator('.banner-minimo').textContent(), /solo lo esencial/i);
  assert.equal(await p.locator('li.tv-habito').count(), 1);
  assert.match(await p.locator('li.tv-habito').textContent(), /Meditar/);
  await p.screenshot({ path: `${CAPT}/m10-tropiezo-minimo.png`, fullPage: true });
  await p.getByRole('button', { name: 'Ver todo' }).click();
  assert.equal(await p.locator('li.tv-habito').count(), 3);
  assert.deepEqual(p.errores, []);
  await p.context().close();
  paso('tropiezo con estilo Firme: frase suave y palabras que acompañan; abrumado → solo lo esencial');

  /* 10. Abrumado varios días: sugerencia delicada; "Descansar hoy" con Deshacer */
  p = await abrir(b, tropiezo({ palabras: { porDia: {}, checkin: { '2026-10-25': 'abrumado', '2026-10-26': 'abrumado' }, minimo: null, identidad: [] } }));
  await p.getByRole('button', { name: 'Abrumado' }).click();
  assert.match(await p.locator('.guia__persona').textContent(), /alguien de confianza/);
  await p.getByRole('button', { name: 'Descansar hoy' }).click();
  assert.equal(await p.locator('li.tv-habito[data-estado="descanso"]').count(), 3);
  await p.locator('.tv-deshacer__accion').click();
  assert.equal(await p.locator('li.tv-habito[data-estado="descanso"]').count(), 0);
  await p.context().close();
  paso('tres días abrumado: sugiere hablar con alguien, sin alarmar; descansar hoy se puede deshacer');

  /* 11. Regreso tras 10 días */
  const reg = construyendo();
  reg.logs = reg.logs.filter((l) => l.fecha <= '2026-10-16');
  p = await abrir(b, reg);
  await p.waitForSelector('[data-tarjeta="frase"]');
  assert.equal(await p.locator('[data-tarjeta="frase"]').getAttribute('data-contexto'), 'regreso');
  assert.match(await p.locator('[data-tarjeta="frase"]').textContent(), /Qué bueno verte/);
  await p.context().close();
  paso('vuelta tras 10 días: frase de regreso, sin reproche');

  /* 12. Modo sin frases y "Mi frase" larga */
  p = await abrir(b, construyendo());
  await p.waitForSelector('[data-tarjeta="frase"]');
  await p.getByRole('button', { name: 'Ajustes', exact: true }).click();
  const largo = 'Voy a mi ritmo y vuelvo siempre, aunque sea poquito, porque esto es para mí. '.repeat(4);
  await p.locator('#ajuste-mi-frase').fill(largo);
  await p.locator('#ajuste-mi-frase').blur();
  assert.ok((await p.locator('#ajuste-mi-frase').inputValue()).length <= 200);
  await p.getByRole('switch', { name: 'Mostrar frases' }).click();
  await p.getByRole('button', { name: 'Hoy', exact: true }).click();
  assert.equal(await p.locator('.tarjeta-frase').count(), 0);
  assert.equal(await p.locator('[data-tarjeta="guia"]').count(), 1, 'las palabras son independientes de las frases');
  await p.context().close();
  paso('modo sin frases: no aparece ninguna; "Mi frase" respeta el límite de 200');

  /* 13. Sin archivo (sin internet) y archivo corrupto: la app sigue, sin errores */
  for (const [nombre, ruta] of [['sin red', (r) => r.abort()], ['corrupto', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: '{"frases": [ {"id": 1}, "x" ' })]]) {
    p = await abrir(b, construyendo(), { bloquear: ruta });
    await p.waitForSelector('li.tv-habito');
    await p.waitForTimeout(300);
    assert.equal(await p.locator('.tarjeta-frase').count(), 0, nombre);
    assert.equal(await p.locator('[data-tarjeta="guia"]').count(), 1, nombre);
    assert.deepEqual(p.errores.filter((e) => !/Failed to load resource|ERR_FAILED/.test(e)), [], nombre);
    await p.context().close();
  }
  paso('sin internet o con el JSON dañado: sin frases y sin errores; el resto funciona');

  /* 14. Movimiento reducido: no se dibujan pétalos */
  p = await abrir(b, construyendo(), { movimiento: 'reduce' });
  await p.locator('[data-tarjeta="guia"] .chip-guia', { hasText: 'Paciencia' }).click();
  assert.equal(await p.locator('.petalos').count(), 0);
  assert.equal(await p.locator('.cabecera .chip-palabra').textContent(), 'Paciencia');
  await p.context().close();
  paso('movimiento reducido: la palabra se elige sin animación');

  /* 15. Revisión semanal: frase de "revisión", palabras de la semana y observación sin causalidad */
  const sem = construyendo();
  sem.palabras = { porDia: { '2026-10-26': 'calma', '2026-10-27': 'calma', '2026-10-28': 'calma', '2026-10-29': 'foco' }, checkin: {}, minimo: null, identidad: ['calma', 'foco'] };
  for (const f of ['2026-10-27', '2026-10-28']) for (const h of ['med', 'leer', 'agua']) sem.logs.push({ habitId: h, fecha: f, estado: 'registrado', valor: 1 });
  sem.logs.push({ habitId: 'med', fecha: '2026-10-29', estado: 'registrado', valor: 1 });
  p = await abrir(b, sem, { hora: '2026-11-01T11:00:00' }); // domingo
  await p.locator('[data-tarjeta="semana"]').getByRole('button').first().click();
  const hojaS = p.locator('dialog[data-hoja="semana"]');
  await hojaS.waitFor();
  assert.equal(await hojaS.locator('.frase-revision').count(), 2);
  assert.match(await hojaS.textContent(), /Tus palabras de la semana/);
  assert.match(await hojaS.locator('.semana-palabras__obs').textContent(), /Calma.*observación, no una causa/);
  await p.screenshot({ path: `${CAPT}/m10-revision.png`, fullPage: true });
  assert.deepEqual(p.errores, []);
  await p.context().close();
  paso('revisión semanal: frase para mirar atrás, palabras de la semana y una observación sin causalidad');

  await b.close();
  console.log(`\n${ok} pruebas de punta a punta (M10) OK`);
})().catch((e) => { console.error(e); process.exit(1); });
