// plantillas-linter.js — Revisor de contenido del catálogo de rutinas.
// Se usa en las pruebas y en tests/revisar-plantillas.mjs; no corre en la app.
// Falla si una plantilla habla de dieta, peso, medicamentos, promesas de salud,
// estudios o cifras inventadas, culpa o culto al cuerpo.

/** Quita tildes y pasa a minúsculas para comparar. */
export function normalizar(s) {
  return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

/** Reglas: cada una con un nombre corto y patrones sobre texto normalizado. */
export const REGLAS = [
  { regla: 'dieta', patrones: [/\bcalori/, /\bkcal\b/, /\bdieta/, /\bayun/, /\bdetox\b/, /\bcarbohidrat/, /\bazucar/, /\bcomer menos\b/, /\bsaltarse? (el|la) (desayuno|almuerzo|cena|once)/] },
  { regla: 'peso', patrones: [/\bpeso\b/, /\bpesar(te|se)?\b/, /\bpesa(te|rse)\b/, /\bkilos?\b/, /\bkg\b/, /\badelgaz/, /\bbajar de talla/, /\bimc\b/, /\bquemar (grasa|calorias)/, /\bgrasa\b/] },
  { regla: 'cuerpo_ideal', patrones: [/\bcuerpo (ideal|perfecto|de verano|sonado)/, /\babdomen plano/, /\bvientre plano/, /\bmarcar (abdominales|el abdomen)/, /\btonific/, /\bverte (mejor|bien) (en|al) /, /\bfigura\b/, /\bbikini\b/] },
  { regla: 'medicamentos', patrones: [/\bmedicament/, /\bpastilla/, /\bfarmac/, /\bdosis\b/, /\bsuplement/, /\bvitamina/, /\btratamiento/, /\bremedio/, /\bmelatonina/] },
  { regla: 'promesa_medica', patrones: [/\bcura(r|s|ra)?\b/, /\bsana(r|ra)?\b/, /\bprevien|\bprevenir/, /\breduce el riesgo/, /\bterapia\b/, /\bansiedad\b/, /\bdepresi/, /\binsomnio\b/, /\bdiagnost/, /\bsintoma/, /\bsistema inmun/, /\bdesintoxic/, /\bmejora(ra|s)? tu salud/, /\bgarantiz/] },
  { regla: 'estudios_o_cifras', patrones: [/\bestudios?\b/, /\binvestigac/, /\bcientific/, /\bcomprobad/, /\bexpertos?\b/, /\bsegun (la|los|las|un|una)\b/, /\d+\s*%/, /\bpor ciento\b/, /\d+\s*veces mas\b/, /\b21 dias (forman?|crean?|bastan|para (formar|crear))/, /\bforma(r)? un habito en\b/] },
  { regla: 'culpa', patrones: [/\btienes que\b/, /\bdebes\b/, /\bdeberias\b/, /\bhay que\b/, /\bsin excusas?\b/, /\bno hay excusa/, /\bobligatori/, /\bno falles\b/, /\bfracas/, /\bperdiste\b/, /\bflojo|\bfloja\b|\bvago\b|\bvaga\b/, /\bno te rindas\b/, /\bnunca (falles|faltes)\b/, /\btodos los dias sin falta\b/, /\bno seas\b/] },
  { regla: 'presion', patrones: [/!{2,}/, /\bya mismo\b/, /\bahora o nunca\b/, /\bultima oportunidad\b/, /\b(compra|compralo|desbloquea) (ya|ahora|pro)\b/,/\bgratis por tiempo\b/] },
];

/** Campos de texto que se revisan en rutinas, hábitos y retos. */
const CAMPOS_RUTINA = ['nombre', 'descripcion', 'objetivo'];
const CAMPOS_HABITO = ['nombre', 'identidad', 'pregunta', 'versionMinima', 'nota'];
const CAMPOS_RETO = ['nombre', 'descripcion', 'textoCierre'];

/** Revisa un texto suelto. Devuelve las reglas que rompe con el fragmento que la gatilló. */
export function revisarTexto(s) {
  const n = normalizar(s);
  const fallos = [];
  for (const { regla, patrones } of REGLAS) {
    for (const p of patrones) {
      const m = n.match(p);
      if (m) { fallos.push({ regla, fragmento: m[0] }); break; }
    }
  }
  return fallos;
}

function revisarCampos(obj, campos, prefijo, out) {
  for (const c of campos) {
    if (typeof obj[c] !== 'string') continue;
    for (const f of revisarTexto(obj[c])) out.push({ campo: `${prefijo}${c}`, ...f });
  }
}

/** Reglas de forma que no son de palabras. */
function revisarHabito(h, prefijo, out) {
  revisarCampos(h, CAMPOS_HABITO, prefijo, out);
  if (!h.versionMinima) out.push({ campo: `${prefijo}versionMinima`, regla: 'sin_version_minima', fragmento: '' });
  if (!h.identidad) out.push({ campo: `${prefijo}identidad`, regla: 'sin_identidad', fragmento: '' });
  else if (!normalizar(h.identidad).startsWith('soy una persona que')) out.push({ campo: `${prefijo}identidad`, regla: 'identidad_formato', fragmento: h.identidad.slice(0, 30) });
  if (!h.pregunta) out.push({ campo: `${prefijo}pregunta`, regla: 'sin_pregunta', fragmento: '' });
  // Hidratación: la meta la elige la persona, nunca una cifra impuesta.
  const sobreAgua = /\bagua|hidrat|\bvasos?\b/.test(normalizar(`${h.nombre} ${h.pregunta} ${h.nota}`)) || h.icono === '💧';
  if (sobreAgua && h.meta && h.meta.modo !== 'libre') out.push({ campo: `${prefijo}meta`, regla: 'hidratacion_con_cifra', fragmento: String(h.meta.valor) });
}

/**
 * Revisa una rutina ya saneada (salida de sanearRutina).
 * Devuelve una lista de problemas: [{ campo, regla, fragmento }]. Vacía = pasa.
 */
export function revisarRutina(r) {
  const out = [];
  revisarCampos(r, CAMPOS_RUTINA, '', out);
  if (!r.descripcion) out.push({ campo: 'descripcion', regla: 'sin_descripcion', fragmento: '' });
  if (r.descripcion && r.descripcion.length > 90) out.push({ campo: 'descripcion', regla: 'descripcion_larga', fragmento: `${r.descripcion.length} caracteres` });
  for (const e of r.etiquetas || []) for (const f of revisarTexto(e)) out.push({ campo: 'etiquetas', ...f });
  r.habitos.forEach((h, i) => revisarHabito(h, `habitos[${i}].`, out));
  return out;
}

/** Revisa un reto ya saneado. */
export function revisarReto(r) {
  const out = [];
  revisarCampos(r, CAMPOS_RETO, '', out);
  if (!r.textoCierre) out.push({ campo: 'textoCierre', regla: 'sin_texto_cierre', fragmento: '' });
  if (!r.hitos.length) out.push({ campo: 'hitos', regla: 'sin_hitos', fragmento: '' });
  revisarHabito(r.habito, 'habito.', out);
  return out;
}

/** Revisa todo un catálogo validado. Devuelve { ok, problemas: [{ id, campo, regla, fragmento }] }. */
export function revisarCatalogo(cat) {
  const problemas = [];
  for (const r of cat.rutinas) for (const p of revisarRutina(r)) problemas.push({ id: r.id, ...p });
  for (const r of cat.retos) for (const p of revisarReto(r)) problemas.push({ id: r.id, ...p });
  for (const d of cat.descartadas) problemas.push({ id: d.id, campo: '*', regla: 'descartada', fragmento: d.motivos.join(', ') });
  return { ok: problemas.length === 0, problemas };
}
