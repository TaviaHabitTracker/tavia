// importar/fechas.js — Fechas que vienen de otros archivos.
// Formatos: AAAA-MM-DD (con hora opcional), DD/MM/AAAA, MM/DD/AAAA (con '/', '-' o '.'),
// y marcas de tiempo Unix en milisegundos (13 dígitos) o segundos (10 dígitos).
// Reglas:
// - DD/MM vs MM/DD nunca se adivina: se decide con TODO el archivo (un número > 12 lo aclara)
//   y si nada lo aclara, la interfaz le pregunta al usuario con un ejemplo.
// - Todo termina en la fecha LOCAL 'AAAA-MM-DD' de Tavia. Nunca toISOString().
// - Si trae hora, se aplica la hora de fin del día del usuario (diaLogico) y se avisa.

import { diaLogico, esFechaValida } from '../fechas.js';
import { ErrorImport } from './errores.js';

const RE_ISO = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2})(?:\.\d{1,9})?)?\s*(Z|[+-]\d{2}:?\d{2})?)?$/;
const RE_BARRA = /^(\d{1,2})([/.-])(\d{1,2})\2(\d{4})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?$/;
const RE_EPOCH = /^\d{10}(\d{3})?$/;

export const FORMATOS_FECHA = ['iso', 'dmy', 'mdy', 'epoch'];

/**
 * Mira todos los valores de una columna y decide el formato.
 * @param {string[]} valores
 * @returns {{ formato: 'iso'|'dmy'|'mdy'|'epoch'|null, ambiguo: boolean, ejemplo: string|null,
 *             conHora: boolean, invalidas: number }}
 *  - ambiguo: solo DD/MM vs MM/DD sin ninguna pista; `ejemplo` es una fecha para preguntar.
 *  - formato null: los valores no se parecen a ninguna fecha conocida (o mezclan formatos).
 */
export function detectarFormatoFecha(valores) {
  let iso = 0, barra = 0, epoch = 0, invalidas = 0, conHora = false;
  let diaPrimero = false, mesPrimero = false, ejemplo = null;
  for (const bruto of valores) {
    const v = String(bruto ?? '').trim();
    if (!v) continue;
    let m;
    if ((m = RE_ISO.exec(v))) { iso++; if (m[4] !== undefined) conHora = true; continue; }
    if ((m = RE_BARRA.exec(v))) {
      barra++;
      if (m[5] !== undefined) conHora = true;
      const a = Number(m[1]), b = Number(m[3]);
      if (a > 12) diaPrimero = true;
      if (b > 12) mesPrimero = true;
      if (a <= 12 && b <= 12 && a !== b && !ejemplo) ejemplo = v;
      continue;
    }
    if (RE_EPOCH.test(v)) { epoch++; conHora = true; continue; }
    invalidas++;
  }
  const tipos = [iso, barra, epoch].filter((x) => x > 0).length;
  const base = { ambiguo: false, ejemplo: null, conHora, invalidas };
  if (tipos !== 1) return { ...base, formato: null };
  if (iso) return { ...base, formato: 'iso' };
  if (epoch) return { ...base, formato: 'epoch' };
  if (diaPrimero && mesPrimero) return { ...base, formato: null }; // mezcla DD/MM y MM/DD: no es confiable
  if (diaPrimero) return { ...base, formato: 'dmy' };
  if (mesPrimero) return { ...base, formato: 'mdy' };
  // Ningún número mayor a 12: si todas tienen día == mes, da igual; si no, hay que preguntar.
  if (!ejemplo) return { ...base, formato: 'dmy' };
  return { ...base, formato: null, ambiguo: true, ejemplo };
}

/** Las dos lecturas posibles de una fecha ambigua, para preguntarle al usuario. */
export function lecturasPosibles(ejemplo) {
  const m = RE_BARRA.exec(String(ejemplo ?? '').trim());
  if (!m) return null;
  const dmy = armar(Number(m[4]), Number(m[3]), Number(m[1]));
  const mdy = armar(Number(m[4]), Number(m[1]), Number(m[3]));
  return dmy && mdy ? { dmy, mdy } : null;
}

/**
 * Convierte un valor a 'AAAA-MM-DD' local.
 * @param {string} bruto
 * @param {'iso'|'dmy'|'mdy'|'epoch'} formato
 * @param {{ finDelDia?: string }} [op]
 * @returns {string|null} null si no es una fecha real (31 de febrero, fuera de rango, etc.)
 */
export function convertirFecha(bruto, formato, { finDelDia = '00:00' } = {}) {
  if (!FORMATOS_FECHA.includes(formato)) throw new ErrorImport('fecha_formato');
  const v = String(bruto ?? '').trim();
  if (!v) return null;
  let m;
  if (formato === 'iso') {
    if (!(m = RE_ISO.exec(v))) return null;
    const dia = armar(Number(m[1]), Number(m[2]), Number(m[3]));
    if (!dia || m[4] === undefined) return dia;
    if (!horaValida(m[4], m[5], m[6])) return null;
    if (m[7]) {
      // Instante absoluto (Z u offset): se lleva a la hora local del teléfono.
      const offset = m[7] === 'Z' ? 'Z' : m[7].replace(/^([+-]\d{2})(\d{2})$/, '$1:$2');
      const d = new Date(`${dia}T${m[4]}:${m[5]}:${m[6] ?? '00'}${offset}`);
      return Number.isNaN(d.getTime()) ? null : alDia(d, finDelDia);
    }
    return conHoraLocal(dia, m[4], m[5], m[6], finDelDia);
  }
  if (formato === 'dmy' || formato === 'mdy') {
    if (!(m = RE_BARRA.exec(v))) return null;
    const [d, mes] = formato === 'dmy' ? [Number(m[1]), Number(m[3])] : [Number(m[3]), Number(m[1])];
    const dia = armar(Number(m[4]), mes, d);
    if (!dia || m[5] === undefined) return dia;
    if (!horaValida(m[5], m[6], m[7])) return null;
    return conHoraLocal(dia, m[5], m[6], m[7], finDelDia);
  }
  if (!RE_EPOCH.test(v)) return null;
  const ms = v.length === 13 ? Number(v) : Number(v) * 1000;
  const d = new Date(ms);
  return Number.isNaN(d.getTime()) ? null : alDia(d, finDelDia);
}

function armar(a, m, d) {
  const s = `${String(a).padStart(4, '0')}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  return esFechaValida(s) ? s : null;
}

const horaValida = (h, mi, s) => Number(h) <= 23 && Number(mi) <= 59 && (s === undefined || Number(s) <= 59);

function conHoraLocal(dia, h, mi, s, finDelDia) {
  const [a, m, d] = dia.split('-').map(Number);
  return alDia(new Date(a, m - 1, d, Number(h), Number(mi), Number(s ?? 0)), finDelDia);
}

function alDia(date, finDelDia) {
  const dia = diaLogico(date, finDelDia);
  return esFechaValida(dia) ? dia : null;
}
