// recordatorios.js — Recordatorios sin servidor, dicho con honestidad:
// 1. Con la app abierta (o en una pestaña de fondo en PC): aviso del sistema a la hora.
// 2. Al abrir la app: tarjeta con lo que ya pasó la hora y sigue pendiente.
// 3. Con la app cerrada: un archivo .ics para el calendario del teléfono, que sí avisa siempre.
// Las PWA no pueden programar avisos con la app cerrada sin un servidor de push
// (Notification Triggers fue abandonada por Chrome), y en iPhone es aún más limitado.

import { minutosDe, sumarDias } from './fechas.js';
import { activoEn, estadoDelDia, tocaEnFecha } from './calculos.js';
import { t } from './textos.js';

const DIAS_ICS = ['MO', 'TU', 'WE', 'TH', 'FR', 'SA', 'SU'];

/** Minutos del "día lógico" (si el día termina a las 03:00, la 01:30 cuenta como 25:30). */
function minutosLogicos(hhmm, finDelDia) {
  const [h, m] = hhmm.split(':').map(Number);
  const v = h * 60 + m;
  return v < minutosDe(finDelDia) ? v + 1440 : v;
}

/** Recordatorios de hoy que ya pasaron su hora y cuyo hábito sigue pendiente. */
export function recordatoriosVencidos(modelo, ahora = new Date(), { incluirPrivados = true } = {}) {
  const hoy = modelo.hoy();
  const fin = modelo.config.finDelDia;
  const actual = minutosLogicos(`${String(ahora.getHours()).padStart(2, '0')}:${String(ahora.getMinutes()).padStart(2, '0')}`, fin);
  const out = [];
  for (const r of modelo.config.recordatorios) {
    const h = modelo.habito(r.habitId);
    if (!h || (!incluirPrivados && h.privado) || !tocaEnFecha(h, hoy)) continue;
    const estado = estadoDelDia(h, modelo.logDe(h.id, hoy));
    if (!['pendiente', 'parcial'].includes(estado)) continue;
    if (minutosLogicos(r.hora, fin) <= actual) out.push({ habito: h, hora: r.hora, clave: `${h.id}|${r.hora}|${hoy}` });
  }
  return out;
}

/**
 * Motor dentro de la app: cada minuto revisa si llegó la hora de algún recordatorio.
 * Los que ya habían pasado al abrir la app no suenan: se muestran en la tarjeta de Hoy.
 */
export function crearMotor(ctx) {
  const avisados = new Set();
  let listo = false;

  function revisar(ahora = new Date()) {
    const { modelo } = ctx;
    const vencidos = recordatoriosVencidos(modelo, ahora);
    if (!listo) { for (const v of vencidos) avisados.add(v.clave); listo = true; return; }
    for (const v of vencidos) {
      if (avisados.has(v.clave)) continue;
      avisados.add(v.clave);
      notificar(ctx, v);
      ctx.render(); // la tarjeta de pendientes se actualiza
    }
  }
  return { revisar, reiniciar: () => { listo = false; avisados.clear(); } };
}

async function notificar(ctx, { habito, clave }) {
  if (!ctx.modelo.config.notificaciones || typeof Notification === 'undefined' || Notification.permission !== 'granted') return;
  // Hábito privado: el aviso no dice cuál es.
  const titulo = habito.privado ? t('recordatorio.privado') : t('recordatorio.titulo', { nombre: habito.nombre });
  const cuerpo = habito.privado ? '' : t('recordatorio.cuerpo');
  try {
    const reg = await navigator.serviceWorker?.getRegistration();
    const op = { body: cuerpo, tag: clave, icon: 'icons/icon-192.png', badge: 'icons/monocromo-96.png', data: { url: './#hoy' } };
    if (reg) await reg.showNotification(titulo, op);
    else new Notification(titulo, op);
  } catch { /* el sistema no dejó mostrar el aviso */ }
}

/** Pide permiso de avisos del navegador. Devuelve 'granted' | 'denied' | 'default' | 'no-soportado'. */
export async function pedirPermiso() {
  if (typeof Notification === 'undefined') return 'no-soportado';
  if (Notification.permission !== 'default') return Notification.permission;
  try { return await Notification.requestPermission(); } catch { return 'denied'; }
}

/* ---------- Archivo .ics para el calendario ---------- */

const escaparICS = (s) => String(s).replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');

/** Corta líneas a 75 bytes como pide el estándar (RFC 5545). */
function plegar(linea) {
  const bytes = new TextEncoder().encode(linea);
  if (bytes.length <= 75) return linea;
  const partes = [];
  let actual = '';
  let largo = 0;
  for (const ch of linea) {
    const n = new TextEncoder().encode(ch).length;
    if (largo + n > (partes.length ? 74 : 75)) { partes.push(actual); actual = ''; largo = 0; }
    actual += ch;
    largo += n;
  }
  partes.push(actual);
  return partes.join('\r\n ');
}

function regla(h) {
  const f = h.frecuencia;
  if (f.tipo === 'dias_fijos') return `FREQ=WEEKLY;BYDAY=${f.dias.map((d) => DIAS_ICS[d]).join(',')}`;
  if (f.tipo === 'cada_n_dias' && f.n > 1) return `FREQ=DAILY;INTERVAL=${f.n}`;
  return 'FREQ=DAILY';
}

/** Primer día desde hoy en que toca el hábito (respeta pausas y "cada N días"). */
function primerDia(h, hoy) {
  for (let i = 0, d = hoy; i < 800; i++, d = sumarDias(d, 1)) {
    if (h.frecuencia.tipo === 'semanal_n' ? activoEn(h, d) : tocaEnFecha(h, d)) return d;
  }
  return null;
}

/** Calendario con un evento repetido por cada recordatorio. */
export function generarICS(modelo, ahora = new Date()) {
  const hoy = modelo.hoy();
  const sello = ahora.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, ''); // DTSTAMP va en UTC
  const lineas = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Tavia//Tavia Habit Tracker//ES', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH', 'X-WR-CALNAME:Tavia'];
  let eventos = 0;
  for (const r of modelo.config.recordatorios) {
    const h = modelo.habito(r.habitId);
    if (!h || h.archivado) continue;
    const inicio = primerDia(h, hoy);
    if (!inicio) continue;
    const titulo = h.privado ? t('recordatorio.privado') : t('recordatorio.titulo', { nombre: h.nombre });
    const desc = h.privado ? '' : t('recordatorio.cuerpo');
    lineas.push(
      'BEGIN:VEVENT',
      `UID:${h.id}-${r.hora.replace(':', '')}@tavia.app`,
      `DTSTAMP:${sello}`,
      `DTSTART:${inicio.replace(/-/g, '')}T${r.hora.replace(':', '')}00`, // hora local del teléfono
      'DURATION:PT10M',
      `RRULE:${regla(h)}`,
      `SUMMARY:${escaparICS(titulo)}`,
      ...(desc ? [`DESCRIPTION:${escaparICS(desc)}`] : []),
      'TRANSP:TRANSPARENT',
      'BEGIN:VALARM', 'ACTION:DISPLAY', `DESCRIPTION:${escaparICS(titulo)}`, 'TRIGGER:PT0M', 'END:VALARM',
      'END:VEVENT',
    );
    eventos++;
  }
  lineas.push('END:VCALENDAR');
  return { texto: `${lineas.map(plegar).join('\r\n')}\r\n`, eventos };
}
