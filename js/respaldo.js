// respaldo.js — Exportar e importar.
// Importar NUNCA toca los datos sin antes: leer, validar todo (tipos, campos, tamaños,
// fechas), mostrar un resumen y recibir confirmación. El cifrado llega desde cripto.js.

import { APP } from './textos.js';
import { CAMPOS_PIN, SCHEMA_VERSION, configPorDefecto, sanearDatos } from './esquema.js';
import { cifrar, descifrar, esRespaldoCifrado } from './cripto.js';

export const TAMANO_MAXIMO = 10 * 1024 * 1024; // 10 MB

/**
 * Quita del respaldo todo lo del PIN (A-3): con el hash y la sal, un PIN de 4 dígitos se adivina
 * sin conexión en minutos, y mucha gente usa el mismo PIN para otras cosas.
 */
export function sinPin(config) {
  const base = configPorDefecto();
  const limpio = { ...config };
  for (const k of CAMPOS_PIN) limpio[k] = base[k];
  return limpio;
}

/** Contenido del archivo de respaldo (sin cifrar). */
export function crearRespaldo(datos, hoy) {
  datos = { ...datos, config: sinPin(datos.config || {}) };
  return {
    app: 'tavia',
    tipo: 'respaldo',
    formato: 1,
    version: APP.version,
    schemaVersion: SCHEMA_VERSION,
    exportado: hoy,
    datos,
  };
}

export const nombreArchivo = (hoy, ext, cifrado = false) => `tavia-respaldo-${hoy}${cifrado ? '-cifrado' : ''}.${ext}`;

/** Respaldo como texto JSON; con contraseña, cifrado con AES-GCM. */
export async function textoRespaldo(datos, hoy, contrasena = null) {
  const r = crearRespaldo(datos, hoy);
  if (!contrasena) return JSON.stringify(r, null, 1);
  return JSON.stringify(await cifrar(JSON.stringify(r), contrasena));
}

/* ---------- CSV ---------- */

const celda = (v) => {
  let s = v === null || v === undefined ? '' : String(v);
  // Evita que Excel o Sheets interpreten una nota como fórmula.
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\n\r;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

/** Registros en CSV (con notas), listo para Excel o Google Sheets. */
export function csvRegistros(datos) {
  const porId = new Map(datos.habits.map((h) => [h.id, h]));
  const filas = [['fecha', 'habito', 'estado', 'valor', 'unidad', 'hora', 'nota']];
  for (const l of datos.logs) {
    const h = porId.get(l.habitId);
    if (!h) continue;
    filas.push([l.fecha, h.nombre, l.estado, l.valor ?? '', h.unidad || '', l.registradoEn || '', l.nota || '']);
  }
  return `﻿${filas.map((f) => f.map(celda).join(',')).join('\r\n')}\r\n`; // BOM: Excel lee bien los acentos
}

/* ---------- Importar ---------- */

/**
 * Lee un archivo y devuelve { ok, datos, resumen } o { ok: false, error, cifrado }.
 * `pedirContrasena` se llama solo si el archivo viene cifrado.
 */
export async function leerRespaldo(archivo, hoy, pedirContrasena) {
  if (!archivo) return { ok: false, error: 'respaldo.error.archivo' };
  if (archivo.size > TAMANO_MAXIMO) return { ok: false, error: 'respaldo.error.tamano' };
  let crudo;
  try {
    crudo = JSON.parse(await archivo.text());
  } catch {
    return { ok: false, error: 'respaldo.error.json' };
  }
  if (esRespaldoCifrado(crudo)) {
    const contrasena = await pedirContrasena();
    if (contrasena === null) return { ok: false, error: null }; // canceló
    try {
      crudo = JSON.parse(await descifrar(crudo, contrasena));
    } catch {
      return { ok: false, error: 'respaldo.error.contrasena', cifrado: true };
    }
  }
  return validarRespaldo(crudo, hoy);
}

/** Valida un objeto ya leído. Separado para poder probarlo sin archivos. */
export function validarRespaldo(crudo, hoy) {
  if (!crudo || typeof crudo !== 'object' || Array.isArray(crudo)) return { ok: false, error: 'respaldo.error.formato' };
  // Acepta el archivo de Tavia o, por compatibilidad, el objeto de datos directo.
  const esArchivo = crudo.app === 'tavia' && crudo.datos && typeof crudo.datos === 'object';
  const fuente = esArchivo ? crudo.datos : crudo;
  if (!Array.isArray(fuente.habits) || !Array.isArray(fuente.logs)) return { ok: false, error: 'respaldo.error.formato' };
  const { datos, futuro, descartados } = sanearDatos(fuente, hoy);
  // Un respaldo nunca trae PIN: al importar se conserva siempre la protección actual (M-2).
  datos.config = sinPin(datos.config);
  if (futuro) return { ok: false, error: 'respaldo.error.futuro' };
  if (datos.habits.length === 0) return { ok: false, error: 'respaldo.error.vacio' };
  const fechas = datos.logs.map((l) => l.fecha).sort();
  return {
    ok: true,
    datos,
    resumen: {
      exportado: esArchivo && typeof crudo.exportado === 'string' ? crudo.exportado.slice(0, 10) : null,
      habitos: datos.habits.length,
      registros: datos.logs.length,
      notas: datos.logs.filter((l) => l.nota).length,
      desde: fechas[0] || null,
      hasta: fechas.at(-1) || null,
      descartados,
    },
  };
}

/* ---------- Entregar el archivo ---------- */

/**
 * En celulares: abre el menú Compartir (para guardar en Drive, Archivos, correo…).
 * En PC: descarga el archivo.
 */
export async function entregarArchivo(nombre, contenido, tipo) {
  const blob = new Blob([contenido], { type: tipo });
  const tactil = globalThis.matchMedia?.('(pointer: coarse)').matches;
  if (tactil && typeof File !== 'undefined' && navigator.canShare) {
    const archivo = new File([blob], nombre, { type: tipo });
    if (navigator.canShare({ files: [archivo] })) {
      try {
        await navigator.share({ files: [archivo], title: nombre });
        return true;
      } catch (e) {
        if (e?.name === 'AbortError') return false;
        // Si compartir falla por otro motivo, seguimos con la descarga.
      }
    }
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = nombre;
  a.rel = 'noopener';
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
  return true;
}
