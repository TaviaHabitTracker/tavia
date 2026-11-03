// importar/errores.js — Errores y límites del importador.
// Un error de importación lleva solo un código (y números, si sirven). Nunca contenido del
// archivo ni nombres de hábitos: el mensaje para el usuario sale de textos.js con el código (I5).

/** Límites duros. Un archivo que los supera se rechaza con un mensaje claro, nunca a medias. */
export const LIMITES_IMPORT = Object.freeze({
  archivo: 25 * 1024 * 1024, // tamaño del archivo elegido
  descomprimido: 100 * 1024 * 1024, // suma de todo lo que sale de un zip
  entrada: 50 * 1024 * 1024, // una sola entrada del zip, descomprimida
  ratio: 100, // relación descomprimido / comprimido de una entrada (zip bomb)
  ratioDesde: 1024 * 1024, // la relación solo se mira desde 1 MB (un CSV chico comprime mucho)
  entradas: 2000, // archivos dentro del zip
  filas: 500_000, // filas de un CSV
  columnas: 200, // columnas de un CSV
  celda: 10_000, // caracteres de una celda
  jsonProfundidad: 64, // anidamiento de un JSON
  jsonNodos: 2_000_000, // valores dentro de un JSON
});

export class ErrorImport extends Error {
  /** @param {string} codigo  p. ej. 'zip_bomba'  @param {object} [datos] solo números o códigos */
  constructor(codigo, datos = {}) {
    super(codigo);
    this.name = 'ErrorImport';
    this.codigo = codigo;
    this.datos = datos;
  }
}

export const esErrorImport = (e) => e instanceof ErrorImport;

/** Límites con ajustes (las pruebas usan límites chicos). Solo acepta claves conocidas. */
export function limitesCon(ajustes) {
  const l = { ...LIMITES_IMPORT };
  if (ajustes && typeof ajustes === 'object') {
    for (const k of Object.keys(LIMITES_IMPORT)) {
      if (Number.isFinite(ajustes[k]) && ajustes[k] > 0) l[k] = ajustes[k];
    }
  }
  return Object.freeze(l);
}

/** Lanza 'cancelado' si la señal ya se activó. */
export function revisarCancelacion(senal) {
  if (senal?.aborted) throw new ErrorImport('cancelado');
}
