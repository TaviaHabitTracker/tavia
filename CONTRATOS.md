# Contratos entre módulos

## Módulo 12 · Plantillas y rutinas guiadas

### Catálogo: `data/plantillas_tavia.json`

Archivo estático, versionado con la app y precacheado por el Service Worker. Sin red.

```json
{ "formato": 1, "version": 1, "rutinas": [ ... ], "retos": [ ... ] }
```

`js/plantillas.js → validarCatalogo(raw)` nunca lanza. Devuelve
`{ version, rutinas, retos, descartadas: [{ id, motivos }], avisos: [{ id, aviso }] }`.
Lo inválido se descarta con su motivo; un id repetido se queda con el primero.

**Rutina**

| Campo | Valores |
|---|---|
| `id` | minúsculas, números y guiones, hasta 48 |
| `nombre`, `descripcion` | texto (descripción de una línea, hasta 90 para el linter) |
| `objetivo` | palabra corta (para el cuestionario) |
| `momento` | `manana` · `tarde` · `noche` · `flexible` |
| `minutosPorDia` | entero 1–120 (minutos reales; el filtro del explorador es «hasta 5 / 15 / 30») |
| `nivel` | `suave` · `normal` |
| `categoria` | `manana` `noche` `estudio` `movimiento` `calma` `hogar` `finanzas` `trabajo` `cuidado` `especiales` |
| `etiquetas` | hasta 8 |
| `sensible` | se fuerza a `true` en `noche` y `calma` |
| `avisoCuerpo` | se fuerza a `true` en `noche`, `movimiento` y `calma` (el texto vive en `textos.js`) |
| `palabraGuia` | opcional; solo se lee del módulo de frases |
| `habitos` | 1–12 |
| `escalera` | minutos ascendentes, hasta 8 pasos; siempre sugerida, nunca automática |

**Hábito de plantilla**

| Campo | Valores |
|---|---|
| `nombre`, `icono` | ícono de `ICONOS_PLANTILLA` (sin 💊 ni 🥗); otro → 🌱 con aviso |
| `tipo` | `check` → si_no · `cantidad` · `tiempo` → cantidad en «min» |
| `meta` | `{ modo: al_menos · como_maximo · libre, valor, unidad }` |
| `frecuencia` | las de la app (`diaria`, `dias_fijos`, `semanal_n`, `cada_n_dias`); otra → la más cercana con aviso `habito.frecuencia_aproximada` |
| `bloque` | `manana` `tarde` `noche` `dia` |
| `horaSugerida` | `HH:MM` u omitido (solo se propone; nunca activa un recordatorio) |
| `identidad` | empieza con «Soy una persona que…» |
| `pregunta` | para la notificación |
| `versionMinima` | obligatoria (2 minutos) |
| `nota` | consejo corto, sin afirmaciones médicas |

**Reto**: `id`, `nombre`, `descripcion`, `duracionDias` (14 · 21 · 30), `categoria`, `habito` (mismo esquema),
`hitos` (días dentro del reto, ordenados, hasta 6), `textoCierre`, `sensible`, `avisoCuerpo`.

### Archivo de rutina propia

`archivoRutina(rutina)` → `{ "tipo": "tavia-rutina", "formato": 1, "rutina": { ... } }`. Solo la plantilla:
sin registros, notas, fechas ni datos de la persona.
`leerArchivoRutina(texto)` → `{ ok, rutina, avisos }` o `{ ok: false, error }`. Límite de 64 KB y 12 hábitos;
rechaza `__proto__`, `constructor` y `prototype` en cualquier nivel y anidación mayor a 12.

### De plantilla a hábito

`aEntradaHabito(habitoPlantilla, cambios)` devuelve la entrada que espera `modelo.crearHabito()`.
`cambios` admite `nombre`, `icono`, `color`, `frecuencia`, `bloque` y `meta`.

### Linter de contenido (solo desarrollo)

`tests/plantillas-linter.mjs` y `node tests/revisar-plantillas.mjs`. Falla ante dieta, peso, cuerpo ideal,
medicamentos, promesas médicas, estudios o cifras inventadas (porcentajes, «21 días forman un hábito»),
culpa («tienes que», «debes», «sin excusas»…) y presión de venta. También exige identidad,
pregunta, versión mínima, texto de cierre e hitos, y que la hidratación no traiga cifra impuesta.

### Pendiente para fases siguientes

- P4: `habit.sensible` y `habit.origenPlantilla`; datos `plantillasUsuario`, `aplicaciones`, `retos`, `ajustes.plantillas` en migraciones y respaldo.
- Eventos `tavia:plantilla-aplicada` y `tavia:reto-completado` (sin textos del usuario).
