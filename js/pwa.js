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

  registrarServiceWorker(ctx);

  return {
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
  const seguro = location.protocol === 'https:' || ['localhost', '127.0.0.1', '[::1]'].includes(location.hostname);
  if (!('serviceWorker' in navigator) || !seguro) return;

  const habiaControlador = Boolean(navigator.serviceWorker.controller);
  let recargando = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    // Solo recargamos si ya había una versión funcionando (no en la primera visita).
    if (!habiaControlador || recargando) return;
    recargando = true;
    location.reload();
  });

  navigator.serviceWorker.register('./sw.js').then((reg) => {
    const avisarSiEspera = () => {
      if (reg.waiting && navigator.serviceWorker.controller) {
        ctx.avisar('aviso.actualizar', {
          accion: { texto: t('aviso.actualizar.boton'), fn: () => reg.waiting?.postMessage({ tipo: 'saltarEspera' }) },
        });
      }
    };
    avisarSiEspera();
    reg.addEventListener('updatefound', () => {
      const nuevo = reg.installing;
      nuevo?.addEventListener('statechange', () => { if (nuevo.state === 'installed') avisarSiEspera(); });
    });
    // Buscar versión nueva cada vez que se vuelve a la app.
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') reg.update().catch(() => {});
    });
  }).catch(() => { /* sin Service Worker la app igual funciona con conexión */ });
}
