/**
 * Estado inicial de la cotización.
 *
 * Ya NO hay origen de material (stock/pedido): se suprimió el 2026-07-30 al pasar
 * a facturar siempre por cajas completas, porque dejó de cambiar el importe.
 */

import { estadoInicial } from '../../../../src/ui/state/quote-state';

describe('estadoInicial', () => {
  it('arranca sin material ni figura y con una sola pieza', () => {
    const estado = estadoInicial(10);
    expect(estado.material).toBeNull();
    expect(estado.figuraId).toBeNull();
    expect(estado.cantidad).toBe('1');
    expect(estado.medidas).toEqual({});
    expect(estado.suplementos).toEqual({});
    expect(estado.unidadesSuplemento).toEqual({});
    expect(estado.pintado).toBe(false);
    expect(estado.comentarios).toBe('');
  });

  it('toma el porcentaje de merma por defecto de la configuración', () => {
    expect(estadoInicial(12.5).mermaPorcentaje).toBe('12,5'.replace(',', '.'));
  });
});
