// main.js — Arranque, navegación, cambio de día, acciones con Deshacer, caché de estadísticas,
// bloqueo con PIN, bóveda privada, recordatorios, aviso de respaldo e instalación (PWA).

import { el, icono, menosMovimiento, vaciar, vibrar } from './dom.js';
import { t } from './textos.js';
import { diffDias, fechaLocal, msHastaCambioDeDia } from './fechas.js';
import { datosVacios } from './esquema.js';
import { crearAlmacen } from './storage.js';
import { crearModelo } from './modelo.js';
import { estadoDelDia } from './calculos.js';
import { crearCache } from './estadisticas.js';
import { crearMotor } from './recordatorios.js';
import { fechaCorta, num } from './formato.js';
import { anunciar, crearDeshacer, renderAvisos } from './ui.js';
import { renderHoy } from './vistas/hoy.js';
import { renderProgreso } from './vistas/progreso.js';
import { renderAjustes } from './vistas/ajustes.js';
import { abrirDetalle } from './vistas/detalle.js';
import { abrirEditor } from './vistas/editor.js';
import { abrirAnalisis } from './vistas/analisis.js';
import { renderBloqueo } from './vistas/seguridad.js';
import { exportar } from './vistas/datos.js';
import { iniciarPWA } from './pwa.js';
import { BARRA, PALETA, paletaEfectiva } from './temas.js';
import { mostrarManifiestoSiToca } from './vistas/manifiesto.js';

const PESTANAS = [
  ['hoy', 'hoy', renderHoy],
  ['progreso', 'progreso', renderProgreso],
  ['ajustes', 'ajustes', renderAjustes],
];
const PISTA_TEMA = 'tavia:tema'; // copia mínima (tema y paleta) para pintar sin parpadeo antes de abrir la base

/** Transiciones de interfaz (pestañas, tema): no con movimiento reducido, ni bajo navegador automatizado
 *  (las pruebas congelan el reloj y verían colores a medio fundir). */
const animarInterfaz = () => !menosMovimiento() && !navigator.webdriver;

/** Aplica tema y paleta al documento y a la barra del sistema. */
function pintarTema(tema, paleta) {
  const raiz = document.documentElement;
  if (tema === 'claro' || tema === 'oscuro' || tema === 'negro') raiz.dataset.theme = tema;
  else delete raiz.dataset.theme;
  if (paleta && paleta !== 'ambar') raiz.dataset.paleta = paleta;
  else delete raiz.dataset.paleta;
  document.querySelectorAll('meta[name="theme-color"]').forEach((m, i) => {
    m.setAttribute('content', tema === 'auto' ? (i === 0 ? BARRA.claro : BARRA.oscuro) : BARRA[tema]);
  });
}

// Antes de abrir la base de datos (asíncrona), pintamos con lo último que se usó.
try {
  const [tema, paleta] = (localStorage.getItem(PISTA_TEMA) || '').split('|');
  if (tema) pintarTema(tema, PALETA[paleta] ? paleta : 'ambar');
} catch { /* sin localStorage: se pinta al cargar */ }

