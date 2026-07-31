import '@testing-library/jest-dom/vitest';

/**
 * jsdom no implementa `Element.scrollTo` (lanza «is not a function»). El panel del
 * catálogo lo llama para volver arriba al cambiar de página, así que se rellena
 * aquí: es un hueco de jsdom, no un comportamiento a probar.
 */
if (typeof Element !== 'undefined' && !Element.prototype.scrollTo) {
  Element.prototype.scrollTo = function scrollTo(): void {};
}
