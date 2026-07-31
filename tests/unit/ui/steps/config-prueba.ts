/**
 * Configuración de prueba construida con `construirConfiguracion` sobre los
 * JSON REALES de /public/config (los mismos que sirve la aplicación), más un
 * material de muestra para despachar `seleccionarMaterial` en los tests.
 */

import { construirConfiguracion, type Configuracion } from '../../../../src/domain/config';
import { eurosACentimos } from '../../../../src/domain/money';
import { mm } from '../../../../src/domain/units';
import type { Material } from '../../../../src/domain/types';
import parametrosJson from '../../../../public/config/parametros.json';
import tarifasJson from '../../../../public/config/tarifas.json';
import figurasJson from '../../../../public/config/figuras.json';

// Las interfaces de los JSON no se exportan de domain/config; se recuperan de
// la firma de construirConfiguracion. El JSON importado ensancha literales
// ('activa' → string), de ahí el doble paso por unknown.
type Args = Parameters<typeof construirConfiguracion>;

/**
 * Tabla de márgenes de prueba con la subfamilia de `materialPrueba()` **al 0 %**.
 *
 * Hace falta que exista: desde 2026-07-31 el motor NO cotiza si no encuentra
 * margen para el artículo, así que con la tabla vacía estos tests de UI se
 * quedaban sin cotización y los pasos no se abrían. Al 0 % para que ningún
 * importe de estos tests cambie por el markup — el margen se prueba aparte, en
 * `tests/unit/engine/margen.test.ts`.
 */
const margenesPrueba = {
  longitudSubfamilia: 4,
  subfamilias: { '9411': { nombre: 'SUBFAMILIA DE PRUEBA', pvp: 0, contratista: 0 } },
};

/**
 * `margenes` se puede sustituir para los tests que SÍ prueban el markup (las
 * tarjetas del catálogo, que enseñan precio de venta): con la tabla por defecto,
 * al 0 %, un precio con margen y otro sin él serían indistinguibles.
 */
export function construirConfigPrueba(margenes: Args[3] = margenesPrueba): Configuracion {
  return construirConfiguracion(
    parametrosJson as unknown as Args[0],
    tarifasJson as unknown as Args[1],
    figurasJson as unknown as Args[2],
    margenes,
  );
}

/**
 * Material ficticio 60×60 para los tests (no requiere la capa de datos).
 * La referencia empieza por 9411 a propósito: es la subfamilia de la tabla de
 * márgenes de prueba, y sin margen no habría cotización.
 */
export function materialPrueba(): Material {
  return {
    referencia: '94110600',
    descripcion: 'Baldosa de prueba 60×60',
    marca: 'Marca Prueba',
    formato: { largoMm: mm(600), anchoMm: mm(600) },
    precioM2Centimos: eurosACentimos(21.5),
    precioUnidadCentimos: null,
    piezasPorCaja: 4,
    m2PorCaja: 1.44,
    subfamilia: null,
    imagenUrl: null,
    esManual: false,
  };
}
