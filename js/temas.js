// temas.js — Temas (claro, oscuro, negro) y paletas de acento ganadas con días registrados.
// Las paletas solo cambian el color de acento: un solo acento a la vez, sobre grafito o papel.
// Se ganan con días registrados (seguidos o no) y nunca se compran. Los colores viven en styles.css.

import { PALETAS } from './esquema.js';

/** id → días registrados necesarios y colores de muestra [oscuro, claro]. */
export const PALETA = {
  ambar: { dias: 0, muestra: ['#F2B66D', '#A2621A'] },
  cobre: { dias: 7, muestra: ['#EE9B74', '#B95A31'] },
  salvia: { dias: 30, muestra: ['#9CCBA5', '#3F7A4D'] },
  acero: { dias: 60, muestra: ['#93B9E3', '#2F679C'] },
  platino: { dias: 100, muestra: ['#D8DBE0', '#3B3F46'] },
};

/** Color de la barra del sistema (Android) según el tema. */
export const BARRA = { claro: '#F3F3F1', oscuro: '#18191C', negro: '#000000' };

/** Temas Pro (en prueba): color de la barra del sistema de cada uno. */
export const BARRA_ESTILO = {
  gaceta: { claro: '#F2EFE8', oscuro: '#161513', negro: '#000000' },
  calibre: { claro: '#E8E9EB', oscuro: '#0F1011', negro: '#000000' },
  observatorio: { claro: '#ECEEF1', oscuro: '#0B0E17', negro: '#000000' },
  kanso: { claro: '#F1EFEA', oscuro: '#141414', negro: '#000000' },
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

/** La paleta que se aplica: la elegida si está ganada; si no (p. ej. tras importar otros datos), ámbar. */
export function paletaEfectiva(elegida, diasRegistrados) {
  const p = PALETA[elegida];
  return p && diasRegistrados >= p.dias ? elegida : 'ambar';
}

/** La próxima paleta por ganar (o null si ya están todas). */
export function proximaPaleta(diasRegistrados) {
  return paletas(diasRegistrados).find((p) => !p.ganada) || null;
}
