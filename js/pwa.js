// pwa.js — Service Worker, aviso de actualización e instalación.

import { t } from './textos.js';

export function iniciarPWA(ctx) {
  const esIOS = /iphone|ipad|ipod/i.test(navigator.userAgent)
    || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1); // iPad con modo escritorio
  const instalada = () => globalThis.matchMedia?.('(display-mode: standalone)').matches || navigator.standalone === true;
  let eventoInstalar = null;

  // Chrome, Edge y Android avisan que la app se puede instalar: guardamos el evento para nuestro botón.
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    eventoInstalar = e;
    ctx.render();
  });
  window.addEventListener('appinstalled', () => { eventoInstalar = null; ctx.render(); });

  // iPhone sin instalar: Safari puede borrar los datos de sitios poco usados.
  if (esIOS && !instalada() && !ctx.modelo.config.avisosVistos.includes('ios') && ctx.modelo.habitos().length > 0) {
    ctx.avisar('aviso.ios');
  }

  const sw = registrarServiceWorker(ctx);

  return {
    /** Busca una versión nueva ahora. Devuelve 'nueva' (y muestra el aviso), 'aldia' o 'sinconexion'. */
    buscarActualizacion: () => sw.buscar(),
    esIOS,
    get instalada() { return instalada(); },
    get puedeInstalar() { return eventoInstalar !== null; },
    async instalar() {
      if (!eventoInstalar) return;
      eventoInstalar.prompt();
      try { await eventoInstalar.userChoice; } catch { /* cancelado */ }
      eventoInstalar = null;
      ctx.render();
    },
  };
}

function registrarServiceWorker(ctx) {
  const sinSW = { buscar: async () => 'sinconexion' };
  const seguro = location.protocol === 'https:' || ['localhost', '127.0.0.1', '[::1]'].includes(location.hostname);
  if (!('serviceWorker' in navigator) || !seguro) return sinSW;

  const habiaControlador = Boolean(navigator.serviceWorker.controller);
  let recargando = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    // Solo recargamos si ya había una versión funcionando (no en la primera visita).
    if (!habiaControlador || recargando) return;
    recargando = true;
    location.reload();
  });

  // Trusted Types: la única URL de script que la app arma es la del Service Worker.
  let urlSW = './sw.js';
  try {
    const politica = globalThis.trustedTypes?.createPolicy('tavia', {
      createScriptURL: (u) => { if (u !== './sw.js') throw new TypeError('URL de script no permitida'); return u; },
    });
    if (politica) urlSW = politica.createScriptURL('./sw.js');
  } catch { /* la política ya existía o el navegador no la soporta */ }

  let registro = null;
  const avisarSiEspera = () => {
    if (registro?.waiting && navigator.serviceWorker.controller) {
      ctx.avisar('aviso.actualizar', {
        accion: { texto: t('aviso.actualizar.boton'), fn: () => registro.waiting?.postMessage({ tipo: 'saltarEspera' }) },
      });
      return true;
    }
    return false;
  };
  // Espera a que la versión nueva termine de descargarse (si se está descargando).
  const esperarInstalacion = (nuevo) => new Promise((listo) => {
    if (!nuevo) { listo(); return; }
    const fin = () => { if (['installed', 'redundant', 'activated'].includes(nuevo.state)) listo(); };
    nuevo.addEventListener('statechange', fin);
    setTimeout(listo, 30000);
    fin();
  });

  const listo = navigator.serviceWorker.register(urlSW, { updateViaCache: 'none' }).then((reg) => {
    registro = reg;
    avisarSiEspera();
    reg.addEventListener('updatefound', () => {
      const nuevo = reg.installing;
      nuevo?.addEventListener('statechange', () => { if (nuevo.state === 'installed') avisarSiEspera(); });
    });
    // Buscar versión nueva al abrir, al volver a la app y cada 30 minutos con la app abierta.
    reg.update().catch(() => {});
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') reg.update().catch(() => {});
    });
    setInterval(() => { if (document.visibilityState === 'visible') reg.update().catch(() => {}); }, 30 * 60 * 1000);
    return reg;
  }).catch(() => null); // sin Service Worker la app igual funciona con conexión

  return {
    async buscar() {
      const reg = await listo;
      if (!reg) return 'sinconexion';
      if (avisarSiEspera()) return 'nueva';
      try { await reg.update(); } catch { return 'sinconexion'; }
      await esperarInstalacion(reg.installing);
      return avisarSiEspera() ? 'nueva' : 'aldia';
    },
  };
}
