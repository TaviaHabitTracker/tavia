// jardin.js — Jardín anual (J1): el estado de cada día, calculado siempre desde los registros.
// Sin DOM: se prueba en Node. No guarda nada y no toca rachas, puntaje ni datos:
// lee con las funciones de siempre (tocaEnFecha, vistaDelDia, progresoDelDia).
//
// Estados (de más tenue a más vivo):
//   futuro       el día aún no llega
//   sin_sembrar  antes del primer hábito: no cuenta para nada
//   sin_habitos  no tocaba ningún hábito (hoja pequeña)
//   descanso     todo lo que tocaba quedó en descanso, saltado o congelado (hoja de descanso)
//   pendiente    hoy, todavía sin nada: no es falla hasta que termine el día
//   tierra       tocaba algo y no se cumplió nada (tierra tranquila con una semilla)
//   brote        algo cumplido, menos de la mitad
//   capullo      la mitad o más, sin llegar al umbral
//   flor         día cumplido (umbral, 100 % por defecto)
//   flor_rara    día en que la racha global llega a 30, 60, 100 o 365 (la flor insignia)

import { sumarDias } from './fechas.js';
import { progresoDelDia, tocaEnFecha, vistaDelDia } from './calculos.js';

export const HITOS = [30, 60, 100, 365];
export const ESTADOS = ['futuro', 'sin_sembrar', 'sin_habitos', 'descanso', 'pendiente', 'tierra', 'brote', 'capullo', 'flor', 'flor_rara'];
/** Estados que cuentan como "flor" en los resúmenes. */
export const esFlor = (e) => e === 'flor' || e === 'flor_rara';

/** Primer día con hábitos (incluye archivados: existieron). null si no hay hábitos. */
export function inicioDelJardin(habitos) {
  if (!habitos.length) return null;
  return habitos.reduce((m, h) => (h.creado < m ? h.creado : m), habitos[0].creado);
}

/**
 * Lo que se cumplió un día (sin interpretar): hechos y requeridos, y si tocaba algo.
 * Es lo único que se guarda en la caché.
 */
export function medirDia(habitos, fecha, logDe) {
  const programados = habitos.filter((h) => tocaEnFecha(h, fecha));
  if (!programados.length) return { programados: 0, hechos: 0, total: 0 };
  const p = progresoDelDia(programados.map((h) => vistaDelDia(h, fecha, logDe)));
  return { programados: programados.length, hechos: p.hechos, total: p.total };
}

/**
 * Estado de un día a partir de su medida.
 * `umbral` en 0–1 (1 = todos los requeridos hechos).
 */
export function estadoDesdeMedida(m, fecha, { hoy, inicio, umbral = 1 }) {
  if (fecha > hoy) return 'futuro';
  if (!inicio || fecha < inicio) return 'sin_sembrar';
  if (m.programados === 0) return 'sin_habitos';
  if (m.total === 0) return 'descanso';
  const f = m.hechos / m.total;
  if (f >= umbral) return 'flor';
  if (m.hechos === 0) return fecha === hoy ? 'pendiente' : 'tierra';
  return f >= 0.5 ? 'capullo' : 'brote';
}

/**
 * Caché de medidas por día. Un registro cambia, a lo más, la semana de ese día
 * (en "N por semana" un toque cambia qué días son requeridos), así que se olvida solo esa semana.
 * Cambiar un hábito, importar o abrir la bóveda olvida todo.
 */
export function crearCacheJardin() {
  const mapa = new Map();
  let firma = '';
  return {
    medir(habitos, fecha, logDe) {
      const f = habitos.map((h) => h.id).join(',');
      if (f !== firma) { mapa.clear(); firma = f; }
      let m = mapa.get(fecha);
      if (!m) { m = medirDia(habitos, fecha, logDe); mapa.set(fecha, m); }
      return m;
    },
    /** Olvida la semana (lunes a domingo, y un día de margen a cada lado) de una fecha. */
    olvidarFecha(fecha) {
      for (let i = -7; i <= 7; i++) mapa.delete(sumarDias(fecha, i));
    },
    olvidar() { mapa.clear(); firma = ''; },
    get tamano() { return mapa.size; },
  };
}

/**
 * Todos los días de un año con su estado. También calcula la racha global
 * (la misma que se ve en Hoy: días seguidos con al menos un hábito cumplido;
 * los días sin nada que hacer, en descanso, y hoy sin terminar, no la cortan)
 * para plantar la flor insignia el día que llega a un hito.
 *
 * Devuelve { anio, dias: [{ fecha, estado, hechos, total, racha, hito }], inicio }.
 */
export function jardinDelAnio(habitos, anio, { hoy, logDe, umbral = 1, cache = null }) {
  const inicio = inicioDelJardin(habitos);
  const medir = (d) => (cache ? cache.medir(habitos, d, logDe) : medirDia(habitos, d, logDe));
  const primero = `${anio}-01-01`;
  const ultimo = `${anio}-12-31`;

  // La racha puede venir del año anterior: se recorre desde el inicio del jardín.
  let racha = 0;
  const hitosDe = new Map(); // fecha → hito
  if (inicio && inicio <= hoy) {
    const hasta = ultimo < hoy ? ultimo : hoy;
    for (let d = inicio; d <= hasta; d = sumarDias(d, 1)) {
      const m = medir(d);
      if (m.hechos > 0) {
        racha++;
        if (HITOS.includes(racha) && d >= primero) hitosDe.set(d, racha);
      } else if (d === hoy || m.total === 0) {
        // hoy aún no termina; día sin nada que hacer (o en descanso): ni suma ni corta
      } else {
        racha = 0;
      }
    }
  }

  const dias = [];
  for (let d = primero; d <= ultimo; d = sumarDias(d, 1)) {
    const fuera = d > hoy || !inicio || d < inicio;
    const m = fuera ? { programados: 0, hechos: 0, total: 0 } : medir(d);
    let estado = estadoDesdeMedida(m, d, { hoy, inicio, umbral });
    const hito = hitosDe.get(d) || null;
    if (hito) estado = 'flor_rara';
    dias.push({ fecha: d, estado, hechos: m.hechos, total: m.total, hito });
  }
  return { anio, dias, inicio };
}

/** Conteos por estado de una lista de días. */
export function contar(dias) {
  const c = Object.fromEntries(ESTADOS.map((e) => [e, 0]));
  for (const d of dias) c[d.estado]++;
  c.flores = c.flor + c.flor_rara;
  c.descansos = c.descanso + c.sin_habitos;
  return c;
}

/** Días de un mes (1–12) dentro del jardín de un año. */
export const diasDelMes = (jardin, mes) => jardin.dias.filter((d) => Number(d.fecha.slice(5, 7)) === mes);

/** Umbral de la configuración (en %) a fracción. */
export const umbralDe = (config) => (config?.jardin?.umbral ?? 100) / 100;
