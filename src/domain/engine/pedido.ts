/**
 * PEDIDO: varias piezas en una sola orden de trabajo (2026-07-31, petición
 * directa). Motor puro, como el resto de `engine/`: los errores se devuelven
 * como valor y nunca se lanza por entrada de usuario.
 *
 * POR QUÉ EXISTE. Cotizando pieza a pieza, cada corte distinto arrastra su
 * propia tanda de cajas completas: dos piezas del mismo artículo que necesitan
 * 1 baldosa cada una se cobraban como 2 cajas de 4, 8 baldosas para usar 2. Como
 * la caja es del ARTÍCULO y no del corte, si de una misma caja salen varios
 * cortes distintos hay que contarla UNA VEZ. Eso es todo lo que hace este
 * módulo: agrupar las líneas por artículo antes de facturar las cajas.
 *
 * Decisiones de cálculo:
 *
 *  - AGRUPACIÓN. Comparten cajas las líneas del mismo artículo con los mismos
 *    datos de caja (`claveGrupoMaterial`). El orden de los grupos es el de
 *    primera aparición: determinista, mismo input → mismo resultado.
 *
 *  - BALDOSAS. Se siguen contando POR LÍNEA (`ceil(cantidad / piezasPorBaldosa)`
 *    y su merma) y luego se SUMAN. No se mezclan cortes distintos dentro de una
 *    misma baldosa: la regla de veta §4 y la receta de ocupación siguen siendo
 *    por pieza. Lo que se comparte es la CAJA, no la baldosa.
 *
 *  - ARRANQUE DE MÁQUINA. Uno por GRUPO DE MATERIAL, no uno por línea ni uno por
 *    pedido. Es la extensión mínima de §2 («una sola vez por orden»): con un solo
 *    material el resultado es idéntico al de siempre, y con varios responde a que
 *    cambiar de baldosa obliga a volver a preparar la máquina. PENDIENTE de
 *    confirmar con taller (PENDIENTES.md §6.14): puede que quieran uno por corte.
 *
 *  - MARGEN. Se resuelve por línea (depende de la subfamilia del artículo), así
 *    que dentro de un grupo — que es un solo artículo — sale siempre el mismo.
 *    Si dos líneas del mismo artículo traen distinto margen o distinto precio de
 *    material editado a mano, el pedido NO se cotiza y lo dice: sería arbitrario
 *    elegir con cuál de los dos se compran las cajas.
 *
 *  - REDONDEO. Igual que en la cotización de una pieza: cada línea de
 *    manipulación y el material de cada grupo redondean UNA vez, y el total es la
 *    suma de las líneas. Así el desglose del PDF cuadra con su total.
 */

import type { Configuracion } from '../config';
import type {
  Centimos,
  EntradaCotizacion,
  ErrorLineaPedido,
  GrupoMaterialPedido,
  Material,
  ResultadoLineaPedido,
  SalidaPedido,
} from '../types';
import { aplicarPorcentaje, centimos, sumarCentimos } from '../money';
import { calcularLinea, facturarMaterial, type LineaCalculada } from './cotizacion';
import { aplicarMargen } from './margen';

/** División entera hacia arriba (a ≥ 0, b > 0, enteros seguros). */
function ceilDiv(a: number, b: number): number {
  return Math.floor((a + b - 1) / b);
}

/**
 * Qué líneas comparten cajas: el mismo artículo con los mismos datos de caja.
 * Los datos de caja entran en la clave a propósito — si dos líneas dicen tener
 * distinto `piezasPorCaja` para la misma referencia, algo va mal en el catálogo
 * y es preferible no mezclarlas que facturar cajas de un tamaño inventado.
 */
export function claveGrupoMaterial(material: Material): string {
  return [
    material.esManual ? 'manual' : 'cataleg',
    material.referencia.trim(),
    material.formato.largoMm,
    material.formato.anchoMm,
    material.piezasPorCaja ?? '-',
    material.m2PorCaja ?? '-',
  ].join('|');
}

