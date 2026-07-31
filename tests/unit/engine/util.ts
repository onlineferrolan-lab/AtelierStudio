/**
 * Utilidades compartidas de los tests del motor: carga de la configuración
 * REAL de /public/config (las tarifas del PDF de taller) y factorías de
 * materiales y entradas de cotización.
 *
 * La configuración se importa como módulo JSON (resolveJsonModule): así los
 * tests no dependen de tipos de Node ni de la ruta de ejecución.
 */

import {
  construirConfiguracion,
  validarConfiguracion,
  type Configuracion,
} from '../../../src/domain/config';
import { centimos } from '../../../src/domain/money';
import type { EntradaCotizacion, Material } from '../../../src/domain/types';
import { mm } from '../../../src/domain/units';
import parametrosJson from '../../../public/config/parametros.json';
import tarifasJson from '../../../public/config/tarifas.json';
import figurasJson from '../../../public/config/figuras.json';
import margenesJson from '../../../public/config/margenes.json';

type ArgsConfiguracion = Parameters<typeof construirConfiguracion>;

/** Carga la configuración real servida en /public/config (parametros + tarifas + figuras). */
export function cargarConfigReal(): Configuracion {
  // Los literales de string del JSON se ensanchan a `string` al importar; el
  // parseo de construirConfiguracion + validarConfiguracion garantizan la forma.
  const config = construirConfiguracion(
    parametrosJson as unknown as ArgsConfiguracion[0],
    tarifasJson as unknown as ArgsConfiguracion[1],
    figurasJson as unknown as ArgsConfiguracion[2],
    // La tabla REAL de márgenes, no una de prueba: así los tests que la usan
    // detectan que `margenes.json` se ha regenerado mal.
    margenesJson as unknown as ArgsConfiguracion[3],
  );
  const errores = validarConfiguracion(config);
  if (errores.length > 0) {
    throw new Error(
      `La configuración real de /public/config no es válida:\n- ${errores.join('\n- ')}`,
    );
  }
  return config;
}

/** Material ERP de prueba: baldosa 60×60 cm, TARP 25 €/m², 4 piezas/caja, 1,44 m²/caja. */
export function materialErp(overrides: Partial<Material> = {}): Material {
  return {
    referencia: 'TEST-6060',
    descripcion: 'Baldosa de prueba 60×60',
    marca: 'Pruebas',
    formato: { largoMm: mm(600), anchoMm: mm(600) },
    precioM2Centimos: centimos(2500),
    precioUnidadCentimos: null,
    piezasPorCaja: 4,
    m2PorCaja: 1.44,
    subfamilia: null,
    imagenUrl: null,
    esManual: false,
    ...overrides,
  };
}

/**
 * Material manual de prueba: 60×60 cm a 8 €/unidad, 4 piezas/caja.
 *
 * Lleva datos de caja porque desde 2026-07-30 se factura por cajas completas en
 * los dos orígenes: sin ellos no se podría cotizar. Los m²/caja son los que
 * derivaría `crearMaterialManual` (4 × 0,36 = 1,44), para que el fixture sea
 * coherente con el formato y no afirme un imposible.
 */
export function materialManual(overrides: Partial<Material> = {}): Material {
  return {
    referencia: 'MANUAL-1',
    descripcion: 'Pieza manual de prueba 60×60',
    marca: null,
    formato: { largoMm: mm(600), anchoMm: mm(600) },
    precioM2Centimos: null,
    precioUnidadCentimos: centimos(800),
    piezasPorCaja: 4,
    m2PorCaja: 1.44,
    subfamilia: null,
    imagenUrl: null,
    esManual: true,
    ...overrides,
  };
}

/**
 * Entrada base válida: Figura 2, 50×30 cm con frontal de 4 cm, 5 piezas,
 * merma 10 %. Sobrescribible por test.
 *
 * **Margen 0 A PROPÓSITO.** Estos tests comprueban la aritmética de COSTE
 * (ocupación, merma, cajas, tarifas, redondeos), y con un margen real todos los
 * importes esperados llevarían el markup encima y dejarían de leerse. El margen
 * tiene sus propios tests en `margen.test.ts`. Se pone como margen MANUAL porque
 * la referencia del material de prueba no es numérica y no tiene subfamilia.
 */
export function entradaBase(overrides: Partial<EntradaCotizacion> = {}): EntradaCotizacion {
  return {
    material: materialErp(),
    figuraId: 'figura-2',
    medidasMm: { longitud: mm(500), fondo: mm(300), alturaFrontal: mm(40) },
    cantidad: 5,
    suplementos: [],
    unidadesSuplemento: {},
    azulejosNoIncluidos: false,
    mermaPorcentaje: 10,
    tipoMargen: 'pvp',
    margenManualCentesimas: 0,
    ...overrides,
  };
}
