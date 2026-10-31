// formato.js — Textos que se arman a partir de los datos (números, frecuencias, metas).

import { t, idioma } from './textos.js';
import { fechaLarga, sumarDias } from './fechas.js';

const nf = new Intl.NumberFormat(idioma, { maximumFractionDigits: 2 });
export const num = (n) => nf.format(n ?? 0);

/** Número para un campo de texto, con coma decimal: 7.5 → "7,5". */
export const numCampo = (n) => (n === null || n === undefined ? '' : String(n).replace('.', ','));

export function resumenFrecuencia(h) {
  const f = h.frecuencia;
  switch (f.tipo) {
    case 'dias_fijos': {
      const dias = t('dias.largo');
      if (f.dias.join() === '0,1,2,3,4') return t('dias.semana');
      if (f.dias.join() === '5,6') return t('dias.finde');
      const nombres = f.dias.map((d) => dias[d]);
      const lista = nombres.length > 1 ? `${nombres.slice(0, -1).join(', ')} y ${nombres.at(-1)}` : nombres[0];
      return lista.charAt(0).toUpperCase() + lista.slice(1);
    }
    case 'cada_n_dias':
      return f.n === 1 ? t('frec.resumen.cada1') : t('frec.resumen.cada', { n: f.n });
    case 'semanal_n':
      return t('frec.semanal_n');
    default:
      return t('frec.resumen.diaria');
  }
}

/** "5 / 20 páginas", "1,5 / máx. 2 h", "3 de 6 veces"… */
export function resumenMeta(h, log) {
  const valor = log?.estado === 'registrado' ? log.valor : 0;
  if (h.tipo === 'si_no') {
    return h.vecesPorDia > 1 ? t('veces.resumen', { valor: num(valor), n: h.vecesPorDia }) : '';
  }
  const { min, max } = h.meta;
  const unidad = h.unidad || '';
  const base = { valor: num(valor), unidad, min: num(min), max: num(max) };
  const clave = min !== null && max !== null ? 'rango' : min !== null ? 'min' : max !== null ? 'max' : 'libre';
  return t(`meta.resumen.${clave}`, base).trim();
}

/** Frase de identidad: "Soy una persona que lee cada noche." */
export function fraseIdentidad(h) {
  let s = (h.identidad || '').trim();
  if (!s) return '';
  if (!/^soy\b/i.test(s)) s = `Soy una persona que ${s}`;
  if (!/[.!?…]$/.test(s)) s += '.';
  return s;
}

/** "Hoy", "Ayer" o "martes 21 de octubre". */
export function nombreDelDia(fecha, hoy) {
  if (fecha === hoy) return t('hoy.titulo');
  if (fecha === sumarDias(hoy, -1)) return t('hoy.ayer');
  const s = fechaLarga(fecha);
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** "1 día", "12 días", "3 semanas"… */
export function textoRacha(n, unidad) {
  const [uno, varios] = t(`stats.racha.${unidad}`);
  return (n === 1 ? uno : varios).replace('{n}', num(n));
}

/** 0,873 → "87 %" (con espacio fino que no se corta). */
export const porcentaje = (p) => `${Math.round((p ?? 0) * 100)} %`;

/** "lun 27" para etiquetas cortas. */
export function fechaCorta(s) {
  const d = new Date(`${s}T12:00:00`);
  return new Intl.DateTimeFormat(idioma, { weekday: 'short', day: 'numeric', month: 'short' }).format(d);
}
