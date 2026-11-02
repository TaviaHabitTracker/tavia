// palabras.js — Palabras guía (Módulo 10). Lógica pura, sin DOM.
// Una palabra para el día, palabras de identidad y una observación semanal que NO afirma causalidad.

import { diaGlobal } from './estadisticas.js';
import { sumarDias } from './fechas.js';
import { semilla } from './frases.js';
import { PALABRAS_GUIA } from './esquema.js';

/** Las 16 palabras: significado en una línea, una frase del archivo que encaja y un color del sistema de diseño. */
export const PALABRAS = [
  { id: 'constancia', nombre: 'Constancia', significado: 'Volver, aunque sea poco, día tras día.', frase: 'f016', color: 'pino' },
  { id: 'calma', nombre: 'Calma', significado: 'Hacer lo que toca sin apuro ni ruido.', frase: 'f048', color: 'lago' },
  { id: 'paciencia', nombre: 'Paciencia', significado: 'Dejar que lo pequeño madure a su ritmo.', frase: 'f019', color: 'musgo' },
  { id: 'foco', nombre: 'Foco', significado: 'Una cosa a la vez, con toda la atención.', frase: 'f095', color: 'lago' },
  { id: 'valentia', nombre: 'Valentía', significado: 'Empezar aunque dé miedo.', frase: 'f006', color: 'arcilla' },
  { id: 'disciplina', nombre: 'Disciplina', significado: 'Cumplirte a ti mismo lo que te prometiste.', frase: 'f027', color: 'ciruela' },
  { id: 'proposito', nombre: 'Propósito', significado: 'Recordar para qué lo haces.', frase: 'f087', color: 'miel' },
  { id: 'descanso', nombre: 'Descanso', significado: 'Parar también es parte del camino.', frase: 'f073', color: 'lago' },
  { id: 'identidad', nombre: 'Identidad', significado: 'Cada acción es un voto por quien quieres ser.', frase: 'f085', color: 'ciruela' },
  { id: 'curiosidad', nombre: 'Curiosidad', significado: 'Mirar el día con ganas de descubrir algo.', frase: 'f096', color: 'miel' },
  { id: 'aprender', nombre: 'Aprender', significado: 'Equivocarte un poco mejor que ayer.', frase: 'f059', color: 'musgo' },
  { id: 'resiliencia', nombre: 'Resiliencia', significado: 'Caer y volver, sin drama.', frase: 'f069', color: 'arcilla' },
  { id: 'presencia', nombre: 'Presencia', significado: 'Estar de verdad en lo que haces.', frase: 'f083', color: 'pino' },
  { id: 'orden', nombre: 'Orden', significado: 'Darle a cada cosa su lugar y su hora.', frase: 'f089', color: 'musgo' },
  { id: 'energia', nombre: 'Energía', significado: 'Poner ganas en lo que eliges hacer.', frase: 'f035', color: 'miel' },
  { id: 'amabilidad', nombre: 'Amabilidad', significado: 'Tratarte como tratarías a un buen amigo.', frase: 'f068', color: 'pino' },
];
export const PALABRA = new Map(PALABRAS.map((p) => [p.id, p]));
export const ID_PALABRAS = PALABRAS.map((p) => p.id);
export const MAX_IDENTIDAD = 3;
if (ID_PALABRAS.join() !== PALABRAS_GUIA.join()) throw new Error('palabras.js y esquema.js deben listar las mismas palabras');

/** Cinco sugerencias según el contexto del día. En días duros, solo palabras que acompañan. */
const POR_CONTEXTO = {
  tropiezo: ['calma', 'amabilidad', 'descanso', 'paciencia', 'resiliencia'],
  dia_dificil: ['calma', 'amabilidad', 'descanso', 'paciencia', 'resiliencia'],
  regreso: ['amabilidad', 'calma', 'paciencia', 'aprender', 'resiliencia'],
  descanso: ['descanso', 'calma', 'presencia', 'amabilidad', 'paciencia'],
  inicio: ['valentia', 'curiosidad', 'aprender', 'proposito', 'constancia'],
  construyendo: ['constancia', 'paciencia', 'foco', 'orden', 'energia'],
  racha_larga: ['disciplina', 'constancia', 'foco', 'proposito', 'presencia'],
  hito: ['presencia', 'proposito', 'identidad', 'calma', 'energia'],
  dia_completo: ['presencia', 'calma', 'identidad', 'proposito', 'energia'],
};

export function sugerencias(contexto) {
  return (POR_CONTEXTO[contexto] || POR_CONTEXTO.inicio).map((id) => PALABRA.get(id));
}

/** "Sorpréndeme": una palabra distinta de la actual, estable mientras no cambie el pedido. */
export function sorpresa(actual, clave) {
  const otras = PALABRAS.filter((p) => p.id !== actual);
  return otras[semilla(`sorpresa|${clave}|${actual || ''}`) % otras.length];
}

/** La palabra siguiente o anterior (deslizar). */
export function vecina(id, paso = 1) {
  const i = Math.max(0, ID_PALABRAS.indexOf(id));
  return PALABRAS[(i + paso + PALABRAS.length) % PALABRAS.length];
}

/**
 * Observación de la semana: con qué palabras te acompañaste y cómo te fue esos días.
 * Solo describe lo que pasó (sin decir que la palabra lo causó). Necesita al menos 2 días con la palabra.
 * Devuelve { usadas: [{ palabra, dias }], destacada: { palabra, pct, pctResto } | null }.
 */
export function observacionSemana({ porDia, lunes, hoy, habitos, logDe }) {
  const dias = [];
  for (let i = 0; i < 7; i++) {
    const fecha = sumarDias(lunes, i);
    if (fecha > hoy) break;
    const p = diaGlobal(habitos, fecha, logDe);
    // Hoy solo cuenta si ya está completo (no es fallo hasta que termina el día).
    if (fecha === hoy && p.hechos < p.total) continue;
    dias.push({ fecha, palabra: PALABRA.has(porDia?.[fecha]) ? porDia[fecha] : null, hechos: p.hechos, total: p.total });
  }
  const conteo = new Map();
  for (const d of dias) if (d.palabra) conteo.set(d.palabra, (conteo.get(d.palabra) || 0) + 1);
  const usadas = [...conteo.entries()].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1)).map(([id, n]) => ({ palabra: PALABRA.get(id), dias: n }));

  const pct = (lista) => {
    const t = lista.reduce((s, d) => s + d.total, 0);
    return t ? lista.reduce((s, d) => s + d.hechos, 0) / t : null;
  };
  let destacada = null;
  for (const { palabra, dias: n } of usadas) {
    if (n < 2) continue;
    const con = dias.filter((d) => d.palabra === palabra.id);
    const sin = dias.filter((d) => d.palabra !== palabra.id);
    const a = pct(con), b = pct(sin);
    if (a === null || b === null || sin.every((d) => d.total === 0)) continue;
    if (a - b >= 0.1 && (!destacada || a - b > destacada.pct - destacada.pctResto)) destacada = { palabra, pct: a, pctResto: b, dias: n };
  }
  return { usadas, destacada };
}
