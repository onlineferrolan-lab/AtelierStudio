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

export function construirConfigPrueba(): Configuracion {
  return construirConfiguracion(
    parametrosJson as unknown as Args[0],
    tarifasJson as unknown as Args[1],
    figurasJson as unknown as Args[2],
  );
}

/** Material ficticio 60×60 para los tests (no requiere la capa de datos). */
export function materialPrueba(): Material {
  return {
    referencia: 'PRU-600',
    descripcion: 'Baldosa de prueba 60×60',
    marca: 'Marca Prueba',
    formato: { largoMm: mm(600), anchoMm: mm(600) },
    precioM2Centimos: eurosACentimos(21.5),
    precioUnidadCentimos: null,
    piezasPorCaja: 4,
    m2PorCaja: 1.44,
    imagenUrl: null,
    esManual: false,
  };
}
