// estadistica.js — Estadística pequeña y transparente para los Descubrimientos (M11).
// Sin dependencias ni DOM: intervalos de Wilson, prueba exacta de Fisher y medianas.
// Los valores de referencia de las pruebas se calcularon con SciPy 1.18 (ver tests/descubrimientos.test.mjs).

const Z95 = 1.959963984540054;

/**
 * Intervalo de confianza de Wilson al 95 % para x éxitos en n intentos.
 * Se usa en vez del promedio simple porque no se desborda con muestras chicas (9 de 10 no es "90 % seguro").
 */
export function wilson(x, n, z = Z95) {
  if (!(n > 0)) return { p: null, bajo: 0, alto: 1 };
  const p = x / n;
  const z2 = z * z;
  const centro = (p + z2 / (2 * n)) / (1 + z2 / n);
  const margen = (z / (1 + z2 / n)) * Math.sqrt((p * (1 - p)) / n + z2 / (4 * n * n));
  return { p, bajo: Math.max(0, centro - margen), alto: Math.min(1, centro + margen) };
}

/** log(n!) con tabla (suficiente para ventanas de un año por varios hábitos). */
const LOG_FACT = [0];
function logFact(n) {
  for (let i = LOG_FACT.length; i <= n; i++) LOG_FACT[i] = LOG_FACT[i - 1] + Math.log(i);
  return LOG_FACT[n];
}

/**
 * Prueba exacta de Fisher bilateral para la tabla [[a, b], [c, d]].
 * Suma las probabilidades hipergeométricas de todas las tablas con los mismos márgenes
 * que son igual o menos probables que la observada (mismo criterio que R y SciPy).
 */
export function fisher(a, b, c, d) {
  const f1 = a + b, f2 = c + d, c1 = a + c, n = a + b + c + d;
  if (n === 0) return 1;
  const base = logFact(f1) + logFact(f2) + logFact(c1) + logFact(n - c1) - logFact(n);
  const prob = (x) => Math.exp(base - logFact(x) - logFact(f1 - x) - logFact(c1 - x) - logFact(f2 - c1 + x));
  const pObs = prob(a);
  const min = Math.max(0, c1 - f2), max = Math.min(f1, c1);
  let p = 0;
  for (let x = min; x <= max; x++) {
    const px = prob(x);
    if (px <= pObs * (1 + 1e-7)) p += px; // tolerancia relativa para empates numéricos
  }
  return Math.min(1, p);
}

/** Umbral de Bonferroni: alfa dividido por el número de comparaciones (al menos 1). */
export const bonferroni = (alfa, m) => alfa / Math.max(1, m);

/**
 * Cuantil de la normal estándar (algoritmo de Acklam, error relativo < 1,2e-9).
 * Sirve para el z de un intervalo de Wilson corregido por comparaciones múltiples.
 */
export function cuantilNormal(p) {
  if (!(p > 0 && p < 1)) return p <= 0 ? -Infinity : Infinity;
  const a = [-3.969683028665376e1, 2.209460984245205e2, -2.759285104469687e2, 1.383577518672690e2, -3.066479806614716e1, 2.506628277459239];
  const b = [-5.447609879822406e1, 1.615858368580409e2, -1.556989798598866e2, 6.680131188771972e1, -1.328068155288572e1];
  const c = [-7.784894002430293e-3, -3.223964580411365e-1, -2.400758277161838, -2.549732539343734, 4.374664141464968, 2.938163982698783];
  const d = [7.784695709041462e-3, 3.224671290700398e-1, 2.445134137142996, 3.754408661907416];
  const bajo = 0.02425;
  if (p < bajo) {
    const q = Math.sqrt(-2 * Math.log(p));
    return (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
  }
  if (p > 1 - bajo) return -cuantilNormal(1 - p);
  const q = p - 0.5, r = q * q;
  return (((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q / (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1);
}

/** z para un límite inferior de una cola con nivel alfa repartido en m comparaciones (Bonferroni). */
export const zCorregido = (alfa, m) => cuantilNormal(1 - bonferroni(alfa, m));

/** Mediana de una lista de números (null si está vacía). */
export function mediana(xs) {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/** ¿Los intervalos [a.bajo, a.alto] y [b.bajo, b.alto] se tocan? */
export const seSolapan = (a, b) => a.bajo <= b.alto && b.bajo <= a.alto;

/** Generador pseudoaleatorio con semilla (mulberry32): para datos sintéticos repetibles en las pruebas. */
export function azar(semilla) {
  let s = semilla >>> 0;
  return () => {
    s = (s + 0x6D2B79F5) >>> 0;
    let x = s;
    x = Math.imul(x ^ (x >>> 15), x | 1);
    x ^= x + Math.imul(x ^ (x >>> 7), x | 61);
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}
