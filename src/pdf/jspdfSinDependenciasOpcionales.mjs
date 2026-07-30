/**
 * Sustituto vacío de las dependencias OPCIONALES de jsPDF: `html2canvas`,
 * `canvg` y `dompurify`.
 *
 * POR QUÉ. jsPDF las carga con `import()` dinámico y solo cuando se usan las API
 * que las necesitan: `doc.html()` (html2canvas + dompurify) y
 * `doc.addSvgAsImage()` (canvg). Esta app no usa ninguna de las dos — la orden de
 * trabajo se dibuja con primitivas de jsPDF (`rect`, `text`, `line`, `addImage`
 * con PNG) — así que Rollup emitía 353 kB de chunks (202 + 151) que NUNCA se
 * descargaban. No eran peso para el usuario, pero sí ficheros muertos en el
 * artefacto de despliegue, y despistaban al leer el build.
 *
 * El alias está en `vite.config.ts`. Si algún día hace falta `doc.html()` o
 * `doc.addSvgAsImage()`, hay que quitar el alias de ese fichero (y volverán a
 * salir los chunks); este módulo lo dice en el error para que no haya que
 * adivinarlo.
 *
 * jsPDF envuelve cada `import()` en un `.catch()`, así que lanzar aquí produce su
 * mensaje «Could not load …» en vez de un fallo raro.
 */

const MOTIVO =
  'Esta dependencia opcional de jsPDF (html2canvas / canvg / dompurify) está ' +
  'sustituida por un módulo vacío a propósito: Atelier Studio no usa doc.html() ' +
  'ni doc.addSvgAsImage(). Si de verdad las necesitas, quita el alias de ' +
  'vite.config.ts (resolve.alias) y se volverán a empaquetar.';

function noDisponible() {
  throw new Error(MOTIVO);
}

// Se cubren las formas en que jsPDF consume estos módulos: `t.default ?? t` para
// html2canvas/dompurify, y `{ Canvg }` con su `from()` estático para canvg.
export default noDisponible;
export const Canvg = { from: noDisponible };
export const presets = undefined;
export const sanitize = noDisponible;
