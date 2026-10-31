// storage.js — Guardar y cargar datos.
// Desde la V3 (Módulo 8) los datos viven en IndexedDB: más espacio que localStorage y sin bloquear
// la pantalla al guardar. La interfaz es la misma de siempre (asíncrona desde el día 1), así que
// el resto de la app no cambia.
//
// Orden de preferencia: IndexedDB → localStorage → memoria (con aviso).
// La primera vez, lo que había en localStorage se copia a IndexedDB, se verifica y recién
// entonces se borra la copia vieja. Todo acceso va en try/catch: nunca se lanza un error hacia afuera.

import { datosVacios, sanearDatos } from './esquema.js';

export const CLAVE = 'tavia:data';
const MARCA = 'tavia:motor'; // "idb" cuando los datos ya se mudaron a IndexedDB
const BASE = 'tavia';
const ALMACEN = 'kv';
const CANAL = 'tavia-datos';
const ESPERA_APERTURA_MS = 4000; // Safari a veces deja la apertura colgada

/* ---------- Motores: misma forma { tipo, leer, escribir, borrar } ---------- */

/** localStorage si funciona de verdad; si no, null. */
export function storageDisponible() {
  try {
    const s = globalThis.localStorage;
    if (!s) return null;
    const k = '__tavia_prueba__';
    s.setItem(k, '1');
    s.removeItem(k);
    return s;
  } catch {
    return null;
  }
}

/** Envuelve un objeto tipo Storage (localStorage o uno falso en las pruebas). */
export function motorStorage(storage) {
  return {
    tipo: 'local',
    async leer(k) { return storage.getItem(k); },
    async escribir(k, v) { storage.setItem(k, v); },
    async borrar(k) { storage.removeItem(k); },
  };
}

/** Abre IndexedDB. Devuelve el motor, o null si el navegador no lo permite. */
export async function abrirIndexedDB(fabrica = globalThis.indexedDB) {
  if (!fabrica) return null;
  let db;
  try {
    db = await new Promise((resolver, rechazar) => {
      const espera = setTimeout(() => rechazar(new Error('tiempo')), ESPERA_APERTURA_MS);
      const pedido = fabrica.open(BASE, 1);
      pedido.onupgradeneeded = () => {
        if (!pedido.result.objectStoreNames.contains(ALMACEN)) pedido.result.createObjectStore(ALMACEN);
      };
      pedido.onsuccess = () => { clearTimeout(espera); resolver(pedido.result); };
      pedido.onerror = () => { clearTimeout(espera); rechazar(pedido.error); };
      pedido.onblocked = () => { /* otra pestaña con versión vieja: esperamos al tiempo límite */ };
    });
  } catch {
    return null;
  }
  // Si otra pestaña necesita actualizar la base, cerramos para no bloquearla.
  db.onversionchange = () => db.close();

  const operar = (modo, fn) => new Promise((resolver, rechazar) => {
    let resultado;
    const tx = db.transaction(ALMACEN, modo);
    const pedido = fn(tx.objectStore(ALMACEN));
    pedido.onsuccess = () => { resultado = pedido.result; };
    tx.oncomplete = () => resolver(resultado);
    tx.onerror = () => rechazar(tx.error || pedido.error);
    tx.onabort = () => rechazar(tx.error || new DOMException('Transacción cancelada', 'AbortError'));
  });

  return {
    tipo: 'idb',
    async leer(k) { const v = await operar('readonly', (s) => s.get(k)); return typeof v === 'string' ? v : null; },
    escribir: (k, v) => operar('readwrite', (s) => s.put(v, k)),
    borrar: (k) => operar('readwrite', (s) => s.delete(k)),
  };
}

/* ---------- Almacén ---------- */

/**
 * @param {object} op
 * @param {Storage|null} [op.storage]  si se pasa (pruebas), se usa ese Storage y no IndexedDB
 * @param {object} [op.motor]          motor ya abierto (pruebas)
 * @param {() => Promise<object|null>} [op.abrir]  cómo abrir IndexedDB (inyectable para pruebas)
 * @param {Storage|null} [op.legado]   dónde buscar datos viejos para mudarlos
 * @param {(clave: string) => void} [op.alAviso]
 */
