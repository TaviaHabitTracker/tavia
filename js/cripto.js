// cripto.js — PIN y respaldo cifrado con la Web Crypto API del navegador (sin librerías).
//
// PIN: se deriva con PBKDF2-SHA256 (600.000 iteraciones) y una sal aleatoria; se guarda
// solo el resultado, nunca el PIN. La comparación es en tiempo constante.
// Límite honesto: un PIN de 4–6 dígitos protege de miradas casuales, no de alguien con
// acceso al navegador y tiempo: 1.000.000 de combinaciones se prueban sin conexión.
//
// Respaldo cifrado: AES-GCM de 256 bits con clave derivada de una contraseña (PBKDF2),
// sal e IV aleatorios incluidos en el archivo.

import { ITERACIONES_MAX, PIN_ITERACIONES } from './esquema.js';

const enc = new TextEncoder();
const dec = new TextDecoder();
const sutil = () => {
  if (!globalThis.crypto?.subtle) throw new Error('Web Crypto no disponible (se necesita https o localhost)');
  return globalThis.crypto.subtle;
};

export const aB64 = (bytes) => {
  let s = '';
  for (const b of new Uint8Array(bytes)) s += String.fromCharCode(b);
  return btoa(s);
};
export const deB64 = (texto) => Uint8Array.from(atob(texto), (c) => c.charCodeAt(0));
export const aleatorio = (n) => globalThis.crypto.getRandomValues(new Uint8Array(n));

async function derivarBits(secreto, sal, iteraciones) {
  const base = await sutil().importKey('raw', enc.encode(secreto), 'PBKDF2', false, ['deriveBits']);
  return new Uint8Array(await sutil().deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: sal, iterations: iteraciones }, base, 256));
}

/** Compara dos arreglos de bytes sin cortar en la primera diferencia. */
export function igualesTiempoConstante(a, b) {
  if (a.length !== b.length) return false;
  let dif = 0;
  for (let i = 0; i < a.length; i++) dif |= a[i] ^ b[i];
  return dif === 0;
}

export const pinValido = (pin) => /^\d{4,8}$/.test(pin);

/** Crea { pinHash, pinSalt, pinIter } a partir de un PIN. */
export async function crearPin(pin, iteraciones = PIN_ITERACIONES) {
  if (!pinValido(pin)) throw new Error('PIN inválido');
  const sal = aleatorio(16);
  const hash = await derivarBits(pin, sal, iteraciones);
  return { pinHash: aB64(hash), pinSalt: aB64(sal), pinIter: iteraciones };
}

/** ¿El PIN coincide con lo guardado? */
export async function verificarPin(pin, { pinHash, pinSalt, pinIter }) {
  if (!pinHash || !pinSalt || !pinValido(pin)) return false;
  const hash = await derivarBits(pin, deB64(pinSalt), pinIter || PIN_ITERACIONES);
  return igualesTiempoConstante(hash, deB64(pinHash));
}

/**
 * Espera tras intentos fallidos: 5 intentos libres; después 30 s, 1 min, 2 min…
 * hasta 15 minutos. Devuelve milisegundos.
 */
export function esperaTrasFallos(fallos) {
  if (fallos < 5) return 0;
  return Math.min(30_000 * 2 ** (fallos - 5), 15 * 60_000);
}

/* ---------- Respaldo cifrado ---------- */

const AAD = enc.encode('tavia-respaldo-cifrado-v1');

export const esRespaldoCifrado = (o) => Boolean(o && o.app === 'tavia' && o.tipo === 'respaldo-cifrado' && o.cifrado && typeof o.datos === 'string');

export async function cifrar(texto, contrasena, iteraciones = PIN_ITERACIONES) {
  const sal = aleatorio(16);
  const iv = aleatorio(12);
  const bits = await derivarBits(contrasena, sal, iteraciones);
  const clave = await sutil().importKey('raw', bits, 'AES-GCM', false, ['encrypt']);
  const cifrado = await sutil().encrypt({ name: 'AES-GCM', iv, additionalData: AAD }, clave, enc.encode(texto));
  return {
    app: 'tavia',
    tipo: 'respaldo-cifrado',
    formato: 1,
    cifrado: { alg: 'AES-GCM', kdf: 'PBKDF2-SHA256', iter: iteraciones, sal: aB64(sal), iv: aB64(iv) },
    datos: aB64(cifrado),
  };
}

/** Descifra; lanza un error si la contraseña es incorrecta o el archivo fue alterado. */
export async function descifrar(obj, contrasena) {
  const c = obj.cifrado;
  if (c.alg !== 'AES-GCM' || c.kdf !== 'PBKDF2-SHA256') throw new Error('Formato de cifrado desconocido');
  const iter = Number(c.iter);
  // Tope de iteraciones: un archivo hostil con millones de vueltas congelaría la app (B-2).
  if (!Number.isInteger(iter) || iter < 100_000 || iter > ITERACIONES_MAX) throw new Error('Iteraciones fuera de rango');
  const sal = deB64(c.sal);
  const iv = deB64(c.iv);
  if (sal.length !== 16 || iv.length !== 12) throw new Error('Sal o IV con largo inválido');
  const bits = await derivarBits(contrasena, sal, iter);
  const clave = await sutil().importKey('raw', bits, 'AES-GCM', false, ['decrypt']);
  const claro = await sutil().decrypt({ name: 'AES-GCM', iv, additionalData: AAD }, clave, deB64(obj.datos));
  return dec.decode(claro);
}
