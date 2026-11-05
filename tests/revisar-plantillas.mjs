// Revisa data/plantillas_tavia.json con el validador y el linter de contenido.
// Uso: node tests/revisar-plantillas.mjs   (sale con código 1 si hay problemas)
import { readFileSync } from 'node:fs';
import { validarCatalogo } from '../js/plantillas.js';
import { revisarCatalogo } from './plantillas-linter.mjs';

const ruta = new URL('../data/plantillas_tavia.json', import.meta.url);
let raw;
try { raw = JSON.parse(readFileSync(ruta, 'utf8')); } catch (e) {
  console.error(`No se pudo leer el catálogo: ${e.message}`);
  process.exit(1);
}
const cat = validarCatalogo(raw);
const { ok, problemas } = revisarCatalogo(cat);

console.log(`Catálogo v${cat.version}: ${cat.rutinas.length} rutinas, ${cat.retos.length} retos.`);
for (const a of cat.avisos) console.log(`  aviso  ${a.id}: ${a.aviso}`);
for (const p of problemas) console.log(`  FALLA  ${p.id} · ${p.campo} · ${p.regla}${p.fragmento ? ` («${p.fragmento}»)` : ''}`);
console.log(ok ? 'Todo en orden.' : `${problemas.length} problema(s).`);
process.exit(ok ? 0 : 1);
