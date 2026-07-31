/**
 * El pedido sobrevive a un F5.
 *
 * Un carrito de diez piezas es media mañana de trabajo, y la app es una sola
 * página sin login ni base de datos (§8): sin esto, recargar sin querer — o que
 * el navegador recicle la pestaña — borraría el pedido entero. Se guarda solo el
 * CARRITO, no la pieza a medias del editor: lo que ya está añadido es lo que
 * duele perder.
 *
 * Reglas de esta caché:
 *
 *  - **Nunca rompe la app.** localStorage puede estar lleno, desactivado o traer
 *    basura de una versión anterior. Cualquier problema se traga y se arranca con
 *    el pedido vacío, que es el estado del que siempre se puede seguir.
 *  - **Versionada.** La forma de `LineaCarrito` cambiará; leer una línea vieja
 *    con campos que ya no existen daría cotizaciones raras en vez de un error
 *    limpio. Al subir `VERSION` los pedidos guardados se descartan.
 *  - **No valida el contenido.** Comprueba la forma mínima (que sea una lista de
 *    objetos con material y figura); del resto se encarga el motor, que ya trata
 *    cualquier entrada como sospechosa y devuelve errores como valor.
 */

import type { LineaCarrito } from './quote-state';

const CLAVE = 'atelier-studio.pedido';
/** Subir al cambiar la forma de `LineaCarrito` (descarta lo guardado). */
const VERSION = 1;

interface Guardado {
  readonly version: number;
  readonly carrito: readonly LineaCarrito[];
}

/** Forma mínima de una línea; lo demás lo valida el motor. */
function pareceLinea(valor: unknown): valor is LineaCarrito {
  if (typeof valor !== 'object' || valor === null) return false;
  const l = valor as Partial<LineaCarrito>;
  return (
    typeof l.id === 'string' &&
    typeof l.figuraId === 'string' &&
    typeof l.material === 'object' &&
    l.material !== null &&
    typeof l.medidas === 'object' &&
    l.medidas !== null
  );
}

/** El pedido guardado, o `[]` si no hay, no se puede leer o no es de esta versión. */
export function leerCarrito(): readonly LineaCarrito[] {
  try {
    const crudo = window.localStorage.getItem(CLAVE);
    if (crudo === null) return [];
    const datos = JSON.parse(crudo) as Partial<Guardado>;
    if (datos.version !== VERSION || !Array.isArray(datos.carrito)) return [];
    return datos.carrito.filter(pareceLinea);
  } catch {
    // Sin localStorage (modo privado de algunos navegadores), JSON corrupto…
    return [];
  }
}

/** Guarda el pedido. Si no se puede (cuota, permisos), se sigue sin más. */
export function guardarCarrito(carrito: readonly LineaCarrito[]): void {
  try {
    if (carrito.length === 0) {
      window.localStorage.removeItem(CLAVE);
      return;
    }
    const datos: Guardado = { version: VERSION, carrito };
    window.localStorage.setItem(CLAVE, JSON.stringify(datos));
  } catch {
    // El pedido sigue en memoria; solo se pierde al recargar. No es motivo para
    // interrumpir al comercial con un error.
  }
}
