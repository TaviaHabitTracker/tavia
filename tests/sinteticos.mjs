// Generador de datos sintéticos con semilla para probar los Descubrimientos (M11).
// Crea usuarios con hábitos y registros "sin patrón" (todo al azar con la misma probabilidad)
// o con patrones plantados (mejor día, franja, par que va junto, tendencia, efecto del descanso).
import { azar } from '../js/estadistica.js';
import { sumarDias, diaSemana } from '../js/fechas.js';
import { sanearDatos } from '../js/esquema.js';
import { crearModelo } from '../js/modelo.js';
import { PALABRAS_GUIA } from '../js/esquema.js';

export const HOY = '2026-11-02'; // lunes

const dos = (n) => String(n).padStart(2, '0');

/**
 * opciones: { semilla, habitos (cuántos), dias (historia), p (constancia base),
 *   patron: null | 'dia' | 'franja' | 'par' | 'tendencia' | 'descanso' | 'palabra', hoy, conHora, palabras, finde }
 */
export function usuario(o = {}) {
  const r = azar(o.semilla ?? 1);
  const hoy = o.hoy ?? HOY;
  const k = o.habitos ?? 3 + Math.floor(r() * 5);
  const dias = o.dias ?? 120;
  const base = o.p ?? 0.3 + r() * 0.6;
  const inicio = sumarDias(hoy, -dias);
  const habits = [];
  for (let j = 0; j < k; j++) {
    const fijos = !o.patron && r() < 0.2; // algunos con días fijos
    habits.push({
      id: `h${j}`, nombre: `Hábito ${j}`, icono: '🌱', color: 'pino', tipo: 'si_no', vecesPorDia: 1,
      frecuencia: fijos ? { tipo: 'dias_fijos', dias: [0, 2, 4] } : { tipo: 'diaria' },
      bloque: ['manana', 'tarde', 'noche', 'dia'][j % 4], creado: inicio, pausas: [], orden: j + 1,
    });
  }
  const pDe = habits.map(() => Math.min(0.97, Math.max(0.05, base + (r() - 0.5) * 0.2)));
  const logs = [];
  const porDia = {};
  for (let i = 0; i < dias; i++) {
    const fecha = sumarDias(inicio, i);
    const ds = diaSemana(fecha);
    if (o.palabras !== false && r() < 0.4) porDia[fecha] = PALABRAS_GUIA[Math.floor(r() * PALABRAS_GUIA.length)];
    if (o.patron === 'palabra' && i % 7 === 0) porDia[fecha] = 'calma';
    const hecho = [];
    for (let j = 0; j < k; j++) {
      const h = habits[j];
      if (h.frecuencia.tipo === 'dias_fijos' && !h.frecuencia.dias.includes(ds)) { hecho.push(null); continue; }
      let p = pDe[j];
      if (o.patron === 'dia' && j === 0) p = ds === 1 ? 0.97 : 0.4;
      if (o.patron === 'tendencia') p = i >= dias - 28 ? 0.85 : 0.45;
      if (o.patron === 'par' && j === 1 && hecho[0] !== null) p = hecho[0] ? 0.9 : 0.3;
      if (o.patron === 'descanso' && logs.some((l) => l.habitId === h.id && l.fecha === sumarDias(fecha, -1) && l.estado === 'descanso')) p = 0.98;
      if (o.patron === 'palabra' && porDia[fecha] === 'calma') p = 0.95;
      if (o.patron === 'palabra' && porDia[fecha] !== 'calma') p = Math.min(p, 0.5);
      // Descansos ocasionales (y más en el patrón "descanso").
      if (r() < (o.patron === 'descanso' ? 0.1 : 0.02)) { logs.push({ habitId: h.id, fecha, estado: 'descanso', valor: null }); hecho.push(null); continue; }
      const ok = r() < p;
      hecho.push(ok ? 1 : 0);
      if (!ok) continue;
      const log = { habitId: h.id, fecha, estado: 'registrado', valor: 1 };
      if (o.conHora !== false) {
        // Sin patrón: hora al azar entre 06:00 y 23:59. Con franja: el hábito 0 casi siempre en la mañana.
        const hora = o.patron === 'franja' && j === 0 && r() < 0.85 ? 7 + Math.floor(r() * 4) : 6 + Math.floor(r() * 18);
        log.registradoEn = `${dos(hora)}:${dos(Math.floor(r() * 60))}`;
      }
      logs.push(log);
    }
  }
  const crudo = { schemaVersion: 3, habits, logs, revisiones: [], palabras: { porDia, checkin: {}, minimo: null, identidad: [] }, config: { finDelDia: '00:00' } };
  return sanearDatos(crudo, hoy).datos;
}

/** Modelo con el reloj fijo en `hoy` a las 10:00. */
export function modeloDe(datos, hoy = HOY) {
  let reloj = new Date(`${hoy}T10:00:00`);
  const m = crearModelo(datos, { reloj: () => reloj });
  m.irA = (f) => { reloj = new Date(`${f}T10:00:00`); };
  return m;
}
