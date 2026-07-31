/**
 * Cálculo completo de la cotización (§4). Motor puro: devuelve los errores de
 * validación como valor (`SalidaMotor`), NUNCA lanza por entrada de usuario.
 *
 * Decisiones de cálculo documentadas:
 *
 *  - ORDEN DE REDONDEO EN MANIPULACIÓN: la tarifa lineal (y cada suplemento
 *    porCm) se aplica POR PIEZA con un único redondeo half-up a céntimos
 *    (`aplicarTarifaLineal`), y el importe por pieza se multiplica después por
 *    la cantidad (entero exacto). Los suplementos porPieza son céntimos
 *    enteros × cantidad. Así, cada línea de cotización redondea una sola vez.
 *
 *  - MERMA (§4): baldosasConMerma = ceil(baldosas × (1 + %/100)) con división
 *    entera exacta; el % se cuantiza a centésimas de punto (10,25 %…) para no
 *    usar floats. La condición "mínimo 3" NO se implementa (§6.1, pendiente).
 *
 *  - FACTURACIÓN (§4): SIEMPRE por cajas completas, en stock y en pedido por
 *    igual (2026-07-30, indicación directa: «facturamos por caja también en
 *    stock»). cajas = ceil(baldosasConMerma / piezasPorCaja) y unidades =
 *    cajas × piezasPorCaja; todo el sobrante se cobra al cliente. El origen ya
 *    NO cambia el importe: se conserva porque le dice al taller si hay que
 *    pedir el material o ya está en almacén. Sin datos de caja → error de
 *    validación claro, en los dos orígenes. Mínimos de compra: §6.8.
 *
 *  - COSTE DE MATERIAL: aritmética entera mm²·céntimos/1e6 con redondeo
 *    half-up exacto. m² facturados = cajas × m2PorCaja (m2PorCaja se cuantiza
 *    a mm² enteros; en material manual se deriva del formato). Material
 *    manual → precioUnidad × unidades. `precioMaterialEditado` sustituye al
 *    precio unitario correspondiente (€/m² en ERP, €/unidad en manual);
 *    `precioMaterialOriginal` conserva la tarifa (o el editado si no había).
 *
 *  - ARRANQUE DE MÁQUINA (§2): una sola vez por orden cuando hay manipulación.
 *    Toda figura activa con tarifa genera línea de manipulación, así que se
 *    aplica siempre que el cálculo llega a su fase de manipulación.
 *
 *  - VETA (§4): todos los componentes de una pieza salen de la MISMA baldosa.
 *    EMPAQUETADO (indicación de dirección 2026-07-28): de una baldosa pueden
 *    salir VARIAS piezas completas (rejilla provisional, ver ocupacion.ts), así
 *    que baldosas de origen = ceil(cantidad / piezasPorBaldosa). No se mezclan
 *    componentes de piezas distintas en la misma fila de colocación.
 *
 *  - PINTADO: solo cambia la tarifa de figuras con regla "pintable" (rodapiés,
 *    §2). En el resto se ignora silenciosamente.
 *
 *  - SUPLEMENTOS POR PIEZA: no se aplican a toda la cantidad, sino a las piezas
 *    que indique `entrada.unidadesSuplemento` (2026-07-30, indicación directa).
 *    «Angular» remata el extremo del peldaño y en un tramo de escalera solo lo
 *    llevan las de esquina. Sin entrada explícita se cobra UNA pieza. Los
 *    suplementos por cm siguen aplicándose a todas.
 */

import type { Configuracion, Figura } from '../config';
import type {
  Centimos,
  ComponentePieza,
  EntradaCotizacion,
  ErrorValidacion,
  LineaManipulacion,
  Mm,
  SalidaMotor,
} from '../types';
import {
  aplicarPorcentaje,
  aplicarTarifaLineal,
  centimos,
  multiplicarCentimos,
  sumarCentimos,
} from '../money';
import { formatearCotaCm } from '../units';
import { figuraPorId } from './index';
import { evaluarOcupacion } from './ocupacion';
import {
  longitudTarifaMm,
  longitudTarifaAdicionalMm,
  resolverTarifaAdicional,
  medidasReferenciadas,
  resolverTarifa,
  tarifasReferenciadas,
} from './tarifas';
import { aplicarMargen, resolverMargen } from './margen';
import { revalidarMedidasMm } from './validacion';

