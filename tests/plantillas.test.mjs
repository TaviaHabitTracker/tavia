// Pruebas del Módulo 12 · P1: esquema del catálogo, validador y linter de contenido.
// Ejecutar con: TZ=America/Santiago node --test tests/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  validarCatalogo, sanearRutina, sanearReto, sanearHabitoPlantilla, frecuenciaPlantilla,
  leerArchivoRutina, archivoRutina, aEntradaHabito, tieneClavePeligrosa, LIMITES, ICONOS_PLANTILLA,
} from '../js/plantillas.js';
import { revisarTexto, revisarRutina, revisarReto, revisarCatalogo } from './plantillas-linter.mjs';
import { validarEntrada, crearModelo } from '../js/modelo.js';
import { datosVacios, PALABRAS_GUIA } from '../js/esquema.js';

const HOY = '2026-11-04';

/* ---------- Fábricas ---------- */

const habito = (extra = {}) => ({
  nombre: 'Caminar', icono: '🚶', tipo: 'tiempo', meta: { modo: 'al_menos', valor: 10 },
  frecuencia: { tipo: 'diaria' }, bloque: 'tarde', horaSugerida: '18:30',
  identidad: 'Soy una persona que se mueve a su ritmo.', pregunta: '¿Salimos a caminar un rato?',
  versionMinima: 'Camina 2 minutos, aunque sea dentro de la casa.', nota: 'Elige un camino que te guste.',
  ...extra,
});
const rutina = (extra = {}) => ({
  id: 'caminar-cada-dia', nombre: 'Caminar cada día', descripcion: 'Un paseo corto que cabe en cualquier tarde.',
  objetivo: 'moverme', momento: 'tarde', minutosPorDia: 10, nivel: 'suave', categoria: 'movimiento',
  etiquetas: ['aire libre'], habitos: [habito()], escalera: [5, 8, 12, 15], ...extra,
});
const reto = (extra = {}) => ({
  id: 'lectura-21', nombre: 'Lectura 21 días', descripcion: 'Diez páginas al día, a tu ritmo.', duracionDias: 21,
  categoria: 'estudio', hitos: [7, 14], textoCierre: 'Cada página que leíste es tuya.',
  habito: habito({ nombre: 'Leer', icono: '📖', tipo: 'cantidad', meta: { modo: 'al_menos', valor: 10, unidad: 'páginas' }, versionMinima: 'Lee una página.' }),
  ...extra,
});
const catalogo = (extra = {}) => ({ formato: 1, version: 3, rutinas: [rutina()], retos: [reto()], ...extra });

/* ---------- El archivo real ---------- */

test('el catálogo de la app es válido y pasa el linter', () => {
  const raw = JSON.parse(readFileSync(new URL('../data/plantillas_tavia.json', import.meta.url), 'utf8'));
  const cat = validarCatalogo(raw);
  assert.equal(cat.descartadas.length, 0, JSON.stringify(cat.descartadas));
  assert.deepEqual(cat.avisos, [], 'sin íconos ni frecuencias aproximadas');
  assert.ok(cat.rutinas.length >= 24, 'al menos 24 rutinas');
  assert.ok(cat.retos.length >= 6, 'al menos 6 retos');
  for (const c of ['manana', 'noche', 'estudio', 'movimiento', 'calma', 'hogar', 'finanzas', 'trabajo', 'cuidado', 'especiales']) {
    assert.ok(cat.rutinas.some((r) => r.categoria === c), `categoría ${c}`);
  }
  assert.ok(cat.rutinas.every((r) => !r.palabraGuia || PALABRAS_GUIA.includes(r.palabraGuia)), 'palabras guía existentes');
  const r = revisarCatalogo(cat);
  assert.ok(r.ok, JSON.stringify(r.problemas, null, 1));
});

/* ---------- Validador ---------- */

test('una rutina bien hecha pasa entera', () => {
  const cat = validarCatalogo(catalogo());
  assert.equal(cat.rutinas.length, 1);
  assert.equal(cat.retos.length, 1);
  assert.equal(cat.version, 3);
  assert.deepEqual(cat.descartadas, []);
  const r = cat.rutinas[0];
  assert.equal(r.avisoCuerpo, true, 'movimiento lleva «escucha a tu cuerpo»');
  assert.equal(r.habitos[0].meta.unidad, 'min', 'tiempo se guarda en minutos');
  assert.deepEqual(r.escalera, [5, 8, 12, 15]);
});

