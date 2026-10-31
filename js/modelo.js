// modelo.js — Estado de la app en memoria y todas las operaciones sobre él.
// Sin DOM: se puede probar en Node. Cada cambio avisa con `alCambiar`,
// y main.js se encarga de guardar y volver a dibujar.

import {
  BLOQUES, COLORES, FINES_DE_DIA, LIMITES, SCHEMA_VERSION, TIPOS,
  numero, sanearConfig, sanearFrecuencia, sanearHabito, sanearMeta, sanearRecordatorios, sanearRevisiones,
} from './esquema.js';
import { diaLogico, esFechaValida, horaLocal, sumarDias } from './fechas.js';
import { puedeCongelar } from './estadisticas.js';

/** Id corto y aleatorio. */
export function nuevoId() {
  if (globalThis.crypto?.randomUUID) return crypto.randomUUID();
  const b = new Uint8Array(16);
  globalThis.crypto.getRandomValues(b);
  return [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
}

/** Primer "carácter visible" de un texto (un emoji completo, aunque tenga varias partes). */
export function primerGrafema(s) {
  if (typeof s !== 'string' || !s.trim()) return '';
  const limpio = s.trim();
  if (typeof Intl !== 'undefined' && Intl.Segmenter) {
    const seg = new Intl.Segmenter(undefined, { granularity: 'grapheme' });
    const primero = seg.segment(limpio)[Symbol.iterator]().next().value;
    return primero ? primero.segment.slice(0, LIMITES.icono) : '';
  }
  return Array.from(limpio)[0] || '';
}

/**
 * Convierte lo que viene del formulario en un hábito válido.
 * Devuelve { ok: true, datos } o { ok: false, error: 'clave.de.texto' }.
 */
export function validarEntrada(e, hoy) {
  const nombre = typeof e.nombre === 'string' ? e.nombre.trim() : '';
  if (!nombre) return { ok: false, error: 'editor.error.nombre', campo: 'nombre' };

  const tipo = TIPOS.includes(e.tipo) ? e.tipo : 'si_no';
  let meta = { min: null, max: null };
  if (tipo === 'cantidad') {
    const leer = (v) => (v === '' || v === null || v === undefined ? null : numero(v));
    const quiereMin = e.metaModo === 'min' || e.metaModo === 'rango';
    const quiereMax = e.metaModo === 'max' || e.metaModo === 'rango';
    const min = quiereMin ? leer(e.metaMin) : null;
    const max = quiereMax ? leer(e.metaMax) : null;
    if ((quiereMin && min === null) || (quiereMax && max === null)) {
      return { ok: false, error: 'editor.error.numero', campo: 'meta' };
    }
    if (min !== null && max !== null && min > max) return { ok: false, error: 'editor.error.meta', campo: 'meta' };
    meta = sanearMeta('cantidad', { min, max });
  }

  const f = e.frecuencia || { tipo: 'diaria' };
  if (f.tipo === 'dias_fijos' && (!Array.isArray(f.dias) || f.dias.length === 0)) {
    return { ok: false, error: 'editor.error.dias', campo: 'dias' };
  }

  let creado = esFechaValida(e.creado) ? e.creado : hoy;
  if (creado > hoy) creado = hoy;

  return {
    ok: true,
    datos: {
      nombre: nombre.slice(0, LIMITES.nombre),
      icono: primerGrafema(e.icono) || '🌱',
      color: COLORES.includes(e.color) ? e.color : 'pino',
      tipo,
      unidad: tipo === 'cantidad' ? String(e.unidad || '').trim().slice(0, LIMITES.unidad) : '',
      meta,
      vecesPorDia: tipo === 'si_no' ? Math.min(Math.max(parseInt(e.vecesPorDia, 10) || 1, 1), LIMITES.vecesMax) : 1,
      frecuencia: sanearFrecuencia(f),
      bloque: BLOQUES.includes(e.bloque) ? e.bloque : 'dia',
      identidad: String(e.identidad || '').trim().slice(0, LIMITES.identidad),
      creado,
      privado: e.privado === true,
    },
  };
}

export function crearModelo(datos, { reloj = () => new Date(), alCambiar = () => {} } = {}) {
  let habits = [];
  let config = sanearConfig(null);
  let semanales = []; // revisiones semanales (M7)
  /** Índice de registros: habitId → (fecha → log). Lectura O(1). */
  let indice = new Map();
  /** Revisión por hábito: cambia cada vez que cambia el hábito o sus registros (invalida la caché). */
  const revisiones = new Map();
  let epoca = 0;
  const tocarRevision = (id) => revisiones.set(id, (revisiones.get(id) || 0) + 1);

  function cargar(d) {
    epoca++;
    habits = d.habits.map((h) => ({ ...h, pausas: h.pausas.map((p) => ({ ...p })) }));
    config = { ...d.config, recordatorios: (d.config.recordatorios || []).map((r) => ({ ...r })) };
    semanales = (d.revisiones || []).map((r) => ({ ...r }));
    indice = new Map(habits.map((h) => [h.id, new Map()]));
    for (const l of d.logs) indice.get(l.habitId)?.set(l.fecha, { ...l });
  }
  cargar(datos);

  const avisar = (cambio) => {
    if (cambio.id) tocarRevision(cambio.id);
    alCambiar(cambio);
  };
  const hoy = () => diaLogico(reloj(), config.finDelDia);
  const habito = (id) => habits.find((h) => h.id === id) || null;
  const logDe = (id, fecha) => indice.get(id)?.get(fecha) || null;

  function puedeMarcar(h, fecha) {
    if (!h || !esFechaValida(fecha)) return false;
    if (fecha > hoy() || fecha < h.creado) return false;
    if (h.archivado && fecha >= h.archivado) return false;
    return true;
  }

  /** Escribe (o borra con null) el registro de un día. Devuelve el anterior para Deshacer. */
  function escribirLog(id, fecha, nuevo) {
    const mapa = indice.get(id);
    const antes = mapa.get(fecha) || null;
    if (nuevo) mapa.set(fecha, nuevo);
    else mapa.delete(fecha);
    return antes ? { ...antes } : null;
  }

  const soloNota = (id, fecha, nota) => ({ habitId: id, fecha, estado: 'nota', valor: null, nota });

  function registro(id, fecha, valor, anterior) {
    const log = { habitId: id, fecha, estado: 'registrado', valor };
    if (fecha === hoy()) log.registradoEn = horaLocal(reloj());
    else if (anterior?.registradoEn) log.registradoEn = anterior.registradoEn;
    if (anterior?.nota) log.nota = anterior.nota;
    return log;
  }

  return {
    hoy,
    habito,
    logDe,
    puedeMarcar,
    get config() { return config; },
    habitos: () => habits,
    cuantosLogs: (id) => indice.get(id)?.size ?? 0,
    /** Fechas distintas con al menos un registro (sirve para ganar paletas: no exige racha). */
    diasRegistrados() {
      const fechas = new Set();
      for (const mapa of indice.values()) for (const l of mapa.values()) if (l.estado === 'registrado') fechas.add(l.fecha);
      return fechas.size;
    },
    revision: (id) => `${epoca}.${revisiones.get(id) || 0}`,

    /* ---------- Hábitos ---------- */

    crearHabito(entrada) {
      const v = validarEntrada(entrada, hoy());
      if (!v.ok) return v;
      if (habits.length >= LIMITES.habitos) return { ok: false, error: 'editor.error.nombre' };
      const orden = habits.reduce((m, h) => Math.max(m, h.orden), 0) + 1;
      const h = sanearHabito({ ...v.datos, id: nuevoId(), archivado: null, pausas: [], orden }, hoy());
      habits.push(h);
      indice.set(h.id, new Map());
      avisar({ tipo: 'habito', id: h.id });
      return { ok: true, habito: h };
    },

    editarHabito(id, entrada) {
      const h = habito(id);
      if (!h) return { ok: false, error: 'editor.error.nombre' };
      const v = validarEntrada(entrada, hoy());
      if (!v.ok) return v;
      Object.assign(h, v.datos);
      avisar({ tipo: 'habito', id });
      return { ok: true, habito: h };
    },

    archivar(id) {
      const h = habito(id);
      if (!h || h.archivado) return null;
      const antes = h.archivado;
      h.archivado = hoy();
      avisar({ tipo: 'habito', id });
      return () => { h.archivado = antes; avisar({ tipo: 'habito', id }); };
    },

    restaurar(id) {
      const h = habito(id);
      if (!h) return;
      h.archivado = null;
      avisar({ tipo: 'habito', id });
    },

    /** Borra el hábito y todo su historial. Solo tras confirmación. */
    eliminar(id) {
      const i = habits.findIndex((h) => h.id === id);
      if (i < 0) return;
      habits.splice(i, 1);
      indice.delete(id);
      config = { ...config, recordatorios: config.recordatorios.filter((r) => r.habitId !== id) };
      avisar({ tipo: 'habito', id });
    },

    pausar(id, hasta) {
      const h = habito(id);
      const desde = hoy();
      if (!h || !esFechaValida(hasta) || hasta < desde) return null;
      const antes = h.pausas.map((p) => ({ ...p }));
      h.pausas = h.pausas.filter((p) => p.hasta < desde); // reemplaza pausas que se cruzan
      h.pausas.push({ desde, hasta });
      h.pausas = h.pausas.slice(-LIMITES.pausasMax);
      avisar({ tipo: 'habito', id });
      return () => { h.pausas = antes; avisar({ tipo: 'habito', id }); };
    },

    /** Termina la pausa vigente: el hábito vuelve a aparecer hoy. */
    reanudar(id) {
      const h = habito(id);
      if (!h) return;
      const d = hoy(), ayer = sumarDias(d, -1);
      h.pausas = h.pausas
        .map((p) => (p.desde <= d && p.hasta >= d ? { desde: p.desde, hasta: ayer } : p))
        .filter((p) => p.desde <= p.hasta && !(p.desde > d));
      avisar({ tipo: 'habito', id });
    },

    /* ---------- Registros ---------- */

    /**
     * Un toque en el check de un hábito Sí/No.
     * 1 vez al día: alterna hecho / pendiente.
     * N veces al día: suma 1; al completar, el siguiente toque vuelve a 0.
     */
    tocar(id, fecha) {
      const h = habito(id);
      if (!puedeMarcar(h, fecha) || h.tipo !== 'si_no') return null;
      const actual = logDe(id, fecha);
      const v = actual?.estado === 'registrado' ? actual.valor : 0;
      let siguiente, accion;
      if (v >= h.vecesPorDia) { siguiente = null; accion = 'desmarcado'; }
      else {
        siguiente = registro(id, fecha, v + 1, actual);
        accion = v + 1 >= h.vecesPorDia ? 'marcado' : 'sumado';
      }
      if (!siguiente && actual?.nota) siguiente = soloNota(id, fecha, actual.nota);
      const antes = escribirLog(id, fecha, siguiente);
      avisar({ tipo: 'log', id, fecha });
      return { accion, antes };
    },

    fijarValor(id, fecha, valorTexto) {
      const h = habito(id);
      if (!puedeMarcar(h, fecha)) return null;
      const valor = numero(valorTexto);
      if (valor === null) return { error: 'editor.error.numero' };
      const actual = logDe(id, fecha);
      const vacio = valor === 0 && h.tipo === 'si_no';
      let nuevo = vacio ? null : registro(id, fecha, h.tipo === 'si_no' ? Math.round(valor) : valor, actual);
      if (!nuevo && actual?.nota) nuevo = soloNota(id, fecha, actual.nota);
      const antes = escribirLog(id, fecha, nuevo);
      avisar({ tipo: 'log', id, fecha });
      return { antes, valor };
    },

    /**
     * Marca "Hoy no" (saltado) o "Descanso". Conserva la nota del día.
     * El descanso es un día libre planificado: solo se puede poner para hoy.
     * Un día pasado que se olvidó se cubre con un congelador.
     */
    fijarEstado(id, fecha, estado) {
      const h = habito(id);
      if (!puedeMarcar(h, fecha) || !['saltado', 'descanso'].includes(estado)) return null;
      if (estado === 'descanso' && fecha !== hoy()) return null;
      const actual = logDe(id, fecha);
      const nuevo = { habitId: id, fecha, estado, valor: null };
      if (actual?.nota) nuevo.nota = actual.nota;
      const antes = escribirLog(id, fecha, nuevo);
      avisar({ tipo: 'log', id, fecha });
      return { antes };
    },

    /** Gasta un congelador para cubrir un día perdido (hasta 2 días atrás). */
    usarCongelador(id, fecha) {
      const h = habito(id);
      if (!h || !puedeCongelar(h, fecha, hoy(), logDe)) return null;
      const actual = logDe(id, fecha);
      const nuevo = { habitId: id, fecha, estado: 'congelado', valor: null, usadoEn: hoy() };
      if (actual?.nota) nuevo.nota = actual.nota;
      const antes = escribirLog(id, fecha, nuevo);
      avisar({ tipo: 'log', id, fecha });
      return { antes };
    },

    /** Quita el registro del día. La nota, si hay, se conserva. */
    quitarLog(id, fecha) {
      const h = habito(id);
      if (!puedeMarcar(h, fecha)) return null;
      const actual = logDe(id, fecha);
      if (!actual || actual.estado === 'nota') return { antes: null };
      const antes = escribirLog(id, fecha, actual.nota ? soloNota(id, fecha, actual.nota) : null);
      avisar({ tipo: 'log', id, fecha });
      return { antes };
    },

    /** Escribe (o borra, con texto vacío) la nota de un día. */
    fijarNota(id, fecha, texto) {
      const h = habito(id);
      if (!puedeMarcar(h, fecha)) return null;
      const nota = String(texto ?? '').replace(/[\u0000-\u0008\u000B-\u001F\u007F]/g, '').slice(0, LIMITES.nota);
      const actual = logDe(id, fecha);
      let nuevo;
      if (nota.trim()) nuevo = actual && actual.estado !== 'nota' ? { ...actual, nota } : soloNota(id, fecha, nota);
      else if (actual && actual.estado !== 'nota') { nuevo = { ...actual }; delete nuevo.nota; }
      else nuevo = null;
      const antes = escribirLog(id, fecha, nuevo);
      avisar({ tipo: 'log', id, fecha });
      return { antes };
    },

    /** Notas de todos los hábitos, de la más reciente a la más antigua. */
    notas(limite = 50) {
      const lista = [];
      for (const [id, mapa] of indice) for (const l of mapa.values()) if (l.nota) lista.push({ habito: habito(id), fecha: l.fecha, nota: l.nota });
      return lista.sort((a, b) => (a.fecha < b.fecha ? 1 : a.fecha > b.fecha ? -1 : 0)).slice(0, limite);
    },

    /** Vuelve un registro a como estaba (para Deshacer). */
    restaurarLog(id, fecha, log) {
      if (!indice.has(id)) return;
      escribirLog(id, fecha, log ? { ...log } : null);
      avisar({ tipo: 'log', id, fecha });
    },

    /* ---------- Configuración y datos ---------- */

    /** `redibujar: false` guarda sin redibujar la pantalla (para campos de texto mientras se editan). */
    setConfig(cambios, { redibujar = true } = {}) {
      const c = { ...config, ...cambios };
      if (!FINES_DE_DIA.includes(c.finDelDia)) c.finDelDia = config.finDelDia;
      config = sanearConfig(c, new Set(habits.map((h) => h.id)));
      avisar({ tipo: 'config', redibujar });
    },

    /* ---------- Recordatorios ---------- */

    recordatoriosDe: (id) => config.recordatorios.filter((r) => r.habitId === id).map((r) => r.hora),

    /** Reemplaza las horas de recordatorio de un hábito. */
    fijarRecordatorios(id, horas) {
      if (!habito(id)) return;
      const otros = config.recordatorios.filter((r) => r.habitId !== id);
      const nuevos = (horas || []).map((hora) => ({ habitId: id, hora }));
      config = { ...config, recordatorios: sanearRecordatorios([...otros, ...nuevos], new Set(habits.map((h) => h.id))) };
      avisar({ tipo: 'config' });
    },

    /* ---------- Revisión semanal (M7) ---------- */

    revisiones: () => semanales,
    revisionDe: (lunes) => semanales.find((r) => r.semana === lunes) || null,

    guardarRevision(rev) {
      const lista = sanearRevisiones([...semanales.filter((r) => r.semana !== rev.semana), rev]);
      const antes = semanales;
      semanales = lista;
      avisar({ tipo: 'revision' });
      return () => { semanales = antes; avisar({ tipo: 'revision' }); };
    },

    /** Datos listos para guardar o exportar. */
    serializar() {
      const logs = [];
      for (const mapa of indice.values()) for (const l of mapa.values()) logs.push({ ...l });
      logs.sort((a, b) => (a.fecha < b.fecha ? -1 : a.fecha > b.fecha ? 1 : 0));
      return {
        schemaVersion: SCHEMA_VERSION,
        habits: habits.map((h) => ({ ...h, pausas: h.pausas.map((p) => ({ ...p })) })),
        logs,
        revisiones: semanales.map((r) => ({ ...r })),
        config: { ...config, recordatorios: config.recordatorios.map((r) => ({ ...r })) },
      };
    },

    /** Reemplaza todo (otra pestaña guardó cambios, o se importó un respaldo). */
    reemplazar(d, { guardar = false } = {}) {
      cargar(d);
      avisar({ tipo: guardar ? 'importado' : 'todo' });
    },

    /**
     * Combina un respaldo con lo actual sin borrar nada:
     * - hábitos nuevos se agregan; si el id ya existe, se queda el actual;
     * - un registro importado solo entra si ese día no tiene registro;
     * - recordatorios y revisiones se suman (lo actual gana si choca).
     * Devuelve cuántos hábitos y registros se agregaron.
     */
    combinar(d) {
      const actual = this.serializar();
      const ids = new Set(actual.habits.map((h) => h.id));
      const nuevosHabitos = d.habits.filter((h) => !ids.has(h.id));
      const claves = new Set(actual.logs.map((l) => `${l.habitId}|${l.fecha}`));
      const nuevosLogs = d.logs.filter((l) => !claves.has(`${l.habitId}|${l.fecha}`));
      let orden = actual.habits.reduce((m, h) => Math.max(m, h.orden), 0);
      const todos = [...actual.habits, ...nuevosHabitos.map((h) => ({ ...h, orden: ++orden }))];
      const semanas = new Set(actual.revisiones.map((r) => r.semana));
      cargar({
        schemaVersion: SCHEMA_VERSION,
        habits: todos,
        logs: [...actual.logs, ...nuevosLogs],
        revisiones: sanearRevisiones([...actual.revisiones, ...d.revisiones.filter((r) => !semanas.has(r.semana))]),
        config: {
          ...actual.config,
          recordatorios: sanearRecordatorios([...actual.config.recordatorios, ...d.config.recordatorios], new Set(todos.map((h) => h.id))),
        },
      });
      avisar({ tipo: 'importado' });
      return { habitos: nuevosHabitos.length, logs: nuevosLogs.length };
    },
  };
}
