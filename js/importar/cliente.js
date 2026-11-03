// importar/cliente.js — Lado de la página: habla con el worker del importador.
// Si el navegador no puede crear un worker de módulo, hace lo mismo en el hilo principal
// (más lento con archivos grandes, pero funciona igual). Nada sale del dispositivo.
//
// Con la CSP de Tavia (require-trusted-types-for 'script'), crear un Worker exige una
// TrustedScriptURL. La política solo acepta la URL exacta de worker.js.

const URL_WORKER = new URL('./worker.js', import.meta.url).href;
let politica;

function urlConfiable() {
  if (politica === undefined) {
    try {
      politica = globalThis.trustedTypes?.createPolicy('tavia', {
        createScriptURL: (u) => {
          if (u !== URL_WORKER) throw new TypeError('URL de script no permitida');
          return u;
        },
      }) ?? null;
    } catch {
      politica = null; // sin Trusted Types, o la política no se pudo crear
    }
  }
  return politica ? politica.createScriptURL(URL_WORKER) : URL_WORKER;
}

/**
 * @param {{ usarWorker?: boolean }} [op]
 * @returns {{ abrir(archivo, op?): Promise<object>, abrirCarpeta(archivos, op?): Promise<object>, cancelar(): void, cerrar(): void }}
 */
export function crearLector({ usarWorker = typeof Worker !== 'undefined' } = {}) {
  let worker = null;
  let sinWorker = !usarWorker;
  let siguiente = 0;
  const pendientes = new Map(); // id → { resolver, rechazar, alProgreso }
  let ctlLocal = null;

  function conectar() {
    if (worker || sinWorker) return worker;
    try {
      worker = new Worker(urlConfiable(), { type: 'module' });
    } catch {
      sinWorker = true;
      return null;
    }
    worker.addEventListener('message', (e) => {
      const m = e.data;
      const p = pendientes.get(m?.id);
      if (!p) return;
      if (m.tipo === 'progreso') { p.alProgreso?.(m.valor); return; }
      pendientes.delete(m.id);
      if (m.tipo === 'listo') p.resolver(m.resumen);
      else p.rechazar(errorCon(m.codigo));
    });
    // Si el worker no llega a arrancar (navegador sin workers de módulo), se repite sin worker.
    worker.addEventListener('error', (e) => {
      e.preventDefault?.();
      worker.terminate();
      worker = null;
      sinWorker = true;
      const reintentos = [...pendientes.values()];
      pendientes.clear();
      for (const p of reintentos) p.reintentar().then(p.resolver, p.rechazar);
    });
    return worker;
  }

  async function enLocal(tipo, carga, alProgreso) {
    const [{ abrirArchivo, abrirCarpeta }, { diagnosticar }] = await Promise.all([import('./leer.js'), import('./diagnostico.js')]);
    ctlLocal?.abort();
    const ctl = new AbortController();
    ctlLocal = ctl;
    try {
      const c = tipo === 'abrir'
        ? await abrirArchivo(carga, { senal: ctl.signal, alProgreso })
        : await abrirCarpeta(carga, { senal: ctl.signal });
      return diagnosticar(c);
    } catch (err) {
      throw errorCon(typeof err?.codigo === 'string' ? err.codigo : 'inesperado');
    } finally {
      if (ctlLocal === ctl) ctlLocal = null;
    }
  }

  function pedir(tipo, carga, { alProgreso } = {}) {
    const w = conectar();
    if (!w) return enLocal(tipo, carga, alProgreso);
    const id = ++siguiente;
    return new Promise((resolver, rechazar) => {
      pendientes.set(id, { resolver, rechazar, alProgreso, reintentar: () => enLocal(tipo, carga, alProgreso) });
      w.postMessage(tipo === 'abrir' ? { tipo, id, archivo: carga } : { tipo, id, archivos: [...carga] });
    });
  }

  return {
    abrir: (archivo, op) => pedir('abrir', archivo, op),
    abrirCarpeta: (archivos, op) => pedir('abrirCarpeta', archivos, op),
    cancelar() {
      worker?.postMessage({ tipo: 'cancelar' });
      ctlLocal?.abort();
    },
    cerrar() {
      worker?.terminate();
      worker = null;
      for (const p of pendientes.values()) p.rechazar(errorCon('cancelado'));
      pendientes.clear();
    },
  };
}

function errorCon(codigo) {
  const e = new Error(codigo);
  e.codigo = codigo;
  return e;
}