test('lo inválido se descarta con su motivo y no rompe lo demás', () => {
  const cat = validarCatalogo(catalogo({
    rutinas: [rutina(), rutina({ id: 'Mal Id' }), rutina({ id: 'sin-habitos', habitos: [] }), rutina({ id: 'otra', categoria: 'dietas' }), 'texto', null],
  }));
  assert.equal(cat.rutinas.length, 1);
  assert.equal(cat.descartadas.length, 5);
  assert.ok(cat.descartadas.some((d) => d.motivos.includes('rutina.categoria')));
});

test('ids repetidos: se queda el primero', () => {
  const cat = validarCatalogo(catalogo({ rutinas: [rutina(), rutina({ nombre: 'Copia' })] }));
  assert.equal(cat.rutinas.length, 1);
  assert.equal(cat.rutinas[0].nombre, 'Caminar cada día');
  assert.deepEqual(cat.descartadas[0].motivos, ['id_repetido']);
});

test('catálogo que no es objeto, de otro formato o con claves peligrosas: vacío, sin lanzar', () => {
  for (const raw of [null, 'x', [], 42, { formato: 2, rutinas: [] }]) {
    const c = validarCatalogo(raw);
    assert.equal(c.rutinas.length, 0);
    assert.equal(c.retos.length, 0);
  }
  const malo = JSON.parse('{"formato":1,"rutinas":[{"id":"a","__proto__":{"x":1}}]}');
  assert.equal(validarCatalogo(malo).descartadas[0].motivos[0], 'catalogo.clave_peligrosa');
  assert.ok(tieneClavePeligrosa({ a: [{ b: { constructor: 1 } }] }));
  assert.ok(tieneClavePeligrosa({ prototype: 1 }));
  assert.ok(!tieneClavePeligrosa({ a: [{ b: 'constructor' }] }), 'como valor no molesta');
});

test('un hábito sin versión mínima no entra', () => {
  const s = sanearHabitoPlantilla(habito({ versionMinima: '  ' }));
  assert.equal(s.habito, null);
  assert.ok(s.motivos.includes('habito.sin_version_minima'));
});

test('íconos fuera del set (o 💊 / 🥗) se cambian por el brote con aviso', () => {
  for (const icono of ['💊', '🥗', '<img src=x>', '🍔']) {
    const s = sanearHabitoPlantilla(habito({ icono }));
    assert.equal(s.habito.icono, '🌱');
    assert.ok(s.avisos.includes('habito.icono_reemplazado'));
  }
  assert.ok(!ICONOS_PLANTILLA.includes('💊') && !ICONOS_PLANTILLA.includes('🥗'));
});

test('frecuencias que la app no soporta: la más cercana, con aviso', () => {
  assert.deepEqual(frecuenciaPlantilla({ tipo: 'diaria' }), { frecuencia: { tipo: 'diaria' }, aproximada: false });
  assert.deepEqual(frecuenciaPlantilla({ tipo: 'semanal' }).frecuencia, { tipo: 'semanal_n', n: 1 });
  assert.deepEqual(frecuenciaPlantilla({ tipo: 'lunes_a_viernes' }).frecuencia, { tipo: 'dias_fijos', dias: [1, 2, 3, 4, 5] });
  const mensual = frecuenciaPlantilla({ tipo: 'mensual' });
  assert.equal(mensual.aproximada, true);
  assert.deepEqual(mensual.frecuencia, { tipo: 'diaria' });
  assert.equal(frecuenciaPlantilla({ tipo: 'semanal_n', n: 9 }).aproximada, true);
  assert.equal(frecuenciaPlantilla({ tipo: 'dias_fijos', dias: [1, 3, 5] }).aproximada, false);
  const s = sanearRutina(rutina({ habitos: [habito({ frecuencia: { tipo: 'mensual' } })] }));
  assert.ok(s.avisos.includes('habito.frecuencia_aproximada#0'));
});

test('textos: sin caracteres de control y recortados al límite', () => {
  const s = sanearHabitoPlantilla(habito({ nombre: `A\u0000B\nC${'x'.repeat(200)}` }));
  assert.ok(!/[\u0000-\u001F]/.test(s.habito.nombre));
  assert.ok(s.habito.nombre.length <= LIMITES.nombre);
});

test('escalera que no sube se descarta (es solo sugerencia)', () => {
  assert.deepEqual(sanearRutina(rutina({ escalera: [5, 5, 8] })).rutina.escalera, []);
  assert.deepEqual(sanearRutina(rutina({ escalera: [15, 10] })).rutina.escalera, []);
  assert.deepEqual(sanearRutina(rutina({ escalera: 'mucho' })).rutina.escalera, []);
});