/** División entera hacia arriba (a ≥ 0, b > 0, enteros seguros). */
function ceilDiv(a: number, b: number): number {
  return Math.floor((a + b - 1) / b);
}

/**
 * Redondeo half-up EXACTO de n/1e6 con aritmética entera (n entero ≥ 0):
 * floor((n + 500000) / 1000000). Los productos intermedios (baldosas × mm² ×
 * céntimos) permanecen muy por debajo de 2^53 para cualquier uso razonable.
 */
function halfUpPartePorMillon(n: number): number {
  return Math.floor((n + 500_000) / 1_000_000);
}

/** Construye los componentes de UNA pieza a partir de la receta de la figura. */
function construirComponentes(
  figura: Figura,
  medidasMm: Readonly<Record<string, Mm>>,
): ComponentePieza[] {
  return figura.componentes.map((c) => ({
    id: c.id,
    largoMm: medidasMm[c.largoDe],
    anchoMm: medidasMm[c.anchoDe],
  }));
}

/**
 * Valida la entrada completa y devuelve los errores acumulados ([] = válida).
 * Es la fase que garantiza que el resto del cálculo no puede lanzar por
 * entrada de usuario ni por referencias de configuración rotas.
 */
function validarEntrada(
  entrada: EntradaCotizacion,
  config: Configuracion,
  figura: Figura,
): ErrorValidacion[] {
  const errores: ErrorValidacion[] = [];

  // Cantidad y merma (la UI las parsea de texto; el motor las revalida).
  if (!Number.isInteger(entrada.cantidad) || entrada.cantidad < 1) {
    errores.push({
      paso: 'medidas',
      medida: 'cantidad',
      mensaje: 'La cantidad debe ser un número entero mayor que 0.',
    });
  }
  if (!Number.isFinite(entrada.mermaPorcentaje) || entrada.mermaPorcentaje < 0) {
    errores.push({
      paso: 'medidas',
      medida: 'merma',
      mensaje: 'La merma debe ser un porcentaje válido igual o mayor que 0.',
    });
  }

  // Medidas presentes y dentro de rango (no se confía en la validación de la UI).
  errores.push(...revalidarMedidasMm(figura, entrada.medidasMm));

  // Referencias de la receta/tarifa a medidas declaradas (configuración coherente).
  const idsDeclarados = new Set(figura.medidas.map((m) => m.id));
  for (const id of medidasReferenciadas(figura)) {
    if (!idsDeclarados.has(id)) {
      errores.push({
        paso: 'figura',
        mensaje: `La configuración de «${figura.nombre}» referencia la medida '${id}', que no está declarada.`,
      });
    }
  }

  // Tarifas referenciadas existentes en configuración.
  if (figura.tarifa === null || figura.longitudTarifa === null) {
    errores.push({
      paso: 'figura',
      mensaje: `La figura «${figura.nombre}» no tiene tarifa configurada (pendiente de taller, §6).`,
    });
  } else {
    for (const id of tarifasReferenciadas(figura)) {
      if (!config.tarifas[id]) {
        errores.push({
          paso: 'figura',
          mensaje: `La figura «${figura.nombre}» referencia la tarifa '${id}', que no existe en la configuración.`,
        });
      }
    }
  }

  // Suplementos: existen, son aplicables a la figura y tienen precio coherente.
  for (const id of new Set(entrada.suplementos)) {
    const suplemento = config.suplementos[id];
    if (!suplemento) {
      errores.push({
        paso: 'suplementos',
        mensaje: `El suplemento '${id}' no existe en la configuración.`,
      });
      continue;
    }
    if (!figura.suplementos.includes(id)) {
      errores.push({
        paso: 'suplementos',
        mensaje: `«${suplemento.nombre}» no disponible para «${figura.nombre}».`,
      });
      continue;
    }
    if (suplemento.tipo === 'porPieza' && suplemento.precioCentimos === null) {
      errores.push({
        paso: 'suplementos',
        mensaje: `El suplemento «${suplemento.nombre}» no tiene precio por pieza configurado.`,
      });
    }
    if (suplemento.tipo === 'porPieza') {
      const unidades = entrada.unidadesSuplemento[id];
      if (unidades !== undefined) {
        if (!Number.isInteger(unidades) || unidades < 1) {
          errores.push({
            paso: 'suplementos',
            medida: id,
            mensaje: `Las piezas con «${suplemento.nombre}» deben ser un número entero mayor que 0.`,
          });
        } else if (Number.isInteger(entrada.cantidad) && unidades > entrada.cantidad) {
          errores.push({
            paso: 'suplementos',
            medida: id,
            mensaje: `No puedes aplicar «${suplemento.nombre}» a ${unidades} piezas: solo hay ${entrada.cantidad}.`,
          });
        }
      }
    }
    if (suplemento.tipo === 'porCm' && suplemento.precioMilesimasPorCm === null) {
      errores.push({
        paso: 'suplementos',
        mensaje: `El suplemento «${suplemento.nombre}» no tiene precio por cm configurado.`,
      });
    }
  }

  // Material: precio unitario disponible (tarifa o edición del comercial) y
  // datos logísticos para facturar pedidos por cajas completas.
  const { material } = entrada;
  if (entrada.precioMaterialEditado !== null && entrada.precioMaterialEditado < 0) {
    errores.push({
      paso: 'material',
      mensaje: 'El precio del material editado no puede ser negativo.',
    });
  }
  const precioUnitario = material.esManual
    ? material.precioUnidadCentimos
    : material.precioM2Centimos;
  if (precioUnitario === null && entrada.precioMaterialEditado === null) {
    errores.push({
      paso: 'material',
      mensaje: material.esManual
        ? `El material manual «${material.descripcion}» no tiene precio por unidad; introdúcelo para poder cotizar.`
        : `El material «${material.descripcion}» no tiene tarifa TARP (€/m²); introduce el precio manualmente.`,
    });
  }
  // Los datos de caja hacen falta SIEMPRE, no solo en pedido: desde 2026-07-30 el
  // stock también se factura por cajas completas.
  if (
    material.piezasPorCaja === null ||
    !Number.isInteger(material.piezasPorCaja) ||
    material.piezasPorCaja < 1
  ) {
    errores.push({
      paso: 'material',
      mensaje: `El material «${material.descripcion}» no tiene el dato «piezas por caja»; no se puede facturar por cajas completas.`,
    });
  }
  if (material.m2PorCaja === null || !Number.isFinite(material.m2PorCaja) || material.m2PorCaja <= 0) {
    errores.push({
      paso: 'material',
      mensaje: `El material «${material.descripcion}» no tiene el dato «m² por caja»; no se puede facturar por cajas completas.`,
    });
  }

  return errores;
}

