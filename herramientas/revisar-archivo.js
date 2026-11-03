// Página «Revisar un archivo»: prueba los lectores del importador en un teléfono real.
// Todo el DOM se arma con createElement y textContent (sin innerHTML: CSP con Trusted Types).
// Muestra solo estructura (columnas, conteos, formatos), nunca el contenido de las celdas.

import { crearLector } from '../js/importar/cliente.js';
import { soportaZip } from '../js/importar/zip.js';

// Mensajes amables por código. En I5 pasan a textos.js con el resto de la app.
const MENSAJES = {
  archivo_vacio: 'El archivo está vacío. Prueba exportar de nuevo desde tu app.',
  archivo_grande: 'El archivo es demasiado grande (más de 25 MB). Si tu app permite exportar solo los registros en CSV, prueba con eso.',
  archivo_desconocido: 'No reconozco este tipo de archivo. Prueba exportando como CSV o como zip.',
  archivo_invalido: 'No pude abrir ese archivo. Prueba elegirlo otra vez.',
  zip_sin_soporte: 'Este navegador no puede abrir archivos zip. Descomprímelo en tu teléfono o computador y usa «Elegir carpeta descomprimida».',
  zip_cifrado: 'El zip tiene contraseña. Expórtalo sin contraseña para poder leerlo.',
  zip_bomba: 'Este zip se agranda de forma anormal al abrirlo, así que no lo abrí. Exporta de nuevo desde tu app.',
  zip_grande: 'El zip trae demasiados datos al descomprimirlo.',
  zip_entrada_grande: 'Uno de los archivos dentro del zip es demasiado grande.',
  zip_muchas_entradas: 'El zip trae demasiados archivos.',
  zip_vacio: 'El zip no trae archivos.',
  zip_metodo: 'El zip usa un tipo de compresión que no puedo leer. Descomprímelo y usa «Elegir carpeta descomprimida».',
  zip64: 'Este zip usa un formato extendido que no puedo leer. Descomprímelo y usa «Elegir carpeta descomprimida».',
  zip_multidisco: 'Este zip está dividido en varias partes. Expórtalo en un solo archivo.',
  cancelado: 'Lectura cancelada.',
};
const GENERICO = 'No pude leer este archivo. Puede que esté dañado o incompleto: prueba exportarlo de nuevo.';

const NOMBRE_TIPO = { zip: 'Zip', carpeta: 'Carpeta', csv: 'CSV', json: 'JSON', sqlite: 'Base de datos SQLite', desconocido: 'Otro' };
const NOMBRE_FECHA = { iso: 'AAAA-MM-DD', dmy: 'DD/MM/AAAA', mdy: 'MM/DD/AAAA', epoch: 'marca de tiempo' };
const NOMBRE_DELIM = { ',': 'coma', ';': 'punto y coma', '\t': 'tabulación' };

const $ = (id) => document.getElementById(id);
const lector = crearLector();
const tamano = (n) => (n < 1024 ? `${n} B` : n < 1048576 ? `${(n / 1024).toFixed(1)} KB` : `${(n / 1048576).toFixed(1)} MB`);
const numero = (n) => new Intl.NumberFormat('es-CL').format(n);

function el(etiqueta, props = {}, ...hijos) {
  const n = document.createElement(etiqueta);
  for (const [k, v] of Object.entries(props)) {
    if (k === 'class') n.className = v;
    else n.setAttribute(k, v);
  }
  for (const h of hijos.flat()) if (h !== null && h !== undefined) n.append(typeof h === 'string' ? document.createTextNode(h) : h);
  return n;
}

function estado(texto, error = false) {
  const e = $('estado');
  e.textContent = texto;
  e.classList.toggle('estado--error', error);
}

async function leer(tipo, carga) {
  $('resultado').replaceChildren();
  estado('Leyendo…');
  $('caja-progreso').hidden = false;
  $('progreso').removeAttribute('value');
  const t0 = performance.now();
  try {
    const opciones = { alProgreso: (v) => { $('progreso').value = v; } };
    const r = tipo === 'archivo' ? await lector.abrir(carga, opciones) : await lector.abrirCarpeta(carga, opciones);
    const s = ((performance.now() - t0) / 1000).toFixed(1);
    estado(`Listo en ${s} s. Esto es lo que trae:`);
    mostrar(r);
    $('resultado').focus?.();
  } catch (e) {
    estado(MENSAJES[e?.codigo] || GENERICO, e?.codigo !== 'cancelado');
  } finally {
    $('caja-progreso').hidden = true;
  }
}

function mostrar(r) {
  const filas = r.archivos.reduce((s, a) => s + (a.filas || 0), 0);
  const general = el('div', { class: 'tarjeta' },
    el('h2', {}, 'Resumen'),
    el('dl', {},
      el('dt', {}, 'Tipo'), el('dd', {}, NOMBRE_TIPO[r.tipo] || r.tipo),
      el('dt', {}, 'Tamaño'), el('dd', {}, tamano(r.tamano)),
      el('dt', {}, 'Archivos dentro'), el('dd', {}, numero(r.archivos.length)),
      el('dt', {}, 'Filas en total'), el('dd', {}, numero(filas)),
      el('dt', {}, 'Huella'), el('dd', {}, `${r.hash.slice(0, 12)}…`),
    ),
    r.rechazadas ? el('p', { class: 'aviso' }, `Se ignoraron ${r.rechazadas} archivos con rutas no seguras.`) : null,
    r.tipo === 'sqlite' ? el('p', { class: 'aviso' }, 'Es una base de datos completa (por ejemplo, el «full backup» de Loop). Por ahora Tavia lee la exportación en CSV.') : null,
  );
  $('resultado').replaceChildren(general, ...r.archivos.map(tarjetaArchivo));
}

