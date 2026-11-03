// vistas/semana.js — Revisión semanal ritual: qué funcionó, qué no, y un ajuste pequeño.

import { el } from '../dom.js';
import { t } from '../textos.js';
import { fechaLarga } from '../fechas.js';
import { abrirHoja } from '../ui.js';
import { resumenSemana } from '../insights.js';
import { porcentaje } from '../formato.js';
import { bloqueRevision, fraseRevision } from './frases.js';
import { bloquePalabrasSemana } from './palabras.js';
import { bloqueRevisionDesc } from './descubrimientos.js';

export function abrirRevision(ctx, lunes) {
  const { modelo } = ctx;
  const r = resumenSemana(ctx.visibles(), lunes, modelo.hoy(), modelo.logDe);
  const previa = modelo.revisionDe(lunes);
  const lista = (items) => (items.length
    ? el('ul', { class: 'lista-simple' }, items.map((x) => el('li', {}, `${x.habito.nombre} · ${x.hechos}/${x.total}`)))
    : el('p', { class: 'texto-ayuda' }, t('semana.nada')));

  abrirHoja({
    titulo: t('semana.titulo'),
    etiqueta: 'semana',
    contenido: (cerrar) => {
      const campo = (id, etiqueta, valor, ph = '') => el('div', { class: 'campo' },
        el('label', { class: 'campo__etiqueta', for: id }, etiqueta),
        el('textarea', { class: 'entrada entrada--area', id, rows: '2', maxlength: '280', placeholder: ph }, valor || ''));
      // Una frase para mirar atrás, y al final, las palabras de la semana y una sobre identidad.
      const frase = bloqueRevision(ctx, fraseRevision(ctx, lunes));
      const identidad = bloqueRevision(ctx, fraseRevision(ctx, lunes, 'identidad'));
      const form = el('form', { class: 'form', novalidate: true },
        frase,
        el('p', { class: 'subtitulo' }, t('semana.rango', { desde: fechaLarga(r.lunes), hasta: fechaLarga(r.fin) })),
        r.pct !== null ? el('p', { class: 'semana__pct' }, t('semana.pct', { pct: porcentaje(r.pct) })) : null,
        el('div', { class: 'semana__columnas' },
          el('section', {}, el('h3', { class: 'campo__etiqueta' }, t('semana.funciono')), lista(r.funciono)),
          el('section', {}, el('h3', { class: 'campo__etiqueta' }, t('semana.costo')), lista(r.costo))),
        bloquePalabrasSemana(ctx, lunes),
        bloqueRevisionDesc(ctx),
        identidad,
        campo('sem-funciono', t('semana.p.funciono'), previa?.funciono),
        campo('sem-nofunciono', t('semana.p.noFunciono'), previa?.noFunciono),
        campo('sem-ajuste', t('semana.p.ajuste'), previa?.ajuste, t('semana.p.ajuste.ph')),
        el('button', { class: 'tv-boton tv-boton--principal tv-boton--ancho', type: 'submit' }, t('semana.guardar')),
      );
      form.addEventListener('submit', (e) => {
        e.preventDefault();
        const E = form.elements;
        const deshacer = modelo.guardarRevision({ semana: lunes, funciono: E['sem-funciono'].value, noFunciono: E['sem-nofunciono'].value, ajuste: E['sem-ajuste'].value });
        cerrar();
        ctx.deshacer(t('semana.guardada'), deshacer);
      });
      return form;
    },
  });
}
