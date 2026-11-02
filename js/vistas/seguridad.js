// vistas/seguridad.js — Pantalla de bloqueo, pedir PIN (bóveda privada) y configurar el PIN.

import { el, icono, simboloTavia, vaciar } from '../dom.js';
import { t } from '../textos.js';
import { crearPin, esperaTrasFallos, pinValido, verificarPin } from '../cripto.js';
import { abrirHoja } from '../ui.js';
import { fechaLarga } from '../fechas.js';

/**
 * Comprueba un PIN aplicando el límite de intentos. La espera pendiente se guarda como
 * "milisegundos que faltan" y se descuenta con el reloj interno del navegador
 * (performance.now), que no cambia si alguien adelanta la hora del teléfono (M-1).
 * Recargar la página no la reinicia. Devuelve { ok } o { ok:false, esperaMs }.
 */
export async function intentarPin(ctx, pin) {
  const { modelo } = ctx;
  const c = modelo.config;
  if (c.pinEspera > 0) return { ok: false, esperaMs: c.pinEspera };
  const ok = await verificarPin(pin, c);
  if (ok) {
    if (c.pinFallos || c.pinEspera) modelo.setConfig({ pinFallos: 0, pinEspera: 0 });
    return { ok: true };
  }
  const fallos = c.pinFallos + 1;
  const espera = esperaTrasFallos(fallos);
  modelo.setConfig({ pinFallos: fallos, pinEspera: espera });
  return { ok: false, esperaMs: espera };
}

/** Campo de PIN: numérico, oculto, sin autocompletar. */
function campoPin(id, etiqueta, extra = {}) {
  return el('div', { class: 'campo' },
    el('label', { class: 'campo__etiqueta', for: id }, etiqueta),
    el('input', {
      class: 'entrada entrada--pin', id, type: 'password', inputmode: 'numeric', pattern: '[0-9]*',
      autocomplete: 'off', maxlength: '8', enterkeyhint: 'done', ...extra,
    }),
  );
}

/** Formulario de PIN reutilizable: muestra errores y la cuenta regresiva de espera. */
function formularioPin(ctx, { id, etiqueta, boton, alAcertar }) {
  const error = el('p', { class: 'error-campo', role: 'alert' });
  const campo = campoPin(id, etiqueta, { 'data-autofoco': '' });
  const entrada = campo.querySelector('input');
  const enviar = el('button', { class: 'tv-boton tv-boton--principal tv-boton--ancho', type: 'submit' }, boton);
  let reloj = null;
  const esperar = (ms) => {
    clearInterval(reloj);
    let restante = ms;
    let antes = performance.now(); // reloj interno: no se mueve si cambian la hora del teléfono
    let guardadoHace = 0;
    enviar.disabled = true;
    const tick = () => {
      const ahora = performance.now();
      const paso = Math.max(0, ahora - antes);
      antes = ahora;
      restante = Math.max(0, restante - paso);
      guardadoHace += paso;
      // Se guarda cada 5 s y al terminar: si cierran la app, la espera sigue donde quedó.
      if (restante === 0 || guardadoHace >= 5000) {
        guardadoHace = 0;
        if (ctx.modelo.config.pinEspera !== Math.round(restante)) ctx.modelo.setConfig({ pinEspera: Math.round(restante) }, { redibujar: false });
      }
      const s = Math.ceil(restante / 1000);
      if (s <= 0) { clearInterval(reloj); enviar.disabled = false; error.textContent = ''; return; }
      error.textContent = t('bloqueo.espera', { s });
    };
    tick();
    reloj = setInterval(tick, 1000);
  };
  const form = el('form', { class: 'form', novalidate: true }, campo, error, enviar);
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (enviar.disabled) return;
    const pin = entrada.value;
    entrada.value = '';
    error.textContent = ''; // así el lector de pantalla vuelve a anunciar el resultado
    enviar.disabled = true;
    const r = await intentarPin(ctx, pin);
    enviar.disabled = false;
    if (r.ok) { clearInterval(reloj); alAcertar(); return; }
    entrada.setAttribute('aria-invalid', 'true');
    entrada.focus();
    if (r.esperaMs) esperar(r.esperaMs);
    else error.textContent = t('bloqueo.error');
  });
  const pendiente = ctx.modelo.config.pinEspera;
  if (pendiente > 0) esperar(pendiente);
  return form;
}

