// importar/worker.js — Lee el archivo fuera del hilo principal, para no congelar la pantalla
// con historiales de años. Mismo origen, sin red: solo recibe el File y devuelve un resumen.
// Los bytes se quedan aquí (las etapas siguientes también correrán aquí, desde I2).
//
// Mensajes que recibe:  { tipo: 'abrir', id, archivo }  |  { tipo: 'abrirCarpeta', id, archivos }  |  { tipo: 'cancelar' }
// Mensajes que envía:   { id, tipo: 'progreso', valor }  |  { id, tipo: 'listo', resumen }  |  { id, tipo: 'error', codigo }

import { abrirArchivo, abrirCarpeta } from './leer.js';
import { diagnosticar } from './diagnostico.js';

let actual = null;

self.addEventListener('message', async (e) => {
  const m = e.data;
  if (!m || typeof m !== 'object') return;
  if (m.tipo === 'cancelar') { actual?.abort(); return; }
  if (m.tipo !== 'abrir' && m.tipo !== 'abrirCarpeta') return;
  actual?.abort();
  const ctl = new AbortController();
  actual = ctl;
  const id = m.id;
  try {
    const alProgreso = (valor) => self.postMessage({ id, tipo: 'progreso', valor });
    const c = m.tipo === 'abrir'
      ? await abrirArchivo(m.archivo, { senal: ctl.signal, alProgreso })
      : await abrirCarpeta(m.archivos, { senal: ctl.signal });
    if (ctl.signal.aborted) throw Object.assign(new Error('cancelado'), { codigo: 'cancelado' });
    self.postMessage({ id, tipo: 'listo', resumen: diagnosticar(c) });
  } catch (err) {
    // Solo el código: nunca contenido del archivo ni la pila.
    self.postMessage({ id, tipo: 'error', codigo: typeof err?.codigo === 'string' ? err.codigo : 'inesperado' });
  } finally {
    if (actual === ctl) actual = null;
  }
});
