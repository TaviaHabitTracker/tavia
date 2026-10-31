// fechas.js — Todo el manejo de fechas de Tavia.
// Regla de oro: un "día" es siempre un string local 'YYYY-MM-DD'.
// Nunca se usa toISOString() para fechas de día (convierte a UTC y corre el día).
// La aritmética se hace a mediodía local: Chile cambia la hora a medianoche,
// y operar a las 00:00 puede producir días duplicados o saltados.

const dos = (n) => String(n).padStart(2, '0');

/** Fecha local de un Date como 'YYYY-MM-DD' (sin ajustes). */
export function fechaLocal(date = new Date()) {
  return `${date.getFullYear()}-${dos(date.getMonth() + 1)}-${dos(date.getDate())}`;
}

/** ¿Es un string 'YYYY-MM-DD' de una fecha real? */
export function esFechaValida(s) {
  if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const [a, m, d] = s.split('-').map(Number);
  if (a < 2000 || a > 2200) return false;
  const f = new Date(a, m - 1, d, 12);
  return f.getFullYear() === a && f.getMonth() === m - 1 && f.getDate() === d;
}

/** 'YYYY-MM-DD' → Date a mediodía local. */
export function aDate(s) {
  const [a, m, d] = s.split('-').map(Number);
  return new Date(a, m - 1, d, 12, 0, 0, 0);
}

/** Suma (o resta) días a una fecha string. */
export function sumarDias(s, n) {
  const f = aDate(s);
  f.setDate(f.getDate() + n);
  return fechaLocal(f);
}

/** Días entre dos fechas string (b - a). Inmune al horario de verano. */
export function diffDias(a, b) {
  const [a1, m1, d1] = a.split('-').map(Number);
  const [a2, m2, d2] = b.split('-').map(Number);
  return Math.round((Date.UTC(a2, m2 - 1, d2) - Date.UTC(a1, m1 - 1, d1)) / 86400000);
}

/** Día de la semana con lunes = 0 … domingo = 6. */
export function diaSemana(s) {
  return (aDate(s).getDay() + 6) % 7;
}

/** Lunes de la semana de la fecha. */
export function inicioSemana(s) {
  return sumarDias(s, -diaSemana(s));
}

/** Convierte 'HH:MM' en minutos desde medianoche (valor seguro entre 0 y 360). */
export function minutosDe(hhmm) {
  const m = /^(\d{2}):(\d{2})$/.exec(hhmm || '');
  if (!m) return 0;
  const total = Number(m[1]) * 60 + Number(m[2]);
  return Math.min(Math.max(total, 0), 360); // el día puede terminar como máximo a las 06:00
}

/**
 * Día "lógico" del usuario: si su día termina a las 03:00, lo que marca
 * a las 01:30 cuenta para el día anterior.
 */
export function diaLogico(ahora = new Date(), finDelDia = '00:00') {
  const corte = minutosDe(finDelDia);
  const minutos = ahora.getHours() * 60 + ahora.getMinutes();
  if (corte > 0 && minutos < corte) {
    const ayer = new Date(ahora.getFullYear(), ahora.getMonth(), ahora.getDate() - 1, 12);
    return fechaLocal(ayer);
  }
  return fechaLocal(ahora);
}

/** Milisegundos hasta el próximo cambio de día lógico (mínimo 1 s). */
export function msHastaCambioDeDia(ahora = new Date(), finDelDia = '00:00') {
  const corte = minutosDe(finDelDia);
  const h = Math.floor(corte / 60), m = corte % 60;
  let proximo = new Date(ahora.getFullYear(), ahora.getMonth(), ahora.getDate(), h, m, 0, 0);
  if (proximo <= ahora) {
    proximo = new Date(ahora.getFullYear(), ahora.getMonth(), ahora.getDate() + 1, h, m, 0, 0);
  }
  return Math.max(proximo - ahora + 500, 1000);
}

/** Hora local 'HH:MM' de un Date (para registrar cuándo se marcó). */
export function horaLocal(date = new Date()) {
  return `${dos(date.getHours())}:${dos(date.getMinutes())}`;
}

let formatoLargo;
/** "lunes 27 de octubre" */
export function fechaLarga(s, idioma = 'es') {
  formatoLargo ??= new Intl.DateTimeFormat(idioma, { weekday: 'long', day: 'numeric', month: 'long' });
  return formatoLargo.format(aDate(s));
}