export function crearAlmacen({ storage, motor = null, abrir = abrirIndexedDB, legado, clave = CLAVE, alAviso = () => {}, esperaMs = 250 } = {}) {
  const pruebas = storage !== undefined || motor !== null;
  if (storage) motor = motorStorage(storage);
  if (legado === undefined) legado = pruebas ? null : storageDisponible();

  let estado = 'memoria'; // ok · memoria · soloLectura · error
  let pendiente = null;
  let temporizador = null;
  let ultimoGuardado = null; // texto guardado por esta pestaña (para ignorar su propio eco)
  let canal = null;
  let sinBase = false; // los datos están en IndexedDB pero hoy no se pudo abrir

  async function elegirMotor() {
    if (motor || pruebas) return motor;
    const idb = await abrir();
    if (idb) return idb;
    // Sin IndexedDB: si los datos ya se habían mudado, localStorage está vacío o viejo.
    // Usarlo haría creer que se perdió todo, así que seguimos en memoria y avisamos.
    let mudado = false;
    try { mudado = legado?.getItem(MARCA) === 'idb'; } catch { /* nada */ }
    if (mudado) { sinBase = true; alAviso('aviso.idb'); return null; }
    return legado ? motorStorage(legado) : null;
  }

  /** Copia los datos de localStorage a IndexedDB, verifica y borra lo viejo. */
  async function mudar() {
    if (!legado || motor.tipo !== 'idb') return null;
    let viejo = null;
    try { viejo = legado.getItem(clave); } catch { return null; }
    if (viejo === null) return null;
    try {
      await motor.escribir(clave, viejo);
      if ((await motor.leer(clave)) !== viejo) throw new Error('verificación');
    } catch {
      motor = motorStorage(legado); // no se pudo mudar: seguimos con localStorage, nada se pierde
      return viejo;
    }
    try { legado.setItem(MARCA, 'idb'); } catch { /* sin espacio: no es grave */ }
    try { legado.removeItem(clave); } catch { /* queda una copia vieja: no es grave */ }
    return viejo;
  }

  async function escribir(datos) {
    if (!motor || estado === 'soloLectura') return false;
    try {
      const texto = JSON.stringify(datos);
      await motor.escribir(clave, texto);
      ultimoGuardado = texto;
      if (estado === 'error') estado = 'ok';
      try { canal?.postMessage(texto); } catch { /* otra pestaña no se entera: recargará al volver */ }
      return true;
    } catch (e) {
      estado = 'error';
      alAviso(e && (e.name === 'QuotaExceededError' || e.code === 22) ? 'aviso.cuota' : 'aviso.memoria');
      return false;
    }
  }

  return {
    get estado() { return estado; },
    /** 'idb' · 'local' · null (memoria). Para mostrarlo en Ajustes. */
    get motor() { return motor?.tipo ?? null; },

    /** Lee, muda, migra y sanea. Nunca lanza: ante cualquier problema devuelve datos usables. */
    async cargar(hoy) {
      motor = await elegirMotor();
      if (!motor) {
        if (!sinBase && (!pruebas || storage === null)) alAviso('aviso.memoria');
        return datosVacios();
      }
      estado = 'ok';
      let texto = null;
      try {
        texto = await motor.leer(clave);
        if (texto === null) texto = await mudar();
      } catch {
        estado = 'memoria';
        motor = null;
        alAviso('aviso.memoria');
        return datosVacios();
      }
      if (texto === null) return datosVacios();
      let crudo;
      try {
        crudo = JSON.parse(texto);
      } catch {
        // Guarda una copia de lo dañado antes de empezar de cero.
        try { await motor.escribir(`${clave}:corrupto:${Date.now()}`, texto); } catch { /* sin espacio: seguimos */ }
        alAviso('aviso.corrupto');
        return datosVacios();
      }
      const { datos, futuro } = sanearDatos(crudo, hoy);
      if (futuro) {
        estado = 'soloLectura';
        alAviso('aviso.futuro');
      }
      ultimoGuardado = texto;
      return datos;
    },

    /** Guarda con una pequeña espera, para agrupar varios toques seguidos. */
    guardar(datos) {
      pendiente = datos;
      clearTimeout(temporizador);
      temporizador = setTimeout(() => this.guardarYa(), esperaMs);
    },

    /** Guarda lo pendiente de inmediato (al salir de la app o cambiar de pestaña). */
    async guardarYa() {
      clearTimeout(temporizador);
      if (!pendiente) return true;
      const d = pendiente;
      pendiente = null;
      return escribir(d);
    },

    /** Avisa cuando otra pestaña guardó cambios (BroadcastChannel con IndexedDB, evento storage con localStorage). */
    escucharOtrasPestanas(alCambiar, hoy) {
      if (!motor || typeof window === 'undefined') return;
      const recibir = (texto) => {
        if (typeof texto !== 'string' || texto === ultimoGuardado) return;
        try {
          const { datos, futuro } = sanearDatos(JSON.parse(texto), hoy());
          if (futuro) return;
          ultimoGuardado = texto;
          pendiente = null;
          alCambiar(datos);
        } catch { /* datos de otra pestaña ilegibles: los ignoramos */ }
      };
      if (motor.tipo === 'idb' && typeof BroadcastChannel !== 'undefined') {
        try {
          canal = new BroadcastChannel(CANAL);
          canal.onmessage = (e) => recibir(e.data);
        } catch { canal = null; }
      } else if (motor.tipo === 'local') {
        window.addEventListener('storage', (e) => { if (e.key === clave && e.newValue !== null) recibir(e.newValue); });
      }
    },

    /** Pide al navegador que no borre los datos por falta de espacio. */
    async pedirPersistencia() {
      try {
        if (navigator.storage?.persisted && (await navigator.storage.persisted())) return true;
        return (await navigator.storage?.persist?.()) === true;
      } catch {
        return false;
      }
    },

    /** Espacio usado por la app, en bytes (o null si el navegador no lo dice). */
    async espacioUsado() {
      try {
        const e = await navigator.storage?.estimate?.();
        return typeof e?.usage === 'number' ? e.usage : null;
      } catch {
        return null;
      }
    },
  };
}