test('calma y noche nacen sensibles; estudio no', () => {
  assert.equal(sanearRutina(rutina({ categoria: 'calma' })).rutina.sensible, true);
  assert.equal(sanearRutina(rutina({ categoria: 'noche' })).rutina.sensible, true);
  assert.equal(sanearRutina(rutina({ categoria: 'estudio' })).rutina.sensible, false);
});

test('retos: solo 14, 21 o 30 días; hitos dentro del reto y ordenados', () => {
  assert.equal(sanearReto(reto({ duracionDias: 66 })).reto, null);
  const r = sanearReto(reto({ hitos: [14, 7, 21, 0, 7, 'x'] })).reto;
  assert.deepEqual(r.hitos, [7, 14], 'el día 21 es el cierre, no un hito');
});

/* ---------- Archivo de rutina propia ---------- */

test('exportar e importar una rutina ida y vuelta', () => {
  const texto = archivoRutina(rutina());
  const r = leerArchivoRutina(texto);
  assert.ok(r.ok);
  assert.equal(r.rutina.nombre, 'Caminar cada día');
  assert.ok(!/registro|logs|creado|fecha/i.test(texto), 'solo la plantilla, sin datos de la persona');
});

test('archivo malicioso, corrupto o enorme: se rechaza sin lanzar', () => {
  const casos = {
    'importar.no_es_json': '{ esto no es json',
    'importar.formato': JSON.stringify({ tipo: 'otra-app', formato: 1, rutina: rutina() }),
    'importar.clave_peligrosa': '{"tipo":"tavia-rutina","formato":1,"rutina":{"constructor":{"prototype":{"x":1}}}}',
    'importar.muy_grande': JSON.stringify({ tipo: 'tavia-rutina', formato: 1, rutina: rutina({ descripcion: 'x'.repeat(70_000) }) }),
    'importar.demasiados_habitos': JSON.stringify({ tipo: 'tavia-rutina', formato: 1, rutina: rutina({ habitos: Array.from({ length: 13 }, () => habito()) }) }),
    'importar.rutina_invalida': JSON.stringify({ tipo: 'tavia-rutina', formato: 1, rutina: { id: 'x' } }),
  };
  for (const [error, texto] of Object.entries(casos)) assert.equal(leerArchivoRutina(texto).error, error, error);
  assert.equal(leerArchivoRutina(null).ok, false);
  const anidado = '{"tipo":"tavia-rutina","formato":1,"rutina":' + '{"a":'.repeat(50) + '1' + '}'.repeat(50) + '}';
  assert.equal(leerArchivoRutina(anidado).ok, false);
  assert.equal(({}).x, undefined, 'el prototipo de Object sigue limpio');
});