/** Pantalla completa de bloqueo. Oculta todo lo demás hasta que el PIN sea correcto. */
export function renderBloqueo(contenedor, ctx, alDesbloquear) {
  vaciar(contenedor);
  const simbolo = simboloTavia();
  const form = formularioPin(ctx, { id: 'pin-bloqueo', etiqueta: t('bloqueo.pin'), boton: t('bloqueo.entrar'), alAcertar: alDesbloquear });
  contenedor.append(el('div', { class: 'bloqueo__caja', role: 'dialog', aria: { modal: 'true', labelledby: 'bloqueo-titulo' } },
    simbolo,
    el('h1', { class: 'vacio__titulo', id: 'bloqueo-titulo' }, t('bloqueo.titulo')),
    form,
    el('button', { class: 'tv-boton tv-boton--sutil', type: 'button', onclick: () => olvidePin(ctx) }, t('bloqueo.olvide')),
  ));
  setTimeout(() => contenedor.querySelector('input')?.focus(), 0);
}

/** Pide el PIN en una hoja (para mostrar la bóveda privada). Devuelve true si acertó. */
export function pedirPin(ctx, titulo) {
  return new Promise((resolver) => {
    let ok = false;
    abrirHoja({
      titulo,
      etiqueta: 'pin',
      alCerrar: () => resolver(ok),
      contenido: (cerrar) => formularioPin(ctx, { id: 'pin-hoja', etiqueta: t('bloqueo.pin'), boton: t('bloqueo.entrar'), alAcertar: () => { ok = true; cerrar(); } }),
    });
  });
}

/** Crear o cambiar el PIN (si ya hay uno, primero se pide el actual). */
export async function configurarPin(ctx) {
  const { modelo } = ctx;
  if (modelo.config.pinHash && !(await pedirPin(ctx, t('pin.actual')))) return;
  abrirHoja({
    titulo: t(modelo.config.pinHash ? 'seguridad.pin.cambiar' : 'seguridad.pin.activar'),
    etiqueta: 'pin-nuevo',
    contenido: (cerrar) => {
      const a = campoPin('pin-nuevo-1', t('pin.nuevo'), { 'data-autofoco': '' });
      const b = campoPin('pin-nuevo-2', t('pin.repetir'));
      const error = el('p', { class: 'error-campo', role: 'alert' });
      const estado = el('p', { class: 'texto-ayuda', aria: { live: 'polite' } });
      const boton = el('button', { class: 'tv-boton tv-boton--principal tv-boton--ancho', type: 'submit' }, t('pin.guardar'));
      const form = el('form', { class: 'form', novalidate: true }, a, b, error, estado, boton, el('p', { class: 'texto-ayuda' }, t('seguridad.honesto')));
      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const p1 = a.querySelector('input').value, p2 = b.querySelector('input').value;
        if (!pinValido(p1)) { error.textContent = t('pin.invalido'); a.querySelector('input').focus(); return; }
        if (p1 !== p2) { error.textContent = t('pin.distinto'); b.querySelector('input').focus(); return; }
        error.textContent = '';
        boton.disabled = true;
        estado.textContent = t('pin.calculando');
        const datos = await crearPin(p1);
        modelo.setConfig({ ...datos, pinFallos: 0, pinEspera: 0 });
        ctx.verPrivados = false;
        cerrar();
      });
      return form;
    },
  });
}

/** Quitar el PIN (pide el actual). Los hábitos privados vuelven a verse. */
export async function quitarPin(ctx) {
  if (!(await pedirPin(ctx, t('pin.actual')))) return;
  ctx.modelo.setConfig({ pinHash: null, pinSalt: null, pinFallos: 0, pinEspera: 0 });
}

/** "Olvidé mi PIN": la única salida honesta es borrar los datos de este dispositivo. */
function olvidePin(ctx) {
  abrirHoja({
    titulo: t('bloqueo.olvide.titulo'),
    etiqueta: 'olvide',
    contenido: () => {
      const id = 'confirmar-borrar';
      const entrada = el('input', { class: 'entrada', id, type: 'text', autocomplete: 'off', autocapitalize: 'characters' });
      const boton = el('button', { class: 'tv-boton tv-boton--secundario tv-boton--ancho', type: 'submit', disabled: true }, t('bloqueo.olvide.borrar'));
      entrada.addEventListener('input', () => { boton.disabled = entrada.value.trim().toUpperCase() !== 'BORRAR'; });
      const form = el('form', { class: 'form', novalidate: true },
        el('p', { class: 'texto-ayuda' }, t('bloqueo.olvide.texto')),
        // Antes de borrar, que se vea qué se pierde (B-1).
        el('p', { class: 'texto-ayuda texto-ayuda--miel' }, ctx.modelo.config.ultimoRespaldo
          ? t('bloqueo.olvide.respaldo', { fecha: fechaLarga(ctx.modelo.config.ultimoRespaldo) })
          : t('bloqueo.olvide.sinRespaldo')),
        el('div', { class: 'campo' }, el('label', { class: 'campo__etiqueta', for: id }, t('bloqueo.olvide.escribe')), entrada),
        boton);
      form.addEventListener('submit', (e) => {
        e.preventDefault();
        if (entrada.value.trim().toUpperCase() === 'BORRAR') ctx.borrarTodo();
      });
      return form;
    },
  });
}