/** Calcula la cotización completa. Errores como valor; nunca lanza por entrada de usuario. */
export function calcularCotizacion(entrada: EntradaCotizacion, config: Configuracion): SalidaMotor {
  // 1. Figura activa (§3: las pendientes se muestran bloqueadas).
  const figura = figuraPorId(config, entrada.figuraId);
  if (!figura) {
    return {
      ok: false,
      errores: [
        {
          paso: 'figura',
          mensaje: `La figura '${entrada.figuraId}' no existe en la configuración.`,
        },
      ],
    };
  }
  if (figura.estado !== 'activa') {
    return {
      ok: false,
      errores: [
        {
          paso: 'figura',
          mensaje: `«${figura.nombre}» no está disponible todavía: ${figura.motivoPendiente ?? 'pendiente de confirmación por taller (§6).'}`,
        },
      ],
    };
  }

  const errores = validarEntrada(entrada, config, figura);
  if (errores.length > 0) return { ok: false, errores };

  // 1 bis. MARGEN COMERCIAL. Se resuelve antes de calcular nada: sin margen no
  //        hay precio que dar. Si la subfamilia del artículo no está en la tabla
  //        del ERP, la cotización se detiene aquí y el mensaje dice qué falta y
  //        dónde ponerlo (2026-07-31, indicación directa).
  const resuelto = resolverMargen(
    entrada.material,
    config.margenes,
    entrada.tipoMargen,
    entrada.margenManualCentesimas,
  );
  if (!resuelto.ok) {
    const cual =
      resuelto.subfamilia !== null
        ? `la subfamilia ${resuelto.subfamilia} del artículo «${entrada.material.referencia}» no está en la tabla de márgenes`
        : `no se puede deducir la subfamilia del artículo «${entrada.material.referencia}»`;
    return {
      ok: false,
      errores: [
        {
          paso: 'material',
          mensaje: `No se puede calcular el precio: ${cual}. Indica el margen a mano en «Parámetros avanzados».`,
        },
      ],
    };
  }
  const { margen } = resuelto;

  // 2. Componentes de UNA pieza desde la receta de la figura.
  const componentes = construirComponentes(figura, entrada.medidasMm);

  // 3. Ocupación §4 (receta PROVISIONAL, ver ocupacion.ts): ambas orientaciones.
  const ocupacion = evaluarOcupacion(componentes, entrada.material.formato, config.parametros);
  if (!ocupacion.ok) return { ok: false, errores: [ocupacion.error] };

  // 4. Baldosas de origen y merma (veta §4 + empaquetado: varias piezas por baldosa).
  const baldosasNecesarias = ceilDiv(entrada.cantidad, ocupacion.detalle.piezasPorBaldosa);
  // TODO §6.1: la condición "mínimo 3" de la merma NO se implementa hasta que taller la defina.
  const mermaCentesimas = Math.round(entrada.mermaPorcentaje * 100);
  const baldosasConMerma = ceilDiv(baldosasNecesarias * (10_000 + mermaCentesimas), 10_000);

  // 5. Facturación por CAJAS COMPLETAS, en stock y en pedido por igual
  //    (2026-07-30, indicación directa). El sobrante se cobra al cliente.
  const piezasPorCaja = entrada.material.piezasPorCaja as number; // validado en validarEntrada
  const cajasFacturadas = ceilDiv(baldosasConMerma, piezasPorCaja);
  const unidadesFacturadas = cajasFacturadas * piezasPorCaja;

  // 6. Coste de material (aritmética entera, redondeo half-up exacto).
  const { material } = entrada;
  const precioUnitarioOriginal = material.esManual
    ? material.precioUnidadCentimos
    : material.precioM2Centimos;
  const precioUnitarioAplicado = (entrada.precioMaterialEditado ??
    precioUnitarioOriginal) as Centimos; // validado no nulo
  // m2PorCaja del ERP (float) se cuantiza a mm² enteros para mantener enteros.
  const mm2PorCaja = Math.round((material.m2PorCaja ?? 0) * 1_000_000);
  const mm2FacturadosTotal = cajasFacturadas * mm2PorCaja;
  const m2Facturados = mm2FacturadosTotal / 1_000_000;

  let materialCentimos: Centimos;
  if (material.esManual) {
    materialCentimos = multiplicarCentimos(precioUnitarioAplicado, unidadesFacturadas);
  } else {
    materialCentimos = centimos(halfUpPartePorMillon(mm2FacturadosTotal * precioUnitarioAplicado));
  }

  // 7. Manipulación: tarifa resuelta × longitud de tarifa (redondeo por pieza,
  //    luego × cantidad — ver cabecera) + suplementos activos. El pintado solo
  //    afecta a figuras con regla "pintable" (rodapiés); en las demás se ignora.
  const tarifa = resolverTarifa(figura, entrada.medidasMm, entrada.pintado, config);
  const longitudTarifa = longitudTarifaMm(figura, entrada.medidasMm);
  const cantidad = entrada.cantidad;
  const suplementosActivos = new Set(entrada.suplementos);

  const lineas: LineaManipulacion[] = [];
  const principalPorPieza = aplicarTarifaLineal(tarifa.milesimasPorCm, longitudTarifa);
  lineas.push({
    concepto: `${tarifa.nombre} — ${formatearCotaCm(longitudTarifa)} × ${cantidad} ud.`,
    centimos: multiplicarCentimos(principalPorPieza, cantidad),
  });

  // Figura COMPUESTA (tabica, 2026-07-31): segunda tarifa de la misma pieza. Va
  // en su PROPIA línea, con su propio redondeo por pieza, igual que la
  // principal; así el desglose enseña de qué se compone el precio y no se
  // acumulan dos redondeos sobre un importe ya redondeado.
  const tarifaZocalo = resolverTarifaAdicional(figura, entrada.medidasMm, entrada.pintado, config);
  const longitudZocalo = longitudTarifaAdicionalMm(figura, entrada.medidasMm);
  if (tarifaZocalo !== null && longitudZocalo !== null) {
    const adicionalPorPieza = aplicarTarifaLineal(tarifaZocalo.milesimasPorCm, longitudZocalo);
    lineas.push({
      concepto: `${tarifaZocalo.nombre} — ${formatearCotaCm(longitudZocalo)} × ${cantidad} ud.`,
      centimos: multiplicarCentimos(adicionalPorPieza, cantidad),
    });
  }

  // Orden canónico de líneas: el de la configuración de la figura (determinista).
  for (const id of figura.suplementos) {
    if (!suplementosActivos.has(id)) continue;
    const suplemento = config.suplementos[id];
    if (suplemento.tipo === 'porPieza' && suplemento.precioCentimos !== null) {
      // Solo las piezas que lo lleven (ver cabecera): sin dato, una.
      const unidades = entrada.unidadesSuplemento[id] ?? 1;
      lineas.push({
        concepto: `${suplemento.nombre} — ${unidades} ud.`,
        centimos: multiplicarCentimos(suplemento.precioCentimos, unidades),
      });
    } else if (suplemento.tipo === 'porCm' && suplemento.precioMilesimasPorCm !== null) {
      const porPieza = aplicarTarifaLineal(suplemento.precioMilesimasPorCm, longitudTarifa);
      lineas.push({
        concepto: `${suplemento.nombre} — ${formatearCotaCm(longitudTarifa)} × ${cantidad} ud.`,
        centimos: multiplicarCentimos(porPieza, cantidad),
      });
    }
  }

  // 8. MARGEN COMERCIAL (2026-07-31). Se aplica a material, manipulación
  //    —suplementos incluidos— y arranque: a todo lo que se factura.
  //
  //    Línea a línea, no sobre el total, para que el desglose que se ve en
  //    pantalla y en la orden SUME el total exacto. Ver `margen.ts`.
  const lineasConMargen = lineas.map((l) => ({
    concepto: l.concepto,
    centimos: aplicarMargen(l.centimos, margen.centesimas),
  }));
  const manipulacionCentimos = sumarCentimos(...lineasConMargen.map((l) => l.centimos));
  const materialConMargen = aplicarMargen(materialCentimos, margen.centesimas);

  // Arranque de máquina: una vez por orden cuando hay manipulación (§2).
  const arranqueCentimos = aplicarMargen(config.parametros.arranqueCentimos, margen.centesimas);

  // 9. Totales: sin IVA, IVA (21 % configurable), con IVA.
  const totalSinIvaCentimos = sumarCentimos(
    materialConMargen,
    manipulacionCentimos,
    arranqueCentimos,
  );
  const ivaCentimos = aplicarPorcentaje(totalSinIvaCentimos, config.parametros.ivaPorcentaje);
  const totalConIvaCentimos = sumarCentimos(totalSinIvaCentimos, ivaCentimos);

  return {
    ok: true,
    resultado: {
      componentes,
      ocupacion: ocupacion.detalle,
      baldosasNecesarias,
      baldosasConMerma,
      unidadesFacturadas,
      cajasFacturadas,
      m2Facturados,
      lineasManipulacion: lineasConMargen,
      margen,
      desglose: {
        materialCentimos: materialConMargen,
        manipulacionCentimos,
        arranqueCentimos,
        totalSinIvaCentimos,
        ivaCentimos,
        totalConIvaCentimos,
      },
      // Si no había tarifa original y el comercial introdujo el precio, el
      // "original" mostrado es ese mismo valor (no hay tarifa que conservar).
      precioMaterialOriginal: precioUnitarioOriginal ?? precioUnitarioAplicado,
    },
  };
}
