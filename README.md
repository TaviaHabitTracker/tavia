# Tavia Habit Tracker — versión 0.9 (diseño «Analista»)

App de hábitos privada, elegante y que perdona. PWA en HTML, CSS y JavaScript puro: sin cuenta, sin servidor, sin rastreadores. Se instala en el celular o el PC y funciona sin internet.

## Probarla en tu PC

Los módulos de JavaScript y el Service Worker no funcionan abriendo `index.html` con doble clic (`file://`). Hay que servir la carpeta:

1. Abre una terminal dentro de esta carpeta.
2. Ejecuta `python -m http.server 8000` (en Windows puede ser `py -m http.server 8000`).
3. Entra a http://localhost:8000

## Publicarla gratis (para instalarla en el celular)

La instalación y el modo sin internet necesitan **https**. GitHub Pages lo da gratis:

1. Crea un repositorio en GitHub y sube todos los archivos de esta carpeta (la raíz del repo debe tener `index.html`).
2. En el repo: Settings → Pages → Source: «Deploy from a branch» → rama `main`, carpeta `/ (root)` → Save.
3. En uno o dos minutos tendrás la dirección `https://TU-USUARIO.github.io/TU-REPO/`.

## Instalarla

- **Android (Chrome):** abre la dirección, menú ⋮ → «Instalar app» (o «Agregar a pantalla principal»). También aparece un botón «Instalar app» en Ajustes.
- **iPhone / iPad (Safari):** abre la dirección en Safari → botón Compartir → «Añadir a pantalla de inicio». Importante: en iPhone, Safari puede borrar los datos de sitios web que no usas por unos días; instalada en la pantalla de inicio queda mucho más protegida.
- **PC (Chrome o Edge):** ícono de instalar en la barra de direcciones, o botón «Instalar app» en Ajustes.

Mantén presionado el ícono instalado (Android y PC) para ver los atajos: Hoy, Nuevo hábito y Progreso.

## Publicar cambios

Cada vez que cambies cualquier archivo, sube la versión en **dos** lugares y vuelve a subir los archivos:

- `sw.js` → `const VERSION = 'tavia-0.9.1'`
- `js/textos.js` → `version: '0.9.1'`

Quien tenga la app abierta verá «Hay una versión nueva de Tavia · Actualizar». Sus datos no se tocan.

## Lo que trae

- **Hoy:** un toque por hábito, bloques Mañana / Día / Noche, rescate de días olvidados, modo Ritual (un hábito a la vez, a pantalla completa).
- **Progreso:** mapa de 30 días, puntaje que perdona, rachas con congeladores, «Lo que dicen tus datos» (mejor día, hábito ancla, hora fuerte) y revisión semanal.
- **Recordatorios:** aviso del sistema con la app abierta, tarjeta «Ya pasó la hora de…» al abrirla, y archivo `.ics` para el calendario del teléfono (el único que avisa siempre con la app cerrada).
- **Tus datos:** respaldo JSON, respaldo cifrado (AES-GCM con contraseña), CSV para Excel e importación con resumen, Combinar o Reemplazar, y Deshacer. Aviso si pasan más de 14 días sin respaldo.
- **Seguridad:** PIN de 4 a 8 dígitos (guardado como hash PBKDF2 con sal, nunca en claro), bloqueo automático, espera creciente tras 5 intentos, y bóveda de hábitos privados.
- **Diseño «Analista» (0.9):** grafito o papel con un solo color de acento, tipografía Instrument Sans y cifras tabulares. Temas automático, claro, oscuro y negro puro. Colores de acento: Ámbar, y Cobre, Salvia, Acero y Platino, que se ganan con 7, 30, 60 y 100 días registrados, seguidos o no.
- **El brote:** en Hoy, un anillo con un tallo que echa hojas a medida que cumples los hábitos del día y florece al completarlos. Al lado, hábitos de hoy, días seguidos, índice de constancia y % de la semana; la semana es tocable.
- **Análisis de racha:** por hábito (desde Progreso o el detalle): racha actual y mejor, índice de constancia en el tiempo (se recorre con el dedo o las flechas), cuánto tardas en volver tras fallar, historial de rachas, cumplimiento por día de la semana y una lectura en una frase.
- **Íconos propios:** un set SVG del mismo trazo; los emojis antiguos se muestran con su ícono equivalente.
- **Tu año:** resumen anual tipo *Wrapped* en Progreso, con una tarjeta 1080×1920 para guardar o compartir como imagen (se crea en el teléfono con canvas).
- **Tu manifiesto:** unas líneas propias que aparecen al abrir (una vez al día, se cierran solas o con un toque) o como una línea arriba en Hoy.
- **Guardado:** IndexedDB. La primera vez se mudan solos los datos de localStorage; si el navegador no tiene IndexedDB, sigue con localStorage.

