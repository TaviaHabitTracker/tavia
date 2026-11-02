// sw.js — Service Worker de Tavia: la app funciona sin internet.
// Estrategia: precache de todos los archivos + cache-first.
// IMPORTANTE: cada vez que cambies cualquier archivo de la app, sube VERSION.
// Así el navegador detecta la versión nueva y la app muestra "Hay una versión nueva · Actualizar".

const VERSION = 'tavia-0.10.0';

const ARCHIVOS = [
  './',
  './index.html',
  './styles.css',
  './manifest.json',
  './fonts/InstrumentSans-Variable.woff2',
  './fonts/FrauncesSoft-Variable.woff2',
  './icons/icon.svg',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/maskable-512.png',
  './icons/apple-touch-icon.png',
  './icons/favicon-32.png',
  './js/rescate.js',
  './js/main.js',
  './js/textos.js',
  './js/fechas.js',
  './js/esquema.js',
  './js/storage.js',
  './js/modelo.js',
  './js/calculos.js',
  './js/estadisticas.js',
  './js/formato.js',
  './js/dom.js',
  './js/ui.js',
  './js/pwa.js',
  './js/respaldo.js',
  './js/cripto.js',
  './js/recordatorios.js',
  './js/insights.js',
  './js/temas.js',
  './js/analisis.js',
  './js/frases.js',
  './js/palabras.js',
  './data/frases_tavia.json',
  './js/anual.js',
  './js/tarjeta-anual.js',
  './js/vistas/hoy.js',
  './js/vistas/detalle.js',
  './js/vistas/editor.js',
  './js/vistas/progreso.js',
  './js/vistas/ajustes.js',
  './js/vistas/seguridad.js',
  './js/vistas/datos.js',
  './js/vistas/ritual.js',
  './js/vistas/semana.js',
  './js/vistas/manifiesto.js',
  './js/vistas/anual.js',
  './js/vistas/analisis.js',
  './js/vistas/frases.js',
  './js/vistas/palabras.js',
];

// Rutas absolutas de los archivos de la app (para reconocerlos en cada petición).
const RUTAS = new Set(ARCHIVOS.map((a) => new URL(a, self.location).pathname));

// Instalar: descarga todo de una vez. Si falta un archivo, no se instala (y la versión anterior sigue).
self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(ARCHIVOS)));
  // No llamamos skipWaiting aquí: la versión nueva espera a que el usuario toque "Actualizar".
});

// Activar: borra las cachés de versiones anteriores.
self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    for (const clave of await caches.keys()) {
      if (clave.startsWith('tavia-') && clave !== VERSION) await caches.delete(clave);
    }
    await self.clients.claim();
  })());
});

// La app pide activar la versión nueva cuando el usuario toca "Actualizar".
self.addEventListener('message', (e) => {
  if (e.data && e.data.tipo === 'saltarEspera') self.skipWaiting();
});

// Tocar un recordatorio abre (o enfoca) Tavia en la pantalla Hoy.
self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  e.waitUntil((async () => {
    const ventanas = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const v of ventanas) {
      if (new URL(v.url).origin === self.location.origin) return v.focus();
    }
    return self.clients.openWindow('./#hoy');
  })());
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // Tavia no carga nada de afuera

  // Navegación: siempre la página de la app (sirve aunque no haya internet).
  if (req.mode === 'navigate') {
    e.respondWith((async () => {
      const cache = await caches.open(VERSION);
      return (await cache.match('./index.html')) || fetch(req);
    })());
    return;
  }

  // Solo los archivos de la app salen de la caché. Todo lo demás va directo a la red y nunca se guarda:
  // así, si algún día hay respuestas con datos (nube), no quedan copiadas aquí (B-3).
  const ruta = new URL(req.url).pathname;
  if (!RUTAS.has(ruta)) return;
  e.respondWith((async () => {
    const cache = await caches.open(VERSION);
    return (await cache.match(req, { ignoreSearch: true })) || fetch(req);
  })());
});
