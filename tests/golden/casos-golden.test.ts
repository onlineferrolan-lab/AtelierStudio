/**
 * Loader de los casos dorados de taller (§5).
 *
 * Ejecuta TODOS los `*.json` de esta carpeta contra la configuración real de
 * /public/config. Cada caso pasa por la cadena completa: validarMedidasCrudas
 * (texto en cm) → calcularCotizacion.
 *
 * §5: «Si un caso dorado falla, el motor está mal, no el caso.» Los casos con
 * `validadoPorTaller: true` son intocables; los marcados «EJEMPLO NO VALIDADO
 * POR TALLER» solo documentan el formato (ver README.md de esta carpeta).
 *
 * Solo se comparan las claves presentes en `esperado`: taller puede rellenar
 * un subconjunto de columnas de la tabla §5.
 *
 * Los ficheros se cargan con `import.meta.glob` (Vite): sin tipos de Node.
 */

import { calcularCotizacion, figuraPorId, validarMedidasCrudas } from '../../src/domain/engine';
import { eurosACentimos } from '../../src/domain/money';
import type { Material, ResultadoCotizacion, SalidaMotor } from '../../src/domain/types';
import { cmAMm } from '../../src/domain/units';
import { cargarConfigReal } from '../unit/engine/util';

interface CasoDorado {
  caso: string;
  validadoPorTaller: boolean;
  nota?: string;
  material: {
    referencia: string;
    descripcion: string;
    marca: string | null;
    formatoCm: { largo: number; ancho: number };
    precioM2Euros: number | null;
    precioUnidadEuros: number | null;
    piezasPorCaja: number | null;
    m2PorCaja: number | null;
    esManual: boolean;
  };
  origen: 'stock' | 'pedido';
  figuraId: string;
  medidasCm: Record<string, string>;
  cantidad: number;
  suplementos: string[];
  /**
   * A cuántas piezas se aplica cada suplemento POR PIEZA (hoy solo «Angular»).
   * Opcional: sin él, cada suplemento por pieza se cobra a UNA pieza.
   */
  unidadesSuplemento?: Record<string, number>;
  pintado: boolean;
  precioMaterialEditadoEuros: number | null;
  mermaPorcentaje: number;
  esperado: {
    ok: boolean;
    errores?: string[];
    baldosasNecesarias?: number;
    baldosasConMerma?: number;
    unidadesFacturadas?: number;
    cajasFacturadas?: number;
    m2Facturados?: number;
    ocupacionMm?: number;
    dimensionUtilMm?: number;
    baldosaGirada?: boolean;
    piezasPorBaldosa?: number;
    precioMaterialOriginal?: number;
    materialCentimos?: number;
    manipulacionCentimos?: number;
    arranqueCentimos?: number;
    totalSinIvaCentimos?: number;
    ivaCentimos?: number;
    totalConIvaCentimos?: number;
  };
}

const config = cargarConfigReal();