## Estructura

```
index.html          Página, CSP y enlaces de PWA
styles.css          Marca (claro y oscuro) y componentes
manifest.json       Nombre, íconos, colores, atajos
sw.js               Service Worker: precache, sin internet, actualización
icons/              Íconos 192, 512, maskable, Apple y favicon
fonts/              Instrument Sans (licencia OFL incluida)
js/main.js          Arranque, pestañas, cambio de día, Deshacer
js/pwa.js           Registro del Service Worker, aviso de actualización, instalar
js/textos.js        Todos los textos (listo para otros idiomas)
js/fechas.js        fechaLocal(), día lógico con hora de fin del día
js/esquema.js       Forma de los datos, migrate(), validación y saneamiento
js/storage.js       IndexedDB (con mudanza desde localStorage), try/catch y respaldo en memoria
js/modelo.js        Hábitos, registros, notas, congeladores, revisiones
js/calculos.js      Qué toca cada día y en qué estado está cada hábito
js/estadisticas.js  Puntaje, rachas, congeladores, mapa de calor (+ caché)
js/formato.js       Números, frecuencias, metas y rachas en texto
js/dom.js           Construcción segura del DOM (sin innerHTML)
js/ui.js            Hojas, confirmación, Deshacer, avisos
js/respaldo.js      Exportar, validar e importar respaldos; CSV
js/cripto.js        PIN (PBKDF2) y respaldo cifrado (AES-GCM)
js/recordatorios.js Motor de avisos y archivo .ics
js/insights.js      Patrones de Progreso y revisión semanal
js/temas.js         Colores de acento y cuándo se ganan
js/analisis.js      Racha global, constancia y análisis por hábito
js/anual.js         Cálculo de "Tu año"
js/tarjeta-anual.js Dibujo de la tarjeta anual (canvas)
js/vistas/          Hoy, detalle, editor, Progreso, Ajustes, seguridad,
                    datos, Ritual, revisión semanal, manifiesto y Tu año
tests/              Pruebas automáticas (no se publican en la app)
```

## Pruebas automáticas (opcional)

```
TZ=America/Santiago node --test tests/*.test.mjs     # 79 pruebas de lógica
python -m http.server 8765 &                         # en otra terminal
node tests/e2e.cjs && node tests/e2e-m2m4.cjs && node tests/e2e-m5m7.cjs && node tests/e2e-m8.cjs && node tests/e2e-m9.cjs   # 64 pruebas en el navegador (requiere Playwright)
```

## Datos

Todo se guarda en este navegador, en IndexedDB (base `tavia`, clave `tavia:data`), con `schemaVersion` y `migrate()`. En localStorage solo quedan dos marcas pequeñas: `tavia:motor` (los datos ya se mudaron) y `tavia:tema` (para pintar el tema sin parpadeo). Rachas, puntaje y congeladores nunca se guardan como números: se calculan desde los registros.

El PIN protege de miradas casuales (alguien que toma tu teléfono desbloqueado). No cifra los datos del navegador: quien tenga acceso técnico al dispositivo podría leerlos. Para una copia realmente protegida, usa el respaldo cifrado.

Si actualizas desde la 0.7 con Tavia abierta en dos pestañas, recarga ambas después de actualizar: la pestaña vieja seguiría guardando en el lugar antiguo.