function tarjetaArchivo(a) {
  const datos = [
    el('dt', {}, 'Tipo'), el('dd', {}, NOMBRE_TIPO[a.tipo] || a.tipo),
    el('dt', {}, 'Tamaño'), el('dd', {}, tamano(a.tamano)),
  ];
  if (a.codificacion) datos.push(el('dt', {}, 'Codificación'), el('dd', {}, `${a.codificacion}${a.bom ? ' (con BOM)' : ''}`));
  if (a.delimitador) datos.push(el('dt', {}, 'Separador'), el('dd', {}, NOMBRE_DELIM[a.delimitador] || a.delimitador));
  if (a.filas !== undefined) datos.push(el('dt', {}, 'Filas'), el('dd', {}, numero(a.filas)));
  if (a.totalColumnas !== undefined) datos.push(el('dt', {}, 'Columnas'), el('dd', {}, numero(a.totalColumnas)));
  const partes = [el('h3', {}, a.ruta || 'Archivo'), el('dl', {}, datos)];
  if (a.error) partes.push(el('p', { class: 'aviso' }, MENSAJES[a.error] || 'Este archivo no se pudo leer.'));
  for (const adv of a.advertencias || []) partes.push(el('p', { class: 'aviso' }, textoAdvertencia(adv)));
  if (a.columnas?.length) partes.push(tablaColumnas(a.columnas));
  if (a.forma) partes.push(el('p', {}, `Estructura: ${resumirForma(a.forma)}`));
  return el('div', { class: 'tarjeta' }, partes);
}

function tablaColumnas(columnas) {
  return el('div', { class: 'tabla' }, el('table', {},
    el('thead', {}, el('tr', {}, el('th', { scope: 'col' }, 'Columna'), el('th', { scope: 'col' }, 'Parece'), el('th', { scope: 'col' }, 'Vacías'))),
    el('tbody', {}, columnas.map((c) => el('tr', {},
      el('td', {}, c.nombre || '(sin nombre)'),
      el('td', {}, describirColumna(c)),
      el('td', {}, numero(c.vacias)),
    ))),
  ));
}

function describirColumna(c) {
  if (c.fecha) {
    if (c.fecha.ambiguo) return 'fecha, pero no se sabe si es DD/MM o MM/DD (te lo preguntaría)';
    return `fecha (${NOMBRE_FECHA[c.fecha.formato]}${c.fecha.conHora ? ', con hora' : ''})`;
  }
  const partes = [];
  if (c.decimal?.separador) partes.push(`números con ${c.decimal.separador === ',' ? 'coma' : 'punto'} decimal`);
  else if (c.decimal?.ambiguo) partes.push('números (separador decimal dudoso)');
  partes.push(c.distintos === '50+' ? 'más de 50 valores distintos' : c.distintos === 1 ? 'un solo valor' : `${c.distintos} valores distintos`);
  return partes.join(' · ');
}

function textoAdvertencia({ codigo, n }) {
  const t = {
    csv_columnas_faltantes: `${numero(n)} filas tienen menos columnas que la cabecera.`,
    csv_columnas_sobrantes: `${numero(n)} filas tienen columnas de más.`,
    csv_comilla_suelta: `${numero(n)} campos tienen comillas sueltas (se leyeron tal cual).`,
    csv_texto_tras_comillas: `${numero(n)} campos tienen texto después de cerrar comillas.`,
  };
  return t[codigo] || `Aviso: ${codigo} (${numero(n)})`;
}

function resumirForma(f) {
  if (f.tipo === 'lista') return `lista de ${numero(f.largo)}${f.elemento ? ` (${resumirForma(f.elemento)})` : ''}`;
  if (f.tipo === 'objeto') return `objeto con ${f.totalClaves} claves: ${f.claves.map((k) => k.nombre).join(', ')}`;
  return f.tipo;
}

$('archivo').addEventListener('change', (e) => {
  const archivo = e.target.files?.[0];
  e.target.value = '';
  if (archivo) leer('archivo', archivo);
});
$('carpeta').addEventListener('change', (e) => {
  const archivos = [...(e.target.files || [])];
  e.target.value = '';
  if (archivos.length) leer('carpeta', archivos);
});
$('cancelar').addEventListener('click', () => lector.cancelar());
$('resultado').setAttribute('tabindex', '-1');

// Elegir carpeta no existe en iPhone/iPad: se oculta para no confundir.
if (!('webkitdirectory' in document.createElement('input')) || /iPhone|iPad/.test(navigator.userAgent)) {
  $('carpeta').remove();
  $('etiqueta-carpeta').remove();
}
if (!soportaZip()) estado('Este navegador no puede abrir zip: descomprime el archivo y elige la carpeta.');
