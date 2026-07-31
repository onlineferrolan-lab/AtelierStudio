/**
 * Margen comercial por subfamilia (indicación directa 2026-07-31).
 *
 * QUÉ ES. Cada artículo pertenece a una **subfamilia**, que son los 4 PRIMEROS
 * DÍGITOS de su referencia: la referencia `94111301` es de la subfamilia `9411`
 * (CASA INFINITA). La tabla del ERP (`public/config/margenes.json`, generada del
 * CSV por `scripts/generar-margenes.mjs`) da para cada subfamilia dos márgenes:
 *
 *  - **MTP** → margen PVP, el de público. Es el que sale por defecto.
 *  - **MTC** → margen contratista. En las 726 filas MTC ≤ MTP.
 *
 * ES MARGEN SOBRE COSTE (markup), no sobre precio de venta:
 *
 *     precio = coste × (1 + m/100)
 *
 * No es una suposición: 77 subfamilias tienen MTP ≥ 100 y llegan a 200, y un
 * margen sobre precio de venta del 100 % sería una división por cero.
 *
 * DÓNDE SE APLICA (indicación directa): al material, a la manipulación —incluidos
 * los suplementos— y al arranque de máquina. O sea, a todo lo que se factura.
 *
 * REDONDEO. Se aplica LÍNEA A LÍNEA, cada una con un único redondeo half-up. Se
 * hace así, y no sobre el total, para que las líneas que se ven en pantalla y en
 * la orden de trabajo SUMEN exactamente el total: si se aplicara al total, el
 * desglose no cuadraría con la suma de sus partes. Efecto secundario a tener
 * presente: el importe de una línea pasa por dos redondeos (el del coste y el del
 * margen), así que puede quedar a un céntimo de lo que daría un cálculo con
 * margen incorporado a la fórmula. Anotado en PENDIENTES.md.
 *
 * ARITMÉTICA. Los márgenes van en CENTÉSIMAS DE PUNTO enteras (44,93 % = 4493) y
 * todo se calcula con enteros: nada de floats para dinero (§1).
 */

import type {
  Centimos,
  MargenCentesimas,
  Material,
  ResolucionMargen,
  TablaMargenes,
  TipoMargen,
} from '../types';
import { centimos } from '../money';

/** Base de las centésimas de punto: 100 % = 10.000. */
const BASE = 10_000;

/**
 * Subfamilia de una referencia: sus primeros `longitud` dígitos. Null si la
 * referencia no empieza por suficientes dígitos (referencias raras o material
 * manual, que trae la subfamilia por separado).
 */
export function subfamiliaDeReferencia(referencia: string, longitud: number): string | null {
  const prefijo = referencia.trim().slice(0, longitud);
  return prefijo.length === longitud && /^\d+$/.test(prefijo) ? prefijo : null;
}

/** Normaliza una subfamilia numérica (la del alta manual) a la clave de la tabla. */
export function subfamiliaDeNumero(valor: number, longitud: number): string | null {
  if (!Number.isInteger(valor) || valor < 0) return null;
  const texto = String(valor);
  return texto.length <= longitud ? texto.padStart(longitud, '0') : null;
}

/** Margen de una subfamilia según el tipo elegido. Null si no está en la tabla. */
export function margenDeSubfamilia(
  tabla: TablaMargenes,
  subfamilia: string | null,
  tipo: TipoMargen,
): MargenCentesimas | null {
  if (subfamilia === null) return null;
  const fila = tabla.subfamilias[subfamilia];
  if (!fila) return null;
  return tipo === 'pvp' ? fila.pvp : fila.contratista;
}

/** Nombre de la subfamilia, para poder decir en pantalla cuál se está aplicando. */
export function nombreDeSubfamilia(tabla: TablaMargenes, subfamilia: string | null): string | null {
  if (subfamilia === null) return null;
  return tabla.subfamilias[subfamilia]?.nombre ?? null;
}

/**
 * Aplica el margen a un importe: `coste × (1 + m/100)`, con un único redondeo
 * half-up y aritmética entera. Un margen de 0 devuelve el importe intacto.
 */
export function aplicarMargen(importe: Centimos, margen: MargenCentesimas): Centimos {
  if (margen === 0) return importe;
  return centimos(Math.floor((importe * (BASE + margen) + BASE / 2) / BASE));
}

/**
 * Subfamilia de un material. Del catálogo se saca del PREFIJO de la referencia;
 * el material de alta manual la trae en su propio campo (obligatorio desde
 * 2026-07-31, justo porque sin ella no hay margen).
 */
export function subfamiliaDeMaterial(material: Material, tabla: TablaMargenes): string | null {
  if (material.subfamilia !== null) {
    return subfamiliaDeNumero(material.subfamilia, tabla.longitudSubfamilia);
  }
  return subfamiliaDeReferencia(material.referencia, tabla.longitudSubfamilia);
}

/**
 * Margen que toca aplicar, o el motivo por el que no se puede cotizar.
 *
 * Orden: manda el margen escrito A MANO si lo hay (es la salida para los
 * artículos que no están en la tabla); si no, el de la tabla para la subfamilia
 * del material. Si no hay ninguno de los dos, `ok: false`: no se inventa un
 * margen ni se cotiza a coste sin avisar (2026-07-31, indicación directa: «que
 * lo diga y que el precio no se calcule hasta que se ponga»).
 *
 * La usan el motor y también las tarjetas del catálogo: el precio que se enseña
 * de un artículo tiene que salir de la MISMA regla con la que luego se cotiza.
 */
export function resolverMargen(
  material: Material,
  tabla: TablaMargenes,
  tipo: TipoMargen,
  manualCentesimas: MargenCentesimas | null,
): ResolucionMargen {
  const subfamilia = subfamiliaDeMaterial(material, tabla);

  if (manualCentesimas !== null) {
    return {
      ok: true,
      margen: {
        tipo,
        centesimas: manualCentesimas,
        subfamilia,
        nombreSubfamilia: nombreDeSubfamilia(tabla, subfamilia),
        manual: true,
      },
    };
  }

  const deTabla = margenDeSubfamilia(tabla, subfamilia, tipo);
  if (deTabla === null) return { ok: false, subfamilia };

  return {
    ok: true,
    margen: {
      tipo,
      centesimas: deTabla,
      subfamilia,
      nombreSubfamilia: nombreDeSubfamilia(tabla, subfamilia),
      manual: false,
    },
  };
}
