// temas.js — Paletas exclusivas (M8). Se ganan con días registrados, nunca se compran.
// Cuentan los días con al menos un registro, seguidos o no: fallar no quita nada.
// Los colores viven en styles.css; aquí solo el umbral y el color de la barra del sistema.

import { PALETAS } from './esquema.js';

/** id → días registrados necesarios y color de fondo (barra del sistema en Android). */
export const PALETA = {
  pino: { dias: 0, barra: { claro: '#f6f3ec', oscuro: '#121614' }, muestra: ['#2e6b5c', '#f6f3ec'] },
  arena: { dias: 7, barra: { claro: '#f5efe6', oscuro: '#16120e' }, muestra: ['#9c4a28', '#f5efe6'] },
  niebla: { dias: 30, barra: { claro: '#eff2f4', oscuro: '#0f1418' }, muestra: ['#2f5f86', '#eff2f4'] },
  ciruela: { dias: 60, barra: { claro: '#f4f0f1', oscuro: '#151014' }, muestra: ['#7a3d6b', '#f4f0f1'] },
  obsidiana: { dias: 100, barra: { claro: '#f4f1ea', oscuro: '#000000' }, muestra: ['#1c1c1a', '#dcb766'] },
};

/** Lista para Ajustes: cada paleta con si está ganada y cuántos días faltan. */
export function paletas(diasRegistrados) {
  return PALETAS.map((id) => ({
    id,
    dias: PALETA[id].dias,
    ganada: diasRegistrados >= PALETA[id].dias,
    faltan: Math.max(0, PALETA[id].dias - diasRegistrados),
  }));
}

/** La paleta que se aplica: la elegida si está ganada; si no (p. ej. tras importar otros datos), la de siempre. */
export function paletaEfectiva(elegida, diasRegistrados) {
  const p = PALETA[elegida];
  return p && diasRegistrados >= p.dias ? elegida : 'pino';
}

/** La próxima paleta por ganar (o null si ya están todas). */
export function proximaPaleta(diasRegistrados) {
  return paletas(diasRegistrados).find((p) => !p.ganada) || null;
}