test('fuzz: 2.000 rutinas al azar nunca lanzan', () => {
  let semilla = 7;
  const azar = () => ((semilla = (semilla * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);
  const valores = [null, undefined, 0, -1, 1e9, NaN, '', 'x', [], {}, true, '__proto__', [1, 2], { tipo: 'diaria' }];
  const elegir = () => valores[Math.floor(azar() * valores.length)];
  for (let i = 0; i < 2000; i++) {
    const base = rutina();
    for (const k of Object.keys(base)) if (azar() < 0.3) base[k] = elegir();
    if (Array.isArray(base.habitos)) for (const h of base.habitos) for (const k of Object.keys(h)) if (azar() < 0.3) h[k] = elegir();
    assert.doesNotThrow(() => validarCatalogo({ formato: 1, rutinas: [base], retos: [reto({ habito: elegir() })] }));
    assert.doesNotThrow(() => leerArchivoRutina(JSON.stringify({ tipo: 'tavia-rutina', formato: 1, rutina: base })));
  }
});

/* ---------- De plantilla a hábito de Tavia ---------- */

test('aEntradaHabito produce una entrada que la app acepta tal cual', () => {
  const r = sanearRutina(rutina()).rutina;
  const v = validarEntrada(aEntradaHabito(r.habitos[0]), HOY);
  assert.ok(v.ok);
  assert.equal(v.datos.tipo, 'cantidad');
  assert.equal(v.datos.unidad, 'min');
  assert.deepEqual(v.datos.meta, { min: 10, max: null });
  assert.equal(v.datos.bloque, 'tarde');

  const check = sanearHabitoPlantilla(habito({ tipo: 'check' })).habito;
  const v2 = validarEntrada(aEntradaHabito(check, { nombre: 'Paseo con Luna', color: 'lago' }), HOY);
  assert.equal(v2.datos.tipo, 'si_no');
  assert.equal(v2.datos.nombre, 'Paseo con Luna');
  assert.equal(v2.datos.color, 'lago');

  const libre = sanearHabitoPlantilla(habito({ nombre: 'Tomar agua', icono: '💧', tipo: 'cantidad', meta: { modo: 'libre', unidad: 'vasos' } })).habito;
  const v3 = validarEntrada(aEntradaHabito(libre), HOY);
  assert.deepEqual(v3.datos.meta, { min: null, max: null }, 'hidratación sin cifra impuesta');
  assert.equal(v3.datos.unidad, 'vasos');
});

test('crearHabito del modelo acepta los hábitos de una rutina', () => {
  const m = crearModelo(datosVacios(), { reloj: () => new Date(2026, 10, 4, 10) });
  const r = sanearRutina(rutina({ habitos: [habito(), habito({ nombre: 'Estirar', tipo: 'check' })] })).rutina;
  const creados = r.habitos.map((h) => m.crearHabito(aEntradaHabito(h)));
  assert.ok(creados.every((c) => c.ok));
});

/* ---------- Linter de contenido ---------- */

test('el linter atrapa cada categoría prohibida', () => {
  const casos = {
    dieta: ['Cuenta tus calorías', 'Haz ayuno hasta el almuerzo', 'Una dieta ligera'],
    peso: ['Pésate cada mañana', 'Baja 2 kilos', 'quemar grasa'],
    cuerpo_ideal: ['Logra tu cuerpo ideal', 'abdomen plano en verano'],
    medicamentos: ['Toma tu pastilla', 'Recuerda tus medicamentos', 'un suplemento al día'],
    promesa_medica: ['Esto cura el cansancio', 'Previene enfermedades', 'Adiós al insomnio'],
    estudios_o_cifras: ['Los estudios dicen que…', 'Un estudio de Harvard', 'Según un estudio reciente', 'Mejora un 40 %', '21 días forman un hábito', 'según los expertos'],
    culpa: ['Tienes que hacerlo', 'Debes cumplir', 'Sin excusas', 'No falles hoy', 'Perdiste la racha'],
    presion: ['¡Vamos!!', 'Compra ya'],
  };
  for (const [regla, textos] of Object.entries(casos)) {
    for (const s of textos) assert.ok(revisarTexto(s).some((f) => f.regla === regla), `«${s}» → ${regla}`);
  }
});

test('el linter deja pasar el tono de la marca (sin falsos positivos comunes)', () => {
  const bien = [
    'Esta rutina cabe en 10 minutos. Puedes cambiar lo que quieras.',
    'Camina 2 minutos, aunque sea dentro de la casa.',
    'Lee 10 páginas o solo una.',
    'Compras y lavandería sin correr.',
    'Un reto de 21 días es un formato, no una promesa.',
    'Escucha a tu cuerpo; si tienes una condición, consulta a un profesional.',
    'Guarda una moneda en el frasco.',
    'Pesas livianas o botellas de agua sirven.',
    'Ordena tu escritorio según cómo trabajas.',
    'Empezamos tu sesión de estudio.',
    'Bloques de estudio con pausas.',
  ];
  for (const s of bien) assert.deepEqual(revisarTexto(s), [], s);
});

test('el linter revisa forma: identidad, pregunta, versión mínima e hidratación', () => {
  const r = sanearRutina(rutina({ habitos: [
    habito({ identidad: 'Camino mucho', pregunta: '' }),
    habito({ nombre: 'Tomar agua', icono: '💧', tipo: 'cantidad', meta: { modo: 'al_menos', valor: 8, unidad: 'vasos' } }),
  ] })).rutina;
  const reglas = revisarRutina(r).map((p) => p.regla);
  assert.ok(reglas.includes('identidad_formato'));
  assert.ok(reglas.includes('sin_pregunta'));
  assert.ok(reglas.includes('hidratacion_con_cifra'));
  assert.deepEqual(revisarRutina(sanearRutina(rutina()).rutina), []);
  assert.deepEqual(revisarReto(sanearReto(reto()).reto), []);
});

test('revisarCatalogo junta problemas de rutinas, retos y descartadas', () => {
  const cat = validarCatalogo(catalogo({
    rutinas: [rutina({ descripcion: 'Tienes que caminar.' }), rutina({ id: 'MAL' })],
    retos: [reto({ textoCierre: '' })],
  }));
  const { ok, problemas } = revisarCatalogo(cat);
  assert.equal(ok, false);
  assert.deepEqual(new Set(problemas.map((p) => p.regla)), new Set(['culpa', 'sin_texto_cierre', 'descartada']));
});
