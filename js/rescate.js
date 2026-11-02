// rescate.js — Red de seguridad del arranque (hallazgo M-6 del informe de seguridad).
// Script clásico y mínimo, cargado antes que la app: si un archivo de la app no llega
// (subida a medias, sin internet en la primera visita) o la app no termina de abrir,
// muestra un mensaje amable en vez de una pantalla en blanco. Nunca muestra detalles internos.
// Sin innerHTML: todo con createElement y textContent.
(function () {
  'use strict';
  var PLAZO_MS = 12000;

  function mostrar() {
    if (document.documentElement.hasAttribute('data-listo')) return; // la app abrió bien
    var vista = document.getElementById('vista');
    if (!vista || vista.querySelector('.fallo')) return;
    while (vista.firstChild) vista.removeChild(vista.firstChild);
    var caja = document.createElement('div');
    caja.className = 'vacio fallo';
    caja.setAttribute('role', 'alert');
    var titulo = document.createElement('h1');
    titulo.className = 'vacio__titulo';
    titulo.textContent = 'Tavia no pudo abrir';
    var texto = document.createElement('p');
    texto.className = 'vacio__texto';
    texto.textContent = 'Algo falló al cargar. Tus datos siguen guardados en este dispositivo: no se borró nada.';
    var boton = document.createElement('button');
    boton.className = 'tv-boton tv-boton--principal';
    boton.type = 'button';
    boton.textContent = 'Volver a intentar';
    boton.addEventListener('click', function () { location.reload(); });
    caja.appendChild(titulo);
    caja.appendChild(texto);
    caja.appendChild(boton);
    vista.appendChild(caja);
  }

  function cuandoHayaPagina() {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mostrar);
    else mostrar();
  }

  // Un script de la app que no carga (o un import que falla) dispara "error" en su etiqueta.
  window.addEventListener('error', function (e) {
    if (e.target && e.target.tagName === 'SCRIPT') cuandoHayaPagina();
  }, true);

  // Último recurso: si la app no avisó que está lista en 12 s, se ofrece reintentar.
  window.addEventListener('load', function () { setTimeout(mostrar, PLAZO_MS); });
})();
