/**
 * Tests del PDF del pedido: construcción pura del documento (sin save()),
 * paginación y nombre de archivo.
 *
 * El `ResultadoPedido` NO se escribe a mano: se calcula con el motor real sobre
 * la configuración real. Un resultado inventado podría no cuadrar con lo que el
 * motor produce y el test dejaría de decir nada útil sobre el documento que se
 * genera de verdad.
 */

import { describe, expect, it } from 'vitest';
import {
  codigoPedido,
  construirPdfOrdenPedido,
  nombreArchivoOrdenPedido,
  type DatosOrdenPedido,
  type PiezaOrdenPedido,
} from '../../../src/pdf/ordenPedido';
import { calcularPedido } from '../../../src/domain/engine/pedido';
import { figuraPorId } from '../../../src/domain/engine';
import type { EntradaCotizacion, Material, ResultadoPedido } from '../../../src/domain/types';
import { construirSeccion } from '../../../src/piezas/piezaDeFigura';
import { cargarConfigReal, entradaBase, materialErp } from '../engine/util';

const config = cargarConfigReal();
const FECHA = new Date(2026, 5, 9, 14, 7); // 9 de junio de 2026, 14:07 (hora local)

// PNG 1×1 válido (parseable por doc.getImageProperties sin canvas, jsdom-friendly).
const PNG_1X1 =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';

/** Convierte entradas del motor en las piezas que dibuja el PDF. */
function construirDatos(
  entradas: readonly EntradaCotizacion[],
  extra: Partial<DatosOrdenPedido> = {},
): DatosOrdenPedido {
  const salida = calcularPedido(entradas, config);
  if (!salida.ok) {
    throw new Error(`El pedido no cotizó: ${salida.errores.map((e) => e.error.mensaje).join(' | ')}`);
  }
  const piezas: PiezaOrdenPedido[] = entradas.map((entrada) => {
    const figura = figuraPorId(config, entrada.figuraId);
    if (!figura) throw new Error(`figura ${entrada.figuraId} no está en la configuración`);
    return {
      figura,
      material: entrada.material,
      medidasMm: entrada.medidasMm,
      cantidad: entrada.cantidad,
      suplementosActivos: entrada.suplementos,
      unidadesSuplemento: entrada.unidadesSuplemento,
      pintado: entrada.pintado,
      precioMaterialEditadoEuros: '',
      seccion: construirSeccion(figura, entrada.medidasMm),
    };
  });
  return { piezas, resultado: salida.resultado, config, fecha: FECHA, ...extra };
}

