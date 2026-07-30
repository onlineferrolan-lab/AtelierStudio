/**
 * Estado inicial de la cotización.
 *
 * El **origen arranca en 'pedido'** (2026-07-30, indicación directa): pedir cajas
 * completas al proveedor es el caso habitual y el de stock es la excepción.
 * Importa fijarlo en un test porque cambia el importe del material — en pedido se
 * factura la caja entera y el sobrante se cobra al cliente — y porque exige que el
 * artículo traiga los datos de caja del ERP.
 */

import { estadoInicial } from '../../../../src/ui/state/quote-state';

describe('estadoInicial', () => {
  it('arranca en pedido, no en stock', () => {
    expect(estadoInicial(10).origen).toBe('pedido');
  });

  it('arranca sin material ni figura y con una sola pieza', () => {
    const estado = estadoInicial(10);
    expect(estado.material).toBeNull();
    expect(estado.figuraId).toBeNull();
    expect(estado.cantidad).toBe('1');
    expect(estado.medidas).toEqual({});
    expect(estado.suplementos).toEqual({});
    expect(estado.unidadesSuplemento).toEqual({});
    expect(estado.pintado).toBe(false);
  });

  it('toma el porcentaje de merma por defecto de la configuración', () => {
    expect(estadoInicial(12.5).mermaPorcentaje).toBe('12,5'.replace(',', '.'));
  });
});
