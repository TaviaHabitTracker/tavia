// jardin-disposicion.js — Dónde va cada flor y cuál es (J2). Puro y determinista:
// la misma semilla da siempre el mismo jardín. La especie depende solo de la fecha y la semilla,
// nunca del nombre de un hábito.

import { diaSemana } from './fechas.js';

export const ESPECIES = ['margarita', 'tulipan', 'campanilla', 'amapola', 'loto'];
export const INSIGNIA = 'insignia'; // reservada a la flor rara de los hitos
export const VARIANTES = 5; // colores (v1–v5); v1 es el acento del tema y sale el doble
const PESOS_VARIANTE = [1, 1, 2, 3, 4, 5];
export const SEMILLA_RESPALDO = '7a7669616a617264696e2d7461766961'; // si falta la semilla (no se guarda)

/* Medidas del jardín en unidades del SVG. Una celda por día. */
export const CELDA = 10;
const ETIQUETA = 9; // alto de la etiqueta del mes
const SEP_X = 12; // separación entre macizos
const SEP_Y = 10;
const MARGEN = 8;
export const ANCHO_MACIZO = 7 * CELDA;
export const ALTO_MACIZO = ETIQUETA + 6 * CELDA;
export const COLUMNAS = 3;
export const FILAS = 4;
export const ANCHO = MARGEN * 2 + COLUMNAS * ANCHO_MACIZO + (COLUMNAS - 1) * SEP_X;
export const ALTO = MARGEN * 2 + FILAS * ALTO_MACIZO + (FILAS - 1) * SEP_Y;

/** Hash de 32 bits (FNV-1a) de un texto. */
export function hash32(s) {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** Generador pseudoaleatorio mulberry32: devuelve números en [0, 1). */
export function generador(semilla) {
  let a = semilla >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Rasgos de la flor de un día: especie, variante de color, desplazamiento, giro y tamaño. */
export function rasgosDelDia(fecha, semilla = SEMILLA_RESPALDO) {
  const azar = generador(hash32(`${semilla || SEMILLA_RESPALDO}|${fecha}`));
  return {
    especie: ESPECIES[Math.floor(azar() * ESPECIES.length)],
    variante: PESOS_VARIANTE[Math.floor(azar() * PESOS_VARIANTE.length)],
    dx: (azar() * 2 - 1) * 0.15, // ±15 % de la celda
    dy: (azar() * 2 - 1) * 0.15,
    giro: Math.round((azar() * 2 - 1) * 8), // grados
    escala: 0.92 + azar() * 0.16,
  };
}

/** Fila de la semana (0–5) de una fecha dentro de su mes; columnas = lunes a domingo. */
export function filaEnMes(fecha) {
  const primero = `${fecha.slice(0, 8)}01`;
  const desfase = diaSemana(primero); // lunes = 0
  return Math.floor((desfase + Number(fecha.slice(8, 10)) - 1) / 7);
}

/** Rectángulo del macizo de un mes (1–12) en el SVG del año. */
export function macizo(mes) {
  const i = mes - 1;
  const col = i % COLUMNAS;
  const fila = Math.floor(i / COLUMNAS);
  const x = MARGEN + col * (ANCHO_MACIZO + SEP_X);
  const y = MARGEN + fila * (ALTO_MACIZO + SEP_Y);
  return { x, y, ancho: ANCHO_MACIZO, alto: ALTO_MACIZO, etiquetaY: y + ETIQUETA - 2, camaY: y + ETIQUETA };
}

/**
 * Posición de un día dentro de un macizo, en unidades locales al macizo (0,0 = esquina de la cama).
 * Devuelve el centro de la celda con el desplazamiento orgánico ya aplicado.
 */
export function posicionLocal(fecha, rasgos) {
  const col = diaSemana(fecha);
  const fila = filaEnMes(fecha);
  return {
    col, fila,
    cx: (col + 0.5 + rasgos.dx) * CELDA,
    cy: (fila + 0.5 + rasgos.dy) * CELDA,
  };
}

/** Posición de un día en el SVG del año. */
export function posicionEnAnio(fecha, rasgos) {
  const m = macizo(Number(fecha.slice(5, 7)));
  const p = posicionLocal(fecha, rasgos);
  return { ...p, cx: m.x + p.cx, cy: m.camaY + p.cy };
}

/** Filas que ocupa un mes (4, 5 o 6). */
export function filasDelMes(anio, mes) {
  const ultimo = new Date(anio, mes, 0).getDate();
  return filaEnMes(`${anio}-${String(mes).padStart(2, '0')}-${String(ultimo).padStart(2, '0')}`) + 1;
}

/**
 * Estación de un mes según el hemisferio. Solo cambia la luz y el tono del suelo,
 * nunca el significado de un estado.
 */
export function estacion(mes, hemisferio = 'sur') {
  const norte = ['invierno', 'invierno', 'primavera', 'primavera', 'primavera', 'verano', 'verano', 'verano', 'otono', 'otono', 'otono', 'invierno'];
  const opuesta = { invierno: 'verano', verano: 'invierno', primavera: 'otono', otono: 'primavera' };
  const e = norte[mes - 1];
  return hemisferio === 'norte' ? e : opuesta[e];
}

/** Semilla nueva: 128 bits al azar en hex. Solo vive en los ajustes (y en tus respaldos). */
export function nuevaSemilla(cripto = globalThis.crypto) {
  const b = new Uint8Array(16);
  cripto.getRandomValues(b);
  return [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
}