async function iniciar() {
  const vista = document.getElementById('vista');
  const principal = document.getElementById('app');
  const nav = document.getElementById('pestanas');
  const capaBloqueo = document.getElementById('bloqueo');
  const deshacer = crearDeshacer(document.getElementById('deshacer'));
  const avisos = new Map(); // clave → { accion?, vars? }
  const contenedorAvisos = el('div', { class: 'avisos' });
  const cache = crearCache();
  const hashInicial = location.hash.replace('#', '');

  let renderPendiente = false;
  let cargado = false; // evita avisos de paletas al reemplazar datos durante el arranque
  let bloqueoDibujado = false;
  const ctx = {
    pestana: leerPestana(),
    fechaVista: null, // null = hoy
    recienCompletados: new Set(), // muestran su frase de identidad durante la sesión
    rescatesDescartados: new Set(), // "id|fecha" que el usuario cerró
    recordatoriosDescartados: new Set(),
    semanaDescartada: null,
    animar: null, // "id|fecha" del check que acaba de marcarse
    verPrivados: false, // bóveda privada abierta (se cierra al bloquear)
    bloqueado: false,
    contenedorAvisos,
    render: () => {
      if (renderPendiente) return;
      renderPendiente = true;
      queueMicrotask(() => { renderPendiente = false; dibujar(); });
    },
    avisar: (clave, op = {}) => { avisos.set(clave, op); ctx.render(); },
    quitarAviso: (clave) => { if (avisos.delete(clave)) ctx.render(); },
    deshacer: (texto, fn) => deshacer.mostrar(texto, fn),
    mostrarError: (texto) => deshacer.mostrar(texto),
  };

  const almacen = crearAlmacen({ alAviso: (clave) => ctx.avisar(clave) });
  ctx.almacen = almacen;
  const datos = await almacen.cargar(fechaLocal());

  let modelo;
  modelo = crearModelo(datos, {
    alCambiar: (cambio) => {
      // Marcar (log) se guarda en el acto; el resto agrupa toques con una pequeña espera.
      if (cambio.tipo !== 'todo') almacen.guardar(modelo.serializar(), { ya: cambio.tipo === 'log' });
      if (cambio.tipo === 'todo' || cambio.tipo === 'importado') cache.olvidar();
      if (['log', 'habito', 'importado', 'todo'].includes(cambio.tipo)) contarDias(cambio.tipo === 'log');
      if (cambio.tipo === 'config' || cambio.tipo === 'importado') { aplicarTema(); revisarDia(); }
      if (cambio.redibujar !== false) ctx.render();
    },
  });
  ctx.modelo = modelo;

  /* Días registrados: desbloquean paletas. Si se gana una nueva, se avisa con calma (sin confeti). */
  let diasRegistrados = modelo.diasRegistrados();
  ctx.diasRegistrados = () => diasRegistrados;
  function contarDias(avisar) {
    const antes = diasRegistrados;
    diasRegistrados = modelo.diasRegistrados();
    if (diasRegistrados !== antes) aplicarTema(); // por si la paleta elegida dejó de estar ganada
    const nueva = Object.entries(PALETA).find(([, p]) => p.dias > antes && p.dias <= diasRegistrados);
    if (nueva && avisar && cargado) deshacer.mostrar(t('paleta.ganada', { nombre: t(`paleta.${nueva[0]}`) }));
  }
  ctx.stats = (h) => cache.obtener(h, modelo.hoy(), modelo.logDe, modelo.revision(h.id));
  /** Sin PIN no hay bóveda: los "privados" se ven. Con PIN, solo con la bóveda abierta. */
  ctx.mostrarPrivados = () => !modelo.config.pinHash || ctx.verPrivados;
  ctx.visibles = () => (ctx.mostrarPrivados() ? modelo.habitos() : modelo.habitos().filter((h) => !h.privado));
  ctx.bloqueado = Boolean(modelo.config.pinHash);
  aplicarTema();

  /* ---------- Acciones (con Deshacer y anuncios) ---------- */

  const nombre = (id) => modelo.habito(id)?.nombre ?? '';
  const marcarHecho = (id, fecha) => {
    vibrar();
    ctx.animar = `${id}|${fecha}`;
    if (fecha === modelo.hoy()) ctx.recienCompletados.add(id);
  };

  ctx.tocar = (id, fecha) => {
    const r = modelo.tocar(id, fecha);
    if (!r) return;
    const h = modelo.habito(id);
    if (r.accion === 'marcado') {
      marcarHecho(id, fecha);
      anunciar(t('deshacer.marcado', { nombre: h.nombre }));
    } else if (r.accion === 'sumado') {
      vibrar(8);
      anunciar(t('veces.resumen', { valor: modelo.logDe(id, fecha)?.valor ?? 0, n: h.vecesPorDia }));
    } else {
      ctx.recienCompletados.delete(id);
      // Desmarcar por error es lo más común: ofrecemos deshacer.
      deshacer.mostrar(t('deshacer.desmarcado', { nombre: h.nombre }), () => modelo.restaurarLog(id, fecha, r.antes));
    }
  };

  ctx.fijarValor = (id, fecha, texto, { silencioso = false } = {}) => {
    const r = modelo.fijarValor(id, fecha, texto);
    if (!r || r.error) return r;
    const h = modelo.habito(id);
    if (estadoDelDia(h, modelo.logDe(id, fecha)) === 'hecho') marcarHecho(id, fecha);
    if (!silencioso) deshacer.mostrar(t('deshacer.valor', { valor: num(r.valor), nombre: h.nombre }), () => modelo.restaurarLog(id, fecha, r.antes));
    return r;
  };

  ctx.fijarEstado = (id, fecha, estado, { silencioso = false } = {}) => {
    const r = modelo.fijarEstado(id, fecha, estado);
    if (!r) return;
    ctx.recienCompletados.delete(id);
    if (!silencioso) deshacer.mostrar(t('deshacer.estado', { nombre: nombre(id), estado: t(`estado.${estado}`) }), () => modelo.restaurarLog(id, fecha, r.antes));
  };

  ctx.usarCongelador = (id, fecha) => {
    const r = modelo.usarCongelador(id, fecha);
    if (!r) return;
    deshacer.mostrar(t('congelar.hecho', { nombre: nombre(id), fecha: fechaCorta(fecha) }), () => modelo.restaurarLog(id, fecha, r.antes));
  };

  ctx.quitarLog = (id, fecha) => {
    const r = modelo.quitarLog(id, fecha);
    if (!r || !r.antes) return;
    ctx.recienCompletados.delete(id);
    deshacer.mostrar(t('deshacer.borrado', { nombre: nombre(id) }), () => modelo.restaurarLog(id, fecha, r.antes));
  };

  ctx.fijarNota = (id, fecha, texto) => {
    const r = modelo.fijarNota(id, fecha, texto);
    if (r) anunciar(t('nota.guardada'));
    return r;
  };

  ctx.archivar = (id) => {
    const volver = modelo.archivar(id);
    if (volver) deshacer.mostrar(t('deshacer.archivado', { nombre: nombre(id) }), volver);
  };

  ctx.pausar = (id, hasta) => {
    const volver = modelo.pausar(id, hasta);
    if (volver) deshacer.mostrar(t('deshacer.pausado', { nombre: nombre(id) }), volver);
  };

  ctx.abrirDetalle = (id, fecha) => abrirDetalle(ctx, id, fecha);
  ctx.abrirEditor = (id = null, plantilla = null) => abrirEditor(ctx, id, plantilla);
  ctx.abrirAnalisis = (id) => abrirAnalisis(ctx, id);
  ctx.alGuardarHabito = (h, esNuevo) => {
    if (esNuevo) {
      // Con el primer hábito pedimos al navegador que no borre los datos.
      if (modelo.habitos().length === 1) almacen.pedirPersistencia();
      if (ctx.pestana !== 'hoy') irA('hoy');
    }
  };
  ctx.verFecha = (fecha) => {
    ctx.fechaVista = fecha;
    if (ctx.pestana !== 'hoy') irA('hoy');
    else ctx.render();
  };
  ctx.ocultarAvisoPara = (clave) => {
    // Avisos que no deben volver (por ejemplo, el de iPhone) quedan anotados en la configuración.
    modelo.setConfig({ avisosVistos: [...modelo.config.avisosVistos, clave] });
  };
  ctx.borrarTodo = async () => {
    modelo.reemplazar(datosVacios(), { guardar: true });
    await almacen.guardarYa();
    location.reload();
  };

  /* ---------- Bloqueo con PIN ---------- */

  function bloquear() {
    if (!modelo.config.pinHash) return;
    ctx.bloqueado = true;
    ctx.verPrivados = false;
    for (const d of document.querySelectorAll('dialog[open]')) d.close();
    deshacer.ocultar();
    dibujar();
  }
  function desbloquear() {
    ctx.bloqueado = false;
    dibujar();
    vista.focus({ preventScroll: true });
    mostrarManifiestoSiToca(ctx);
  }
  ctx.bloquear = bloquear;

  /* ---------- Dibujo ---------- */

  function dibujar() {
    document.body.toggleAttribute('data-bloqueado', ctx.bloqueado);
    principal.inert = ctx.bloqueado;
    nav.inert = ctx.bloqueado;
    if (ctx.bloqueado) {
      vaciar(vista); // nada sensible queda en pantalla ni en el DOM
      vaciar(nav);
      if (!bloqueoDibujado) { renderBloqueo(capaBloqueo, ctx, desbloquear); bloqueoDibujado = true; }
      return;
    }
    if (bloqueoDibujado) { vaciar(capaBloqueo); bloqueoDibujado = false; }

    // Conservamos el foco del teclado entre redibujos.
    const foco = document.activeElement?.closest?.('[data-foco]')?.dataset.foco;
    const enHoja = document.activeElement?.closest?.('dialog');

    renderAvisos(contenedorAvisos, avisos, (clave) => {
      avisos.delete(clave);
      if (clave === 'aviso.ios') ctx.ocultarAvisoPara('ios');
      ctx.render();
    });
    vaciar(vista);
    const [, , render] = PESTANAS.find(([id]) => id === ctx.pestana) || PESTANAS[0];
    render(vista, ctx);
    ctx.animar = null;
    dibujarPestanas();

    if (foco && !enHoja) document.querySelector(`[data-foco="${CSS.escape(foco)}"]`)?.focus({ preventScroll: true });
  }

  function dibujarPestanas() {
    vaciar(nav);
    for (const [id, ic] of PESTANAS) {
      nav.append(el('button', {
        class: 'tv-pestana', type: 'button', data: { foco: `tab-${id}` },
        aria: { current: ctx.pestana === id ? 'page' : null },
        onclick: () => irA(id),
      }, el('span', { class: 'tv-pestana__fondo' }, icono(ic)), t(`pestana.${id}`)));
    }
  }

  function irA(id) {
    if (ctx.pestana === id) { if (id === 'hoy' && ctx.fechaVista) { ctx.fechaVista = null; ctx.render(); } return; }
    const orden = (p) => PESTANAS.findIndex(([x]) => x === p);
    const adelante = orden(id) > orden(ctx.pestana);
    ctx.pestana = id;
    if (location.hash !== `#${id}`) history.replaceState(null, '', `#${id}`);
    deshacer.ocultar();
    transicion(() => { dibujar(); window.scrollTo(0, 0); }, adelante ? 'adelante' : 'atras');
    vista.focus({ preventScroll: true });
  }

  /** Cambio de pantalla o de tema con transición de vista (solo si el navegador la tiene y no se pidió menos movimiento). */
  function transicion(cambio, direccion) {
    const raiz = document.documentElement;
    if (!document.startViewTransition || !animarInterfaz() || document.hidden) { cambio(); return; }
    raiz.dataset.transicion = direccion;
    try {
      const vt = document.startViewTransition(cambio);
      // Red de seguridad: una transición nunca puede dejar la pantalla sin responder.
      const corte = setTimeout(() => vt.skipTransition?.(), 700);
      vt.finished.finally(() => { clearTimeout(corte); delete raiz.dataset.transicion; });
    } catch { delete raiz.dataset.transicion; cambio(); }
  }
  ctx.irA = irA;

  function aplicarTema() {
    const tema = modelo.config.tema;
    const paleta = paletaEfectiva(modelo.config.paleta, diasRegistrados);
    const clave = `${tema}|${paleta}`;
    // Al cambiar de tema, los colores se funden un momento (sin bloquear nada).
    const pintado = aplicarTema.pintado;
    if (pintado && pintado !== clave && animarInterfaz()) {
      const raiz = document.documentElement;
      raiz.setAttribute('data-cambiando-tema', '');
      clearTimeout(aplicarTema.reloj);
      aplicarTema.reloj = setTimeout(() => raiz.removeAttribute('data-cambiando-tema'), 420);
    }
    pintarTema(tema, paleta);
    aplicarTema.pintado = clave;
    try { localStorage.setItem(PISTA_TEMA, `${tema}|${paleta}`); } catch { /* no es grave */ }
  }

  /* ---------- Aviso de respaldo (más de 14 días) ---------- */

  function revisarRespaldo() {
    const hs = modelo.habitos();
    avisos.delete('aviso.respaldo');
    avisos.delete('aviso.respaldoNunca');
    if (!hs.length) return;
    const hoy = modelo.hoy();
    const accion = { texto: t('aviso.respaldo.boton'), fn: () => exportar(ctx) };
    const u = modelo.config.ultimoRespaldo;
    if (u) {
      const n = diffDias(u, hoy);
      if (n > 14) avisos.set('aviso.respaldo', { vars: { n }, accion });
    } else {
      const inicio = hs.reduce((m, h) => (h.creado < m ? h.creado : m), hoy);
      if (diffDias(inicio, hoy) >= 14) avisos.set('aviso.respaldoNunca', { accion });
    }
  }

  /* ---------- Cambio de día y recordatorios ---------- */

  const motor = crearMotor(ctx);
  let diaActual = modelo.hoy();
  let temporizadorDia = null;
  function revisarDia() {
    const d = modelo.hoy();
    if (d !== diaActual) {
      diaActual = d;
      ctx.fechaVista = null;
      ctx.recienCompletados.clear();
      ctx.recordatoriosDescartados.clear();
      deshacer.ocultar();
      motor.re/** Si el arranque falla, nunca queda la pantalla en blanco (M-6). No se muestran detalles internos. */
function mostrarFallo(error) {
  console.error('Tavia no pudo iniciar', error);
  const vista = document.getElementById('vista');
  if (!vista || vista.querySelector('.fallo')) return;
  vaciar(vista);
  vista.append(el('div', { class: 'vacio fallo', role: 'alert' },
    el('h1', { class: 'vacio__titulo' }, t('error.titulo')),
    el('p', { class: 'vacio__texto' }, t('error.texto')),
    el('button', { class: 'tv-boton tv-boton--principal', type: 'button', onclick: () => location.reload() }, t('error.recargar'))));
}

iniciar().catch(mostrarFallo);
      revisarRespaldo();
      ctx.render();
    }
    motor.revisar();
    clearTimeout(temporizadorDia);
    temporizadorDia = setTimeout(revisarDia, msHastaCambioDeDia(new Date(), modelo.config.finDelDia));
  }
  revisarRespaldo();
  revisarDia();
  setInterval(revisarDia, 60_000); // revisa recordatorios y es red de seguridad del cambio de día

  let ocultoDesde = null;
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
      ocultoDesde = Date.now();
      // Con PIN, el contenido se tapa al salir (para que no aparezca en el selector de apps).
      if (modelo.config.pinHash) document.body.setAttribute('data-privacidad', '');
      almacen.guardarYa();
      return;
    }
    document.body.removeAttribute('data-privacidad');
    if (modelo.config.pinHash && ocultoDesde !== null && Date.now() - ocultoDesde >= modelo.config.bloqueoSegundos * 1000) bloquear();
    ocultoDesde = null;
    revisarDia();
  });
  window.addEventListener('focus', revisarDia);
  window.addEventListener('pagehide', () => { almacen.guardarYa(); });

  /* ---------- Otras pestañas, navegación e instalación ---------- */

  almacen.escucharOtrasPestanas((d) => modelo.reemplazar(d), () => modelo.hoy());
  window.addEventListener('hashchange', () => {
    if (location.hash === '#nuevo') {
      history.replaceState(null, '', '#hoy');
      irA('hoy');
      if (!ctx.bloqueado) ctx.abrirEditor();
      return;
    }
    irA(leerPestana());
  });

  ctx.pwa = iniciarPWA(ctx);

  dibujar();
  cargado = true;
  document.documentElement.dataset.listo = ''; // avisa a rescate.js que la app abrió bien
  mostrarManifiestoSiToca(ctx);

  // Atajo "Nuevo hábito" desde el ícono de la app instalada.
  if (hashInicial === 'nuevo') {
    history.replaceState(null, '', '#hoy');
    if (!ctx.bloqueado) ctx.abrirEditor();
  }
}

function leerPestana() {
  const h = location.hash.replace('#', '');
  return PESTANAS.some(([id]) => id === h) ? h : 'hoy';
}

/** Si el arranque falla, nunca queda la pantalla en blanco (M-6). No se muestran detalles internos. */
function mostrarFallo(error) {
  console.error('Tavia no pudo iniciar', error);
  const vista = document.getElementById('vista');
  if (!vista || vista.querySelector('.fallo')) return;
  vaciar(vista);
  vista.append(el('div', { class: 'vacio fallo', role: 'alert' },
    el('h1', { class: 'vacio__titulo' }, t('error.titulo')),
    el('p', { class: 'vacio__texto' }, t('error.texto')),
    el('button', { class: 'tv-boton tv-boton--principal', type: 'button', onclick: () => location.reload() }, t('error.recargar'))));
}

iniciar().catch(mostrarFallo);
