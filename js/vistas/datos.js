// vistas/datos.js — Exportar (JSON, cifrado, CSV), importar con resumen y confirmación,
// y descargar los recordatorios para el calendario.

import { el } from '../dom.js';
import { t } from '../textos.js';
import { fechaLarga } from '../fechas.js';
import { abrirHoja } from '../ui.js';
import { csvRegistros, entregarArchivo, leerRespaldo, nombreArchivo, textoRespaldo } from '../respaldo.js';
import { generarICS } from '../recordatorios.js';
import { anunciar } from '../ui.js';
import { CAMPOS_PIN } from '../esquema.js';
import { pedirPin } from './seguridad.js';

/** Con PIN activo, exportar pide el PIN: el archivo lleva también los hábitos privados (M-3). */
async function permisoParaExportar(ctx) {
  if (!ctx.modelo.config.pinHash) return true;
  return pedirPin(ctx, t('pin.exportar'));
}

export async function exportar(ctx, { cifrado = false } = {}) {
  const { modelo } = ctx;
  if (!(await permisoParaExportar(ctx))) return;
  const hoy = modelo.hoy();
  let contrasena = null;
  if (cifrado) {
    contrasena = await pedirContrasena({ crear: true });
    if (contrasena === null) return;
  }
  const texto = await textoRespaldo(modelo.serializar(), hoy, contrasena);
  const ok = await entregarArchivo(nombreArchivo(hoy, 'json', cifrado), texto, 'application/json');
  if (ok) {
    modelo.setConfig({ ultimoRespaldo: hoy });
    ctx.quitarAviso('aviso.respaldo');
    ctx.quitarAviso('aviso.respaldoNunca');
    anunciar(t('datos.exportado'));
  }
}

export async function exportarCSV(ctx) {
  if (!(await permisoParaExportar(ctx))) return;
  const hoy = ctx.modelo.hoy();
  await entregarArchivo(nombreArchivo(hoy, 'csv'), csvRegistros(ctx.modelo.serializar()), 'text/csv;charset=utf-8');
}

export async function exportarICS(ctx) {
  const { texto, eventos } = generarICS(ctx.modelo);
  if (!eventos) return false;
  await entregarArchivo('tavia-recordatorios.ics', texto, 'text/calendar;charset=utf-8');
  anunciar(t('recordatorios.ics.listo', { n: eventos }));
  return true;
}

/** Elegir archivo → leer → validar → resumen → combinar o reemplazar (con Deshacer). */
export function importar(ctx) {
  const entrada = el('input', { type: 'file', accept: '.json,application/json', class: 'solo-lector', tabindex: '-1' });
  entrada.addEventListener('change', async () => {
    const archivo = entrada.files?.[0];
    entrada.remove();
    if (!archivo) return;
    const r = await leerRespaldo(archivo, ctx.modelo.hoy(), () => pedirContrasena({ crear: false }));
    if (!r.ok) {
      if (r.error) ctx.mostrarError(t(r.error));
      return;
    }
    mostrarResumen(ctx, r);
  });
  document.body.append(entrada);
  entrada.click();
}

function mostrarResumen(ctx, { datos, resumen }) {
  const f = (s) => (s ? fechaLarga(s) : '');
  const texto = t('respaldo.resumen.texto', {
    exportado: resumen.exportado ? t('respaldo.resumen.exportado', { fecha: f(resumen.exportado) }) : '',
    habitos: resumen.habitos, registros: resumen.registros, notas: resumen.notas,
    rango: resumen.desde ? t('respaldo.resumen.rango', { desde: f(resumen.desde), hasta: f(resumen.hasta) }) : '',
  });
  abrirHoja({
    titulo: t('respaldo.resumen.titulo'),
    etiqueta: 'importar',
    contenido: (cerrar) => [
      el('p', {}, texto),
      resumen.descartados ? el('p', { class: 'texto-ayuda texto-ayuda--miel' }, t('respaldo.resumen.descartados', { n: resumen.descartados })) : null,
      opcion(t('respaldo.combinar'), t('respaldo.combinar.ayuda'), 'principal', () => {
        cerrar();
        const antes = ctx.modelo.serializar();
        const r = ctx.modelo.combinar(datos);
        ctx.deshacer(t('respaldo.combinado', { h: r.habitos, l: r.logs }), () => ctx.modelo.reemplazar(antes, { guardar: true }));
      }),
      opcion(t('respaldo.reemplazar'), t('respaldo.reemplazar.ayuda'), 'secundario', () => {
        cerrar();
        const antes = ctx.modelo.serializar();
        // La protección actual (PIN, intentos, bloqueo) se queda: un archivo no puede quitarla ni cambiarla (M-2).
        const actual = ctx.modelo.config;
        const seguridad = Object.fromEntries([...CAMPOS_PIN, 'bloqueoSegundos'].map((k) => [k, actual[k]]));
        ctx.modelo.reemplazar({ ...datos, config: { ...datos.config, ...seguridad } }, { guardar: true });
        ctx.deshacer(t('respaldo.reemplazado'), () => ctx.modelo.reemplazar(antes, { guardar: true }));
      }),
    ],
  });
}

function opcion(titulo, ayuda, peso, onclick) {
  return el('div', { class: 'campo' },
    el('button', { class: `tv-boton tv-boton--${peso} tv-boton--ancho`, type: 'button', onclick }, titulo),
    el('p', { class: 'texto-ayuda' }, ayuda));
}

/** Pide (o crea, con confirmación) la contraseña de un respaldo cifrado. null = canceló. */
function pedirContrasena({ crear }) {
  return new Promise((resolver) => {
    let valor = null;
    abrirHoja({
      titulo: t('respaldo.contrasena.titulo'),
      etiqueta: 'contrasena',
      alCerrar: () => resolver(valor),
      contenido: (cerrar) => {
        const a = el('input', { class: 'entrada', id: 'contrasena-1', type: 'password', autocomplete: crear ? 'new-password' : 'current-password', 'data-autofoco': '' });
        const b = el('input', { class: 'entrada', id: 'contrasena-2', type: 'password', autocomplete: 'new-password' });
        const error = el('p', { class: 'error-campo', role: 'alert' });
        const form = el('form', { class: 'form', novalidate: true },
          el('div', { class: 'campo' }, el('label', { class: 'campo__etiqueta', for: 'contrasena-1' }, t(crear ? 'respaldo.contrasena.crear' : 'respaldo.contrasena.titulo')), a),
          crear ? el('div', { class: 'campo' }, el('label', { class: 'campo__etiqueta', for: 'contrasena-2' }, t('respaldo.contrasena.repetir')), b) : null,
          crear ? el('p', { class: 'texto-ayuda' }, t('respaldo.contrasena.ayuda')) : null,
          error,
          el('button', { class: 'tv-boton tv-boton--principal tv-boton--ancho', type: 'submit' }, t(crear ? 'respaldo.contrasena.cifrar' : 'respaldo.contrasena.abrir')),
        );
        form.addEventListener('submit', (e) => {
          e.preventDefault();
          if (crear && a.value.length < 8) { error.textContent = t('respaldo.contrasena.corta'); a.focus(); return; }
          if (crear && a.value !== b.value) { error.textContent = t('respaldo.contrasena.distinta'); b.focus(); return; }
          if (!a.value) { a.focus(); return; }
          valor = a.value;
          cerrar();
        });
        return form;
      },
    });
  });
}
