// Ayudantes de las pruebas del importador: un zip "a mano" para armar archivos maliciosos
// (tamaños que mienten, entradas superpuestas, cifrado, métodos raros) y un azar con semilla.

import { crc32 } from '../js/importar/zip.js';

const enc = new TextEncoder();
export const bytes = (x) => (typeof x === 'string' ? enc.encode(x) : x);

export async function deflate(datos) {
  const cs = new CompressionStream('deflate-raw');
  const w = cs.writable.getWriter();
  w.write(datos); w.close();
  return new Uint8Array(await new Response(cs.readable).arrayBuffer());
}

/**
 * entradas: [{ ruta, datos, metodo = 8, flags = 0, tamanoDeclarado?, crcDeclarado?, offsetForzado? }]
 * opciones: { superponer: true } hace que todas las entradas apunten a los mismos datos locales.
 */
export async function crearZip(entradas, { superponer = false, totalDeclarado } = {}) {
  const locales = [];
  const centrales = [];
  let offset = 0;
  let primerOffset = null;
  for (const e of entradas) {
    const crudo = bytes(e.datos);
    const metodo = e.metodo ?? 8;
    const comp = metodo === 8 ? await deflate(crudo) : crudo;
    const nombre = enc.encode(e.ruta);
    const crc = e.crcDeclarado ?? crc32(crudo);
    const tam = e.tamanoDeclarado ?? crudo.length;
    const flags = (e.flags ?? 0) | 0x0800;
    const miOffset = superponer && primerOffset !== null ? primerOffset : offset;
    if (!(superponer && primerOffset !== null)) {
      const local = new Uint8Array(30 + nombre.length + comp.length);
      const v = new DataView(local.buffer);
      v.setUint32(0, 0x04034b50, true); v.setUint16(4, 20, true); v.setUint16(6, flags, true);
      v.setUint16(8, metodo, true); v.setUint32(14, crc, true); v.setUint32(18, comp.length, true);
      v.setUint32(22, tam, true); v.setUint16(26, nombre.length, true);
      local.set(nombre, 30); local.set(comp, 30 + nombre.length);
      locales.push(local);
      if (primerOffset === null) primerOffset = offset;
      offset += local.length;
    }
    const c = new Uint8Array(46 + nombre.length);
    const v = new DataView(c.buffer);
    v.setUint32(0, 0x02014b50, true); v.setUint16(4, 20, true); v.setUint16(6, 20, true);
    v.setUint16(8, flags, true); v.setUint16(10, metodo, true); v.setUint32(16, crc, true);
    v.setUint32(20, comp.length, true); v.setUint32(24, tam, true); v.setUint16(28, nombre.length, true);
    v.setUint32(42, e.offsetForzado ?? miOffset, true);
    c.set(nombre, 46);
    centrales.push(c);
  }
  const inicioCD = offset;
  const tamCD = centrales.reduce((s, c) => s + c.length, 0);
  const eocd = new Uint8Array(22);
  const v = new DataView(eocd.buffer);
  v.setUint32(0, 0x06054b50, true);
  v.setUint16(8, totalDeclarado ?? centrales.length, true); v.setUint16(10, totalDeclarado ?? centrales.length, true);
  v.setUint32(12, tamCD, true); v.setUint32(16, inicioCD, true);
  return unir([...locales, ...centrales, eocd]);
}

export function unir(partes) {
  const out = new Uint8Array(partes.reduce((s, p) => s + p.length, 0));
  let p = 0;
  for (const x of partes) { out.set(x, p); p += x.length; }
  return out;
}

/** Azar repetible (mulberry32). */
export function azar(semilla) {
  let a = semilla >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