describe('construirPdfOrdenPedido — paginación', () => {
  it('saca el resumen y una hoja por pieza', () => {
    const doc = construirPdfOrdenPedido(
      construirDatos([entradaBase(), entradaBase({ figuraId: 'figura-1' })]),
    );
    // 1 resumen + 2 piezas.
    expect(doc.getNumberOfPages()).toBe(3);
  });

  it('con una sola pieza son dos hojas: resumen y pieza', () => {
    const doc = construirPdfOrdenPedido(construirDatos([entradaBase()]));
    expect(doc.getNumberOfPages()).toBe(2);
  });

  it('el resumen cabe en una hoja con un pedido normal de cinco piezas', () => {
    const entradas = Array.from({ length: 5 }, (_, i) =>
      entradaBase({ cantidad: i + 1, figuraId: i % 2 === 0 ? 'figura-2' : 'figura-1' }),
    );
    const doc = construirPdfOrdenPedido(construirDatos(entradas));
    expect(doc.getNumberOfPages()).toBe(1 + 5);
  });

  it('un pedido largo pasa los importes a otra hoja en vez de partirlos', () => {
    // Doce piezas con suplementos: el desglose no cabe bajo las dos tablas.
    const entradas = Array.from({ length: 12 }, () =>
      entradaBase({ suplementos: ['angular-f14'], unidadesSuplemento: { 'angular-f14': 1 } }),
    );
    const doc = construirPdfOrdenPedido(construirDatos(entradas));
    // 1 resumen + 1 de importes desplazados + 12 piezas.
    expect(doc.getNumberOfPages()).toBe(2 + 12);
  });

  it('los comentarios para taller no rompen el documento', () => {
    const doc = construirPdfOrdenPedido(
      construirDatos([entradaBase(), entradaBase({ figuraId: 'figura-1' })], {
        comentarios: 'Aviso para taller. '.repeat(20),
      }),
    );
    expect(doc.getNumberOfPages()).toBeGreaterThanOrEqual(3);
  });

  it('con logo y foto de material se genera igual', () => {
    const datos = construirDatos([entradaBase()]);
    const doc = construirPdfOrdenPedido({
      ...datos,
      logoDataUrl: PNG_1X1,
      piezas: datos.piezas.map((p) => ({ ...p, imagenMaterialDataUrl: PNG_1X1 })),
    });
    expect(doc.getNumberOfPages()).toBe(2);
  });

  it('sin croquis el PDF se genera igual, solo sin dibujo', () => {
    const datos = construirDatos([entradaBase()]);
    const doc = construirPdfOrdenPedido({
      ...datos,
      piezas: datos.piezas.map((p) => ({ ...p, seccion: null })),
    });
    expect(doc.getNumberOfPages()).toBe(2);
  });

  it('varios materiales distintos también se maquetan', () => {
    const otro: Material = materialErp({
      referencia: 'TEST-OTRO',
      descripcion: 'Otra baldosa de prueba',
    });
    const doc = construirPdfOrdenPedido(
      construirDatos([entradaBase(), entradaBase({ material: otro })]),
    );
    expect(doc.getNumberOfPages()).toBe(3);
  });
});

describe('construirPdfOrdenPedido — no depende de datos opcionales', () => {
  it('un material sin marca ni imagen no rompe la hoja de la pieza', () => {
    const pelado = materialErp({ marca: null, imagenUrl: null });
    const doc = construirPdfOrdenPedido(construirDatos([entradaBase({ material: pelado })]));
    expect(doc.getNumberOfPages()).toBe(2);
  });

  it('una pieza sin suplementos imprime «sin operaciones» y no falla', () => {
    const doc = construirPdfOrdenPedido(construirDatos([entradaBase({ suplementos: [] })]));
    expect(doc.getNumberOfPages()).toBe(2);
  });
});

describe('código y nombre de archivo', () => {
  const datos = construirDatos([entradaBase(), entradaBase()]);

  it('el código del pedido se distingue del de una orden suelta', () => {
    expect(codigoPedido(datos)).toBe('PED-20260609-1407');
  });

  it('el nombre del archivo dice cuántas piezas lleva y cuándo se hizo', () => {
    expect(nombreArchivoOrdenPedido(datos)).toBe('pedido_2-piezas_20260609-1407.pdf');
  });

  it('singular con una sola pieza', () => {
    expect(nombreArchivoOrdenPedido({ piezas: [datos.piezas[0]], fecha: FECHA })).toBe(
      'pedido_1-pieza_20260609-1407.pdf',
    );
  });
});

describe('el documento refleja el reparto de cajas', () => {
  it('agrupa las piezas del mismo artículo en un solo grupo de material', () => {
    const datos = construirDatos([
      entradaBase({ cantidad: 1, mermaPorcentaje: 0 }),
      entradaBase({ cantidad: 1, mermaPorcentaje: 0, figuraId: 'figura-1' }),
    ]);
    const resultado: ResultadoPedido = datos.resultado;
    expect(resultado.grupos).toHaveLength(1);
    expect(resultado.cajasAhorradas).toBe(1);
    // Y el documento se construye sin tropezar con ese reparto.
    expect(construirPdfOrdenPedido(datos).getNumberOfPages()).toBe(3);
  });
});
