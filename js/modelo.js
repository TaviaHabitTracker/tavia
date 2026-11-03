// modelo.js — Estado de la app en memoria y todas las operaciones sobre él.
// Sin DOM: se puede probar en Node. Cada cambio avisa con `alCambiar`,
// y main.js se encarga de guardar y volver a dibujar.

import {
  BLOQUES, COLORES, FINES_DE_DIA, LIMITES, SCHEMA_VERSION, TIPOS,
  numero, sanearConfig, sanearDescubrimientos, sanearFrecuencia, sanearFrases, sanearHabito, sanearMeta, sanearPalabras, sanearRecordatorios, sanearRevisiones,
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
      esencial: e.esencial === true,
    },
  };
}

export function crearModelo(datos, { reloj = () => new Date(), alCambiar = () => {} } = {}) {
  let habits = [];
  let config = sanearConfig(null);
  let semanales = []; // revisiones semanales (M7)
  let frases = sanearFrases(null); // M10: frase del día, vistas, favoritas, Mi frase
  let palabras = sanearPalabras(null); // M10: palabra del día, check-in, mínimo, palabras de identidad
  let descubrimientos = sanearDescubrimientos(null); // M11: descubrimientos de cada semana, guardados y "no volver a mostrar"
  let nuevaInstalacion = false;
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
    frases = sanearFrases(structuredClone(d.frases ?? null));
    palabras = sanearPalabras(structuredClone(d.palabras ?? null));
    descubrimientos = sanearDescubrimientos(structuredClone(d.descubrimientos ?? null), new Set(d.habits.map((h) => h.id)));
    // Id de instalación: semilla local para elegir frases (nunca sale del dispositivo).
    if (!config.idInstalacion) { config = { ...config, idInstalacion: nuevoId() }; nuevaInstalacion = true; }
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

  /** Aplica un cambio a las frases o palabras, siempre saneado. */
  const cambiarFrases = (fn, redibujar = true) => { frases = sanearFrases(fn(structuredClone(frases))); avisar({ tipo: 'guia', redibujar }); };
  const cambiarPalabras = (fn, redibujar = true) => { palabras = sanearPalabras(fn(structuredClone(palabras))); avisar({ tipo: 'guia', redibujar }); };
  const cambiarDesc = (fn, redibujar = true) => {
    const antes = descubrimientos;
    descubrimientos = sanearDescubrimientos(fn(structuredClone(descubrimientos)), new Set(habits.map((h) => h.id)));
    avisar({ tipo: 'descubrimientos', redibujar });
    return () => { descubrimientos = antes; avisar({ tipo: 'descubrimientos' }); };
  };
  const anotarVista = (f, id, fecha) => {
    if (!f.vistas.some((v) => v.id === id && v.fecha === fecha)) f.vistas.push({ id, fecha });
    // Solo sirven los últimos 120 días (60 de repetición + margen).
    f.vistas = f.vistas.filter((v) => v.fecha >= sumarDias(fecha, -120));
  };

  return {
    hoy,
    habito,
    /** true si el id de instalación se creó en esta carga (main.js lo guarda en el acto). */
    get nuevaInstalacion() { return nuevaInstalacion; },
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
      // Descubrimientos: los no guardados de ese hábito se borran; los guardados quedan sin nombre.
      descubrimientos = sanearDescubrimientos(descubrimientos, new Set(habits.map((h) => h.id)));
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

    /* ---------- Frases y palabras guía (M10) ---------- */

    get frases() { return frases; },
    get palabras() { return palabras; },

    /** Fija la frase del día (y la anota como vista). `propia`: es "Mi frase", no se anota. */
    fijarFraseDelDia({ fecha, id, contexto, propia = false }) {
      cambiarFrases((f) => {
        f.delDia = { fecha, id, contexto, ...(propia ? { propia: true } : {}) };
        if (!propia) anotarVista(f, id, fecha);
        return f;
      }, false);
    },
    cerrarFraseDelDia() {
      if (!frases.delDia) return null;
      cambiarFrases((f) => { f.delDia.cerrada = true; return f; });
      return () => cambiarFrases((f) => { if (f.delDia) delete f.delDia.cerrada; return f; });
    },
    /** Frase de cierre (una vez al día). `hitos`: claves de hitos que se celebran con ella. */
    fijarCierre({ fecha, id, contexto }, hitos = []) {
      cambiarFrases((f) => {
        f.cierre = { fecha, id, contexto };
        anotarVista(f, id, fecha);
        f.hitosVistos.push(...hitos);
        return f;
      }, false);
    },
    alternarFavorita(id) {
      cambiarFrases((f) => {
        f.favoritas = f.favoritas.includes(id) ? f.favoritas.filter((x) => x !== id) : [id, ...f.favoritas];
        return f;
      });
    },
    fijarMiFrase(texto, { redibujar = false } = {}) {
      cambiarFrases((f) => { f.miFrase = String(texto ?? ''); return f; }, redibujar);
    },
    /** Palabra del día: id, '-' (saltada) o null (borrar). */
    fijarPalabra(fecha, id) {
      if (!esFechaValida(fecha)) return;
      cambiarPalabras((p) => { if (id) p.porDia[fecha] = id; else delete p.porDia[fecha]; return p; });
    },
    fijarCheckin(fecha, estado) {
      if (!esFechaValida(fecha)) return;
      cambiarPalabras((p) => { if (estado) p.checkin[fecha] = estado; else delete p.checkin[fecha]; return p; });
    },
    /** "Solo lo esencial" hoy (o null para volver a ver todo). */
    fijarMinimo(fecha) {
      cambiarPalabras((p) => { p.minimo = fecha; return p; });
    },
    fijarPalabrasIdentidad(ids) {
      cambiarPalabras((p) => { p.identidad = Array.isArray(ids) ? ids : []; return p; });
    },

    /* ---------- Descubrimientos (M11) ---------- */

    get descubrimientos() { return descubrimientos; },
    /** Guarda la selección de una semana (una sola vez por semana: abrir la app de nuevo no la cambia). */
    fijarSemanaDesc(semana, nuevos) {
      if (!esFechaValida(semana)) return;
      cambiarDesc((d) => {
        const ids = new Set(d.items.map((x) => x.id));
        d.items.push(...nuevos.filter((x) => !ids.has(x.id)));
        // Fuera lo vencido hace más de un año que no se guardó (el archivo no crece sin fin).
        const corte = sumarDias(semana, -371);
        d.items = d.items.filter((x) => x.estado === 'guardado' || x.semana >= corte);
        d.semana = semana;
        return d;
      }, false);
    },
    /** nuevo → visto · guardado · oculto. Devuelve una función para deshacer. */
    estadoDesc(id, estado) {
      if (!descubrimientos.items.some((x) => x.id === id)) return null;
      return cambiarDesc((d) => { for (const x of d.items) if (x.id === id) x.estado = estado; return d; });
    },
    marcarVistosDesc(ids) {
      const set = new Set(ids);
      if (!descubrimientos.items.some((x) => set.has(x.id) && x.estado === 'nuevo')) return;
      cambiarDesc((d) => { for (const x of d.items) if (set.has(x.id) && x.estado === 'nuevo') x.estado = 'visto'; return d; }, false);
    },
    /** "No volver a mostrar este": se oculta y su firma (tipo + hábitos) no vuelve. */
    noMostrarDesc(id, firma) {
      return cambiarDesc((d) => {
        for (const x of d.items) if (x.id === id) x.estado = 'oculto';
        if (!d.noMostrar.includes(firma)) d.noMostrar.push(firma);
        return d;
      });
    },
    accionDescHecha(id, hecha = true) {
      cambiarDesc((d) => { for (const x of d.items) if (x.id === id && x.accion) { if (hecha) x.accion.hecha = true; else delete x.accion.hecha; } return d; }, false);
    },
    /** Olvida lo calculado (por ejemplo, tras cambiar los ajustes): se recalcula esta semana. */
    reiniciarSemanaDesc() {
      cambiarDesc((d) => { d.items = d.items.filter((x) => x.semana !== d.semana || x.estado === 'guardado'); d.semana = null; return d; }, false);
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
        frases: structuredClone(frases),
        palabras: structuredClone(palabras),
        descubrimientos: structuredClone(descubrimientos),
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
        // Frases y palabras: se suman favoritas, vistas y días; lo actual gana si choca.
        frases: {
          ...actual.frases,
          favoritas: [...new Set([...actual.frases.favoritas, ...(d.frases?.favoritas || [])])],
          vistas: [...actual.frases.vistas, ...(d.frases?.vistas || [])],
          miFrase: actual.frases.miFrase || d.frases?.miFrase || '',
        },
        palabras: {
          ...actual.palabras,
          porDia: { ...(d.palabras?.porDia || {}), ...actual.palabras.porDia },
          checkin: { ...(d.palabras?.checkin || {}), ...actual.palabras.checkin },
          identidad: actual.palabras.identidad.length ? actual.palabras.identidad : (d.palabras?.identidad || []),
        },
        // Descubrimientos: se queda lo actual y se suman los guardados del respaldo.
        descubrimientos: {
          ...actual.descubrimientos,
          items: [...actual.descubrimientos.items, ...(d.descubrimientos?.items || []).filter((x) => x.estado === 'guardado' && !actual.descubrimientos.items.some((y) => y.id === x.id))],
          noMostrar: [...new Set([...actual.descubrimientos.noMostrar, ...(d.descubrimientos?.noMostrar || [])])],
        },
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