// Todos los *.json de esta carpeta, empaquetados por Vite (sin fs ni tipos de Node).
const modulos = import.meta.glob('./*.json', { eager: true, import: 'default' });
const casos = Object.entries(modulos)
  .sort(([a], [b]) => a.localeCompare(b))
  .map(([ruta, contenido]) => ({
    fichero: ruta.replace(/^\.\//, ''),
    caso: contenido as CasoDorado,
  }));

/** Extrae del resultado los campos comparables, con los mismos nombres que el JSON. */
function camposDelResultado(r: ResultadoCotizacion): Record<string, number | boolean> {
  return {
    baldosasNecesarias: r.baldosasNecesarias,
    baldosasConMerma: r.baldosasConMerma,
    unidadesFacturadas: r.unidadesFacturadas,
    cajasFacturadas: r.cajasFacturadas,
    m2Facturados: r.m2Facturados,
    ocupacionMm: r.ocupacion.ocupacionMm,
    dimensionUtilMm: r.ocupacion.dimensionUtilMm,
    baldosaGirada: r.ocupacion.baldosaGirada,
    piezasPorBaldosa: r.ocupacion.piezasPorBaldosa,
    precioMaterialOriginal: r.precioMaterialOriginal,
    materialCentimos: r.desglose.materialCentimos,
    manipulacionCentimos: r.desglose.manipulacionCentimos,
    arranqueCentimos: r.desglose.arranqueCentimos,
    totalSinIvaCentimos: r.desglose.totalSinIvaCentimos,
    ivaCentimos: r.desglose.ivaCentimos,
    totalConIvaCentimos: r.desglose.totalConIvaCentimos,
  };
}

/** Ejecuta la cadena completa del caso: validación de medidas → cotización. */
function ejecutarCaso(caso: CasoDorado): SalidaMotor {
  const figura = figuraPorId(config, caso.figuraId);
  if (!figura) {
    return {
      ok: false,
      errores: [
        { paso: 'figura', mensaje: `Caso ${caso.caso}: figura desconocida '${caso.figuraId}'.` },
      ],
    };
  }
  const validacion = validarMedidasCrudas(figura, caso.medidasCm);
  if (!validacion.ok) return { ok: false, errores: validacion.errores };

  const material: Material = {
    referencia: caso.material.referencia,
    descripcion: caso.material.descripcion,
    marca: caso.material.marca,
    formato: {
      largoMm: cmAMm(caso.material.formatoCm.largo),
      anchoMm: cmAMm(caso.material.formatoCm.ancho),
    },
    precioM2Centimos:
      caso.material.precioM2Euros === null ? null : eurosACentimos(caso.material.precioM2Euros),
    precioUnidadCentimos:
      caso.material.precioUnidadEuros === null
        ? null
        : eurosACentimos(caso.material.precioUnidadEuros),
    piezasPorCaja: caso.material.piezasPorCaja,
    m2PorCaja: caso.material.m2PorCaja,
    imagenUrl: null,
    esManual: caso.material.esManual,
  };

  return calcularCotizacion(
    {
      material,
      origen: caso.origen,
      figuraId: caso.figuraId,
      medidasMm: validacion.medidasMm,
      cantidad: caso.cantidad,
      suplementos: caso.suplementos,
      unidadesSuplemento: caso.unidadesSuplemento ?? {},
      pintado: caso.pintado,
      precioMaterialEditado:
        caso.precioMaterialEditadoEuros === null
          ? null
          : eurosACentimos(caso.precioMaterialEditadoEuros),
      mermaPorcentaje: caso.mermaPorcentaje,
    },
    config,
  );
}

if (casos.length === 0) {
  describe('casos dorados de taller (§5)', () => {
    it.todo('taller aún no ha rellenado ningún caso dorado (ver tests/golden/README.md)');
  });
}

for (const { fichero, caso } of casos) {
  const marca = caso.validadoPorTaller ? 'VALIDADO POR TALLER' : 'EJEMPLO NO VALIDADO POR TALLER';

  describe(`caso dorado ${caso.caso} (${fichero}) [${marca}]`, () => {
    if (caso.esperado.ok) {
      it('el motor reproduce el cálculo del caso', () => {
        const salida = ejecutarCaso(caso);
        if (!salida.ok) {
          throw new Error(
            `El motor rechazó el caso: ${salida.errores.map((e) => e.mensaje).join(' | ')}`,
          );
        }
        const campos = camposDelResultado(salida.resultado);
        for (const [clave, valor] of Object.entries(caso.esperado)) {
          if (clave === 'ok' || clave === 'errores') continue;
          expect(campos[clave], `campo '${clave}'`).toBe(valor);
        }
      });
    } else {
      it('el motor rechaza el caso con los errores esperados', () => {
        const salida = ejecutarCaso(caso);
        if (salida.ok) throw new Error('El motor aceptó un caso que debería fallar');
        const mensajes = salida.errores.map((e) => e.mensaje);
        for (const fragmento of caso.esperado.errores ?? []) {
          expect(
            mensajes.some((m) => m.includes(fragmento)),
            `debe aparecer el error: «${fragmento}» (mensajes: ${mensajes.join(' | ')})`,
          ).toBe(true);
        }
      });
    }
  });
}
