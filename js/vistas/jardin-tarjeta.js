// vistas/jardin-tarjeta.js — Hoja «Mi jardín»: vista previa en vivo, interruptores y Compartir/Descargar.
// Privacidad primero: por defecto la imagen no lleva cifras, rachas, meses ni frase; nunca lleva
// nombres de hábitos, tu nombre, fechas, notas ni nada de la bóveda (los privados se excluyen siempre,
// aunque la bóveda esté abierta). Nada se sube: compartir usa el menú del sistema solo al tocar el botón.

import { el, icono } from '../dom.js';
import { t } from '../textos.js';
import { abrirHoja, anunciar } from '../ui.js';
import { rachaGlobal } from '../analisis.js';
import { jardinDelAnio, umbralDe } from '../jardin.js';
import { SEMILLA_RESPALDO } from '../jardin-disposicion.js';
import { prepararFuentes } from '../tarjeta-anual.js';
import {
  ANCHO, FORMATOS, NOMBRE_ARCHIVO, OPCIONES_POR_DEFECTO, coloresDelTema, datosTarjeta, dibujarTarjetaJardin, textoAlternativo, textoContenido,
} from '../tarjeta-jardin.js';

export async function abrirTarjetaJardin(ctx) {
  const { modelo } = ctx;
  const hoy = modelo.hoy();
  const anio = Number(hoy.slice(0, 4));
  // Solo hábitos no privados: la bóveda no aporta nada a la tarjeta, ni siquiera en los números.
  const publicos = modelo.habitos().filter((h) => !h.privado);
  const hayPrivados = modelo.habitos().some((h) => h.privado);
  const jardin = jardinDelAnio(publicos, anio, { hoy, logDe: modelo.logDe, umbral: umbralDe(modelo.config) });
  const racha = rachaGlobal(publicos, hoy, modelo.logDe);
  const ultimoHito = [...jardin.dias].reverse().find((d) => d.hito)?.hito ?? null;
  const semilla = modelo.config.jardin.semilla || modelo.config.idInstalacion || SEMILLA_RESPALDO;
  await prepararFuentes();

  const op = { ...OPCIONES_POR_DEFECTO }; // se reinician cada vez: lo privado es lo de fábrica

  abrirHoja({
    titulo: t('tarjeta.hoja'),
    etiqueta: 'jardin-tarjeta',
    clase: 'tv-hoja--anual',
    contenido: () => {
      const lienzo = el('canvas', { class: 'anual__lienzo jardin-tarjeta__lienzo', width: String(ANCHO), height: String(FORMATOS.retrato), role: 'img' });
      const aviso = el('p', { class: 'jardin-tarjeta__aviso', role: 'status' });
      let datos = null;
      const dibujar = () => {
        datos = datosTarjeta(jardin, semilla, { opciones: op, racha, hitoFrase: ultimoHito });
        dibujarTarjetaJardin(lienzo, datos, coloresDelTema());
        lienzo.setAttribute('aria-label', textoAlternativo(datos));
        lienzo.dataset.formato = datos.formato;
        aviso.textContent = textoContenido(datos);
      };

      const formato = el('fieldset', { class: 'segmentos' },
        el('legend', { class: 'campo__etiqueta' }, t('tarjeta.formato')),
        Object.keys(FORMATOS).map((f) => el('label', { class: 'segmento' },
          el('input', { type: 'radio', name: 'jardin-formato', value: f, checked: op.formato === f }),
          el('span', {}, t(`tarjeta.formato.${f}`)))));
      formato.addEventListener('change', (e) => { op.formato = e.target.value; dibujar(); });

      const interruptor = (clave) => {
        const id = `jardin-tarjeta-${clave}`;
        const input = el('input', { type: 'checkbox', role: 'switch', id, checked: op[clave] });
        input.addEventListener('change', () => { op[clave] = input.checked; dibujar(); });
        return el('label', { class: 'interruptor', for: id }, el('span', {}, t(`tarjeta.op.${clave}`)), input);
      };

      const descargar = el('button', { class: 'tv-boton tv-boton--secundario tv-boton--ancho', type: 'button', data: { foco: 'jardin-descargar' } },
        icono('respaldo', 'tv-icono--sm'), t('tarjeta.descargar'));
      const compartir = el('button', { class: 'tv-boton tv-boton--principal tv-boton--ancho', type: 'button', data: { foco: 'jardin-compartir-ya' } },
        icono('compartir', 'tv-icono--sm'), t('tarjeta.compartir'));
      const puedeCompartir = typeof File !== 'undefined' && navigator.canShare?.({ files: [new File([''], NOMBRE_ARCHIVO, { type: 'image/png' })] });

      const png = () => new Promise((ok, mal) => lienzo.toBlob((b) => (b ? ok(b) : mal(new Error('vacío'))), 'image/png'));
      descargar.addEventListener('click', async () => {
        descargar.disabled = true;
        try {
          const blob = await png();
          const url = URL.createObjectURL(blob);
          const a = el('a', { href: url, download: NOMBRE_ARCHIVO, rel: 'noopener' });
          document.body.append(a);
          a.click();
          a.remove();
          setTimeout(() => URL.revokeObjectURL(url), 10_000);
          anunciar(t('tarjeta.lista'));
        } catch { ctx.mostrarError(t('anual.error')); } finally { descargar.disabled = false; }
      });
      compartir.addEventListener('click', async () => {
        compartir.disabled = true;
        try {
          const blob = await png();
          await navigator.share({ files: [new File([blob], NOMBRE_ARCHIVO, { type: 'image/png' })] });
        } catch (e) {
          if (e?.name !== 'AbortError') ctx.mostrarError(t('anual.error'));
        } finally { compartir.disabled = false; }
      });

      dibujar();
      return [
        el('div', { class: 'anual__marco' }, lienzo),
        aviso,
        el('p', { class: 'texto-ayuda' }, t('tarjeta.nunca')),
        hayPrivados ? el('p', { class: 'texto-ayuda' }, t('tarjeta.privados')) : null,
        formato,
        el('div', { class: 'jardin-tarjeta__opciones' }, ['flores', 'racha', 'meses', 'frase'].map(interruptor)),
        puedeCompartir ? compartir : null,
        descargar,
        el('p', { class: 'texto-ayuda' }, t('anual.local')),
      ];
    },
  });
}