interface GrupoEnConstruccion {
  readonly clave: string;
  readonly material: Material;
  readonly indices: number[];
  readonly lineas: LineaCalculada[];
}

/**
 * Calcula un pedido completo: varias piezas, las cajas compartidas por artículo.
 *
 * Con UNA sola línea el resultado es equivalente a `calcularCotizacion` (mismas
 * cajas, mismo importe, mismo arranque): el pedido no es un cálculo aparte, es el
 * mismo cálculo con el paso de facturación hecho por artículo en vez de por pieza.
 */
export function calcularPedido(
  entradas: readonly EntradaCotizacion[],
  config: Configuracion,
): SalidaPedido {
  if (entradas.length === 0) {
    return {
      ok: false,
      errores: [
        {
          indiceLinea: null,
          error: { paso: 'material', mensaje: 'El pedido no tiene ninguna pieza todavía.' },
        },
      ],
    };
  }

  // 1. Cada pieza por su cuenta, hasta donde se puede sin decidir cajas.
  const calculadas: LineaCalculada[] = [];
  const errores: ErrorLineaPedido[] = [];
  entradas.forEach((entrada, indice) => {
    const salida = calcularLinea(entrada, config);
    if (salida.ok) calculadas[indice] = salida.linea;
    else for (const error of salida.errores) errores.push({ indiceLinea: indice, error });
  });
  if (errores.length > 0) return { ok: false, errores };

  // 2. Agrupación por artículo, en orden de primera aparición (determinista).
  const porClave = new Map<string, GrupoEnConstruccion>();
  entradas.forEach((entrada, indice) => {
    const clave = claveGrupoMaterial(entrada.material);
    let grupo = porClave.get(clave);
    if (!grupo) {
      grupo = { clave, material: entrada.material, indices: [], lineas: [] };
      porClave.set(clave, grupo);
    }
    grupo.indices.push(indice);
    grupo.lineas.push(calculadas[indice]);
  });

  // 3. Coherencia dentro del grupo: un solo margen y una sola respuesta a quién
  //    aporta las baldosas. Con dos valores distintos no hay forma no arbitraria
  //    de comprar las cajas — el artículo se compra entero o no se compra.
  for (const grupo of porClave.values()) {
    const [primera] = grupo.lineas;
    const discrepaAzulejos = grupo.lineas.some(
      (l) => l.azulejosNoIncluidos !== primera.azulejosNoIncluidos,
    );
    const discrepaMargen = grupo.lineas.some(
      (l) => l.margen.centesimas !== primera.margen.centesimas,
    );
    if (discrepaAzulejos || discrepaMargen) {
      const que = discrepaAzulejos ? '«azulejos no incluidos»' : 'margen';
      errores.push({
        indiceLinea: grupo.indices[grupo.indices.length - 1],
        error: {
          paso: 'material',
          mensaje:
            `Hay piezas del artículo «${grupo.material.referencia}» con distinto ${que}. ` +
            'Como comparten caja, todas las piezas de un mismo artículo deben cotizarse igual.',
        },
      });
    }
  }
  if (errores.length > 0) return { ok: false, errores };

  // 4. Facturación por grupo: las cajas se cuentan UNA VEZ sobre la suma.
  const grupos: GrupoMaterialPedido[] = [];
  for (const grupo of porClave.values()) {
    const [primera] = grupo.lineas;
    const baldosasConMerma = grupo.lineas.reduce((acc, l) => acc + l.baldosasConMerma, 0);
    const facturacion = facturarMaterial(
      grupo.material,
      baldosasConMerma,
      primera.precioUnitario,
      primera.margen.centesimas,
      primera.azulejosNoIncluidos,
    );
    const piezasPorCaja = grupo.material.piezasPorCaja as number; // validado en `calcularLinea`
    grupos.push({
      clave: grupo.clave,
      material: grupo.material,
      indicesLinea: [...grupo.indices],
      baldosasConMerma,
      cajasFacturadas: facturacion.cajasFacturadas,
      unidadesFacturadas: facturacion.unidadesFacturadas,
      m2Facturados: facturacion.m2Facturados,
      baldosasSobrantes: facturacion.unidadesFacturadas - baldosasConMerma,
      materialCentimos: facturacion.materialCentimos,
      // Lo que habría costado en cajas cotizando cada pieza en su propia orden.
      cajasSinAgrupar: grupo.lineas.reduce(
        (acc, l) => acc + ceilDiv(l.baldosasConMerma, piezasPorCaja),
        0,
      ),
      arranqueCentimos: aplicarMargen(
        config.parametros.arranqueCentimos,
        primera.margen.centesimas,
      ),
      margen: primera.margen,
      precioMaterial: primera.precioUnitario,
      azulejosNoIncluidos: primera.azulejosNoIncluidos,
    });
  }

  // 5. Las líneas del pedido, ya sabiendo de qué grupo sale cada una.
  const claveDeLinea = new Map<number, string>();
  for (const grupo of grupos) for (const i of grupo.indicesLinea) claveDeLinea.set(i, grupo.clave);

  const lineas: ResultadoLineaPedido[] = entradas.map((entrada, indice) => {
    const l = calculadas[indice];
    return {
      indice,
      figuraId: entrada.figuraId,
      cantidad: entrada.cantidad,
      claveGrupo: claveDeLinea.get(indice) as string,
      componentes: l.componentes,
      ocupacion: l.ocupacion,
      baldosasNecesarias: l.baldosasNecesarias,
      baldosasConMerma: l.baldosasConMerma,
      mermaPorcentaje: entrada.mermaPorcentaje,
      lineasManipulacion: l.lineasManipulacion,
      manipulacionCentimos: l.manipulacionCentimos,
      margen: l.margen,
    };
  });

  // 6. Totales del pedido.
  const materialCentimos = sumarCentimos(...grupos.map((g) => g.materialCentimos));
  const manipulacionCentimos = sumarCentimos(...lineas.map((l) => l.manipulacionCentimos));
  const arranqueCentimos = sumarCentimos(...grupos.map((g) => g.arranqueCentimos));
  const totalSinIvaCentimos = sumarCentimos(
    materialCentimos,
    manipulacionCentimos,
    arranqueCentimos,
  );
  const ivaCentimos = aplicarPorcentaje(totalSinIvaCentimos, config.parametros.ivaPorcentaje);
  const totalConIvaCentimos = sumarCentimos(totalSinIvaCentimos, ivaCentimos);

  // 7. Cuánto se ahorra frente a sacar una orden por pieza: cajas compartidas y
  //    un solo arranque por material. Es la cifra que justifica el pedido, así
  //    que se calcula, no se estima.
  const totalSinAgruparCentimos = sumarCentimos(
    ...entradas.map((entrada, indice) => {
      const l = calculadas[indice];
      const suelta = facturarMaterial(
        entrada.material,
        l.baldosasConMerma,
        l.precioUnitario,
        l.margen.centesimas,
        l.azulejosNoIncluidos,
      );
      return sumarCentimos(
        suelta.materialCentimos,
        l.manipulacionCentimos,
        aplicarMargen(config.parametros.arranqueCentimos, l.margen.centesimas),
      );
    }),
  );

  return {
    ok: true,
    resultado: {
      lineas,
      grupos,
      desglose: {
        materialCentimos,
        manipulacionCentimos,
        arranqueCentimos,
        totalSinIvaCentimos,
        ivaCentimos,
        totalConIvaCentimos,
      },
      cajasAhorradas: grupos.reduce((acc, g) => acc + (g.cajasSinAgrupar - g.cajasFacturadas), 0),
      // Nunca negativa: agrupar no puede salir más caro (mismas baldosas, menos
      // o igual número de cajas y de arranques), pero se acota por si acaso.
      ahorroCentimos: centimos(
        Math.max(0, totalSinAgruparCentimos - totalSinIvaCentimos),
      ) as Centimos,
      totalSinAgruparCentimos,
    },
  };
}
